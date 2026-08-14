# 99AI Plugin Edition 部署与首次配置

本文面向首次自托管部署。生产环境建议使用 Docker Compose，并在反向代理层配置 HTTPS。

## 1. 准备环境

- Docker Engine 24+ 或 Docker Desktop，且启用 Compose v2
- 至少 4 核 CPU、8 GB 内存、10 GB 可用磁盘空间
- 一个指向服务器的域名及有效 TLS 证书
- 一个 OpenAI 兼容模型服务的 Base URL、API Key 和模型名

部署目录中不得放置旧 `.env`、数据库文件、上传文件或日志。首次部署应从干净源码快照开始。

## 2. 获取源码并创建环境配置

```bash
git clone https://github.com/vastxie/99AI-plugin-edition.git
cd 99AI-plugin-edition/service
cp .env.example .env
```

至少修改以下值：

```dotenv
MYSQL_ROOT_PASSWORD=<独立的强随机密码>
DB_USER=chatgpt
DB_PASS=<独立的强随机密码>
DB_DATABASE=chatgpt
REDIS_PASSWORD=<独立的强随机密码>
INITIAL_ADMIN_USERNAME=super
INITIAL_ADMIN_PASSWORD=<至少 12 位的独立强密码>
INITIAL_ADMIN_EMAIL=<管理员邮箱>
CORS_ORIGINS=https://ai.example.com
DB_SYNC=true
```

注意：

- `.env` 不得提交到 Git，也不要通过截图或工单公开。
- 数据库、Redis、管理员和模型服务应使用不同密码。
- `CORS_ORIGINS` 填写用户实际访问站点的 HTTPS Origin；多个 Origin 用英文逗号分隔。
- `INITIAL_ADMIN_*` 只在空数据库不存在 `super` 时创建首位超级管理员，不会重置已有账号。

## 3. 首次构建与启动

在 `service/` 目录执行：

```bash
docker compose up --build -d
docker compose ps
docker compose logs --tail=200 service
```

等待 MySQL、Redis 显示 `healthy`，并确认服务端日志没有初始化失败。然后访问：

- 用户端：`http://服务器地址:9520/`
- 管理端：`http://服务器地址:9520/admin`

空数据库首次建表完成后，立即将 `.env` 中的 `DB_SYNC` 改为 `false`，再重建服务容器：

```bash
docker compose up -d --force-recreate service
docker compose logs --tail=100 service
```

不要让生产环境长期运行在 `DB_SYNC=true`。

## 4. 反向代理与 HTTPS

将公网域名反向代理到 `127.0.0.1:9520`，并至少设置：

- TLS 1.2/1.3 与 HTTP 到 HTTPS 跳转
- 上传请求体大小不低于应用内配置值
- `X-Forwarded-For`、`X-Forwarded-Proto` 和真实 Host 转发
- 访问日志脱敏，禁止记录 Authorization、Cookie 和请求体中的 Key
- 合理的连接及流式响应超时，关闭会缓冲流式聊天响应的代理设置

确认 `.env` 的 `CORS_ORIGINS` 和管理端“站点地址”均改为最终 HTTPS 地址。

## 5. 管理端首次配置顺序

### 5.1 基础站点

在“系统管理 / 基础配置”中配置：

- 站点名称、站点 URL、公司名称（默认作者与项目归属为 `vastxie`）
- 页面标题、描述、关键词、Logo 与 Favicon
- 默认语言、可用语言、主题及展示开关

### 5.2 模型全局配置

在“模型管理 / 基础设置”中填写：

```text
全局地址：https://provider.example.com/v1
全局 Key：<MODEL_API_KEY>
全局模型：<MODEL_NAME>
```

保存后再次打开页面只会显示密钥占位符，不会把原密钥返回浏览器；保持占位符保存代表“不修改已有密钥”。如需轮换，输入新 Key 后保存。

随后在“模型管理 / 模型列表”新增至少一个已启用模型，并核对：

- API 模型名必须与供应商目录完全一致
- 显示名、模型类型、扣费类型、单次或 Token 扣费值
- 上下文轮数、排序、上传能力、工具调用能力
- 模型级 Key 为空时才继承全局 Key

新数据库未配置可用模型时，用户端会给出明确提示，不会重复创建会话。

### 5.3 用户与额度

在“用户管理 / 用户配置”中配置：

- 注册赠送、签到奖励、访客额度
- 最大登录设备数
- 邮箱、短信、微信等登录方式

关闭某项赠送功能时，对应赠送数可留空；开启后必须填写。正式上线前用普通测试账号充值少量额度，完整验证一次扣费及刷新。

### 5.4 文件存储

在“存储管理”选择本地或对象存储，填写站点 URL、文件数量与大小限制，并上传一个允许类型文件验证下载。

本地 `/file` 当前是匿名静态地址，不应存放敏感或受监管文件。公网业务优先使用具备私有桶和签名 URL 的对象存储，或在应用与反向代理层增加访问控制。

### 5.5 可选外部服务

仅在需要时配置并逐项实测：

- SMTP 邮箱或短信验证码：用于真实普通用户注册
- 微信公众号：登录、绑定、迁移及菜单
- 支付渠道：商户号、证书、回调与返回 URL
- 图片、视频、音乐、搜索、向量、MCP 等服务

未配置的外部服务应保持关闭。支付上线前必须使用沙箱和真实回调各验证一次签名、重复通知与订单幂等。

## 6. 上线验收

至少完成以下检查：

```bash
docker compose ps
docker compose logs --since=10m service
curl -I https://ai.example.com/
curl -I https://ai.example.com/admin
```

浏览器实测：

1. 超级管理员登录、退出、错误密码。
2. 模型配置后创建会话，发送消息并收到完整回复。
3. 扣费后余额立即变化，刷新页面后保持一致。
4. 模型供应商故障时显示明确错误，不出现空白 AI 回复。
5. 普通用户注册、登录、资料修改、主题和语言。
6. 文件允许类型上传成功，非法类型被拒绝。
7. 分享链接在未登录桌面和移动端可按预期打开。
8. 所有启用的支付、邮件、短信、微信回调。

## 7. 备份、升级与恢复

升级前备份：

- MySQL 全库及表结构
- Redis 持久化数据（若业务依赖其中会话或缓存）
- `uploaded_files` 卷
- `.env` 和反向代理配置（进入受控密钥存储，不进入源码仓库）

升级时不要执行 `docker compose down -v`，它会删除命名卷。常规更新流程：

```bash
docker compose build --pull service
docker compose up -d service
docker compose ps
docker compose logs --tail=200 service
```

数据库结构升级应使用审阅过的迁移或明确的人工步骤；不要在已有生产数据库上临时打开 `DB_SYNC`。恢复演练应验证数据库、上传文件和账号登录三者同时可用。

## 8. 发布前安全清单

- 所有默认密码已替换，测试 Key 已轮换。
- `.env`、日志、上传文件、数据库导出和本机扩展属性不在开源快照中。
- `DB_SYNC=false`，CORS 仅允许真实站点。
- 管理端响应与 DOM 不包含原始密钥。
- HTTPS、备份、恢复、日志脱敏和告警均已验证。
- 未启用的登录、支付和外部服务保持关闭。
