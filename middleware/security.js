// middleware/security.js
import { createMiddleware } from "hono/factory";

// 简单的敏感词/恶意标签黑名单
const FORBIDDEN_WORDS = ["<script>", "javascript:", "onerror=", "onload="];

export const sanitizeInput = createMiddleware(async (c, next) => {
  // 只拦截写入操作
  if (["POST", "PUT"].includes(c.req.method)) {
    const contentType = c.req.header("Content-Type") || "";
    
    if (contentType.includes("application/json")) {
      try {
        const body = await c.req.json();
        
        // 递归清理对象中的字符串
        const cleanData = (data) => {
          if (typeof data === "string") {
            let cleaned = data;
            for (const word of FORBIDDEN_WORDS) {
              // 简单替换掉危险标签
              const regex = new RegExp(word, "gi");
              cleaned = cleaned.replace(regex, "***");
            }
            return cleaned;
          }
          if (Array.isArray(data)) return data.map(cleanData);
          if (typeof data === "object" && data !== null) {
            const obj = {};
            for (const [key, value] of Object.entries(data)) {
              obj[key] = cleanData(value);
            }
            return obj;
          }
          return data;
        };

        // 把清理后的数据重新注入请求体（Hono 的特性）
        c.req.rawBody = JSON.stringify(cleanData(body));
      } catch (e) {
        // 如果解析失败，直接交给后续路由报错
      }
    }
  }
  await next();
});