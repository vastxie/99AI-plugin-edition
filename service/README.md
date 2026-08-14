# 99AI Plugin Edition · 服务端（service）

NestJS 10 + TypeORM + MySQL + Redis。对外提供用户端与管理端共用的 HTTP API，生产模式下同时托管两个前端的静态构建产物。

## 本地开发

要求 Node.js 20–24 与 pnpm 10.33.2，并准备可连接的 MySQL 与 Redis：

```bash
cp .env.example .env   # 填写数据库、Redis 与初始管理员配置
pnpm install --frozen-lockfile
pnpm dev
```

常用命令：

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` | 开发模式（watch） |
| `pnpm build` | 生产构建（`nest build`，产物在 `dist/`） |
| `pnpm test` / `pnpm test:cov` | Jest 单元测试 / 覆盖率 |
| `pnpm format` / `pnpm format:check` | Prettier 格式化 / 校验 |
| `pnpm start` | 运行已构建产物 |

测试通过 `scripts/run-jest.js` 包装执行，测试结束后会运行 `scripts/check-test-output-secrets.js` 检查测试输出是否泄露密钥。依赖的 CVE 锁定统一维护在 [pnpm-workspace.yaml](pnpm-workspace.yaml)（pnpm v10 的配置位置）。

## 运行时约定

- 监听端口 `PORT`（默认 9520）；健康检查为 `GET /health`，Docker 镜像已内置 `HEALTHCHECK`。
- 全局路由前缀为 `/api`，但 **GET 路由被排除在前缀之外**（见 `src/main.ts` 的 `setGlobalPrefix` exclude 配置），因此 GET 接口注册在根路径下。
- JWT Secret 在首次启动时自动生成并写入 Redis，无硬编码兜底；丢失 Redis 数据等同于所有登录态失效。
- 初始管理员由 `INITIAL_ADMIN_*` 环境变量种入：弱密码、过短密码会直接拒绝启动。
- 生产环境必须设置 `CORS_ORIGINS`，否则启动即报错；`DB_SYNC` 仅首次建表时临时开启。
- Swagger 仅在 `ISDEV=true` 时挂载，生产不暴露。
- 静态托管：`/` 用户端、`/admin` 管理端（`ADMIN_SERVE_ROOT` 可调）、`/file` 本地上传目录（匿名访问，勿存敏感文件）。
- 全局启用限流中间件与请求中断传播（`AbortInterceptor`，客户端断开时中止上游模型请求）。

## 模块地图（`src/modules/`）

对话与 AI 能力：

| 模块 | 职责 |
| --- | --- |
| `chat` | 核心对话流程、流式响应、扣费联动 |
| `aiTool` | 供应商适配与扩展工具：联网搜索、文件解析与向量检索、图像/视频/音乐/PPT 等 |
| `agent` | Agent 工作流引擎（节点定义在 `agent/nodes/`） |
| `mcp` | MCP 工具接入、授权与调用 |
| `models` | 模型与供应商管理 |
| `preset` / `presetCategory` | 应用预设及其分类 |
| `app` | 应用广场（预设应用、分类、用户收藏） |
| `plugin` | 插件管理 |

用户与计费：

| 模块 | 职责 |
| --- | --- |
| `user` / `auth` / `verification` | 账号、登录注册、验证码 |
| `userBalance` | 额度与扣费 |
| `signin` | 每日签到 |
| `crami` | 卡密与套餐包 |
| `order` / `pay` | 订单与支付渠道（微信、支付宝、易支付、虎皮椒、Stripe、PayPal） |
| `official` | 微信公众号（扫码登录、消息与菜单） |

平台与基础设施：

| 模块 | 职责 |
| --- | --- |
| `globalConfig` | 站点与全局配置（管理端大部分设置的落点） |
| `upload` | 文件上传（本地 / OSS / COS / S3，含 magic byte 校验） |
| `statistic` | 统计报表 |
| `badWords` / `autoReply` | 敏感词、自动回复 |
| `share` | 对话分享页 |
| `chatGroup` / `chatLog` | 会话分组、聊天记录 |
| `task` | 定时任务 |
| `database` | 首次建表、种子数据与初始管理员 |
| `redisCache` | Redis 封装（含 JWT Secret 存取） |
| `rateLimit` | 限流 |
| `health` | 健康检查 |
| `spa` | 前端路由兜底（非 API 的 GET 回退到用户端 `index.html`） |

`src/common/` 存放守卫、全局过滤器与拦截器、日志、中间件和工具函数（脱敏、SSRF 防护 `remoteUrlGuard` 等）。

## 鉴权约定

没有全局守卫：需要登录的路由显式挂 `JwtAuthGuard`，管理接口挂管理员守卫（如 `SuperAuthGuard`）；未挂守卫的路由即公开路由（登录注册、支付回调、公开配置、分享页等）。**新增接口时默认加守卫，确认需要公开再放开。**

## 二次开发常见入口

- 新增/调整模型供应商适配：`src/modules/aiTool/chat/`（各供应商请求与流式响应的适配层），配合管理端「模型管理」的配置。
- 新增支付渠道：`src/modules/pay/`（现有渠道的 helper 可作模板）与 `src/modules/order/`。
- 新增 MCP 工具或调整授权：`src/modules/mcp/`。
- 新增 Agent 工作流节点：`src/modules/agent/nodes/`。

## 部署

生产部署请使用仓库根目录 README 的 Docker Compose 流程或 `build.sh` 整合包流程；不要直接暴露 `pnpm dev` 开发服务器。
