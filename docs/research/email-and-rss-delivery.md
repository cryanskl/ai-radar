# Email and RSS delivery boundary for Issue #20

Research date: 2026-08-31. Sources are limited to Resend first-party documentation, the RSS Advisory Board specification, and the W3C XML specification.

## Recommended production boundary

The application owns subscriptions, confirmation and unsubscribe state, Brief versions, the delivery ledger, and public RSS/web rendering. Resend is an outbound transport and delivery-event source only. A successful send response must be recorded as provider acceptance, not delivery: Resend returns an email `id`, while `email.delivered` is the later event that means the recipient's mail server accepted the message. [Send Email](https://resend.com/docs/api-reference/emails/send-email) · [email.delivered](https://resend.com/docs/webhooks/emails/delivered)

Render web, RSS and email from one immutable published Brief snapshot. For each confirmed, still-active subscription, create one internal delivery row before contacting Resend. The row should reference the Brief/version and subscription internally, but public Brief, RSS, APIs and data releases must never expose recipient identity, confirmation/unsubscribe tokens, provider payloads, or delivery events.

## Resend send contract

Use `POST https://api.resend.com/emails` over HTTPS with `Authorization: Bearer <API key>`, `Content-Type: application/json`, and `Idempotency-Key`. The minimal relevant body is:

| Field | Requirement / use |
| --- | --- |
| `from` | Required sender address; production sending requires a verified sender domain. |
| `to` | Required recipient address or array; the endpoint allows at most 50 recipients, but Issue #20 should send one logical delivery per subscription so bounce/unsubscribe state remains attributable. |
| `subject` | Required localized subject. |
| `html` | HTML rendering of the frozen Brief. |
| `text` | Explicit plain-text rendering is recommended; Resend otherwise derives text from HTML. |
| `tags` | Optional non-secret correlation metadata. Use opaque internal delivery ID and Brief/version only; never put email addresses or tokens in tags because tags return in webhook payloads. |

