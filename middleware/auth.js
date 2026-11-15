import { createMiddleware } from "hono/factory";
import { verifyToken } from "../auth/jwt.js";
import { db } from "../db/index.js";

async function getUserFromRequest(c) {
  const authHeader = c.req.header("Authorization");
  const apiKey = c.req.header("X-API-KEY");

  // 1. 网页 JWT 认证
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const userId = verifyToken(authHeader.slice(7));
    if (!userId) return null;
    return (await db.execute({ sql: "SELECT id, email, display_name, is_admin FROM users WHERE id = ?", args: [userId] })).rows[0];
  }

  // 2. API Key 认证
  if (apiKey) {
    const user = (await db.execute({ sql: "SELECT id, email, display_name, is_admin FROM users WHERE api_key = ?", args: [apiKey] })).rows[0];
    
    if (user) {
      // 核心：记录调用次数和最后调用时间
      await db.execute({
        sql: "UPDATE users SET api_key_usage = api_key_usage + 1, last_api_call_at = datetime('now') WHERE id = ?",
        args: [user.id]
      });
      return user;
    }
  }

  return null;
}

export const requireAuth = createMiddleware(async (c, next) => {
  const user = await getUserFromRequest(c);
  if (!user) return c.json({ detail: "未登录或 API Key 无效" }, 401);
  c.set("user", user);
  await next();
});

export const optionalAuth = createMiddleware(async (c, next) => {
  const user = await getUserFromRequest(c);
  if (user) c.set("user", user);
  await next();
});