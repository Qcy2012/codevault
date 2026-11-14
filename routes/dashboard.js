import { Hono } from "hono";
import { db } from "../db/index.js";

const dashboard = new Hono();

dashboard.get("/", async (c) => {
  try {
    // 1. 基础汇总数据（强制使用 parseInt 转换，避免 BigInt 导致 JSON 报错）
    const usersRes = await db.execute("SELECT COUNT(*) as count FROM users");
    const snippetsRes = await db.execute("SELECT COUNT(*) as count FROM snippets");
    const likesRes = await db.execute("SELECT COUNT(*) as count FROM likes");
    const viewsRes = await db.execute("SELECT SUM(view_count) as count FROM snippets");

    const summary = {
      users: parseInt(usersRes.rows[0]?.count || 0, 10),
      snippets: parseInt(snippetsRes.rows[0]?.count || 0, 10),
      likes: parseInt(likesRes.rows[0]?.count || 0, 10),
      views: parseInt(viewsRes.rows[0]?.count || 0, 10),
    };

    // 2. 语言分布
    const langRes = await db.execute(`
      SELECT language, COUNT(*) as count 
      FROM snippets 
      GROUP BY language 
      ORDER BY count DESC
    `);
    const languages = langRes.rows.map(r => ({ name: r.language, value: parseInt(r.count, 10) }));

    // 3. 获取所有代码的创建时间
    const allSnippetsRes = await db.execute("SELECT created_at FROM snippets");
    const allSnippets = allSnippetsRes.rows || [];

    // 4. 过去 7 天发帖趋势
    const trend7Days = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const count = allSnippets.filter(s => s.created_at && String(s.created_at).startsWith(dateStr)).length;
      trend7Days.push({ date: dateStr, count });
    }

    // 5. 过去 365 天发帖热力图
    const heatmapMap = {};
    allSnippets.forEach(s => {
      if (s.created_at && String(s.created_at).length >= 10) {
        const date = String(s.created_at).substring(0, 10);
        heatmapMap[date] = (heatmapMap[date] || 0) + 1;
      }
    });
    const heatmapData = Object.keys(heatmapMap).map(date => ({ date, count: heatmapMap[date] }));

    return c.json({ summary, languages, trend7Days, heatmapData });
    
  } catch (error) {
    console.error("💥 大屏数据获取失败:", error);
    return c.json({ detail: "大屏数据获取失败", error: error.message }, 500);
  }
});

export default dashboard;