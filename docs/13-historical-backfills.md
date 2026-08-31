# Historical Backfill Runbook

AI Radar imports history as reviewed themes, not as a count of copied articles. The main timeline starts on 2022-11-30. Earlier context must be represented as an explicit `curated_prehistory` candidate instead of being presented as complete coverage.

## Versioned manifest

Each batch is a reviewed JSON manifest in `data/historical-batches`. The first production batch is `chatgpt-research-preview-v1.json` and covers the ChatGPT Research Preview theme.

Every manifest contains:

- A stable batch public ID, semantic version, bilingual theme name and coverage interval.
- Ordered Entity, Event and Relation candidates using the same executable request schemas as the live Owner APIs.
- Explicit unresolved candidates with a public target and reason code when the available evidence is insufficient or belongs only in Curated Prehistory.
- Rights status on every imported Entity, Event, Source Item and Relation.

Changing a completed manifest requires both a new batch public ID and a new version. Submitting different content under an existing public ID returns `409 batch_content_conflict`; reusing a theme/version under another public ID returns `409 batch_version_conflict`.

## Run and inspect

Sign in through `/admin` as the configured Owner, then submit the checked-in manifest to:

```text
POST /api/v1/admin/historical-batches
Content-Type: application/json
```

The first successful run returns `201`. Replaying byte-equivalent parsed content returns the stored report with `200` and `replayed: true`; it does not recreate domain records. Read a stored report with:

```text
GET /api/v1/admin/historical-batches/{publicId}
```

Both endpoints require the Owner session cookie. Their complete executable schemas are published at `/api/openapi.json`.

## Candidate behavior

The batch layer only orchestrates the import. It delegates validation and writes to the existing domain services:

1. Entities and versions use the live Entity creation path.
2. Historical Events reuse a previously registered Source when its identity matches, then use the live Source Item, Event, localization and publication rules.
3. Events must pass the normal bilingual, rights and source gates before publication.
4. Relations use the live endpoint, vocabulary, evidence, review and rights checks.
5. Expected domain rejections such as `not_found`, `invalid_relation`, `not_publishable` and `already_exists` are persisted as failed candidate results. Unknown system errors fail the request instead of being hidden in a quality report.

Candidate order is significant because later Relations may depend on Entities and Events created earlier in the same manifest.

## Quality report

Every completed run persists per-candidate outcomes and these aggregate checks:

- Imported, failed and unresolved counts.
- Published Event, Entity, version and Relation counts.
- Reviewed bilingual Event and Entity counts.
- Rights-classified candidate count.
- Original or S/A-quality source count.
- Gates for all Events published, bilingual and sourced, plus all candidates resolved.

`completed` means every candidate imported. `completed_with_issues` means the workflow completed but at least one candidate is failed or unresolved. `failed` means an unexpected system error interrupted the run; the current candidate is recorded as `system_error`, later candidates are `not_run`, and the original error still fails the request. Replaying the same failed manifest returns its stored report without retrying partially committed domain records; a corrected retry uses a new public ID and version. The Owner reviews all candidate error codes before treating a theme as publish-complete.

The reusable workflow supports later batches toward the editorial target of 1,000–3,000 distinct Events, but volume is never a per-batch acceptance gate. A smaller, accurately sourced and rights-classified theme is preferable to inflated coverage.

## First theme evidence

The ChatGPT Research Preview batch starts the main timeline on 2022-11-30 from OpenAI's original announcement, stores only AI Radar-authored bilingual summaries plus link and provenance metadata, and classifies the Source Item as `link_only`. It creates:

- One published bilingual announcement Event.
- Product, organization and topic Entities.
- One ChatGPT Research Preview version.
- `ANNOUNCES`, `DEVELOPS` and `TAGGED_WITH` Relations backed by the original Source Item.

The end-to-end acceptance scenario in `tests/e2e/historical-backfill.spec.ts` imports this manifest, checks both public locales and graph links, replays it without duplication, exposes failed and unresolved fixture candidates, and verifies the OpenAPI paths.
