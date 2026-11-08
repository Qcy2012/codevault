import { Hono } from "hono";
import { db } from "../db/index.js";
import { requireAuth, optionalAuth } from "../middleware/auth.js";

const snippets = new Hono();

function rowToSnippet(row, tags = []) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    language: row.language,
    code: row.code,
    is_public: Boolean(row.is_public),
    view_count: row.view_count,
    created_at: row.created_at,
    updated_at: row.updated_at,
    owner: {
      id: row.user_id,
      display_name: row.display_name,
    },
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

snippets.get("/", optionalAuth, async (c) => {
  const q = c.req.query("q")?.trim() || "";
  const language = c.req.query("language") || "";
  const tag = c.req.query("tag") || "";
  const scope = c.req.query("scope") || "public";
  const page = Math.max(1, Number(c.req.query("page")) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(c.req.query("page_size")) || 10));

  const current = c.get("user");

  if ((scope === "mine" || scope === "favorites") && !current) {
    return c.json({ detail: "请先登录" }, 401);
  }

  let joinClause = "";
  const conditions = [];
  const params = [];

  if (scope === "mine") {
    conditions.push("s.user_id = ?");
    params.push(current.id);
  } else if (scope === "favorites") {
    joinClause += " JOIN favorites f ON f.snippet_id = s.id ";
    conditions.push("f.user_id = ?");
    params.push(current.id);
  } else {
    conditions.push("s.is_public = 1");
  }

  if (language) {
    conditions.push("s.language = ?");
    params.push(language);
  }

  if (tag) {
    joinClause += " JOIN snippet_tags st ON st.snippet_id = s.id JOIN tags t ON t.id = st.tag_id ";
    conditions.push("t.name = ?");
    params.push(tag);
  }

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
    sql: `SELECT DISTINCT s.*, u.display_name
          FROM snippets s
          JOIN users u ON u.id = s.user_id
          ${joinClause}
          ${where}
          ORDER BY s.created_at DESC
          LIMIT ${pageSize} OFFSET ${offset}`,
    args: params
  });

  const tagMap = await loadTagsForSnippets(res.rows.map((r) => r.id));

  return c.json({
    items: res.rows.map((r) => rowToSnippet(r, tagMap.get(r.id) || [])),
    total,
    page,
    page_size: pageSize,
  });
});

snippets.get("/:id", optionalAuth, async (c) => {
  const id = Number(c.req.param("id"));
  if (!id) return c.json({ detail: "无效的片段 ID" }, 400);

  const res = await db.execute({
    sql: `SELECT s.*, u.display_name
          FROM snippets s
          JOIN users u ON u.id = s.user_id
          WHERE s.id = ?`,
    args: [id]
  });
  const row = res.rows[0];

  if (!row) return c.json({ detail: "片段不存在" }, 404);

  const current = c.get("user");
  if (!row.is_public && (!current || current.id !== row.user_id)) {
    return c.json({ detail: "片段不存在" }, 404);
  }

  await db.execute({
    sql: "UPDATE snippets SET view_count = view_count + 1 WHERE id = ?",
    args: [id]
  });

  row.view_count += 1;
  const tagMap = await loadTagsForSnippets([id]);

  return c.json(rowToSnippet(row, tagMap.get(id) || []));
});

