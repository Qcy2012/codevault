import { Hono } from "hono";
import { db } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import { logAction } from "../db/audit.js";

const admin = new Hono();

const requireAdmin = async (c, next) => {
  const user = c.get("user");
  if (!user || !user.is_admin) {
    return c.json({ detail: "需要管理员权限" }, 403);
  }
  await next();
};

admin.use("*", requireAuth, requireAdmin);

// 核心修复：获取日志接口必须放在 /:id 路由的前面！
admin.get("/logs", async (c) => {
  try {
    const res = await db.execute(
      "SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100"
    );
    
    // 处理 Turso 返回的 BigInt
    const logs = res.rows.map(row => ({
      id: Number(row.id),
      user_id: row.user_id ? Number(row.user_id) : null,
      display_name: row.display_name,
      action: row.action,
      details: row.details,
      ip_address: row.ip_address,
      created_at: row.created_at
    }));

    return c.json(logs);
  } catch (error) {
    console.error("获取日志接口报错:", error);
    return c.json({ detail: error.message }, 500);
  }
});

// 获取所有片段
admin.get("/snippets", async (c) => {
  const rows = await db.execute(`
    SELECT s.id, s.title, s.is_public, u.display_name 
    FROM snippets s 
    JOIN users u ON u.id = s.user_id 
    ORDER BY s.created_at DESC
  `).rows;
  return c.json(rows);
});

// 修改公开状态
admin.put("/snippets/:id/visibility", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json();
  await db.execute({
    sql: "UPDATE snippets SET is_public = ? WHERE id = ?",
    args: [body.is_public ? 1 : 0, id]
  });
  
  const statusText = body.is_public ? "恢复公开" : "强制下架";
  await logAction(c, "ADMIN_UPDATE_VISIBILITY", `管理员将片段 (ID: ${id}) ${statusText}`);
  
  return c.json({ ok: true });
});

// 删除片段
admin.delete("/snippets/:id", async (c) => {
  const id = Number(c.req.param("id"));
  await db.execute({ sql: "DELETE FROM snippets WHERE id = ?", args: [id] });
  
  await logAction(c, "ADMIN_DELETE_SNIPPET", `管理员强制删除了片段 (ID: ${id})`);
  
  return c.body(null, 204);
});

export default admin;