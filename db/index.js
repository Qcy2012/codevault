import { connect } from "@tursodatabase/database";

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
  const fs = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const __dirname = dirname(fileURLToPath(import.meta.url));
  
  db = await connect(join(__dirname, "codevault.db"));
  const schema = fs.readFileSync(join(__dirname, "schema.sql"), "utf-8");
  await db.exec(schema);
}

export { db };