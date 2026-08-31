# AI Radar

AI Radar is an open-source, bilingual AI information system for global news, papers, models, benchmarks, products, repositories, prompts, skills and practical guides. The Public Alpha is event-first and source-first: English and Chinese presentation share one fact and provenance layer.

The repository is under active Public Alpha development. The current executable baseline provides a sourced bilingual Event publication flow, English and Chinese Radar pages, versioned public and Owner APIs with an OpenAPI document, a separately runnable Worker, PostgreSQL migrations, and allowlisted Owner access through GitHub OAuth.

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
- English Radar: <http://localhost:3000/en/radar>
- 中文雷达: <http://localhost:3000/zh/radar>
- Status API: <http://localhost:3000/api/v1/status>
- Published Events API: <http://localhost:3000/api/v1/events?locale=en>
- OpenAPI 3.1: <http://localhost:3000/api/openapi.json>
- English Trust Center and Open Data: <http://localhost:3000/en/trust>
- 中文信任中心与开放数据: <http://localhost:3000/zh/trust>

External developers can start with the [Public API guide](docs/11-public-api.md) for versioning, bounded cursors, rate limits and data-rights boundaries.

The staged Owner sequence for generated artifacts, server-verified canonical GitHub publication and byte-verified Feishu/Baidu mirrors is documented in the [Public Data Release runbook](docs/12-public-data-releases.md).

## GitHub Owner authentication

Create a GitHub OAuth App and set its callback URL to:

```text
http://localhost:3000/api/auth/callback/github
```

Put its client ID and secret in `.env.local`. `OWNER_GITHUB_ID` is the immutable numeric GitHub account ID allowed to create an Owner session. Public pages do not require an account. Visit <http://localhost:3000/admin> to begin the Owner sign-in flow.

The first editorial slice is API-driven: an authenticated Owner creates a Source, rights-classified Source Item, Event and reviewed English/Chinese Localized Content with `POST /api/v1/admin/event-drafts`. The returned Event public ID opens its bilingual preview at `/admin/events/{publicId}`, where the Owner can publish it. The complete request and response schemas, including rights-related failure responses, are available from the OpenAPI document.

## arXiv Source ingestion

The first production Source adapter reads descriptive metadata from the official arXiv API. An authenticated Owner first calls `POST /api/v1/admin/sources/arxiv` to record the reviewed Source and retrieval policy. The policy evidence points to the [arXiv API Terms of Use](https://info.arxiv.org/help/api/tou.html), keeps no raw Atom payload, requests at most 25 newest records, and enforces arXiv's minimum three-second interval. It stores only a response hash and CC0-classified identification metadata; it does not store PDFs, source files or source-authored abstract text. The policy record also distinguishes what AI Radar may display from the narrower metadata-only export boundary.

Run one retrieval from the independently runnable Worker:

```bash
pnpm dev:worker -- --once --source arxiv
```

The cursor, every Ingest Run, Source Health, retry time, lag and new candidates are visible at <http://localhost:3000/admin/inbox>. Replaying a cursor is safe: the `(source_id, external_id)` boundary prevents duplicate Source Items. Network, rate-limit, authentication and parsing failures exit unsuccessfully after writing retryable operational state, so they cannot look like an empty news day.

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
- `src/events` — Event creation, publication gates and public projections
- `src/ingestion` — dedicated Source adapters, cursor-safe ingest and Inbox projections
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
