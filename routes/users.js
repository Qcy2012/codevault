import { Hono } from "hono";
import { db } from "../db/index.js";

const users = new Hono();

// 获取排行榜
users.get("/ranking", async (c) => {
  const res = await db.execute(`
    SELECT u.id, u.display_name, 
           COUNT(DISTINCT s.id) as snippet_count,
           (SELECT COUNT(*) FROM likes l JOIN snippets s2 ON s2.id = l.snippet_id WHERE s2.user_id = u.id) as total_likes
    FROM users u
    LEFT JOIN snippets s ON s.user_id = u.id AND s.is_public = 1
    GROUP BY u.id
    ORDER BY total_likes DESC, snippet_count DESC
    LIMIT 10
  `);
  return c.json(res.rows);
});

// 获取某用户公开主页信息
users.get("/:id/profile", async (c) => {
  const id = Number(c.req.param("id"));
  const user = (await db.execute({ sql: "SELECT id, display_name, created_at FROM users WHERE id = ?", args: [id] })).rows[0];
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
          WHERE s.user_id = ? AND s.is_public = 1 ORDER BY s.created_at DESC`,
    args: [id]
  });
  return c.json(res.rows);
});

export default users;