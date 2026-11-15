// db/index.js
import { createClient } from "@libsql/client"; // 修复：改为 createClient
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
  db = createClient({ url, authToken: token }); // 修复：改为 createClient
} else {
  db = createClient({ url: `file:${join(__dirname, "codevault.db")}` }); // 修复：改为 createClient
}

const schema = `
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name  TEXT NOT NULL UNIQUE,
    is_admin      INTEGER NOT NULL DEFAULT 0,
    api_key       TEXT UNIQUE,
    api_key_usage INTEGER NOT NULL DEFAULT 0,
    last_api_call_at TEXT,
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
    is_deleted  INTEGER NOT NULL DEFAULT 0,
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
CREATE TABLE IF NOT EXISTS comments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    snippet_id INTEGER NOT NULL REFERENCES snippets(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS likes (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    snippet_id INTEGER NOT NULL REFERENCES snippets(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, snippet_id)
);
CREATE TABLE IF NOT EXISTS status_checks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    status      TEXT NOT NULL, -- 'up' 或 'down'
    duration_ms INTEGER NOT NULL, -- 响应耗时
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS incidents (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    title        TEXT NOT NULL,
    status       TEXT NOT NULL, -- 'investigating' (调查中), 'resolved' (已解决)
    started_at   TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at  TEXT
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

try {
  await db.execute("ALTER TABLE snippets ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0");
  console.log("✅ 成功添加 is_deleted 字段");
} catch (e) {
  // 如果字段已经存在，SQLite 会抛出错误，这里直接忽略即可
  if (!e.message.includes("duplicate column name")) {
    console.log("迁移检查:", e.message);
  }
}

try {
  await db.execute("ALTER TABLE users ADD COLUMN api_key TEXT UNIQUE");
  console.log("✅ 成功添加 api_key 字段");
} catch (e) {
  if (!e.message.includes("duplicate column name")) console.log("迁移检查:", e.message);
}

try {
  await db.execute("ALTER TABLE users ADD COLUMN api_key_usage INTEGER NOT NULL DEFAULT 0");
} catch (e) { /* 忽略 */ }

try {
  await db.execute("ALTER TABLE users ADD COLUMN last_api_call_at TEXT");
} catch (e) { /* 忽略 */ }

export { db };