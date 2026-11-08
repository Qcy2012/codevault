import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { exec } from "node:child_process";
import { chmod, access } from "node:fs/promises";
import { join } from "node:path";
import { constants } from "node:fs";
import { spawn } from "node:child_process";
import { db } from "../db/index.js"; // 引入数据库
import util from "node:util";

const execPromise = util.promisify(exec);
import authRoutes from "../routes/auth.js";
import snippetRoutes from "../routes/snippets.js";
import tagRoutes from "../routes/tags.js";
import adminRoutes from "../routes/admin.js";

const app = new Hono().basePath("/api");

app.onError((err, c) => {
  console.error("Vercel 后端发生崩溃:", err);
  return c.json({ 
    detail: `后端错误: ${err.message}` 
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

// 因为前面设置了 basePath("/api")，这里直接写 "/auth" 即可
app.route("/auth", authRoutes);
app.route("/snippets", snippetRoutes);
app.route("/tags", tagRoutes);
app.route("/admin", adminRoutes);

app.get("/health", (c) => c.json({ status: "ok" }));

// 提取出一个 Promise，保证等待 C++ 运行结束
function runCppStats(binaryPath, snippets) {
  return new Promise((resolve, reject) => {
    const child = spawn(binaryPath);
    let outputData = "";
    let errorData = "";

    child.stdout.on("data", (data) => { outputData += data.toString(); });
    child.stderr.on("data", (data) => { errorData += data.toString(); });

    // 如果找不到 exe 文件，会触发 error
    child.on("error", (err) => {
      reject(new Error(`无法启动 C++ 程序: ${err.message}`));
    });

    // 进程结束
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

    // 喂数据
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
    const res = await db.execute("SELECT language, code FROM snippets WHERE is_public = 1");
    const snippets = res.rows;

    // 加一行日志，看看数据库查出来没有
    console.log(`📊 准备发送 ${snippets.length} 个片段给 C++ 分析`);

    if (snippets.length === 0) {
      return c.json({ detail: "当前没有可统计的公开片段" }, 400);
    }

    const isWindows = process.platform === "win32";
    const binaryPath = isWindows 
      ? join(process.cwd(), "tools", "cpp_stats", "cpp_stats.exe") 
      : join(process.cwd(), "api", "cpp_stats");

    // 加一行日志，看看路径对不对
    console.log(`🔧 正在启动 C++ 进程: ${binaryPath}`);

    const stats = await runCppStats(binaryPath, snippets);
    
    // 加一行日志，看看 C++ 算出来了什么
    console.log(`✅ C++ 分析完成:`, stats);

    return c.json(stats);
  } catch (error) {
    console.error("统计失败:", error);
    return c.json({ detail: "统计失败", error: error.message }, 500);
  }
});

// 直接导出 Hono 实例给 Vercel
export default app;