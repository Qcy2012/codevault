import { connect as connectLocal } from "@tursodatabase/database";
import { connect as connectRemote } from "@tursodatabase/serverless";

const isProduction = process.env.NODE_ENV === "production";
let db;

if (isProduction) {
  // 生产环境：强制使用 Turso Serverless 驱动连接远程数据库
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    throw new Error("生产环境缺少 TURSO_DATABASE_URL 或 TURSO_AUTH_TOKEN");
  }

  db = connectRemote({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  console.log("Connected to Turso Cloud via @tursodatabase/serverless");
} else {
  // 本地开发环境：继续使用 @tursodatabase/database 读写本地文件
  const fs = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const __dirname = dirname(fileURLToPath(import.meta.url));

  db = await connectLocal(join(__dirname, "codevault.db"));
  const schema = fs.readFileSync(join(__dirname, "schema.sql"), "utf-8");
  await db.exec(schema);
  console.log("Connected to local SQLite database");
}

export { db };