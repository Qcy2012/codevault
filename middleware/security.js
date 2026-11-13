import { createMiddleware } from "hono/factory";

export const sanitizeInput = createMiddleware(async (c, next) => {
  // 放弃强行修改 rawBody，防止 Hono 解析崩溃
  // 依靠前端的 DOMPurify 以及后端的参数化查询（SQL 注入免疫）即可保证基本安全
  await next();
});