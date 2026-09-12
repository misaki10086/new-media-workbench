# 新媒体内容工作台 MVP

一个前后端分离的新媒体运营后台：集中管理平台账号与图文内容，通过 Redis 队列模拟异步分发到微信公众号、抖音和小红书，并汇总各平台的模拟阅读、点赞、评论和分享数据。编辑内容时可以调用 OpenAI 生成 3 个备选标题。

> 本项目是用于本地开发和产品验证的 MVP。平台凭证、发布结果和统计数据均为模拟数据，不具备真实平台发布能力。

## 技术架构

```text
React + Ant Design (client, :5173)
              |
              | Axios / REST
              v
Node.js + Express (server, :3000) -----> OpenAI API
       |                 |
       | Sequelize       | publish job
       v                 v
   MySQL 8          Redis 7 queue -----> Worker
       ^                                  |
       | PublishRecord / ContentStats     |
       +----------------------------------+
```

- `client/`：React 管理后台，包含账号管理、内容列表/编辑和数据统计页面。
- `server/`：Express REST API、Sequelize 模型与迁移、OpenAI 客户端和发布 worker。
- `docker-compose.yml`：仅启动开发所需的 MySQL 与 Redis；应用进程在宿主机通过 npm 运行。
- 服务端预留 `server/uploads/` 本地磁盘目录并通过 `/uploads` 静态暴露，目录已从 Git 排除。当前内容编辑保存封面 URL，完整上传接口、视频与云存储适配留待后续迭代。

## 环境要求

- Node.js 20 或更高版本
- npm 10 或更高版本
- Docker Desktop（或可运行 Docker Compose 的 Docker Engine）
- 可选：OpenAI API Key。未配置时，AI 标题接口会返回配置错误，其他功能仍可运行。

默认端口为 Web `5173`、API `3000`、MySQL `3306`、Redis `6379`。如本机端口已占用，请在环境文件中修改；`VITE_API_BASE_URL` 和 `CLIENT_ORIGIN` 也要同步调整。

## 快速开始

以下命令均在项目根目录执行。

1. 创建本地环境文件。

   PowerShell：

   ```powershell
   Copy-Item .env.example .env
   Copy-Item server/.env.example server/.env
   ```

   macOS / Linux：

   ```bash
   cp .env.example .env
   cp server/.env.example server/.env
   ```

   根目录 `.env` 供 Docker Compose 读取，`server/.env` 供 API 与 worker 读取。需要 AI 标题时，将 `OPENAI_API_KEY` 写入 `server/.env`。前端默认通过 Vite 代理请求 `/api`；若需直连或修改代理目标，可执行 `Copy-Item client/.env.example client/.env`（macOS/Linux 使用 `cp`），再调整 `VITE_API_BASE_URL` / `VITE_API_TARGET`。

2. 启动 MySQL 和 Redis，并等待二者状态变为 `healthy`。

   ```bash
   docker compose up -d
   docker compose ps
   ```

3. 安装根目录及两个 workspace 的依赖。

   ```bash
   npm install
   ```

4. 创建表并写入默认用户种子数据。

   ```bash
   npm run db:migrate
   npm run db:seed
   ```

5. 同时启动 API、前端和发布 worker。

   ```bash
   npm run dev
   ```

6. 打开 `http://localhost:5173`，无需登录即可直接使用。

