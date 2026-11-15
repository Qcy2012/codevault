import { createMiddleware } from "hono/factory";
import { verifyToken } from "../auth/jwt.js";
import { db } from "../db/index.js";

async function getUserFromRequest(c) {
  const authHeader = c.req.header("Authorization");
  const apiKey = c.req.header("X-API-KEY");

  // 1. 优先检查 Bearer Token (网页端的 JWT)
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const userId = verifyToken(authHeader.slice(7));
    if (!userId) return null;
    return (await db.execute({ sql: "SELECT id, email, display_name, is_admin FROM users WHERE id = ?", args: [userId] })).rows[0];
  }

  // 2. 其次检查 X-API-KEY (第三方脚本调用的 Key)
  if (apiKey) {
    const user = (await db.execute({ sql: "SELECT id, email, display_name, is_admin FROM users WHERE api_key = ?", args: [apiKey] })).rows[0];
    if (user) return user;
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