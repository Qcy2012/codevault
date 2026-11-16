import { Hono } from "hono";
import { db } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";

const admin = new Hono();

const requireAdmin = async (c, next) => {
  const user = c.get("user");
  if (!user || !user.is_admin) {
    return c.json({ detail: "需要管理员权限" }, 403);
  }
  await next();
};

admin.use("*", requireAuth, requireAdmin);

admin.get("/snippets", async (c) => {
  const res = await db.execute(`
    SELECT s.id, s.title, s.is_public, u.display_name 
    FROM snippets s 
    JOIN users u ON u.id = s.user_id 
    ORDER BY s.created_at DESC
  `);
  return c.json(res.rows);
});

admin.put("/snippets/:id/visibility", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json();
  await db.execute({
    sql: "UPDATE snippets SET is_public = ? WHERE id = ?",
    args: [body.is_public ? 1 : 0, id]
  });

  // 新增日志埋点：管理员下架/恢复
  const statusText = body.is_public ? "恢复公开" : "强制下架";
  await logAction(c, "ADMIN_UPDATE_VISIBILITY", `管理员将片段 (ID: ${id}) ${statusText}`);

  return c.json({ ok: true });
});

admin.delete("/snippets/:id", async (c) => {
  const id = Number(c.req.param("id"));
  await db.execute({ sql: "DELETE FROM snippets WHERE id = ?", args: [id] });

  // 新增日志埋点：管理员强删
  await logAction(c, "ADMIN_DELETE_SNIPPET", `管理员强制删除了片段 (ID: ${id})`);

  return c.body(null, 204);
});

export default admin;