import { Hono } from "hono";
import { db } from "../db/index.js";
import { requireAuth, optionalAuth } from "../middleware/auth.js";
import  bcrypt  from "bcryptjs";
import { logAction } from "../db/audit.js";

const snippets = new Hono();

function normalizeTime(timeStr) {
  if (!timeStr) return null;
  let t = timeStr.includes('T') ? timeStr : timeStr.replace(' ', 'T');
  if (!t.endsWith('Z')) t += 'Z';
  return t;
}

function rowToSnippet(row, tags = []) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    language: row.language,
    code: row.code,
    is_public: Boolean(row.is_public),
    view_count: row.view_count,
    likes_count: Number(row.likes_count || 0),
    is_liked: Boolean(row.is_liked),
    created_at: normalizeTime(row.created_at),
    updated_at: normalizeTime(row.updated_at),
    owner: { id: row.user_id, display_name: row.display_name },
    tags: tags.map((t) => ({ id: t.id, name: t.name })),
  };
}

async function loadTagsForSnippets(snippetIds) {
  if (!snippetIds.length) return new Map();
  const placeholders = snippetIds.map(() => "?").join(",");
  const res = await db.execute({
    sql: `SELECT st.snippet_id, t.id, t.name
          FROM snippet_tags st
          JOIN tags t ON t.id = st.tag_id
          WHERE st.snippet_id IN (${placeholders})
          ORDER BY t.name`,
    args: snippetIds
  });

  const map = new Map();
  for (const row of res.rows) {
    if (!map.has(row.snippet_id)) map.set(row.snippet_id, []);
    map.get(row.snippet_id).push({ id: row.id, name: row.name });
  }
  return map;
}

async function getOrCreateTags(names) {
  const tags = [];
  const seen = new Set();
  for (const raw of names) {
    const name = String(raw).trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);

    let tag = (await db.execute({ sql: "SELECT id, name FROM tags WHERE name = ?", args: [name] })).rows[0];
    if (!tag) {
      const result = await db.execute({ sql: "INSERT INTO tags (name) VALUES (?)", args: [name] });
      tag = { id: Number(result.lastInsertRowid), name };
    }
    tags.push(tag);
  }
  return tags;
}

// ==========================================
// 回收站专属路由 (必须在 /:id 之前)
// ==========================================

snippets.get("/trash", requireAuth, async (c) => {
  const current = c.get("user");
  const res = await db.execute({
    sql: `SELECT s.*, u.display_name FROM snippets s 
          JOIN users u ON u.id = s.user_id
          WHERE s.user_id = ? AND s.is_deleted = 1 
          ORDER BY s.updated_at DESC`,
    args: [current.id]
  });
  const tagMap = await loadTagsForSnippets(res.rows.map((r) => r.id));
  return c.json({
    items: res.rows.map((r) => rowToSnippet(r, tagMap.get(r.id) || [])),
    total: res.rows.length, page: 1, page_size: 50
  });
});

snippets.post("/:id/restore", requireAuth, async (c) => {
  const id = Number(c.req.param("id"));
  const current = c.get("user");
  const existing = (await db.execute({ sql: "SELECT * FROM snippets WHERE id = ?", args: [id] })).rows[0];
  
  if (!existing || existing.user_id !== current.id) return c.json({ detail: "无权操作" }, 403);
  
  await db.execute({ sql: "UPDATE snippets SET is_deleted = 0 WHERE id = ?", args: [id] });
  return c.body(null, 204);
});

snippets.delete("/:id/permanent", requireAuth, async (c) => {
  const id = Number(c.req.param("id"));
  const current = c.get("user");
  const existing = (await db.execute({ sql: "SELECT * FROM snippets WHERE id = ?", args: [id] })).rows[0];
  
  if (!existing || existing.user_id !== current.id) return c.json({ detail: "无权操作" }, 403);
  
  await db.execute({ sql: "DELETE FROM snippets WHERE id = ?", args: [id] });

  // 新增日志埋点：彻底删除
  await logAction(c, "PERMANENT_DELETE", `彻底删除了代码片段 [${existing.title}] (ID: ${id})`);

  return c.body(null, 204);
});

