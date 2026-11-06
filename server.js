import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import authRoutes from "./routes/auth.js";
import snippetRoutes from "./routes/snippets.js";
import tagRoutes from "./routes/tags.js";
import adminRoutes from "./routes/admin.js";

const app = new Hono();

app.use("*", logger());
app.use(
  "/api/*",
  cors({
    origin: (origin) => origin || "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

app.route("/api/auth", authRoutes);
app.route("/api/snippets", snippetRoutes);
app.route("/api/tags", tagRoutes);
app.route("/api/admin", adminRoutes);

app.get("/api/health", (c) => c.json({ status: "ok" }));

// Vercel 的 Node.js Serverless 环境要求默认导出一个请求处理函数
export default app;