默认 API 地址为 `http://localhost:3000/api`。发布内容后，请保持 worker 运行；任务会先显示为 `pending`，随后被模拟为 `success` 或 `failed`，成功时会生成一组随机统计数据。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm install` | 安装根目录、`server` 和 `client` 的依赖 |
| `npm run install:all` | 与根目录 `npm install` 等价的显式聚合命令 |
| `npm run dev` | 并行启动 API、前端和发布 worker |
| `npm run dev:server` | 仅启动 API 开发进程 |
| `npm run dev:client` | 仅启动前端开发服务器 |
| `npm run worker` | 单独启动发布队列 worker |
| `npm run build` | 构建前后端生产产物 |
| `npm run typecheck` | 检查前后端 TypeScript 类型 |
| `npm test` | 运行前后端测试 |
| `npm run db:migrate` | 执行尚未应用的 Sequelize 迁移 |
| `npm run db:migrate:undo` | 回滚最近一次迁移 |
| `npm run db:seed` | 写入默认用户等开发种子数据 |
| `npm run db:seed:undo` | 撤销开发种子数据 |
| `docker compose logs -f mysql redis` | 查看基础设施日志 |
| `docker compose down` | 停止容器并保留数据卷 |

如需分别运行各进程，可打开三个终端执行：

```bash
npm run dev:server
npm run dev:client
npm run worker
```

首次迁移失败时，先运行 `docker compose ps` 确认 MySQL 已健康，并检查 `server/.env` 中的数据库端口、库名、用户名和密码是否与根目录 `.env` 一致。

## API 概览

所有接口均无需鉴权，请求头仅需：

```http
Content-Type: application/json
```

| 方法与路径 | 用途 | 主要请求数据 |
| --- | --- | --- |
| `GET /api/accounts` | 获取平台账号 | 无 |
| `POST /api/accounts` | 添加平台账号 | `platform`, `accountName`, `credential`, `status` |
| `DELETE /api/accounts/:id` | 删除平台账号 | 路径参数 `id` |
| `GET /api/contents` | 获取内容、各账号发布状态及统计汇总 | 无 |
| `POST /api/contents` | 创建图文草稿 | `title`, `body`, `coverUrl`, `tags`, `accountIds`, `scheduledAt` |
| `PUT /api/contents/:id` | 更新内容 | 与创建接口相同的可选字段 |
| `POST /api/contents/:id/publish` | 将内容加入所选账号的发布队列 | 可传 `{ "accountIds": [1, 2] }` 覆盖内容已选账号 |
| `POST /api/ai/generate-titles` | 根据主题生成 3 个标题 | `{ "topic": "秋季新品发布" }` |

`platform` 仅接受 `wechat`、`douyin`、`xiaohongshu`；账号 `status` 为 `active` 或 `expired`。内容支持立即发布（`scheduledAt` 为空）和定时发布（ISO 8601 时间字符串）。具体响应字段与错误码以 `server/` 中的路由和控制器为准。

## 平台接入（真实授权与发布）

默认情况下所有账号仍为**模拟发布**。为某个平台配置真实凭据后，该平台的账号会走真实 API：

| 平台 | 接入方式 | 服务端凭据 | 发布接口 |
| --- | --- | --- | --- |
| 微信公众号 | 服务端凭据（AppID/Secret，无需用户授权） | `WECHAT_APP_ID` / `WECHAT_APP_SECRET` | 封面传永久素材 → 新建草稿 → `freepublish/submit` 发布 |
| 抖音 | OAuth 用户授权（`video.create` scope） | `DOUYIN_CLIENT_KEY` / `DOUYIN_CLIENT_SECRET` / `DOUYIN_REDIRECT_URI` | 上传视频 → `create_video` 发布 |
| 小红书 | OAuth 用户授权 | `XHS_APP_KEY` / `XHS_APP_SECRET` / `XHS_REDIRECT_URI` | 创建笔记（图文/视频） |

接入步骤：

1. 抖音 / 小红书需要在服务端先配置应用凭据：把 `DOUYIN_CLIENT_KEY` / `DOUYIN_CLIENT_SECRET`、`XHS_APP_KEY` / `XHS_APP_SECRET` 写入 `server/.env`，回调地址默认为 `http://localhost:3000/api/platform-auth/<platform>/callback`，生产环境需替换并在平台后台登记。
2. 执行 `npm run db:migrate` 应用授权字段迁移。
3. 打开「平台账号」页，在「添加账号」弹窗中选择接入方式（提示都放在字段旁的问号图标里）：
   - **官方授权登录**：
     - 微信公众号：直接填写 AppID / AppSecret（公众平台「设置与开发 → 基本配置」中获取），点「验证并绑定」，服务端会校验凭据并拉取公众号昵称后建号；发布仅支持图文且必须设置封面图。
     - 抖音 / 小红书：点「前往平台授权登录」，浏览器会跳转到平台官方授权页，同意后回调自动建号并保存令牌（过期会自动刷新；刷新失败时账号标记为「已过期」，需重新授权）。
   - **手动录入**：仅创建本地模拟账号，用于验证发布流程，不连接真实平台。

授权相关接口：

| 方法与路径 | 用途 |
| --- | --- |
| `GET /api/platform-auth/status` | 查询各平台凭据配置状态 |
| `GET /api/platform-auth/:platform/authorize` | 302 跳转到平台授权页（带一次性 state 防伪） |
| `GET /api/platform-auth/:platform/callback` | 平台回调：换取令牌、建号后重定向回前端 |
| `POST /api/platform-auth/wechat/connect` | 校验公众号凭据（请求体可传 `appId`/`appSecret`，缺省读服务端环境变量）并绑定账号 |

各平台的前置要求与限制：

- 微信公众号：`stable_token` 受 IP 白名单限制；`freepublish` 发布仅对**已认证**的公众号开放，未认证账号只能停留在草稿环节并报错。图文正文为纯文本自动转 HTML 段落。
- 抖音：需在抖音开放平台创建应用并通过审核、申请 `video.create` 能力，回调地址必须在平台登记；仅支持视频内容（`videoUrl` 必填）。
- 小红书：内容发布 API 仅对通过审核的开放平台应用开放；本实现的授权流程按 `open.xiaohongshu.com` 文档编写，笔记创建接口路径与字段定义在 `server/src/platforms/xiaohongshu.ts` 顶部常量中，若平台文档有更新仅需调整该文件。
- 令牌（access/refresh token）只保存在数据库中，接口返回时会脱敏，不会下发到前端。

