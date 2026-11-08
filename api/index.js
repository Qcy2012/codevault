import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { exec } from "node:child_process";
import { chmod } from "node:fs/promises";
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
    const binaryPath = isWindows 
      ? `"tools\\cpp_stats\\cpp_stats.exe"` 
      : `"./tools/cpp_stats/cpp_stats"`;

    // 生产环境下，赋予可执行权限（防止 EACCES 错误）
    if (!isWindows) {
      try {
        await chmod("./tools/cpp_stats/cpp_stats", 0o755);
      } catch (e) {
        console.log("chmod 跳过:", e.message);
      }
    }

    const { stdout } = await execPromise(`${binaryPath} "." --json`);
    return c.json(JSON.parse(stdout));
  } catch (error) {
    console.error("C++ 运行失败详情:", error);
    return c.json({ detail: "代码统计失败", error: error.message }, 500);
  }
});

// 直接导出 Hono 实例给 Vercel
export default app;