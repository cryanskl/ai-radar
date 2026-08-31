# Public Alpha release decision

> Decision: **NO-GO**
>
> Evidence cutoff: 2026-08-31T05:26:26Z
>
> Candidate: `public-alpha-release-candidate-1`
> Environment: local production build, isolated PostgreSQL and Chromium

AI Radar is explicitly a **Public Alpha / 公开测试版**, but this release candidate must not be represented as a hosted public release. The executable evidence manifest covers every accepted P0 check and intentionally returns No-Go while production-only evidence is missing.

Run the auditable decision locally:

```bash
pnpm release:decision
pnpm release:go
```

`release:decision` prints the decision, pass/fail totals and every blocking P0 ID. `release:go` exits unsuccessfully until every P0 has attached passing evidence. A future checklist addition without a manifest entry also fails closed.

## Engineering evidence completed

- A real official arXiv metadata record for `1706.03762v7` traverses ingestion, rights classification, Event creation, second-source consolidation, bilingual publication, knowledge-graph linking, Search, cited Ask, Brief/RSS, correction, page/API propagation and rights-safe Open Data generation.
- A failed arXiv retrieval records a retryable Ingest Run and degraded Source Health instead of appearing as an empty news day.
- PostgreSQL is dumped in custom format, restored to a separate PostgreSQL 17 container and compared through release-critical Event, Entity, Relation, Source Item and audit fingerprints.
- The checked-in repository passes a secret, privacy and restricted-field scan. The dependency graph has no known high- or critical-severity advisory at the evidence cutoff.
- The production build, empty-database migrations and complete automated suite remain release gates. GitHub CI repeats the dependency audit and complete verification from a clean checkout.

## Current blockers

The detailed source of truth is `docs/release-evidence/public-alpha-v1.json`. Its remaining No-Go items include:

- no configured production PostgreSQL provider and automatic backup schedule;
- no hosted-environment performance evidence;
- no Safari and Firefox smoke evidence;
- no canonical production GitHub Data Release or checksum-verified Feishu/Baidu mirror;
- no production editorial, query-quality and rights sampling against a hosted dataset;
- incomplete full WCAG AA, SEO, observability, alerting and privacy-preserving analytics evidence.

These are not converted to passing results by local mocks or documents. The Owner may change a result only after attaching the corresponding environment or review evidence.

## Coverage and Data Cutoff

The Public Alpha interface covers Radar, Models, Papers, Products, GitHub, Prompts, Skills and Guides in English and Chinese. The homepage renders the latest verified public-data cutoff from the database; it does not substitute the build time or current wall clock when no public record exists.

The rehearsal's rights-safe release contains Event and Correction records. It does not claim to be the canonical production dataset. Entity and domain-profile exports remain limited until their provenance and rights evidence meet the same release standard.

## Recovery boundary

The isolated recovery rehearsal proves that the documented database backup can reconstruct release-critical facts and audits. It does not prove production automatic backups (`DR-001`) because no production database provider is configured. Generated public Data Releases are distribution artifacts and must never be treated as the sole production database backup.

The release Owner is responsible for configuring automatic production backups, recording retention and restore ownership, and attaching a dated hosted restore rehearsal before changing `DR-001` to pass.

## Decision rule

The release becomes GO only when the manifest contains exactly one passing evidence entry for every current P0, the complete local and CI gates pass, and the Owner records the hosted evidence above. Until then, the correct public statement is: **AI Radar Public Alpha is implemented as a release candidate; public production launch remains No-Go.**
