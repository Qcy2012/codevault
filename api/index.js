import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { chmod, access } from "node:fs/promises";
import { constants } from "node:fs";
import { db } from "../db/index.js";
import { sanitizeInput } from "../middleware/security.js";
import { rateLimit } from "../middleware/rateLimit.js";

import authRoutes from "../routes/auth.js";
import snippetRoutes from "../routes/snippets.js";
import tagRoutes from "../routes/tags.js";
import adminRoutes from "../routes/admin.js";
import userRoutes from "../routes/users.js";

const app = new Hono().basePath("/api");

// 全局错误拦截，防止 Cloud 端返回 HTML 500 页面导致前端 JSON 解析崩溃
app.onError((err, c) => {
  console.error("💥 后端发生错误:", err);
  // 直接把真实错误返回，方便前端和网络面板看到
  return c.json({ 
    detail: `服务器内部错误: ${err.message}`,
    stack: err.stack 
  }, 500);
});

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: (origin) => origin || "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

// 限制登录/注册接口：1 分钟最多 5 次
app.use("/auth/login", rateLimit(5, 60000));
app.use("/auth/register", rateLimit(5, 60000));

// 限制发布代码和评论：1 分钟最多 10 次
app.use("/snippets", rateLimit(10, 60000));
app.use("/snippets/*/comments", rateLimit(10, 60000));

app.use("/api/*", sanitizeInput); // 挂载安全中间件

// 挂载各模块路由
app.route("/auth", authRoutes);
app.route("/snippets", snippetRoutes);
app.route("/tags", tagRoutes);
app.route("/admin", adminRoutes);
app.route("/users", userRoutes);

// 健康检查
app.get("/health", (c) => c.json({ status: "ok" }));

// ==========================================
// C++ 统计引擎接口
// ==========================================
function runCppStats(binaryPath, snippets) {
  return new Promise((resolve, reject) => {
    const child = spawn(binaryPath);
    let outputData = "";
    let errorData = "";

    child.stdout.on("data", (data) => { outputData += data.toString(); });
    child.stderr.on("data", (data) => { errorData += data.toString(); });

    child.on("error", (err) => {
      reject(new Error(`无法启动 C++ 程序: ${err.message}`));
    });

    child.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`C++ 进程退出码 ${code}。错误信息: ${errorData}`));
      }
      try {
        resolve(JSON.parse(outputData));
      } catch (e) {
        reject(new Error(`C++ 输出的不是合法 JSON: ${outputData}`));
      }
    });

    for (const row of snippets) {
      child.stdin.write(`LANG:${row.language}\n`);
      child.stdin.write(`CODE_START\n`);
      child.stdin.write(`${row.code}\n`);
      child.stdin.write(`CODE_END\n`);
    }
    child.stdin.end();
  });
}

app.get("/stats", async (c) => {
  try {
    // 1. 从 Turso 数据库查询公开代码
    const res = await db.execute("SELECT language, code FROM snippets WHERE is_public = 1");
    const snippets = res.rows;

    if (snippets.length === 0) {
      return c.json({ detail: "当前没有可统计的公开片段" }, 400);
    }

    const isWindows = process.platform === "win32";
    const binaryPath = isWindows 
      ? join(process.cwd(), "tools", "cpp_stats", "cpp_stats.exe") 
      : join(process.cwd(), "api", "cpp_stats");

    if (!isWindows) {
      try {
        await access(binaryPath, constants.F_OK);
        await chmod(binaryPath, 0o755);
      } catch (e) {
        console.log("云端 C++ 权限或路径检查跳过:", e.message);
      }
    }

    const stats = await runCppStats(binaryPath, snippets);
    return c.json(stats);

  } catch (error) {
    console.error("统计失败:", error);
    return c.json({ detail: "统计失败", error: error.message }, 500);
  }
});

export default app;