// ==========================================
// 评论相关路由
// ==========================================

snippets.get("/:id/comments", async (c) => {
  const snippetId = Number(c.req.param("id"));
  const res = await db.execute({
    sql: `SELECT c.id, c.content, c.created_at, c.user_id, u.display_name 
          FROM comments c JOIN users u ON u.id = c.user_id 
          WHERE c.snippet_id = ? ORDER BY c.created_at DESC`,
    args: [snippetId]
  });
  const comments = res.rows.map(row => {
    let isoTime = new Date().toISOString();
    if (row.created_at) {
      let timeStr = row.created_at.includes('T') ? row.created_at : row.created_at.replace(' ', 'T');
      if (!timeStr.endsWith('Z')) timeStr += 'Z';
      isoTime = timeStr;
    }
    return { id: Number(row.id), content: row.content, created_at: isoTime, user_id: Number(row.user_id), display_name: row.display_name };
  });
  return c.json(comments);
});

snippets.post("/:id/comments", requireAuth, async (c) => {
  const snippetId = Number(c.req.param("id"));
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);
  if (!body || !body.content || body.content.trim() === "") return c.json({ detail: "评论内容不能为空" }, 400);
  const snippet = (await db.execute({ sql: "SELECT id FROM snippets WHERE id = ?", args: [snippetId] })).rows[0];
  if (!snippet) return c.json({ detail: "片段不存在" }, 404);
  const result = await db.execute({
    sql: "INSERT INTO comments (snippet_id, user_id, content) VALUES (?, ?, ?)",
    args: [snippetId, user.id, body.content.trim()]
  });
  return c.json({ id: Number(result.lastInsertRowid), content: body.content.trim(), user_id: Number(user.id), display_name: user.display_name, created_at: new Date().toISOString() }, 201);
});

snippets.delete("/comments/:commentId", requireAuth, async (c) => {
  const commentId = Number(c.req.param("commentId"));
  const user = c.get("user");
  const comment = (await db.execute({ sql: "SELECT user_id FROM comments WHERE id = ?", args: [commentId] })).rows[0];
  if (!comment) return c.json({ detail: "评论不存在" }, 404);
  if (Number(comment.user_id) !== Number(user.id) && !user.is_admin) return c.json({ detail: "无权删除此评论" }, 403);
  await db.execute({ sql: "DELETE FROM comments WHERE id = ?", args: [commentId] });

  // 新增日志埋点：删除评论
  await logAction(c, "DELETE_COMMENT", `删除了评论 (ID: ${commentId})`);

  return c.body(null, 204);
});

// ==========================================
// 列表与详情
// ==========================================

