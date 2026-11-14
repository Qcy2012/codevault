// server.js
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import apiApp from "./api/index.js"; 

const app = new Hono();

// 1. 先挂载 API 路由（由于 apiApp 内部写了 basePath("/api")，它只会拦截 /api 开头的请求）
app.route("/", apiApp);

// 2. 然后处理静态资源（如 /css/style.css）
app.use("/*", serveStatic({ root: "./public" }));

// 3. 处理根路径（访问 http://127.0.0.1:3000/ 时返回首页）
app.get("/", serveStatic({ path: "./public/index.html" }));

const port = Number(process.env.PORT) || 3000;
serve({ fetch: app.fetch, port }, () => {
  console.log(`CodeVault running locally at http://127.0.0.1:${port}`);
});