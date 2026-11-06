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
  const rows = await db
    .prepare(
      `SELECT st.snippet_id, t.id, t.name
       FROM snippet_tags st
       JOIN tags t ON t.id = st.tag_id
       WHERE st.snippet_id IN (${placeholders})
       ORDER BY t.name`
    )
    .all(...snippetIds);

  const map = new Map();
  for (const row of rows) {
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

    let tag = await db.prepare("SELECT id, name FROM tags WHERE name = ?").get(name);
    if (!tag) {
      const result = await db
        .prepare("INSERT INTO tags (name) VALUES (?)")
        .run(name);
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
    // 改成 JOIN 查询，避开 IN (SELECT ...) 导致的崩溃
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
    // 改成 JOIN 查询标签
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

  // 注意：因为有 JOIN，查询总数必须用 COUNT(DISTINCT s.id) 避免重复计数
  const countRow = await db
    .prepare(`SELECT COUNT(DISTINCT s.id) AS total FROM snippets s ${joinClause} ${where}`)
    .get(...params);
  const total = countRow?.total || 0;

  const offset = (page - 1) * pageSize;
  
  // 注意：SELECT DISTINCT s.* 也是为了防止 JOIN 导致一行数据出现多次
  const rows = await db
    .prepare(
      `SELECT DISTINCT s.*, u.display_name
       FROM snippets s
       JOIN users u ON u.id = s.user_id
       ${joinClause}
       ${where}
       ORDER BY s.created_at DESC
       LIMIT ${pageSize} OFFSET ${offset}`
    )
    .all(...params);

  const tagMap = await loadTagsForSnippets(rows.map((r) => r.id));

  return c.json({
    items: rows.map((r) => rowToSnippet(r, tagMap.get(r.id) || [])),
    total,
    page,
    page_size: pageSize,
  });
});

snippets.get("/:id", optionalAuth, async (c) => {
  const id = Number(c.req.param("id"));
  if (!id) return c.json({ detail: "无效的片段 ID" }, 400);

  const row = await db
    .prepare(
      `SELECT s.*, u.display_name
       FROM snippets s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ?`
    )
    .get(id);

  if (!row) return c.json({ detail: "片段不存在" }, 404);

  const current = c.get("user");
  if (!row.is_public && (!current || current.id !== row.user_id)) {
    return c.json({ detail: "片段不存在" }, 404);
  }

  await db
    .prepare("UPDATE snippets SET view_count = view_count + 1 WHERE id = ?")
    .run(id);

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

  const result = await db
    .prepare(
      `INSERT INTO snippets (user_id, title, description, language, code, is_public)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      current.id,
      title,
      body.description || null,
      language,
      code,
      isPublic
    );

  const snippetId = Number(result.lastInsertRowid);
  const tags = await getOrCreateTags(body.tags || []);

  for (const tag of tags) {
    await db
      .prepare(
        "INSERT INTO snippet_tags (snippet_id, tag_id) VALUES (?, ?) ON CONFLICT DO NOTHING"
      )
      .run(snippetId, tag.id);
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

  const existing = await db.prepare("SELECT * FROM snippets WHERE id = ?").get(id);
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
    await db
      .prepare(`UPDATE snippets SET ${fields.join(", ")} WHERE id = ?`)
      .run(...values, id);
  }

  if (Array.isArray(body.tags)) {
    await db.prepare("DELETE FROM snippet_tags WHERE snippet_id = ?").run(id);
    const tags = await getOrCreateTags(body.tags);
    for (const tag of tags) {
      await db
        .prepare(
          "INSERT INTO snippet_tags (snippet_id, tag_id) VALUES (?, ?) ON CONFLICT DO NOTHING"
        )
        .run(id, tag.id);
    }
  }

  return c.json({ id, ...body });
});

snippets.delete("/:id", requireAuth, async (c) => {
  const id = Number(c.req.param("id"));
  const current = c.get("user");

  const existing = await db.prepare("SELECT * FROM snippets WHERE id = ?").get(id);
  if (!existing) return c.json({ detail: "片段不存在" }, 404);
  if (existing.user_id !== current.id && !current.is_admin) {
    return c.json({ detail: "无权删除" }, 403);
  }

  await db.prepare("DELETE FROM snippets WHERE id = ?").run(id);
  return c.body(null, 204);
});

snippets.post("/:id/favorite", requireAuth, async (c) => {
  const id = Number(c.req.param("id"));
  const current = c.get("user");

  const snippet = await db
    .prepare("SELECT id FROM snippets WHERE id = ? AND is_public = 1")
    .get(id);
  if (!snippet) return c.json({ detail: "片段不存在" }, 404);

  await db
    .prepare(
      "INSERT INTO favorites (user_id, snippet_id) VALUES (?, ?) ON CONFLICT DO NOTHING"
    )
    .run(current.id, id);

  return c.body(null, 204);
});

snippets.delete("/:id/favorite", requireAuth, async (c) => {
  const id = Number(c.req.param("id"));
  const current = c.get("user");

  await db
    .prepare("DELETE FROM favorites WHERE user_id = ? AND snippet_id = ?")
    .run(current.id, id);

  return c.body(null, 204);
});

export default snippets;