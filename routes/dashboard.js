import { Hono } from "hono";
import { db } from "../db/index.js";

const dashboard = new Hono();

dashboard.get("/", async (c) => {
  try {
    // 1. 基础汇总数据
    const usersCount = (await db.execute("SELECT COUNT(*) as count FROM users")).rows[0].count;
    const snippetsCount = (await db.execute("SELECT COUNT(*) as count FROM snippets")).rows[0].count;
    const likesCount = (await db.execute("SELECT COUNT(*) as count FROM likes")).rows[0].count;
    const viewsCount = (await db.execute("SELECT SUM(view_count) as count FROM snippets")).rows[0].count || 0;

    // 2. 语言分布 (柱状图/玫瑰图)
    const langRes = await db.execute(`
      SELECT language, COUNT(*) as count 
      FROM snippets 
      GROUP BY language 
      ORDER BY count DESC
    `);

    // 3. 过去 7 天发帖趋势 (折线图)
    // 为了兼容 SQLite 的日期格式，使用 date('now', '-X days')
    const trend7Days = [];
    for (let i = 6; i >= 0; i--) {
      const dateStr = (await db.execute(`SELECT date('now', '-${i} days') as d`)).rows[0].d;
      const count = (await db.execute({
        sql: "SELECT COUNT(*) as count FROM snippets WHERE date(created_at) = ?",
        args: [dateStr]
      })).rows[0].count;
      trend7Days.push({ date: dateStr, count });
    }

    // 4. 过去 365 天发帖热力图数据
    const heatmapData = (await db.execute(`
      SELECT date(created_at) as date, COUNT(*) as count 
      FROM snippets 
      WHERE created_at >= date('now', '-365 days')
      GROUP BY date(created_at)
    `)).rows;

    return c.json({
      summary: {
        users: Number(usersCount),
        snippets: Number(snippetsCount),
        likes: Number(likesCount),
        views: Number(viewsCount)
      },
      languages: langRes.rows.map(r => ({ name: r.language, value: Number(r.count) })),
      trend7Days,
      heatmapData
    });
  } catch (error) {
    console.error("获取大屏数据失败:", error);
    return c.json({ detail: "获取数据失败", error: error.message }, 500);
  }
});

export default dashboard;