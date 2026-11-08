import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { exec } from "node:child_process";
import { chmod, access } from "node:fs/promises";
import { join } from "node:path";
import { constants } from "node:fs";
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

// 新增：调用 C++ 工具的接口
app.get("/stats", async (c) => {
  try {
    const isWindows = process.platform === "win32";
    
    // 明确指定 exe 文件路径
    const binaryPath = isWindows 
      ? join(process.cwd(), "tools", "cpp_stats", "cpp_stats.exe") 
      : join(process.cwd(), "api", "cpp_stats");

    // 检查文件是否存在，避免瞎执行
    try {
      await access(binaryPath, constants.F_OK);
    } catch (e) {
      return c.json({ detail: `找不到统计工具: ${binaryPath}` }, 500);
    }

    // 赋予执行权限 (针对 Linux/Vercel)
    if (!isWindows) {
      try {
        await chmod(binaryPath, 0o755);
      } catch (e) {
        console.log("chmod 跳过:", e.message);
      }
    }

    // 修复执行逻辑：
    // 1. 用双引号包裹路径（防止中文路径报错）
    // 2. 扫描根目录 "." 也要用双引号
    // 3. Windows 下推荐使用 exec 配合 shell 执行
    const cmd = `"${binaryPath}" "." --json`;
    
    const { stdout } = await execPromise(cmd, { 
      cwd: process.cwd(), // 明确指定工作目录
      encoding: "utf-8" 
    });
    
    return c.json(JSON.parse(stdout));
  } catch (error) {
    console.error("C++ 运行失败详情:", error);
    return c.json({ 
      detail: "代码统计失败", 
      error: error.message,
      stderr: error.stderr || ""
    }, 500);
  }
});

// 直接导出 Hono 实例给 Vercel
export default app;