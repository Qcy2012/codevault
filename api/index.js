import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { exec } from "node:child_process";
import util from "node:util";

const execPromise = util.promisify(exec);
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

// 新增：调用 C++ 工具的接口
app.get("/stats", async (c) => {
  try {
    const isWindows = process.platform === "win32";
    
    // Windows 下不要用 './'，直接写路径；并且用双引号包裹防止路径包含空格报错
    const binaryPath = isWindows 
      ? `"tools\\cpp_stats\\cpp_stats.exe"` 
      : `"./tools/cpp_stats/cpp_stats"`;

    // 运行二进制文件（注意参数里也统一用双引号包裹 '.'）
    const { stdout } = await execPromise(`${binaryPath} "." --json`);
    return c.json(JSON.parse(stdout));
  } catch (error) {
    console.error("C++ 运行失败详情:", error);
    return c.json({ detail: "代码统计失败", error: error.message }, 500);
  }
});

// 直接导出 Hono 实例给 Vercel
export default app;