snippets.post("/", requireAuth, async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ detail: "请求格式错误" }, 400);

  const title = (body.title || "").trim();
  const language = (body.language || "").trim();
  const code = body.code || "";
  if (!title || !language || !code) {
    return c.json({ detail: "标题、语言、代码不能为空" }, 400);
  }

  const current = c.get("user");
  const isPublic = body.is_public !== false ? 1 : 0;

  const result = await db.execute({
    sql: `INSERT INTO snippets (user_id, title, description, language, code, is_public)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [current.id, title, body.description || null, language, code, isPublic]
  });

  const snippetId = Number(result.lastInsertRowid);
  const tags = await getOrCreateTags(body.tags || []);

  for (const tag of tags) {
    await db.execute({
      sql: "INSERT INTO snippet_tags (snippet_id, tag_id) VALUES (?, ?) ON CONFLICT DO NOTHING",
      args: [snippetId, tag.id]
    });
  }

  return c.json(
    {
      id: snippetId,
      title,
      language,
      code,
      is_public: Boolean(isPublic),
      owner: { id: current.id, display_name: current.display_name },
      tags,
    },
    201
  );
});

snippets.put("/:id", requireAuth, async (c) => {
  const id = Number(c.req.param("id"));
  const current = c.get("user");
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ detail: "请求格式错误" }, 400);

  const existing = (await db.execute({ sql: "SELECT * FROM snippets WHERE id = ?", args: [id] })).rows[0];
  if (!existing) return c.json({ detail: "片段不存在" }, 404);
  if (existing.user_id !== current.id && !current.is_admin) {
    return c.json({ detail: "无权修改" }, 403);
  }

  const fields = [];
  const values = [];

  for (const key of ["title", "description", "language", "code"]) {
    if (body[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(body[key]);
    }
  }
  if (body.is_public !== undefined) {
    fields.push("is_public = ?");
    values.push(body.is_public ? 1 : 0);
  }

  if (fields.length) {
    fields.push("updated_at = datetime('now')");
    values.push(id);
    await db.execute({
      sql: `UPDATE snippets SET ${fields.join(", ")} WHERE id = ?`,
      args: values
    });
  }

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
  if (existing.user_id !== current.id && !current.is_admin) {
    return c.json({ detail: "无权删除" }, 403);
  }

  await db.execute({ sql: "DELETE FROM snippets WHERE id = ?", args: [id] });
  return c.body(null, 204);
});

snippets.post("/:id/favorite", requireAuth, async (c) => {
  const id = Number(c.req.param("id"));
  const current = c.get("user");

  const snippet = (await db.execute({ sql: "SELECT id FROM snippets WHERE id = ? AND is_public = 1", args: [id] })).rows[0];
  if (!snippet) return c.json({ detail: "片段不存在" }, 404);

  await db.execute({
    sql: "INSERT INTO favorites (user_id, snippet_id) VALUES (?, ?) ON CONFLICT DO NOTHING",
    args: [current.id, id]
  });

  return c.body(null, 204);
});

snippets.delete("/:id/favorite", requireAuth, async (c) => {
  const id = Number(c.req.param("id"));
  const current = c.get("user");

  await db.execute({
    sql: "DELETE FROM favorites WHERE user_id = ? AND snippet_id = ?",
    args: [current.id, id]
  });

  return c.body(null, 204);
});

// ==========================================
// 评论功能 API
// ==========================================

// 获取某个片段的评论列表
snippets.get("/:id/comments", async (c) => {
  const snippetId = Number(c.req.param("id"));
  
  const res = await db.execute({
    sql: `SELECT c.id, c.content, c.created_at, c.user_id, u.display_name 
          FROM comments c 
          JOIN users u ON u.id = c.user_id 
          WHERE c.snippet_id = ? 
          ORDER BY c.created_at DESC`,
    args: [snippetId]
  });

  return c.json(res.rows);
});

// 发表评论
snippets.post("/:id/comments", requireAuth, async (c) => {
  const snippetId = Number(c.req.param("id"));
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);
  
  if (!body || !body.content || body.content.trim() === "") {
    return c.json({ detail: "评论内容不能为空" }, 400);
  }

  // 检查片段是否存在
  const snippet = (await db.execute({ sql: "SELECT id FROM snippets WHERE id = ?", args: [snippetId] })).rows[0];
  if (!snippet) return c.json({ detail: "片段不存在" }, 404);

  const result = await db.execute({
    sql: "INSERT INTO comments (snippet_id, user_id, content) VALUES (?, ?, ?)",
    args: [snippetId, user.id, body.content.trim()]
  });

  return c.json({ 
    id: Number(result.lastInsertRowid), 
    content: body.content.trim(),
    user_id: user.id,
    display_name: user.display_name,
    created_at: new Date().toISOString()
  }, 201);
});

// 删除评论
snippets.delete("/comments/:commentId", requireAuth, async (c) => {
  const commentId = Number(c.req.param("commentId"));
  const user = c.get("user");

  const comment = (await db.execute({ sql: "SELECT user_id FROM comments WHERE id = ?", args: [commentId] })).rows[0];
  if (!comment) return c.json({ detail: "评论不存在" }, 404);
  
  // 只有评论作者或管理员可以删除
  if (comment.user_id !== user.id && !user.is_admin) {
    return c.json({ detail: "无权删除此评论" }, 403);
  }

  await db.execute({ sql: "DELETE FROM comments WHERE id = ?", args: [commentId] });
  return c.body(null, 204);
});

export default snippets;