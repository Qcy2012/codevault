import { Hono } from "hono";
import { db } from "../db/index.js";
import { exec } from "node:child_process";
import util from "node:util";

const execPromise = util.promisify(exec);
const status = new Hono();

// 1. 核心监控接口（由 Vercel Cron 定时调用）
status.get("/cron", async (c) => {
  const startTime = Date.now();
  let isUp = true;
  let errorMsg = "";

  try {
    // 这里模拟真实的检查：比如检查数据库连接
    await db.execute("SELECT 1");
    
    // 如果部署在 Vercel，也可以顺便检查一下 C++ 引擎是否正常（可选）
    // 为了速度，这里只做轻量级检查
  } catch (error) {
    isUp = false;
    errorMsg = error.message;
  }

  const duration = Date.now() - startTime;
  const statusStr = isUp ? "up" : "down";

  // 写入检查记录
  await db.execute({
    sql: "INSERT INTO status_checks (status, duration_ms) VALUES (?, ?)",
    args: [statusStr, duration]
  });

  // 状态机逻辑：检查是否需要创建或解决 Incident
  // 获取最近一次的 Incident
  const latestIncident = (await db.execute(
    "SELECT * FROM incidents ORDER BY id DESC LIMIT 1"
  )).rows[0];

  if (!isUp) {
    // 如果服务挂了，且当前没有正在调查中的 Incident，则创建一个
    if (!latestIncident || latestIncident.status === "resolved") {
      await db.execute({
        sql: "INSERT INTO incidents (title, status) VALUES (?, ?)",
        args: [`服务宕机: ${errorMsg.substring(0, 50)}`, "investigating"]
      });
    }
  } else {
    // 如果服务恢复了，且当前有正在调查中的 Incident，则将其标记为已解决
    if (latestIncident && latestIncident.status === "investigating") {
      await db.execute({
        sql: "UPDATE incidents SET status = 'resolved', resolved_at = datetime('now') WHERE id = ?",
        args: [latestIncident.id]
      });
    }
  }

  return c.json({ status: statusStr, duration });
});

// 2. 获取过去 30 天的监控数据（供前端展示）
status.get("/data", async (c) => {
  // 获取所有的 Incident
  const incidents = (await db.execute(
    "SELECT * FROM incidents ORDER BY started_at DESC"
  )).rows;

  // 获取过去 30 天的每日可用率 (按天分组)
  const dailyStats = (await db.execute(`
    SELECT 
      date(created_at) as date,
      COUNT(*) as total_checks,
      SUM(CASE WHEN status = 'up' THEN 1 ELSE 0 END) as up_checks
    FROM status_checks
    WHERE created_at >= date('now', '-30 days')
    GROUP BY date(created_at)
    ORDER BY date(created_at) ASC
  `)).rows;

  // 获取最近 50 次检查明细（用于展示响应时间）
  const recentChecks = (await db.execute(
    "SELECT * FROM status_checks ORDER BY created_at DESC LIMIT 50"
  )).rows;

  return c.json({
    incidents,
    dailyStats: dailyStats.map(d => ({
      date: d.date,
      uptime: (Number(d.up_checks) / Number(d.total_checks)) * 100
    })),
    recentChecks: recentChecks.map(r => ({
      status: r.status,
      duration_ms: r.duration_ms,
      created_at: r.created_at
    }))
  });
});

export default status;