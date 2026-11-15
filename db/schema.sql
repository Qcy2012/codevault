CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name  TEXT NOT NULL UNIQUE,
    is_admin      INTEGER NOT NULL DEFAULT 0,
    api_key       TEXT UNIQUE,
    api_key_usage INTEGER NOT NULL DEFAULT 0,
    last_api_call_at TEXT,
    last_active_at   TEXT,
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
-- 建立 FTS5 虚拟表（使用 trigram 分词器，完美支持代码和中英文字符的模糊匹配）
CREATE VIRTUAL TABLE IF NOT EXISTS snippets_fts USING fts5(
    title,
    description,
    code,
    content='snippets',
    content_rowid='id',
    tokenize='trigram'
);

-- 触发器：新增数据时同步
CREATE TRIGGER IF NOT EXISTS snippets_ai AFTER INSERT ON snippets BEGIN
  INSERT INTO snippets_fts(rowid, title, description, code) VALUES (new.id, new.title, new.description, new.code);
END;

-- 触发器：删除数据时同步
CREATE TRIGGER IF NOT EXISTS snippets_ad AFTER DELETE ON snippets BEGIN
  INSERT INTO snippets_fts(snippets_fts, rowid, title, description, code) VALUES('delete', old.id, old.title, old.description, old.code);
END;

-- 触发器：更新数据时同步
CREATE TRIGGER IF NOT EXISTS snippets_au AFTER UPDATE ON snippets BEGIN
  INSERT INTO snippets_fts(snippets_fts, rowid, title, description, code) VALUES('delete', old.id, old.title, old.description, old.code);
  INSERT INTO snippets_fts(rowid, title, description, code) VALUES (new.id, new.title, new.description, new.code);
END;

-- 将现有的旧数据导入 FTS 引擎（如果表是空的，这句不会有副作用）
INSERT INTO snippets_fts(rowid, title, description, code)
SELECT id, title, description, code FROM snippets
WHERE id NOT IN (SELECT rowid FROM snippets_fts);