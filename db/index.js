import { connect as connectLocal } from "@tursodatabase/database";
import { createClient } from "@libsql/client/web";

const isProduction = process.env.NODE_ENV === "production";
let db;

if (isProduction) {
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    throw new Error("生产环境缺少 TURSO_DATABASE_URL 或 TURSO_AUTH_TOKEN");
  }

  // 强制将 libsql:// 替换为 https://，避免 fetch failed
  // db/index.js 生产环境部分
  const url = process.env.TURSO_DATABASE_URL.replace("libsql://", "https://").trim();
  const token = process.env.TURSO_AUTH_TOKEN.trim();

  console.log("使用的数据库 URL:", url);
  console.log("Token 前 10 位:", token.substring(0, 10) + "...");

  db = createClient({
    url,
    authToken: token,
  });
  console.log("Connected to Turso via @libsql/client/web");
} else {
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