snippets.get("/", optionalAuth, async (c) => {
  const q = c.req.query("q")?.trim() || "";
  const language = c.req.query("language") || "";
  const tag = c.req.query("tag") || "";
  const scope = c.req.query("scope") || "public";
  const page = Math.max(1, Number(c.req.query("page")) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(c.req.query("page_size")) || 10));

  const current = c.get("user");
  const currentUserId = current ? current.id : -1;

  if ((scope === "mine" || scope === "favorites") && !current) return c.json({ detail: "请先登录" }, 401);

  let joinClause = "";
  const conditions = [];
  const params = [];

  if (scope === "mine") {
    conditions.push("s.user_id = ?");
    conditions.push("s.is_deleted = 0");
    params.push(current.id);
  } else if (scope === "favorites") {
    joinClause += " JOIN favorites f ON f.snippet_id = s.id ";
    conditions.push("f.user_id = ?");
    conditions.push("s.is_deleted = 0");
    params.push(current.id);
  } else {
    conditions.push("s.is_public = 1");
    conditions.push("s.is_deleted = 0");
  }

  if (language) { conditions.push("s.language = ?"); params.push(language); }
  if (tag) { joinClause += " JOIN snippet_tags st ON st.snippet_id = s.id JOIN tags t ON t.id = st.tag_id "; conditions.push("t.name = ?"); params.push(tag); }
  
  // 恢复为 LIKE 模糊搜索
  if (q) {
    conditions.push("(s.title LIKE ? OR s.description LIKE ? OR s.code LIKE ?)");
    const like = `%${q}%`;
    params.push(like, like, like);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const countRow = (await db.execute({
    sql: `SELECT COUNT(DISTINCT s.id) AS total FROM snippets s ${joinClause} ${where}`,
    args: params
  })).rows[0];
  const total = countRow?.total || 0;

  const offset = (page - 1) * pageSize;
  const res = await db.execute({
    sql: `SELECT DISTINCT s.*, u.display_name,
          (SELECT COUNT(*) FROM likes l WHERE l.snippet_id = s.id) as likes_count,
          (SELECT COUNT(*) FROM likes l WHERE l.snippet_id = s.id AND l.user_id = ?) as is_liked
          FROM snippets s JOIN users u ON u.id = s.user_id
          ${joinClause} ${where}
          ORDER BY s.created_at DESC LIMIT ${pageSize} OFFSET ${offset}`,
    args: [currentUserId, ...params]
  });

  const tagMap = await loadTagsForSnippets(res.rows.map((r) => r.id));
  return c.json({
    items: res.rows.map((r) => rowToSnippet(r, tagMap.get(r.id) || [])),
    total, page, page_size: pageSize,
  });
});

snippets.get("/:id", optionalAuth, async (c) => {
  const id = Number(c.req.param("id"));
  const current = c.get("user");
  const currentUserId = current ? current.id : -1;

  const res = await db.execute({
    sql: `SELECT s.*, u.display_name,
          (SELECT COUNT(*) FROM likes l WHERE l.snippet_id = s.id) as likes_count,
          (SELECT COUNT(*) FROM likes l WHERE l.snippet_id = s.id AND l.user_id = ?) as is_liked
          FROM snippets s JOIN users u ON u.id = s.user_id
          WHERE s.id = ?`,
    args: [currentUserId, id]
  });
  const row = res.rows[0];

  if (!row) return c.json({ detail: "片段不存在" }, 404);
  if (row.is_deleted && (!current || current.id !== row.user_id)) return c.json({ detail: "片段不存在" }, 404);

  const isOwner = current && current.id === row.user_id;

  // 1. 过期检查
  if (row.expires_at && !isOwner) {
    let timeStr = row.expires_at.replace(' ', 'T');
    if (!timeStr.endsWith('Z')) timeStr += 'Z';
    const expireTime = new Date(timeStr).getTime();
    if (!isNaN(expireTime) && Date.now() > expireTime) {
      return c.json({ detail: "该代码片段已过期并销毁" }, 410);
    }
  }

  // 2. 阅后即销毁检查
  const maxViews = Number(row.max_views || 0);
  const viewCount = Number(row.view_count || 0);
  if (maxViews > 0 && viewCount >= maxViews && !isOwner) {
    return c.json({ detail: "该代码片段已达到最大查看次数并销毁" }, 410);
  }

  // 3. 密码拦截
  if (row.password_hash && !isOwner) {
    const providedPassword = c.req.header("X-Snippet-Password");
    if (!providedPassword) {
      return c.json({ require_password: true });
    }
    const isValid = await bcrypt.compare(providedPassword, row.password_hash);
    if (!isValid) return c.json({ detail: "访问密码错误" }, 403);
  }

  // 核心修复：只有非作者，或者没设限制的情况，才增加查看次数
  if (!isOwner) {
    await db.execute({ sql: "UPDATE snippets SET view_count = view_count + 1 WHERE id = ?", args: [id] });
    row.view_count += 1;
  }
  
  delete row.password_hash; // 绝不给前端返回密码哈希
  
  const filesRes = await db.execute({ sql: "SELECT filename, language, code FROM snippet_files WHERE snippet_id = ?", args: [id] });
  const tagMap = await loadTagsForSnippets([id]);
  const snippetData = rowToSnippet(row, tagMap.get(id) || []);

  snippetData.files = filesRes.rows.length > 0 
    ? filesRes.rows.map(f => ({ filename: f.filename, language: f.language, code: f.code }))
    : [{ filename: `main.${row.language}`, language: row.language, code: row.code }];

  return c.json(snippetData);
});

