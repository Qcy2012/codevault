import { Hono } from "hono";
import { db } from "../db/index.js";
import { hashPassword, verifyPassword, signToken } from "../auth/jwt.js";
import { requireAuth } from "../middleware/auth.js";

const auth = new Hono();

// 注册
auth.post("/register", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ detail: "请求格式错误" }, 400);

  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";
  const displayName = (body.display_name || "").trim();

  if (!email || password.length < 6 || !displayName) {
    return c.json({ detail: "邮箱、密码（至少 6 位）、昵称均不能为空" }, 400);
  }

  const existing = await db
    .prepare("SELECT id FROM users WHERE email = ? OR display_name = ?")
    .get(email, displayName);
    
  if (existing) {
    return c.json({ detail: "邮箱或用户名已被注册" }, 400);
  }

  const passwordHash = await hashPassword(password);
  const result = await db
    .prepare(
      "INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)"
    )
    .run(email, passwordHash, displayName);

  const userId = Number(result.lastInsertRowid);
  const token = signToken(userId);

  return c.json(
    {
      access_token: token,
      token_type: "bearer",
      user: { id: userId, email, display_name: displayName, is_admin: false },
    },
    201
  );
});

// 登录 (支持用户名或邮箱)
auth.post("/login", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ detail: "请求格式错误" }, 400);

  const account = (body.account || "").trim();
  const password = body.password || "";

  const user = await db
    .prepare(
      "SELECT id, email, password_hash, display_name, is_admin FROM users WHERE email = ? OR display_name = ?"
    )
    .get(account.toLowerCase(), account);

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return c.json({ detail: "账号或密码错误" }, 401);
  }

  const token = signToken(user.id);

  return c.json({
    access_token: token,
    token_type: "bearer",
    user: {
      id: user.id,
      email: user.email,
      display_name: user.display_name,
      is_admin: Boolean(user.is_admin),
    },
  });
});

// 当前用户信息
auth.get("/me", requireAuth, (c) => {
  return c.json(c.get("user"));
});

export default auth;