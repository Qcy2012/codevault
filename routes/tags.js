import { Hono } from "hono";
import { db } from "../db/index.js";

const tags = new Hono();

tags.get("/", async (c) => {
  const q = c.req.query("q")?.trim() || "";
  let res;
  
  if (q) {
    res = await db.execute({
      sql: "SELECT id, name FROM tags WHERE name LIKE ? ORDER BY name LIMIT 100",
      args: [`%${q}%`]
    });
  } else {
    res = await db.execute("SELECT id, name FROM tags ORDER BY name LIMIT 100");
  }

  return c.json(res.rows);
});

export default tags;