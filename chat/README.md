# 99AI Plugin Edition · 用户端（chat）

Vue 3 + Vite + Pinia + Tailwind CSS + vue-i18n 构建的用户聊天前端。

## 本地开发

要求 Node.js 20–24 与 pnpm 10.33.2：

```bash
pnpm install --frozen-lockfile
pnpm dev
```

开发环境通过 `.env` 的 `VITE_GLOB_API_URL=http://127.0.0.1:9520/api` 指向本地服务端，需先启动 `service/`；也可以在本目录执行 `pnpm all`，一条命令同时拉起服务端（watch 模式）与前端。

常用命令：

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` | Vite 开发服务器 |
| `pnpm type-check` | `vue-tsc --noEmit` 类型检查 |
| `pnpm build` | 生产构建（`--mode=production`） |
| `pnpm build-check` | 类型检查 + 构建（CI 等价流程） |
| `pnpm all` | 并行启动服务端 dev 与前端 dev |
| `pnpm format` / `pnpm format:check` | Prettier 格式化 / 校验 |

## 环境变量

`.env`（开发）与 `.env.production`（生产，走 `/api` 相对路径）只包含可公开的 Vite 构建变量。与服务端同域整合部署时无需修改；分离部署时把 `VITE_GLOB_API_URL` 指向服务端地址。依赖的 CVE 锁定维护在 [pnpm-workspace.yaml](pnpm-workspace.yaml)。

## 目录结构（`src/`）

| 目录 | 用途 |
| --- | --- |
| `views/` | 页面，`views/chat/` 为主聊天界面 |
| `components/` | 通用组件 |
| `api/` | 服务端接口封装 |
| `store/` | Pinia 状态 |
| `locales/` | 多语言文案（16 个语种） |
| `composables/`、`hooks/` | 组合式逻辑（两目录并存，属历史结构） |
| `services/`、`core/`、`data/` | 业务服务与静态数据 |
| `styles/` | 全局样式与 Markdown 渲染主题 |
| `types/`、`typings/` | 类型声明（两目录并存，属历史结构） |

## 国际化

`locales/` 已包含 16 个语种的完整文案文件，但组件层对 `vue-i18n` 的接入尚不完整，部分界面仍是中文硬编码——切换到非中文语言时会出现中英混排。欢迎通过 PR 补齐接入。

## 构建与托管

`pnpm build` 产物输出到 `dist/`，由服务端托管在站点根路径 `/`；三端整合构建见仓库根目录的 `build.sh` 与 `service/Dockerfile`。
