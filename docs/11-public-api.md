# AI Radar Public API

The Public API is a read-only, rights-aware interface for external developers. Its executable OpenAPI 3.1 document is served at `/api/openapi.json`; the current major-version base path is `/api/v1`.

## Versioning

The URL major version describes HTTP contract compatibility. A breaking field, identity or behavior change requires a new major version.

Every public response also includes `X-AI-Radar-Data-Version`. Collection responses repeat that value as `dataVersion`. This data version identifies the public dataset used for the response; it may change without changing the API major version. Before the first immutable Public Data Release, the honest default is `public-alpha-unreleased`.

## Core resources

| Resource | Collection | Detail |
| --- | --- | --- |
| Events | `GET /api/v1/events` | `GET /api/v1/events/{publicId}` |
| Entities | `GET /api/v1/entities` | `GET /api/v1/entities/{publicId}` |
| Relations | `GET /api/v1/relations` | `GET /api/v1/relations/{publicId}` |
| Search | `GET /api/v1/search` | — |
| Rankings | `GET /api/v1/rankings` | `GET /api/v1/rankings/{publicId}` |
| Corrections | `GET /api/v1/corrections` | `GET /api/v1/corrections/{publicId}` |
| Tombstones | `GET /api/v1/tombstones` | `GET /api/v1/tombstones/{publicId}` |
| Public Data Releases | `GET /api/v1/releases` | `GET /api/v1/releases/{publicId}` |
| Status | — | `GET /api/v1/status` |

Records expose stable public identities. Rights Status, provenance and verification timestamps are included where the underlying domain record supports them. A missing provenance field must not be interpreted as AI Radar claiming ownership of third-party material.

Each Data Release detail lists five immutable JSON files with byte size and SHA-256. `GET /api/v1/releases/{publicId}/files/{name}` returns the exact stored bytes. GitHub Release is canonical; a Feishu or Baidu mirror appears in the detail only after all five checksums match. The operational publication and verification sequence is documented in `12-public-data-releases.md`.

Relation records explicitly expose subject-to-object direction, validity range, confidence, review status and fact verification timestamps. Evidence objects separately expose `rightsStatus`, `attribution`, `licenseUrl` and `rightsCheckedAt`; a Rights review timestamp must not be interpreted as fact verification.

## Bounded pagination

Collections accept `limit` from 1 through 50 and an opaque `cursor`. The default limit is 20. A response returns `nextCursor: null` when no next page exists.

Cursors are bound to the resource, locale and active filters. Clients must pass the same filters on the next request and must not decode, edit or reuse a cursor for another request. Ranking cursors advance the `definitions` array; `featured` is a separately selected, bounded editorial snapshot and is not part of natural ranking order.

```bash
curl 'http://localhost:3000/api/v1/events?locale=en&limit=20'
curl 'http://localhost:3000/api/v1/search?q=agent&locale=zh&limit=10'
curl 'http://localhost:3000/api/v1/rankings?locale=en&kind=value&limit=10'
```

## Errors

Public API boundary errors use a stable JSON object:

```json
{
  "error": "invalid_cursor",
  "message": "Cursor does not match this Public API request"
}
```

The public error codes are `invalid_request`, `invalid_cursor`, `not_found` and `rate_limit_exceeded`. Detailed schemas and per-operation statuses are in OpenAPI.

## Anonymous rate limit

Public GET routes use a fixed-window anonymous quota. Defaults are 60 requests per 60 seconds and can be configured with `PUBLIC_API_RATE_LIMIT_REQUESTS` and `PUBLIC_API_RATE_LIMIT_WINDOW_SECONDS`.

Every counted response includes:

- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset` as Unix seconds

A rejected request returns HTTP `429`, `Retry-After`, `Cache-Control: no-store` and the stable `rate_limit_exceeded` body. Public Alpha keeps counters in each Web runtime, so this is a per-runtime guard rather than a globally coordinated quota.

The deployment reverse proxy must remove client-supplied forwarding headers and set a trusted `X-Real-IP`, or a trusted final `X-Forwarded-For` hop. AI Radar hashes that value before using it as the in-memory quota identity. Owner routes and non-GET requests are outside this public quota.

## Rights and licensing boundary

AI Radar-owned structured data is available under CC BY 4.0. Record-level `rightsStatus`, license, attribution and source fields take precedence. The API license does not relicense third-party names, links, quotations, source metadata or source material.

The Public API never exposes Owner operations, raw upstream responses, private submissions, subscriber identity, internal review notes or records that fail public visibility and rights gates. The source and release policy is defined in `05-sources-rights-and-open-data.md`.

A Relation is public only when the Relation, its endpoints and at least one Evidence item pass the public gates. Restricted Evidence items are omitted from every public projection; if no public Evidence remains, the Relation is omitted. Direct Relation responses, Entity graphs and nested Event relations use this same rule.

## 中文摘要

Public API 面向外部开发者，只提供只读、经过版权与公开性过滤的数据。`/api/v1` 表示接口主版本，`X-AI-Radar-Data-Version` 表示本次响应使用的数据版本。列表每页默认 20 条、最多 50 条，游标绑定语言和过滤条件，不能跨请求复用。

每个数据发行版详情列出五个不可变 JSON 文件、字节数与 SHA-256。生成后的草稿不会进入公开接口；服务端下载并验证 GitHub Release 的五个资产后才公开。飞书或百度网盘镜像也由服务端逐文件下载并校验，五个文件全部字节一致后才会出现在公开详情中。

公开 GET 接口默认按每个 Web runtime、每个匿名身份每 60 秒 60 次限流。部署代理必须覆盖客户端伪造的转发 IP 头。AI Radar 自有结构化数据采用 CC BY 4.0；单条记录的版权、许可和署名字段优先，接口许可不会重新授权第三方原始内容。