// ==========================================
// 增删改
// ==========================================

snippets.post("/", requireAuth, async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ detail: "请求格式错误" }, 400);

  const title = (body.title || "").trim();
  const language = (body.language || "").trim();
  const files = body.files || [];
  const mainCode = files.length > 0 ? files[0].code : (body.code || "");
  if (!title || !language || !mainCode) return c.json({ detail: "标题、语言、主代码不能为空" }, 400);

  const current = c.get("user");
  const isPublic = body.is_public !== false ? 1 : 0;
  
  // 处理安全字段
  let passwordHash = null;
  if (body.password) {
    passwordHash = await bcrypt.hash(body.password, 10);
  }
  const maxViews = Number(body.max_views) || 0;
  const expiresAt = body.expires_at || null;

  const result = await db.execute({
    sql: `INSERT INTO snippets (user_id, title, description, language, code, is_public, password_hash, max_views, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [current.id, title, body.description || null, language, mainCode, isPublic, passwordHash, maxViews, expiresAt]
  });

  const snippetId = Number(result.lastInsertRowid);

  // 插入多文件记录
  if (files.length > 0) {
    for (const f of files) {
      await db.execute({
        sql: "INSERT INTO snippet_files (snippet_id, filename, language, code) VALUES (?, ?, ?, ?)",
        args: [snippetId, f.filename, f.language, f.code]
      });
    }
  }

  const tags = await getOrCreateTags(body.tags || []);
  for (const tag of tags) {
    await db.execute({ sql: "INSERT INTO snippet_tags (snippet_id, tag_id) VALUES (?, ?) ON CONFLICT DO NOTHING", args: [snippetId, tag.id] });
  }

  // 新增日志埋点：发布代码
  await logAction(c, "CREATE_SNIPPET", `发布了代码片段 [${title}] (ID: ${snippetId})`);

  return c.json({ id: snippetId, title, language, code: mainCode, is_public: Boolean(isPublic), owner: { id: current.id, display_name: current.display_name }, tags }, 201);
});

snippets.put("/:id", requireAuth, async (c) => {
  const id = Number(c.req.param("id"));
  const current = c.get("user");
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ detail: "请求格式错误" }, 400);

  const existing = (await db.execute({ sql: "SELECT * FROM snippets WHERE id = ?", args: [id] })).rows[0];
  if (!existing) return c.json({ detail: "片段不存在" }, 404);
  if (existing.user_id !== current.id && !current.is_admin) return c.json({ detail: "无权修改" }, 403);

  const fields = [];
  const values = [];

  // 1. 处理基础字段
  for (const key of ["title", "description", "language", "code"]) {
    if (body[key] !== undefined) { 
      fields.push(`${key} = ?`); 
      values.push(body[key]); 
    }
  }
  
  // 2. 处理公开状态
  if (body.is_public !== undefined) { 
    fields.push("is_public = ?"); 
    values.push(body.is_public ? 1 : 0); 
  }

  // 3. 处理安全字段：阅后即销毁、过期时间
  if (body.max_views !== undefined) {
    fields.push("max_views = ?");
    values.push(Number(body.max_views) || 0);
  }
  if (body.expires_at !== undefined) {
    fields.push("expires_at = ?");
    values.push(body.expires_at || null);
  }

  // 4. 处理安全字段：密码修改
  // 如果 body 中包含了 password 字段（哪怕是空字符串），说明用户想要修改密码
  if (body.password !== undefined) {
    if (!body.password) {
      // 如果传了空字符串或 null，代表用户取消了密码保护
      fields.push("password_hash = NULL");
    } else {
      // 如果传了新密码，重新哈希加密
      const newHash = await bcrypt.hash(body.password, 10);
      fields.push("password_hash = ?");
      values.push(newHash);
    }
  }

  // 5. 执行更新主表
  if (fields.length) {
    fields.push("updated_at = datetime('now')");
    values.push(id);
    await db.execute({ 
      sql: `UPDATE snippets SET ${fields.join(", ")} WHERE id = ?`, 
      args: values 
    });
  }

  // 6. 处理多文件更新 (全量覆盖)
  if (Array.isArray(body.files)) {
    await db.execute({ sql: "DELETE FROM snippet_files WHERE snippet_id = ?", args: [id] });
    for (const f of body.files) {
      await db.execute({
        sql: "INSERT INTO snippet_files (snippet_id, filename, language, code) VALUES (?, ?, ?, ?)",
        args: [id, f.filename, f.language, f.code]
      });
    }
  }

  // 7. 处理标签更新
  if (Array.isArray(body.tags)) {
    await db.execute({ sql: "DELETE FROM snippet_tags WHERE snippet_id = ?", args: [id] });
    const tags = await getOrCreateTags(body.tags);
    for (const tag of tags) {
      await db.execute({ 
        sql: "INSERT INTO snippet_tags (snippet_id, tag_id) VALUES (?, ?) ON CONFLICT DO NOTHING", 
        args: [id, tag.id] 
      });
    }
  }

  return c.json({ id, ...body });
});

snippets.delete("/:id", requireAuth, async (c) => {
  const id = Number(c.req.param("id"));
  const current = c.get("user");
  const existing = (await db.execute({ sql: "SELECT * FROM snippets WHERE id = ?", args: [id] })).rows[0];
  if (!existing) return c.json({ detail: "片段不存在" }, 404);
  if (existing.user_id !== current.id && !current.is_admin) return c.json({ detail: "无权删除" }, 403);
  
  await db.execute({ sql: "UPDATE snippets SET is_deleted = 1 WHERE id = ?", args: [id] });

  // 新增日志埋点：移入回收站
  await logAction(c, "DELETE_SNIPPET", `将代码片段 [${existing.title}] 移入回收站 (ID: ${id})`);

  return c.body(null, 204);
});

// ==========================================
// 互动（收藏、点赞）
// ==========================================

snippets.post("/:id/favorite", requireAuth, async (c) => {
  const id = Number(c.req.param("id"));
  const current = c.get("user");
  const snippet = (await db.execute({ sql: "SELECT id FROM snippets WHERE id = ? AND is_public = 1", args: [id] })).rows[0];
  if (!snippet) return c.json({ detail: "片段不存在" }, 404);
  await db.execute({ sql: "INSERT INTO favorites (user_id, snippet_id) VALUES (?, ?) ON CONFLICT DO NOTHING", args: [current.id, id] });
  return c.body(null, 204);
});

snippets.delete("/:id/favorite", requireAuth, async (c) => {
  const id = Number(c.req.param("id"));
  const current = c.get("user");
  await db.execute({ sql: "DELETE FROM favorites WHERE user_id = ? AND snippet_id = ?", args: [current.id, id] });
  return c.body(null, 204);
});

snippets.post("/:id/like", requireAuth, async (c) => {
  const id = Number(c.req.param("id"));
  const user = c.get("user");
  const existing = await db.execute({ sql: "SELECT 1 FROM likes WHERE user_id = ? AND snippet_id = ?", args: [user.id, id] });

  if (existing.rows.length > 0) {
    await db.execute({ sql: "DELETE FROM likes WHERE user_id = ? AND snippet_id = ?", args: [user.id, id] });
    return c.json({ liked: false });
  } else {
    await db.execute({ sql: "INSERT INTO likes (user_id, snippet_id) VALUES (?, ?)", args: [user.id, id] });
    return c.json({ liked: true });
  }
});

export default snippets;