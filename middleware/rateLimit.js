// middleware/rateLimit.js
import { createMiddleware } from "hono/factory";

// 内存缓存记录，格式: { "IP": [时间戳1, 时间戳2, ...] }
const ipRequests = new Map();

/**
 * @param {number} maxRequests 时间窗口内允许的最大请求数
 * @param {number} windowMs 时间窗口大小(毫秒)
 */
export const rateLimit = (maxRequests = 5, windowMs = 60000) => {
  return createMiddleware(async (c, next) => {
    // 获取客户端 IP (Vercel 环境下优先取 x-forwarded-for)
    const ip = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown-ip";
    const now = Date.now();

    if (!ipRequests.has(ip)) {
      ipRequests.set(ip, []);
    }

    // 过滤出当前时间窗口内的请求记录
    let requests = ipRequests.get(ip).filter(timestamp => now - timestamp < windowMs);
    
    if (requests.length >= maxRequests) {
      return c.json({ detail: "请求过于频繁，请稍后再试！" }, 429); // 429 Too Many Requests
    }

    // 记录本次请求
    requests.push(now);
    ipRequests.set(ip, requests);

    // 定期清理过期数据，防止内存泄漏 (简单实现)
    if (Math.random() < 0.05) { // 5% 概率触发清理
      for (const [key, value] of ipRequests.entries()) {
        const valid = value.filter(t => now - t < windowMs);
        if (valid.length === 0) ipRequests.delete(key);
        else ipRequests.set(key, valid);
      }
    }

    await next();
  });
};