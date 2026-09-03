# 99AI Plugin Edition · 整合部署包

本目录由仓库根目录的 `./build.sh` 生成，三端已经构建完成，布局是扁平的：

```text
dist/                 服务端构建产物
public/chat/          用户端静态文件
public/admin/         管理端静态文件
public/file/          本地上传目录
package.json          服务端生产依赖清单
pnpm-lock.yaml
.env.example
start.sh
```

这里没有 `service/`、`chat/`、`admin/` 源码目录，也不包含 Docker Compose。源码仓库里的 `cd service` / `docker compose up` 命令不适用于本目录。生产加固、HTTPS、备份与管理端首次配置见 [DEPLOYMENT_AND_CONFIGURATION.md](docs/DEPLOYMENT_AND_CONFIGURATION.md)。

## 启动前准备

需要可连接的 MySQL 8 与 Redis，以及 Node.js 20–24、pnpm 10.33.2。

```bash
cp .env.example .env
```

编辑 `.env`，至少设置：

- `MYSQL_ROOT_PASSWORD`、`DB_HOST`、`DB_PASS`、`DB_DATABASE`（指向已有 MySQL）
- `REDIS_HOST`、`REDIS_PASSWORD`
- `INITIAL_ADMIN_PASSWORD`（至少 12 位独立强密码；`CHANGE_ME_REQUIRED` 等占位符会被拒绝）
- `CORS_ORIGINS`（实际访问站点的 Origin）
- 首次空库建表时临时设置 `DB_SYNC=true`，完成后改回 `false`

可选：`API_URL` / `CLIENT_URL` 用于支付回调与跳转，生产支付必须改为公网 HTTPS。

## 启动

```bash
pnpm install --prod --frozen-lockfile
pnpm start
# 或 ./start.sh
```

默认监听 `9520`：用户端 `/`，管理端 `/admin`，健康检查 `GET /health`。