The successful response is `{ "id": "<provider-email-id>" }`. Persist that ID on the delivery row and use it to correlate webhook `data.email_id`. Treat `4xx` as request/auth/domain errors, `429` as quota/rate limiting, and `5xx` as provider infrastructure failure; Resend documents structured error types including the idempotency-specific `400` and `409` cases. [API introduction](https://resend.com/docs/api-reference/introduction) · [Send Email](https://resend.com/docs/api-reference/emails/send-email) · [Errors](https://resend.com/docs/api-reference/errors)

### Idempotency

Send the same stable key for every retry of the same immutable payload, for example `daily-brief/<delivery-id>`. Resend supports `Idempotency-Key` on `POST /emails`; keys are at most 256 characters and retained for 24 hours. Reusing a key with the same payload returns the original response without another send. Reusing it with a different payload returns `409 invalid_idempotent_request`; a simultaneous request can return `409 concurrent_idempotent_requests` and may be retried later. [Idempotency Keys](https://resend.com/docs/dashboard/emails/idempotency-keys)

The 24-hour retention window is not a durable exactly-once guarantee. Enforce a local unique constraint for the logical delivery identity (Brief version + subscription, or an equivalent delivery ID) and never regenerate a different payload under an existing key. This is an implementation conclusion from Resend's documented 24-hour window.

## Webhook ingestion contract

Subscribe at least to `email.delivered`, `email.failed`, and `email.bounced`; `email.sent` is useful if the product distinguishes provider acceptance from downstream delivery. Common payload fields are top-level `type`, top-level `created_at`, and `data` containing `email_id`, `created_at`, `from`, `to`, `subject`, optional `template_id`, and `tags`.

| Event | Meaning | Event-specific data | Suggested internal transition |
| --- | --- | --- | --- |
| `email.delivered` | Recipient mail server accepted the message; this does not prove inbox placement or human reading. | Common fields. | `delivered` |
| `email.failed` | Resend could not send because of a sending error such as recipient, API key, domain or quota failure. | `failed.reason` | `failed` plus recorded reason |
| `email.bounced` | Recipient mail server permanently rejected the email. | `message_id`; `bounce.message`, `bounce.type`, `bounce.subType` | `bounced`; suppress further sends according to product policy |

Sources: [event types](https://resend.com/docs/webhooks/event-types) · [email.delivered](https://resend.com/docs/webhooks/emails/delivered) · [email.failed](https://resend.com/docs/webhooks/emails/failed) · [email.bounced](https://resend.com/docs/webhooks/emails/bounced)

### Signature verification and duplicate delivery

Verify before parsing or mutating state:

1. Read the raw request body as text. Parsing and re-stringifying JSON changes the signed bytes and breaks verification.
2. Pass the raw payload plus `svix-id`, `svix-timestamp`, and `svix-signature` headers and `RESEND_WEBHOOK_SECRET` to `resend.webhooks.verify` (or the official Svix verifier).
3. Reject invalid signatures with a non-success response. Parse/use only the object returned by successful verification.
4. Store `svix-id` under a unique constraint before applying the event; Resend explicitly recommends it as the event ID for deduplication.
5. Return success only after the event is durably accepted. Keep the handler small; perform non-essential follow-up work asynchronously.

Resend retries failed webhook delivery using exponential backoff and supports manual replay of both failed and previously successful messages. Therefore duplicate and delayed events are expected operational conditions. Deduplicate by `svix-id`, correlate by `data.email_id`, record event time and type, and apply status transitions idempotently. Do not assume arrival order; this is a conservative implementation conclusion from retry and replay behavior, not an explicit ordering guarantee in the cited docs. [Verify Webhook Requests](https://resend.com/docs/webhooks/verify-webhooks-requests) · [Retries and Replays](https://resend.com/docs/webhooks/retries-and-replays) · [Storing Webhook Data](https://resend.com/docs/dashboard/webhooks/how-to-store-webhooks-data)

## RSS 2.0 contract

RSS is XML. The document must have one `<rss version="2.0">` root containing one `<channel>`. The minimum required channel elements are:

- `<title>` — feed name.
- `<link>` — corresponding HTML website URL.
- `<description>` — phrase or sentence describing the feed.

A channel may contain zero or more `<item>` elements. Formally, all item fields are optional, but every item must contain at least one of `<title>` or `<description>`. [RSS 2.0 specification](https://www.rssboard.org/rss-specification)

For interoperable AI Radar Brief items, emit more than the formal minimum:

| Element | AI Radar rule |
| --- | --- |
| `title` | Localized Brief title. |
| `link` | Absolute HTTPS URL of that exact published Brief version. |
| `description` | Localized summary/content rendered from the same frozen Brief snapshot. |
| `guid` | Stable immutable identifier for the Brief version; set `isPermaLink="false"` unless the value is actually a permalink. The spec recommends GUIDs so aggregators do not repeat edited items. |
| `pubDate` | Publication time formatted as an RSS/RFC 822-style date. |

Publish separate English and Chinese feed URLs, each with its own `language` value and items referencing the corresponding localized Brief. This prevents mixed-language reader behavior while preserving the same underlying Brief/version and ordered Event references.

### XML escaping

Every dynamic value must be serialized with an XML library, not string-concatenated. In XML character data, literal `&` and `<` are forbidden and must be escaped as `&amp;` and `&lt;` (or numeric references); `>` must be escaped when it would form `]]>`. Attribute values additionally require the matching quote delimiter to be escaped (`&quot;` or `&apos;`). [W3C XML 1.0, character data and markup](https://www.w3.org/TR/xml/#syntax)

If `description` contains HTML, encode the HTML as XML character data or wrap it in a correctly terminated CDATA section. Never insert untrusted HTML directly as child XML markup. RSS permits entity-encoded HTML in item descriptions, but the outer feed must remain well-formed XML. Validate generated feeds with an XML parser and the [RSS Validator](https://validator.w3.org/feed/) in tests.

## Production risks and acceptance checks

- **False delivery claims:** API `2xx` / provider email ID is acceptance, not delivery. Only `email.delivered` supports a delivered state, and even that means recipient mail server acceptance rather than inbox placement.
- **Duplicate email:** use both a local logical-delivery unique constraint and Resend's stable idempotency key; the provider key expires after 24 hours.
- **Webhook forgery or replay:** verify raw bytes and the three Svix headers before parsing; deduplicate the verified `svix-id`.
- **Status regression:** retries/replays can delay or duplicate events. Preserve the event log and make state projection idempotent; do not blindly overwrite a later terminal state with an older event.
- **Privacy leak:** recipient addresses appear in webhook `data.to`. Keep delivery/subscription storage private and exclude it from public API/RSS/data-release query paths; use opaque correlation tags only.
- **Broken feeds or injection:** serialize XML structurally, escape all dynamic text/attributes, emit absolute links, and test bilingual titles/descriptions containing `&`, `<`, `>`, quotes, and non-ASCII text.
- **Content drift:** snapshot the published Brief once and assert web, RSS and email render the same Brief ID/version, Data Cutoff, and ordered Event references.

The production acceptance seam should include deterministic fake-provider tests for accepted/failed sends and signed delivered/failed/bounced webhook fixtures, plus RSS parser/validator tests for both locales. Live-provider smoke tests should verify a real provider email ID and signed webhook correlation without making production behavior depend on Resend dashboard state.
