import { Hono } from "hono";
import { db } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import { randomBytes } from "node:crypto";

const users = new Hono();

// 生成或重置 API Key (放在 /:id 之前防止被误匹配)
users.post("/api-key", requireAuth, async (c) => {
  try {
    const current = c.get("user");
    const newKey = `cv_live_${randomBytes(16).toString("hex")}`;

    await db.execute({
      sql: "UPDATE users SET api_key = ? WHERE id = ?",
      args: [newKey, current.id]
    });

    return c.json({ api_key: newKey });
  } catch (error) {
    console.error("生成 API Key 失败:", error);
    return c.json({ detail: error.message }, 500);
  }
});

// 获取排行榜
users.get("/ranking", async (c) => {
  const res = await db.execute(`
    SELECT u.id, u.display_name, 
           COUNT(DISTINCT s.id) as snippet_count,
           COUNT(l.user_id) as total_likes
    FROM users u
    LEFT JOIN snippets s ON s.user_id = u.id AND s.is_public = 1
    LEFT JOIN likes l ON l.snippet_id = s.id
    GROUP BY u.id
    ORDER BY total_likes DESC, snippet_count DESC
    LIMIT 10
  `);
  return c.json(res.rows);
});

// 获取某用户公开主页信息
users.get("/:id/profile", async (c) => {
  const id = Number(c.req.param("id"));
  const user = (await db.execute({ 
    sql: "SELECT id, display_name, created_at FROM users WHERE id = ?", 
    args: [id] 
  })).rows[0];
  
  if (!user) return c.json({ detail: "用户不存在" }, 404);
  return c.json(user);
});

// 获取某用户的公开片段
users.get("/:id/snippets", async (c) => {
  const id = Number(c.req.param("id"));
  const res = await db.execute({
    sql: `SELECT s.*, u.display_name, 
          (SELECT COUNT(*) FROM likes l WHERE l.snippet_id = s.id) as likes_count
          FROM snippets s JOIN users u ON u.id = s.user_id
          WHERE s.user_id = ? AND s.is_public = 1 
          ORDER BY s.created_at DESC`,
    args: [id]
  });
  return c.json(res.rows);
});

// 获取 API Key 使用状态
users.get("/api-key", requireAuth, async (c) => {
  const current = c.get("user");
  const res = await db.execute({
    sql: "SELECT api_key, api_key_usage, last_api_call_at FROM users WHERE id = ?",
    args: [current.id]
  });
  return c.json(res.rows[0]);
});

// 1. 接收前端心跳
users.post("/heartbeat", requireAuth, async (c) => {
  const current = c.get("user");
  await db.execute({
    sql: "UPDATE users SET last_active_at = datetime('now') WHERE id = ?",
    args: [current.id]
  });
  return c.body(null, 204);
});

// 2. 获取当前在线人数
users.get("/online-count", async (c) => {
  // 统计过去 5 分钟内有活跃记录的用户数
  const res = await db.execute(
    "SELECT COUNT(*) as count FROM users WHERE last_active_at >= datetime('now', '-5 minutes')"
  );
  
  // 如果一个人都没在线（比如刚部署），为了好看可以假装有 1 个（就是你自己）
  let count = Number(res.rows[0]?.count || 0);
  if (count === 0) count = 1; 
  
  return c.json({ count });
});

export default users;