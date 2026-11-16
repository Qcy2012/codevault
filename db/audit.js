import { db } from "./index.js";

export async function logAction(c, action, details = "") {
  try {
    const user = c.get("user");
    const userId = user ? user.id : null;
    const displayName = user ? user.display_name : "Anonymous";
    
    // 获取真实 IP
    const ip = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown";

    await db.execute({
      sql: "INSERT INTO audit_logs (user_id, display_name, action, details, ip_address) VALUES (?, ?, ?, ?, ?)",
      args: [userId, displayName, action, details, ip]
    });
  } catch (error) {
    console.error("写入审计日志失败:", error);
  }
}