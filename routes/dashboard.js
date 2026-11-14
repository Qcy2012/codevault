import { Hono } from "hono";
import { db } from "../db/index.js";

const dashboard = new Hono();

dashboard.get("/", async (c) => {
  try {
    // 1. 基础汇总数据 (兼容 BigInt 和 null)
    const usersCount = (await db.execute("SELECT COUNT(*) as count FROM users")).rows[0]?.count || 0;
    const snippetsCount = (await db.execute("SELECT COUNT(*) as count FROM snippets")).rows[0]?.count || 0;
    const likesCount = (await db.execute("SELECT COUNT(*) as count FROM likes")).rows[0]?.count || 0;
    const viewsCount = (await db.execute("SELECT SUM(view_count) as count FROM snippets")).rows[0]?.count || 0;

    // 2. 语言分布
    const langRes = await db.execute(`
      SELECT language, COUNT(*) as count 
      FROM snippets 
      GROUP BY language 
      ORDER BY count DESC
    `);

    // 3. 获取所有代码的创建时间，在 JS 中进行时间统计（避开 SQL 时间函数兼容性问题）
    const allSnippets = (await db.execute("SELECT created_at FROM snippets")).rows;

    // 统计过去 7 天趋势
    const trend7Days = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().split('T')[0]; // 获取 YYYY-MM-DD
      
      // 在 JS 里过滤匹配该日期的数量
      const count = allSnippets.filter(s => s.created_at && s.created_at.startsWith(dateStr)).length;
      trend7Days.push({ date: dateStr, count });
    }

    // 统计过去 365 天热力图数据
    const heatmapData = allSnippets
      .filter(s => s.created_at && s.created_at.length >= 10)
      .map(s => s.created_at.substring(0, 10)) // 截取 YYYY-MM-DD
      .reduce((acc, date) => {
        acc[date] = (acc[date] || 0) + 1;
        return acc;
      }, {});
      
    // 转为 ECharts 需要的数组格式
    const heatmapArray = Object.keys(heatmapData).map(date => ({ date, count: heatmapData[date] }));

    return c.json({
      summary: {
        users: Number(usersCount),
        snippets: Number(snippetsCount),
        likes: Number(likesCount),
        views: Number(viewsCount)
      },
      languages: langRes.rows.map(r => ({ name: r.language, value: Number(r.count) })),
      trend7Days,
      heatmapData: heatmapArray
    });
  } catch (error) {
    console.error("获取大屏数据失败:", error);
    return c.json({ detail: "获取数据失败", error: error.message }, 500);
  }
});

export default dashboard;