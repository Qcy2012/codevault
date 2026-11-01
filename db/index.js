import { connect } from "@tursodatabase/database";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === "production";

let db;

if (isProduction) {
  if (!process.env.TURSO_DATABASE_URL) {
    throw new Error("NODE_ENV=production 时必须设置 TURSO_DATABASE_URL");
  }
  db = await connect(process.env.TURSO_DATABASE_URL, {
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
} else {
  // 关键改动：数据库文件固定生成在 db/ 目录下，与 index.js 同级
  db = await connect(join(__dirname, "codevault.db"));
}

const schema = fs.readFileSync(join(__dirname, "schema.sql"), "utf-8");
await db.exec(schema);

export { db };