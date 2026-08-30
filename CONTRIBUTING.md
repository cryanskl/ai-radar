# Contributing to AI Radar

AI Radar separates source code, original editorial content and third-party discovery links because each carries a different rights grant.

## Before starting

1. Read `AGENTS.md`, `CONTEXT.md` and any relevant ADR under `docs/adr`.
2. Find or open a bounded GitHub Issue with acceptance criteria and blocking edges.
3. Do not start work on a blocked Issue.
4. Keep one change focused on one Issue and preserve unrelated work.

## Code contributions

Code contributions are submitted under Apache-2.0. Add a failing test at the agreed public seam, implement the smallest passing behavior, and run:

```bash
pnpm verify
```

## Original content contributions

Only submit text, structured facts or media that you created and have the right to license. State the intended license and provide the evidence sources used for factual claims. A code contribution does not automatically grant AI Radar the right to republish accompanying third-party expression.

## Third-party links and metadata

Submitting a public URL grants no rights over the linked work. Provide the canonical URL, publisher or author, publication time and any known license. Do not paste paywalled articles, complete repository documentation, unauthorized prompt text, skill text or other restricted expression into an Issue or pull request.

## Review expectations

- Preserve the event-first domain language and shared bilingual fact layer.
- Validate user input, external APIs and network responses at their boundaries.
- Keep public data projections explicitly rights-safe.
- Include focused test evidence and disclose limitations or unverified external setup.
