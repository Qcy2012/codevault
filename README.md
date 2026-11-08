# 📦 CodeVault - 开源代码片段管理平台

CodeVault 是一个轻量级、全栈无框架的代码片段分享与管理平台。不同于常规的 CRUD 项目，本项目在 Serverless 架构的基础上，**引入了 C++17 作为底层的代码分析引擎**，实现了 Node.js 与 C++ 的跨语言数据管道通信。

> 🌐 **在线体验地址**: [https://codevault.qcyblog.dpdns.org](https://codevault.qcyblog.dpdns.org)

---

## ✨ 核心特性

*   **极简架构**：前端使用原生 HTML/CSS/JS，零构建工具（无 Webpack/Vite），极致轻量。
*   **多维度代码高亮**：集成 `highlight.js` 与 `marked`，提供丝滑的阅读体验，并基于 `DOMPurify` 防范 XSS 攻击。
*   **双重认证登录**：支持“用户名”或“邮箱”+ 密码进行 JWT 鉴权登录。
*   **完善的权限系统**：区分普通用户、资源所有者与管理员，提供管理后台（封禁/删除片段）。
*   **🚀 跨语言统计引擎**：用 C++17 编写代码文本解析器，通过标准输入输出（stdin/stdout）与 Node.js 后端进行进程间通信，极速分析全站代码的语言分布、注释比例与实际代码行数。

---

## 🛠️ 技术栈

| 模块 | 技术选型 | 说明 |
| :--- | :--- | :--- |
| **前端** | Vanilla JS, Chart.js | 原生 DOM 操作，无框架依赖，响应式 UI |
| **后端** | Node.js, Hono | 采用 Hono 这一超轻量 Web 框架，完美适配 Serverless |
| **数据库** | Turso (libSQL), SQLite | 本地开发用文件，云端无缝切换 Turso 分布式数据库 |
| **核心引擎** | **C++17** | 手写状态机解析代码词法，统计行数与注释 |
| **部署** | Vercel (Serverless) | 前后端同域部署，自动构建 C++ 二进制文件 |

---

## 🏗️ 架构设计与跨语言通信

在 Vercel Serverless 环境下，后端的运行环境是隔离且只读的。为了让 C++ 能够处理数据库中的云端数据，本项目设计了如下数据管道：

1. 前端向 `/api/stats` 发起请求。
2. Node.js 后端连接 Turso 数据库，查询出所有公开的代码片段。
3. Node.js 使用 `child_process.spawn` 启动 C++ 二进制程序。
4. Node.js 将代码片段通过 **stdin（标准输入）** 流式传递给 C++。
5. C++ 进程利用状态机对代码文本进行逐行分析，计算各类指标。
6. C++ 将统计结果以 JSON 格式通过 **stdout（标准输出）** 返回给 Node.js。
7. Node.js 将结果透传给前端，由 Chart.js 渲染饼图。

---

## 💡 工程实践与踩坑记录

*   **Serverless 环境适配**：解决了 Vercel 生产环境只读导致的 SQLite 初始化崩溃问题，统一使用 `@libsql/client` 抹平了本地与云端的驱动差异。
*   **C++ 跨平台编译与执行**：通过 `g++ -O3 -std=c++17` 在 Vercel 构建阶段编译；针对 Windows 本地和 Linux 云端的环境差异，动态处理了路径拼接（`.exe` 后缀）、字符编码（`\r\n` 换行符）与文件执行权限（`chmod 0o755`）。
*   **SQL 兼容性避坑**：舍弃了 `INSERT OR IGNORE` 等方言，全面使用标准的 `ON CONFLICT DO NOTHING` 语法，保证了 SQLite 与 libSQL 的完美兼容。

---

## 💻 本地运行指南

### 1. 克隆项目并安装依赖
```bash
git clone https://github.com/Qcy2012/codevault.git
cd codevault
npm install
```

### 2. 环境变量配置
复制 `.env.example` 并重命名为 `.env`，填入以下内容（本地开发默认使用 SQLite 文件）：
```env
PORT=3000
NODE_ENV=development
JWT_SECRET=your_super_secret_key
```

### 3. 编译 C++ 统计引擎
```bash
cd tools/cpp_stats
g++ -std=c++17 main.cpp -o cpp_stats.exe
cd ../..
```

### 4. 启动服务
```bash
npm run dev
```
访问 `http://127.0.0.1:3000` 即可进入首页。

---

## 📂 目录结构

```text
codevault/
├── api/                 # Vercel Serverless 入口与 C++ 编译产物
├── auth/                # JWT 签发与密码哈希
├── db/                  # 数据库连接与 schema 初始化
├── middleware/          # Hono 路由鉴权中间件
├── public/              # 前端静态文件 (HTML/CSS/JS)
├── routes/              # 业务逻辑接口 (Auth/Snippets/Admin)
├── tools/
│   └── cpp_stats/       # C++ 源码目录 (主分析引擎)
├── server.js            # 本地开发服务器入口 (含静态托管)
├── vercel.json          # Vercel 部署与路由配置
└── package.json
```
