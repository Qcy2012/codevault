import { Hono } from "hono";
import { db } from "../db/index.js";

const tags = new Hono();

tags.get("/", async (c) => {
  const q = c.req.query("q")?.trim() || "";
  const rows = q
    ? await db
        .prepare("SELECT id, name FROM tags WHERE name LIKE ? ORDER BY name LIMIT 100")
        .all(`%${q}%`)
    : await db
        .prepare("SELECT id, name FROM tags ORDER BY name LIMIT 100")
        .all();

  return c.json(rows);
});

export default tags;