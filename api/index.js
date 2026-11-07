import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import authRoutes from "../routes/auth.js";
import snippetRoutes from "../routes/snippets.js";
import tagRoutes from "../routes/tags.js";
import adminRoutes from "../routes/admin.js";

const app = new Hono().basePath("/api");

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: (origin) => origin || "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

// 因为前面设置了 basePath("/api")，这里直接写 "/auth" 即可
app.route("/auth", authRoutes);
app.route("/snippets", snippetRoutes);
app.route("/tags", tagRoutes);
app.route("/admin", adminRoutes);

app.get("/health", (c) => c.json({ status: "ok" }));

// 直接导出 Hono 实例给 Vercel
export default app;