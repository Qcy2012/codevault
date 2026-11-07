import { createMiddleware } from "hono/factory";
import { verifyToken } from "../auth/jwt.js";
import { db } from "../db/index.js";

export const requireAuth = createMiddleware(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ detail: "未登录" }, 401);
  }

  const token = authHeader.slice(7);
  const userId = verifyToken(token);
  if (!userId) {
    return c.json({ detail: "登录已过期或无效" }, 401);
  }

  const res = await db.execute({
    sql: "SELECT id, email, display_name, is_admin FROM users WHERE id = ?",
    args: [userId]
  });
  const user = res.rows[0];

  if (!user) {
    return c.json({ detail: "用户不存在" }, 401);
  }

  c.set("user", user);
  await next();
});

export const optionalAuth = createMiddleware(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const userId = verifyToken(authHeader.slice(7));
    if (userId) {
      const res = await db.execute({
        sql: "SELECT id, email, display_name, is_admin FROM users WHERE id = ?",
        args: [userId]
      });
      const user = res.rows[0];
      if (user) c.set("user", user);
    }
  }
  await next();
});