## 数据与迁移

Sequelize 迁移会创建以下核心表：

- `Users`：默认数据归属用户（所有业务数据都挂在该用户下）。
- `PlatformAccounts`：平台、账号名、模拟凭证、状态、所属用户，以及 OAuth 授权字段（平台侧 ID、访问/刷新令牌、过期时间）。
- `Contents`：标题、正文、封面、标签、发布状态、定时时间和预留视频字段。
- `ContentTargets`：内容与多个平台账号的多对多关联表，用于保存发布目标。
- `PublishRecords`：每个内容到每个平台账号的异步发布状态、错误和发布时间。
- `ContentStats`：每次成功发布所生成的阅读、点赞、评论、分享和采集时间。

开发环境重新开始时，推荐先执行迁移回滚/重建命令，而不是手工修改表结构。若确实要彻底清空本地容器数据，可以使用 `docker compose down -v` 后重新启动并迁移；该命令会永久删除本项目 MySQL 与 Redis 的命名卷，请先确认没有需要保留的数据。

## 配置说明

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` / `SERVER_PORT` | `3000` | API 监听端口；服务端以 `PORT` 为准，`SERVER_PORT` 供根级配置识别 |
| `CLIENT_PORT` | `5173` | 前端开发端口 |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Express CORS 允许的前端来源 |
| `VITE_API_BASE_URL` | `/api` | 前端 Axios 基础路径；默认走 Vite 代理 |
| `VITE_API_TARGET` | `http://localhost:3000` | Vite 开发代理的 API 目标地址 |
| `DB_*` | 见 `.env.example` | MySQL 地址、端口、库名和凭证 |
| `REDIS_URL` | `redis://127.0.0.1:6379` | 发布队列使用的 Redis 连接 |
| `WECHAT_APP_ID` / `WECHAT_APP_SECRET` | 空 | 公众号凭据；配置后该平台走真实发布接口 |
| `DOUYIN_CLIENT_KEY` / `DOUYIN_CLIENT_SECRET` | 空 | 抖音开放平台客户端密钥 |
| `DOUYIN_REDIRECT_URI` | `http://localhost:3000/api/platform-auth/douyin/callback` | 抖音 OAuth 回调地址 |
| `XHS_APP_KEY` / `XHS_APP_SECRET` | 空 | 小红书开放平台应用密钥 |
| `XHS_REDIRECT_URI` | `http://localhost:3000/api/platform-auth/xiaohongshu/callback` | 小红书 OAuth 回调地址 |
| `OPENAI_API_KEY` | 空 | OpenAI API Key，只能配置在服务端 |
| `OPENAI_MODEL` | `gpt-4o-mini` | 标题生成模型 |
| `UPLOAD_DIR` | `uploads` | 服务端本地上传目录 |
| `PUBLISH_SUCCESS_RATE` | `0.8` | 模拟发布成功概率，范围 `0` 到 `1` |
| `PUBLISH_DELAY_MIN_MS` / `MAX_MS` | `1000` / `3000` | 模拟单次发布耗时范围 |
| `PUBLISH_WORKER_CONCURRENCY` | `3` | worker 并行处理任务数 |

## 当前限制

- 微信公众号、抖音和小红书默认仍为模拟发布；配置真实凭据并授权后走真实接口，但公众号需要认证资质、抖音/小红书需要通过开放平台应用审核后才能实际发文。
- 抖音/小红书真实发布后不会立刻回传阅读、点赞等数据指标，因此真实发布记录不会生成模拟统计数据。
- 当前为单用户模式（无登录验证），所有数据归属 `db:seed` 创建的默认用户，没有多用户隔离、角色权限和审计日志。
- 视频转码、正文 AI 生成、真实定时调度、失败重试策略和云存储尚未实现或仅预留字段。
- 本地磁盘不适合多实例部署；切换到对象存储前，多实例之间不会共享上传文件。
- 统计数据不是平台实时数据，不能用于业务决策或平台效果核算。

## 安全提示

- 本项目没有登录验证，任何能访问服务端口的人都可以读写数据，切勿在公网环境直接暴露服务；如需对外提供，请自行在网关层增加认证与访问控制。
- 不要提交 `.env`、真实 OpenAI Key、Cookie、Token 或平台账号凭证；仓库只应保留脱敏后的 `.env.example`。
- MVP 会将模拟 credential 存入数据库。接入真实平台前必须增加字段级加密、密钥轮换、最小权限、凭证过期与撤销机制。
- 生产环境应启用 HTTPS、严格 CORS、请求限流、输入校验、安全响应头、集中日志和依赖漏洞扫描。
- 删除账号、回滚迁移和 `docker compose down -v` 可能造成数据丢失；执行前应备份并确认目标环境。
