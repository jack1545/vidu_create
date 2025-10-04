# VIDU批量提交视频工具 Chrome 插件

1. 打开Chrome浏览器，在网页页输入 chrome://extensions/，打开右上角开发者模式
2. 把解压的插件目录拖进来
3. 打开vidu.cn，在页面中间会悬浮一个设置按钮，点击进入
4. 左上角点击打开文件，选择项目文件

## 项目文件夹说明
1. 项目文件夹应该包含：分镜图、prompt.txt

![项目目录内容](/guide/1.png)

2. prompt.txt 的提示词一行一条，也可以后面添加

![prompt内容](/guide/2.png)

3. 插件工作界面

批量提交默认是将所有分镜一次性按顺序提交（可能存在bug）

![插件界面](/guide/3.png)

## 豆包视频批量提交插件未完成：😂 Creative Workbench → Doubao Video (Chrome Extension MVP)

This Chrome extension reads `cw` param from `doubao.com` and attempts to automate the video generation workflow.

## Install (Developer Mode)
1. Open Chrome → Extensions → Manage Extensions.
2. Enable Developer Mode.
3. Click "Load unpacked" and select `f:\2025\youtube\doubao\API_Guide\chrome-extension`.

## Usage
- In your Creative Workbench Storyboard workflow, click the "Doubao video" button on a Shot card.
- It will open `https://www.doubao.com/?cw=<payload>` where payload contains `imageUrl` and `prompt`.
- The extension content script decodes it and:
  - Tries to click "新对话".
  - Attempts to upload the image (MVP: inserts the image URL in the prompt area if file upload is restricted).
  - Fills the prompt text.
  - Clicks submit.

## Notes
- Real file uploads usually require a user gesture; extensions cannot arbitrarily write local files. This MVP focuses on URL insertion.
- You can adapt selectors in `content.js` to match doubao.com UI.
- If you already have login/session, the workflow should proceed immediately.

## 部署方案（Creative Workbench / Storyboard / API）

本项目的主应用位于 `creative-workbench/`，支持两种典型部署方式：独立服务器（自管）与 Vercel（Serverless）。以下方案以“图片 URL 存储 + MongoDB”为核心，避免把 Base64 `data:image` 直接写库。

### 一、独立服务器部署（推荐使用 MongoDB Atlas 托管）
- 前置要求：
  - 安装 `Node.js >= 18`
  - 使用 MongoDB Atlas（推荐）或自建 MongoDB（需开启认证、TLS、备份）
  - 反向代理与 HTTPS：`nginx` + `certbot`（Let’s Encrypt）
  - 进程守护：`pm2`
- 目录与构建：
  - 切换到 `creative-workbench/`
  - 构建：`npm ci && npm run build`
  - 启动（生产）：`npm run start`（或 `pm2 start "npm run start" --name creative-workbench --cwd ./`）
- 必要环境变量（在服务器上设置，不要写入仓库）：
  - `MONGODB_URI`、`MONGODB_DB`
  - 可选（对象存储与直传）：
    - Cloudflare Images：`CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_API_TOKEN`、`NEXT_PUBLIC_CF_IMAGES_ACCOUNT_HASH`
    - Cloudflare R2：`R2_ACCOUNT_ID`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`、`R2_BUCKET`
  - 如使用其他存储（如 Supabase）：`SUPABASE_URL`、`SUPABASE_ANON_KEY`
- 反向代理（示例 `nginx` 配置）：
  ```nginx
  server {
    listen 80;
    server_name your.domain.com;

    location / {
      proxy_pass http://127.0.0.1:3001; # Next.js 生产端口
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
    }

    client_max_body_size 20M; # 控制上传大小
  }
  ```
- 图片直传与 URL 存储（二选一）：
  - Cloudflare Images（便捷，内置裁剪/变体/CDN）：
    - 服务端生成直传链接：`POST https://api.cloudflare.com/client/v4/accounts/{account_id}/images/v2/direct_upload`
    - 前端用返回的 `uploadURL` 直接上传图片，得到 `image_id`
    - 写库时仅保存 `https://imagedelivery.net/{account_hash}/{image_id}/{variant}`
    - 在 `creative-workbench/next.config.ts` 的 `images.remotePatterns` 中加入 `imagedelivery.net`
  - Cloudflare R2（S3 兼容，更通用）：
    - 服务端生成 `PUT` 预签名 URL，前端直传文件到 R2
    - 写库保存公共访问 URL（自定义 CDN 域或 `r2.dev` 公共桶）
    - 在 `next.config.ts` 白名单中加入你的图片域名
- 安全与性能：
  - 仅保存 URL 到 MongoDB，避免 Base64 存库（文档最大 16MB）
  - 添加基础速率限制与输入校验，设置 CSP（允许的图片域）
  - 连接池复用 MongoDB 客户端，减少连接开销

### 二、Vercel + MongoDB Atlas 部署
- 连接仓库自动构建：Vercel 选择项目根为 `creative-workbench/`
- 环境变量：在 Vercel 项目设置中配置 `MONGODB_URI`、`MONGODB_DB`，以及对象存储相关变量（参考上文）
- Serverless 约束与建议：
  - 函数无状态、短生命周期；请求体有大小限制
  - 前端直传图片（Cloudflare Images / R2），服务端仅生成直传链接与保存 URL
  - 复用 Mongo 客户端（在 `getDb` 使用全局缓存）以减少冷启动连接压力
  - 不可写本地磁盘；图片等文件必须走外部存储
  - 在 `next.config.ts` 配置 `images.remotePatterns`，确保 `<Image>` 能加载外域图片
- 区域与延迟：选择与 Atlas 同区域或邻近区域，降低延迟与尾时延

### 运行与脚本
- 本地开发：
  - 在 `creative-workbench/`：`npm run dev`（默认端口 3001）
- 数据迁移与同步（可选）：
  - 参考 `creative-workbench/scripts/`：
    - `migrate-reference-images.mjs`
    - `sync-reference-images-to-mongo.mjs`
    - `sync-supabase-to-mongo.mjs`
  - 示例运行：`node scripts/sync-reference-images-to-mongo.mjs`

### 配置检查清单
- MongoDB：`MONGODB_URI`、`MONGODB_DB` 正确；使用连接池复用
- 图片域：`next.config.ts` 中已加入 Cloudflare Images 或 R2 自定义域
- 上传路径：使用直传（前端）+ 服务端签名/直传 URL 生成，避免服务端接收大文件
- 安全：开启 HTTPS、CSP、速率限制、输入校验，日志与备份到位

### 常见问题
- 413（请求体过大）：
  - 独服：调整 `nginx` 的 `client_max_body_size`
  - Vercel：改用前端直传到外部存储
- 图片不显示：未在 `next.config.ts` 配置外链图片域
- Mongo 文档过大：避免 Base64 存库，仅保存对象存储 URL
- 并发与速率限制：在 Serverless（尤其免费套餐）添加应用层限流与重试策略