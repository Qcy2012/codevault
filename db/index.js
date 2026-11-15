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
} else {
  db = createClient({ url: `file:${join(__dirname, "codevault.db")}` });
}

// 注意：这里只有普通的表，绝对没有 FTS5 和触发器
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
`;

// 1. 先执行基础建表
const statements = schema.split(";").map(s => s.trim()).filter(Boolean);
for (const stmt of statements) {
  try {
    await db.execute(stmt);
  } catch (e) {
    console.error("基础建表失败:", e.message);
  }
}

// 2. 独立执行 FTS5 虚拟表与触发器
try {
  // 虚拟表（去掉了 trigram 分词，使用默认分词保证兼容性）
  await db.execute(`
    CREATE VIRTUAL TABLE IF NOT EXISTS snippets_fts USING fts5(
      title, description, code, content='snippets', content_rowid='id'
    );
  `);

  // 三个触发器
  await db.execute(`
    CREATE TRIGGER IF NOT EXISTS snippets_ai AFTER INSERT ON snippets BEGIN
      INSERT INTO snippets_fts(rowid, title, description, code) VALUES (new.id, new.title, new.description, new.code);
    END;
  `);

  await db.execute(`
    CREATE TRIGGER IF NOT EXISTS snippets_ad AFTER DELETE ON snippets BEGIN
      INSERT INTO snippets_fts(snippets_fts, rowid, title, description, code) VALUES('delete', old.id, old.title, old.description, old.code);
    END;
  `);

  await db.execute(`
    CREATE TRIGGER IF NOT EXISTS snippets_au AFTER UPDATE ON snippets BEGIN
      INSERT INTO snippets_fts(snippets_fts, rowid, title, description, code) VALUES('delete', old.id, old.title, old.description, old.code);
      INSERT INTO snippets_fts(rowid, title, description, code) VALUES (new.id, new.title, new.description, new.code);
    END;
  `);

  // 将旧数据导入 FTS
  await db.execute(`
    INSERT INTO snippets_fts(rowid, title, description, code)
    SELECT id, title, description, code FROM snippets
    WHERE id NOT IN (SELECT rowid FROM snippets_fts);
  `);
  
  console.log("✅ FTS5 全文索引和触发器初始化成功");
} catch (e) {
  console.error("❌ FTS5 初始化失败:", e.message);
}

// 3. 自动迁移（以防万一之前旧表缺字段）
try {
  await db.execute("ALTER TABLE users ADD COLUMN api_key TEXT");
} catch (e) {}
try {
  await db.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_api_key ON users(api_key)");
} catch (e) {}
try {
  await db.execute("ALTER TABLE users ADD COLUMN api_key_usage INTEGER NOT NULL DEFAULT 0");
} catch (e) {}
try {
  await db.execute("ALTER TABLE users ADD COLUMN last_api_call_at TEXT");
} catch (e) {}
try {
  await db.execute("ALTER TABLE snippets ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0");
} catch (e) {}

export { db };