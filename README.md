# AI Radar

AI Radar is an open-source, bilingual AI information system for global news, papers, models, benchmarks, products, repositories, prompts, skills and practical guides. The Public Alpha is event-first and source-first: English and Chinese presentation share one fact and provenance layer.

The repository is under active Public Alpha development. The current executable baseline provides live English and Chinese service-status pages, a versioned status API and OpenAPI document, a separately runnable Worker, PostgreSQL migrations, and allowlisted Owner access through GitHub OAuth.

## Quick start

Prerequisites:

- Node.js 20.9 or newer
- pnpm 10
- Docker with the Compose plugin

From a clean clone:

```bash
pnpm install
cp .env.example .env.local
docker compose up -d --wait postgres
pnpm db:migrate
```

Start the Web process:

```bash
pnpm dev:web
```

In a second terminal, start the Worker process:

```bash
pnpm dev:worker
```

Open these public routes:

- English status: <http://localhost:3000/en/status>
- 中文状态: <http://localhost:3000/zh/status>
- Status API: <http://localhost:3000/api/v1/status>
- OpenAPI 3.1: <http://localhost:3000/api/openapi.json>

## GitHub Owner authentication

Create a GitHub OAuth App and set its callback URL to:

```text
http://localhost:3000/api/auth/callback/github
```

Put its client ID and secret in `.env.local`. `OWNER_GITHUB_ID` is the immutable numeric GitHub account ID allowed to create an Owner session. Public pages do not require an account. Visit <http://localhost:3000/admin> to begin the Owner sign-in flow.

## Verification and production build

The unit suite is fast and does not use the network:

```bash
pnpm test
```

The end-to-end suite starts its own isolated PostgreSQL container and real Next.js process. Docker must be running:

```bash
pnpm test:e2e
```

Run the complete local gate:

```bash
pnpm verify
```

Build and run production Web output:

```bash
pnpm build
pnpm start:web
```

Run the production Worker in another terminal:

```bash
pnpm start:worker
```

## Repository map

- `src/app` — public and Owner Web routes
- `src/auth` — GitHub allowlist and server-side session configuration
- `src/contracts` — executable HTTP contracts and OpenAPI generation
- `src/db` and `drizzle` — executable PostgreSQL schema and migrations
- `src/worker` — separately runnable Worker entry point
- `tests/unit` — deterministic policy tests
- `tests/e2e` — real browser, HTTP and isolated PostgreSQL seams
- `docs` — accepted product, domain, architecture, editorial and delivery decisions
- `CONTEXT.md` and `docs/adr` — canonical domain language and hard-to-reverse decisions

## 中文说明

AI Radar 是一个面向全球用户的中英文双语 AI 信息雷达，聚合新闻、论文、模型与评测、产品、GitHub、提示词、Skill 和使用指南。事实、日期、版本与来源在中英文页面之间共享，语言只改变表达层。

本地启动顺序是：安装依赖、复制 `.env.example`、启动 PostgreSQL、执行迁移，然后分别启动 Web 和 Worker。公开阅读不要求登录；只有 `OWNER_GITHUB_ID` 配置的 GitHub 数字账号 ID 可以进入 `/admin`。

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting code, original content or a third-party link. Report vulnerabilities through [SECURITY.md](SECURITY.md), not a public Issue.

Source code is licensed under the [Apache License 2.0](LICENSE). Data and third-party material have separate rights and release boundaries documented under `docs/05-sources-rights-and-open-data.md`.
