# 99AI Plugin Edition · 管理端（admin）

Vue 3 + Vite + Element Plus + UnoCSS 构建的管理后台（基于 Fantastic-admin 底座）。

## 本地开发

要求 Node.js 20–24 与 pnpm 10.33.2：

```bash
pnpm install --frozen-lockfile
pnpm dev
```

开发环境通过 `.env.development` 的 `VITE_APP_API_BASEURL=http://127.0.0.1:9520/api` 指向本地服务端，需先启动 `service/`。

常用命令：

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` | Vite 开发服务器 |
| `pnpm lint` | 目前等价于 `vue-tsc` 类型检查（尚未配置 ESLint） |
| `pnpm build` | 类型检查 + 生产构建（`vue-tsc && vite build`） |
| `pnpm new` | Plop 生成器（新页面/组件脚手架） |
| `pnpm generate:icons` / `pnpm svgo` | 图标数据生成与 SVG 压缩 |
| `pnpm format` / `pnpm format:check` | Prettier 格式化 / 校验 |

## 环境变量

`.env.development` / `.env.production` / `.env.test` 只包含可公开的 Vite 构建变量（接口地址、标题与构建开关）。生产构建走 `/api` 相对路径，与服务端同域部署无需修改。依赖的 CVE 锁定维护在 [pnpm-workspace.yaml](pnpm-workspace.yaml)。

## 目录结构（`src/`）

| 目录 | 用途 |
| --- | --- |
| `views/` | 各管理页面（模型、用户、套餐、支付、系统配置等） |
| `router/` | 路由；`router/modules/*.menu.ts` 定义侧边栏菜单 |
| `layouts/` | 布局与框架组件 |
| `components/` | 通用组件 |
| `api/` | 服务端接口封装 |
| `store/` | Pinia 状态 |
| `settings.default.ts` | 底座默认配置（主题、布局、版权区等） |
| `iconify/` | 离线图标数据 |
| `mock/` | 本地 mock（由 `VITE_BUILD_MOCK` 控制，生产关闭） |

## 构建与托管

`pnpm build` 产物输出到 `dist/`，由服务端托管在 `/admin`（可用 `ADMIN_SERVE_ROOT` 调整）；三端整合构建见仓库根目录的 `build.sh` 与 `service/Dockerfile`。
