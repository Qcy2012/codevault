import { connect as connectLocal } from "@tursodatabase/database";
import { createClient } from "@libsql/client/web";

const isProduction = process.env.NODE_ENV === "production";
let db;

// 把建表语句直接写在代码里，避免 Vercel 找不到 schema.sql 文件
const schema = `
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name  TEXT NOT NULL UNIQUE,
    is_admin      INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS snippets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    description TEXT,
    language    TEXT NOT NULL,
    code        TEXT NOT NULL,
    is_public   INTEGER NOT NULL DEFAULT 1,
    view_count  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS tags (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS snippet_tags (
    snippet_id INTEGER NOT NULL REFERENCES snippets(id) ON DELETE CASCADE,
    tag_id     INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (snippet_id, tag_id)
);
CREATE TABLE IF NOT EXISTS favorites (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    snippet_id INTEGER NOT NULL REFERENCES snippets(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, snippet_id)
);
CREATE INDEX IF NOT EXISTS idx_snippets_public_time ON snippets(is_public, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_snippets_user ON snippets(user_id);
CREATE INDEX IF NOT EXISTS idx_snippets_language ON snippets(language);
CREATE INDEX IF NOT EXISTS idx_snippet_tags_tag ON snippet_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
`;

if (isProduction) {
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    throw new Error("生产环境缺少 TURSO_DATABASE_URL 或 TURSO_AUTH_TOKEN");
  }

  const url = process.env.TURSO_DATABASE_URL.replace("libsql://", "https://").trim();
  const token = process.env.TURSO_AUTH_TOKEN.trim();

  db = createClient({ url, authToken: token });
  console.log("Connected to Turso via @libsql/client/web");

  // 在生产环境自动建表
  const statements = schema.split(";").map(s => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    try {
      await db.execute(stmt);
    } catch (e) {
      console.error("建表失败:", e);
    }
  }
  console.log("✅ Turso 数据库表结构检查/初始化完成");
} else {
  // 本地开发环境
  const fs = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const __dirname = dirname(fileURLToPath(import.meta.url));

  db = await connectLocal(join(__dirname, "codevault.db"));
  await db.exec(schema);
  console.log("Connected to local SQLite database");
}

export { db };