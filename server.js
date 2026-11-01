import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";

import authRoutes from "./routes/auth.js";
import snippetRoutes from "./routes/snippets.js";
import tagRoutes from "./routes/tags.js";

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

app.get("/api/health", (c) => c.json({ status: "ok" }));

// 前端静态文件（开发时由 Hono 直接托管；生产可改为 Cloudflare Pages 独立部署）
app.use("/*", serveStatic({ root: "./frontend" }));

const port = Number(process.env.PORT) || 3000;

serve({ fetch: app.fetch, port }, () => {
  console.log(`CodeVault running at http://127.0.0.1:${port}`);
});