import { Hono } from "hono";
import { db } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";

const admin = new Hono();

// 校验管理员权限的中间件
const requireAdmin = async (c, next) => {
  const user = c.get("user");
  if (!user || !user.is_admin) {
    return c.json({ detail: "需要管理员权限" }, 403);
  }
  await next();
};

admin.use("*", requireAuth, requireAdmin);

// 获取所有片段
admin.get("/snippets", async (c) => {
  const rows = await db.prepare(`
    SELECT s.id, s.title, s.is_public, u.display_name 
    FROM snippets s 
    JOIN users u ON u.id = s.user_id 
    ORDER BY s.created_at DESC
  `).all();
  return c.json(rows);
});

// 修改公开状态
admin.put("/snippets/:id/visibility", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json();
  await db.prepare("UPDATE snippets SET is_public = ? WHERE id = ?")
    .run(body.is_public ? 1 : 0, id);
  return c.json({ ok: true });
});

// 删除片段
admin.delete("/snippets/:id", async (c) => {
  const id = Number(c.req.param("id"));
  await db.prepare("DELETE FROM snippets WHERE id = ?").run(id);
  return c.body(null, 204);
});

export default admin;