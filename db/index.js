import { connect as connectLocal } from "@tursodatabase/database";
import { connect as connectRemote } from "@tursodatabase/serverless";

const isProduction = process.env.NODE_ENV === "production";
let db;

if (isProduction) {
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    throw new Error("生产环境缺少 TURSO_DATABASE_URL 或 TURSO_AUTH_TOKEN");
  }

  const client = connectRemote({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  console.log("Connected to Turso Cloud via @tursodatabase/serverless");

  // 核心适配器：把 serverless 的 execute 伪装成本地库的 prepare().get/all/run
  db = {
    prepare: (sql) => {
      return {
        get: async (...args) => {
          const res = await client.execute({ sql, args });
          return res.rows[0]; // 取第一行
        },
        all: async (...args) => {
          const res = await client.execute({ sql, args });
          return res.rows; // 取所有行
        },
        run: async (...args) => {
          const res = await client.execute({ sql, args });
          return {
            lastInsertRowid: Number(res.lastInsertRowid), // 转成普通数字
            changes: Number(res.rowsAffected),
          };
        },
      };
    },
    exec: async (sql) => {
      return await client.execute(sql);
    },
  };
} else {
  // 本地开发环境
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