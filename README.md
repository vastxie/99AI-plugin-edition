# 99AI Plugin Edition（99AI 插件版）

<div align="center">

**99AI 插件版完整源码：可自托管、可二次开发的一站式 AI Web 平台。**

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20--24-339933.svg)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED.svg)](https://docs.docker.com/compose/)

作者与维护者：[vastxie](https://github.com/vastxie)

如果这个项目对你有帮助，欢迎点亮右上角的 **Star ⭐**，也欢迎参与共同维护。

</div>

## 项目介绍

99AI Plugin Edition 是一个独立开源的 AI 服务平台，仓库包含管理端、用户端和服务端的完整未编译源码，适合个人、团队或企业私有化部署及二次开发。部署需要 MySQL、Redis，以及至少一个 OpenAI 兼容模型服务。

主要能力：

- 多模型 AI 对话、上下文管理与流式响应
- 应用预设、插件、Agent 工作流与 MCP 工具
- 文件分析、联网搜索、图片、视频、音乐及 PPT 等扩展能力
- 用户、额度、套餐、支付、登录方式与站点配置管理
- 独立的用户端和管理后台，支持 Docker 一体化部署

## 工程组成

| 目录 | 技术栈 | 用途 |
| --- | --- | --- |
| [`service/`](service/README.md) | NestJS、TypeORM、MySQL、Redis | API、认证、聊天、插件、Agent、MCP、上传和支付 |
| [`chat/`](chat/README.md) | Vue 3、Pinia、Tailwind CSS | 用户聊天端 |
| [`admin/`](admin/README.md) | Vue 3、Element Plus、UnoCSS | 管理后台 |

整合部署后，服务默认监听 `9520`：用户端位于 `/`，管理端位于 `/admin`。

## 一键整合打包

面向直接部署者，仓库根目录提供一键构建脚本。它会自动安装锁定依赖、构建服务端与两套前端，并将三端整合到一个独立目录：

```bash
git clone https://github.com/vastxie/99AI-plugin-edition.git
cd 99AI-plugin-edition
./build.sh
```

构建完成后，整合目录位于：

```text
99AIPluginQuickDeploy/
```

目录中已经包含服务端 `dist/`、用户端与管理端静态文件、生产依赖清单、环境变量模板和启动脚本。将该目录复制到部署服务器后执行：

```bash
cp .env.example .env
# 编辑 .env
pnpm install --prod --frozen-lockfile
pnpm start
```

构建环境需要 Node.js 20–24 和 pnpm 10.33.2。生成的 `99AIPluginQuickDeploy/` 不会进入 Git 或 Docker 构建上下文；再次执行脚本时，只有在三端全部构建成功后才会更新该目录。

## 快速部署

推荐环境：Docker Engine 24+ 或 Docker Desktop、Compose v2、至少 4 核 CPU / 8 GB 内存 / 10 GB 可用磁盘。

```bash
git clone https://github.com/vastxie/99AI-plugin-edition.git
cd 99AI-plugin-edition/service
cp .env.example .env
```

编辑 `.env`，至少设置：

```dotenv
MYSQL_ROOT_PASSWORD=<独立的强随机密码>
DB_PASS=<独立的强随机密码>
REDIS_PASSWORD=<独立的强随机密码>
INITIAL_ADMIN_USERNAME=super
INITIAL_ADMIN_PASSWORD=<至少 12 位的独立强密码>
INITIAL_ADMIN_EMAIL=<管理员邮箱>
CORS_ORIGINS=https://ai.example.com
DB_SYNC=true
```

首次使用全新数据库时构建并启动：

```bash
docker compose up --build -d
docker compose ps
docker compose logs --tail=200 service
```

确认首次建表完成后，立即将 `DB_SYNC` 改回 `false`，再执行：

```bash
docker compose up -d --force-recreate service
```

完整的生产部署、HTTPS、备份、升级和上线验收说明见：[部署与首次配置](docs/DEPLOYMENT_AND_CONFIGURATION.md)。

## 首次配置

登录管理端后，建议依次完成：

1. 在“系统管理 / 基础配置”设置站点名称、正式站点 URL、Logo、语言和主题。
2. 在“模型管理 / 基础设置”填写模型服务 Base URL、Key 和全局模型。
3. 在“模型管理 / 模型列表”添加并启用至少一个模型，确认 API 模型名与供应商一致。
4. 在“用户管理 / 用户配置”设置注册、签到、访客额度和登录方式。
5. 配置文件存储；邮件、短信、微信、支付等外部服务按需开启并逐项实测。

全新数据库尚未配置可用模型时，用户端会明确提示管理员先完成模型配置；模型服务 Key 由部署者在管理端填写。

## 本地开发

要求 Node.js 20–24（推荐 22）和 pnpm 10.33.2：

```bash
git clone https://github.com/vastxie/99AI-plugin-edition.git
cd 99AI-plugin-edition
corepack enable
corepack prepare pnpm@10.33.2 --activate
```

分别安装依赖并验证：

```bash
cd service && pnpm install --frozen-lockfile && pnpm test -- --runInBand && pnpm build
cd ../chat && pnpm install --frozen-lockfile && pnpm type-check && pnpm build
cd ../admin && pnpm install --frozen-lockfile && pnpm lint && pnpm build
```

三个工程均可在各自目录运行 `pnpm dev`。生产环境请使用构建产物或 Docker Compose，不要直接暴露开发服务器。

## 参与贡献

欢迎通过本仓库的 Issues 和 Pull Requests 参与，也欢迎长期共同维护。

1. 先搜索现有 Issue；大型功能请先讨论目标、接口和兼容策略。
2. Fork 仓库并从最新主分支创建范围清晰的功能分支。
3. 按改动范围运行上面的测试、类型检查、Lint 和构建命令。
4. PR 中说明改动目的、验证结果、兼容性变化及尚未覆盖的风险。

请勿提交 `.env`、Key、数据库、日志、上传文件或个人信息。安全漏洞请按照 [SECURITY.md](SECURITY.md) 的指引私密提交，不要在公开 Issue 中发布密钥、个人数据或可直接利用的复现细节。

除非另有明确声明，提交到本项目的贡献按 Apache License 2.0 第 5 节处理。

仓库中的 `scripts/export-open-source-snapshot.sh` 是维护者用于生成干净源码快照的发布工具（仅支持 macOS，依赖 bsdtar 与 xattr），日常部署与贡献流程无需使用。

## 交流群

微信扫一扫，备注「99」进群交流。作者不提供私聊技术咨询，进群后请先阅读群公告。

<img src="https://github.com/user-attachments/assets/9fed8343-73ae-43b0-9ce7-dc1a4c30c7a5" width="220" alt="99AI 微信交流群二维码">

## 部署安全提示

- 不要提交或公开 `.env`、数据库、日志、上传文件及任何服务 Key。
- 生产环境应启用 HTTPS、限制 `CORS_ORIGINS`、使用独立强密码，并保持 `DB_SYNC=false`。
- MCP 工具默认应保持最小权限；支付、邮件、短信和微信回调必须使用正式配置实测。
- 本地存储的 `/file` 当前为匿名静态访问，不应存放敏感、私密或受监管文件；公网使用前应增加鉴权或签名 URL。

## 免责声明

- 本项目按“现状”提供，不承诺服务持续可用，也不保证 AI 生成内容的准确性、完整性或适用于特定目的。AI 输出不应直接作为医疗、法律、金融等专业决策依据。
- 使用者应确保拥有所使用的模型、接口、数据和内容的合法授权，并遵守所在地法律法规及上游服务条款。禁止将本项目用于违法活动或侵害他人知识产权、隐私权等合法权益。
- 在中国大陆面向公众提供生成式人工智能服务的运营者，应按实际业务遵守[《生成式人工智能服务管理暂行办法》](https://www.cac.gov.cn/2023-07/13/c_1690898327029107.htm)、[《人工智能生成合成内容标识办法》](https://www.cac.gov.cn/2025-03/14/c_1743654685899683.htm)及其他适用规定，依法履行内容标识、安全评估、算法备案或许可等义务；内部研发或非公众服务是否适用，应根据实际场景判断。
- 部署、运营、二次开发及 AI 生成内容产生的风险与责任由使用者承担。本说明不构成法律意见；正式运营前请结合业务所在地和服务方式进行专业合规评估。

## 开源许可

Copyright 2026 vastxie

本项目由 `vastxie` 以 [Apache License 2.0](LICENSE) 发布。
