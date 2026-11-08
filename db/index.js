// db/index.js
import { createClient } from "@libsql/client";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === "production";
let db;

if (isProduction) {
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    throw new Error("生产环境缺少 TURSO_DATABASE_URL 或 TURSO_AUTH_TOKEN");
  }
  const url = process.env.TURSO_DATABASE_URL.replace("libsql://", "https://").trim();
  const token = process.env.TURSO_AUTH_TOKEN.trim();
  db = createClient({ url, authToken: token });
  console.log("Connected to Turso Cloud via @libsql/client/web");
} else {
  // 本地开发环境：直接读取本地文件
  db = createClient({ url: `file:${join(__dirname, "codevault.db")}` });
  console.log("Connected to local SQLite database via @libsql/client");
}

// 自动建表逻辑（本地和线上都运行）
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
`;

const statements = schema.split(";").map(s => s.trim()).filter(Boolean);
for (const stmt of statements) {
  try {
    await db.execute(stmt);
  } catch (e) {
    console.error("建表失败:", e.message);
  }
}

export { db };