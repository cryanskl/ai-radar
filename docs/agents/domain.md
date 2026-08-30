# Domain docs

This repository uses a single-context domain documentation layout.

## Before exploring or changing domain behaviour

1. Read `CONTEXT.md` at the repository root when it exists.
2. Read ADRs under `docs/adr/` that affect the area being changed.
3. Follow the detailed product and system documents linked from `docs/README.md`.

If `CONTEXT.md` or a relevant ADR does not exist, proceed with the verified repository state. Do not invent a domain rule to fill the gap.

## Use the glossary vocabulary

Issue titles, specifications, tests, API contracts and code should use terms as defined in `CONTEXT.md`.

In particular, do not silently collapse distinct concepts such as:

- `Source Item` and `Event`.
- `Entity` and an entity version.
- factual fields and `Localized Content`.
- `Latest`, `Trending` and `Featured`.
- `Search` and `Ask`.
- `Correction` and `Tombstone`.

If an implementation needs a concept that is absent from the glossary, first determine whether it is a synonym that should be rejected or a real domain gap that should be documented.

## Flag ADR conflicts

If proposed work conflicts with an existing ADR, surface the conflict explicitly. Do not silently override or work around an accepted decision.

## Layout

~~~text
/
├── CONTEXT.md
├── docs/
│   ├── README.md
│   ├── adr/
│   └── agents/
└── application source
~~~

Do not introduce `CONTEXT-MAP.md` or per-package contexts unless the repository later becomes a genuinely independent multi-context monorepo.
