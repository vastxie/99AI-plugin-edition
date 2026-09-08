# 99AI Plugin Edition

English | [中文](README.zh-CN.md)

<div align="center">

**A self-hosted AI web platform — chat, plugins, agents, and an ops console in one repo.**

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20--24-339933.svg)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED.svg)](https://docs.docker.com/compose/)
[![GitHub stars](https://img.shields.io/github/stars/vastxie/99AI-plugin-edition?style=social)](https://github.com/vastxie/99AI-plugin-edition/stargazers)

Author and maintainer: [vastxie](https://github.com/vastxie)

If this project helps you, a **Star ⭐** is appreciated — contributions are welcome too.

</div>

## What it is

99AI Plugin Edition is an **uncompiled, open-source** AI service platform. People chat in the user app; admins configure models, apps, and site data in the console. The repo ships the chat frontend, the admin frontend, and the API together, for private deployment and further development.

You need MySQL, Redis, and at least one **OpenAI-compatible** model service. After an integrated deploy the process listens on `9520` by default: chat at `/`, admin at `/admin`.

## Who it's for

- **People who want their own AI site.** Docker or a one-shot pack gets you chatting first; you can tighten ops later.
- **Teams that need more than a chat box.** Users, quotas, plans, login methods, and site branding live in the admin console.
- **Developers who will change the source.** NestJS + Vue 3 are in the repo, with clear entry points for plugins, agents, and MCP.

If you only want a tiny chat widget, this may be more than you need. If you want chat, plugins, and an ops console in one product, this is built for that.

## Capabilities

- **Multi-model chat** — context, streaming replies; model keys are entered in the admin console, not baked into the source.
- **Apps and plugins** — app plaza, presets, plugins, and Agent workflow orchestration.
- **MCP tools** — connect MCP tools with permission checks; least privilege by default, granted by role.
- **Multimodal extras** — file analysis, web search, plus image, video, music, and PPT features (enable the matching services as needed).
- **Ops console** — users, quotas, plans / redeem codes, payments, login methods (email / SMS / WeChat, and others), and site appearance.
- **One process to host both UIs** — chat and admin are served by the same backend, via Docker Compose or the packaged build.

On a fresh database with no usable model yet, the chat app tells the admin to finish model setup instead of silently creating empty sessions.

## Project layout

| Directory | Stack | Role |
| --- | --- | --- |
| [`service/`](service/README.md) | NestJS, TypeORM, MySQL, Redis | API, auth, chat, plugins, Agent, MCP, uploads, and payments |
| [`chat/`](chat/README.md) | Vue 3, Pinia, Tailwind CSS | User chat app |
| [`admin/`](admin/README.md) | Vue 3, Element Plus, UnoCSS | Admin console |

Production hardening, HTTPS, backups, and go-live checks: [Deployment and first-time configuration](docs/DEPLOYMENT_AND_CONFIGURATION.md).

## Quick start

Pick the path that matches your environment.

### Option A: Docker Compose (recommended)

Use this when you want MySQL, Redis, and the app started together. You need Docker Engine 24+ or Docker Desktop, Compose v2, and ideally 4 CPU cores / 8 GB RAM / 10 GB disk.

```bash
git clone https://github.com/vastxie/99AI-plugin-edition.git
cd 99AI-plugin-edition/service
cp .env.example .env
```

Edit `.env` and set at least the following. The example `INITIAL_ADMIN_PASSWORD` is empty on purpose — placeholders are rejected.

```dotenv
MYSQL_ROOT_PASSWORD=<a strong unique password>
DB_PASS=<a strong unique password>
REDIS_PASSWORD=<a strong unique password>
INITIAL_ADMIN_USERNAME=super
INITIAL_ADMIN_PASSWORD=<a unique password, at least 12 characters>
INITIAL_ADMIN_EMAIL=<admin email>
CORS_ORIGINS=https://ai.example.com
DB_SYNC=true
```

On a brand-new database, build and start:

```bash
docker compose up --build -d
docker compose ps
docker compose logs --tail=200 service
```

After the first schema create finishes, set `DB_SYNC` back to `false` **immediately**, then:

```bash
docker compose up -d --force-recreate service
```

Then open:

- Chat: `http://<host>:9520/`
- Admin: `http://<host>:9520/admin`
- Health check: `GET /api/health`

### Option B: One-shot pack (`./build.sh`)

Use this when MySQL and Redis already exist, and you want to build on one machine and copy the result to the server. The repo-root script installs locked dependencies, builds all three apps, and writes a standalone directory:

```bash
git clone https://github.com/vastxie/99AI-plugin-edition.git
cd 99AI-plugin-edition
./build.sh
```

The output directory is:

```text
99AIPluginQuickDeploy/
```

It already contains the server `dist/`, chat and admin static files, the production lockfile, an env template, and start scripts. **The `README.md` inside that directory only describes this flat layout.** The source-repo paths `cd service` and `docker compose` do not apply there. Copy the directory to the server, then:

```bash
cp .env.example .env
# edit .env
pnpm install --prod --frozen-lockfile
pnpm start
```

The build host needs Node.js 20–24 and pnpm 10.33.2. `99AIPluginQuickDeploy/` is not committed and is excluded from the Docker build context. Running the script again updates that directory only after all three apps build successfully. Layout notes: [docs/QUICK_DEPLOY.md](docs/QUICK_DEPLOY.md).

## First-time configuration

Sign in to the admin console with the super-admin from `.env`, then walk through this order:

1. **System / Basic settings** — site name, public site URL, logo, language, and theme.
2. **Models / Basic settings** — model service base URL, key, and global model.
3. **Models / Model list** — add and enable at least one model. The API model name must match the provider catalog.
4. **Users / User settings** — registration, check-in, guest quota, and login methods.
5. **Storage and extras** — configure file storage; turn on email, SMS, WeChat, or payments only as needed, and test each one.

Model keys are entered by the operator in the admin console. Before you go public, test payment, email, SMS, and WeChat callbacks with real configuration.

## Local development

Node.js 20–24 (22 recommended) and pnpm 10.33.2, plus reachable MySQL and Redis:

```bash
git clone https://github.com/vastxie/99AI-plugin-edition.git
cd 99AI-plugin-edition
corepack enable
corepack prepare pnpm@10.33.2 --activate
```

Install and verify each package:

```bash
cd service && pnpm install --frozen-lockfile && pnpm test -- --runInBand && pnpm build
cd ../chat && pnpm install --frozen-lockfile && pnpm type-check && pnpm build
cd ../admin && pnpm install --frozen-lockfile && pnpm lint && pnpm build
```

Each package can run `pnpm dev` in its own directory. Chat defaults to port `9002`, admin to `9000`, both calling `http://127.0.0.1:9520/api`. In production use the build output or Docker Compose — do not expose the dev servers.

## Contributing

Issues and pull requests are welcome, including longer-term co-maintainership.

1. Search existing issues first. For large features, discuss goals, APIs, and compatibility before coding.
2. Fork the repo and branch from the latest `main` with a narrow scope.
3. Run the tests, type checks, lint, and builds that match what you changed.
4. In the PR, say why it changed, how you verified it, what compatibility shifted, and what you did not cover.

Do not commit `.env` files, keys, databases, logs, uploads, or personal data. Report security issues privately using [SECURITY.md](SECURITY.md) — do not post secrets, personal data, or ready-to-use exploit details in a public issue.

Unless stated otherwise, contributions are under Apache License 2.0 section 5.

`scripts/export-open-source-snapshot.sh` is a maintainer tool for clean source snapshots (macOS only; needs bsdtar and xattr). Everyday deploy and contribution flows do not use it.

## Community

Scan the WeChat QR, add the remark `99`, and join the group. The author does not offer private 1:1 tech support. Read the group notice after you join.

<img src="https://github.com/user-attachments/assets/9fed8343-73ae-43b0-9ce7-dc1a4c30c7a5" width="220" alt="99AI WeChat community QR code">

## Deployment security notes

- Do not commit or publish `.env` files, databases, logs, uploads, or any service keys.
- In production enable HTTPS, restrict `CORS_ORIGINS`, use unique strong passwords, and keep `DB_SYNC=false`.
- Keep MCP tools at least privilege by default. Test payment, email, SMS, and WeChat callbacks with production-like config.
- Local `/file` is currently anonymous static access. Do not store sensitive, private, or regulated files there. Add auth or signed URLs before you expose it on the public internet.

## Disclaimer

- This project is provided “as is.” It does not promise continuous availability, and it does not guarantee that AI output is accurate, complete, or fit for a particular purpose. Do not treat AI output as medical, legal, or financial advice.
- You must have lawful rights to the models, APIs, data, and content you use, and you must follow local law and upstream terms. Do not use this project for illegal activity or to infringe others’ IP, privacy, or other rights.
- Operators who offer generative AI services to the public in mainland China should follow, as their business requires, the [Interim Measures for the Management of Generative Artificial Intelligence Services](https://www.cac.gov.cn/2023-07/13/c_1690898327029107.htm), the [Measures for the Identification of AI-Generated and Synthetic Content](https://www.cac.gov.cn/2025-03/14/c_1743654685899683.htm), and other applicable rules — including content labeling, security assessments, and algorithm filing or licensing. Whether internal R&D or non-public use is in scope depends on the actual scenario.
- You accept the risks of deploying, operating, forking, and publishing AI output. This is not legal advice. Get a professional compliance review for your location and how you offer the service before you go live.

## License

Copyright 2026 vastxie

Published by `vastxie` under [Apache License 2.0](LICENSE).
