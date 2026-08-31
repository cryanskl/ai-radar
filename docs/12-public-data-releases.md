# Public Data Release runbook

AI Radar publishes immutable, rights-cleared data snapshots separately from the source-code license and the continuously changing Public API data version.

## Release boundary

Public Alpha release schema `1.0.0` contains five files:

| File               | Purpose                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| `schema.json`      | Executable JSON Schema definitions for Events, Corrections and Tombstones                                   |
| `records.json`     | One Fact Layer record per Event, with reviewed English/Chinese Localized Content and public Source evidence |
| `corrections.json` | Public Corrections or minimal `redacted_due_to_rights` records effective at or before the Data Cutoff       |
| `tombstones.json`  | Active deletion, merge, withdrawal and review instructions effective at or before the cutoff                |
| `manifest.json`    | Data version, cutoff, license, attribution, record counts, file sizes and SHA-256 checksums                 |

The Release row stores the SHA-256 of `manifest.json`; the manifest stores the checksums of the other four files. This avoids a self-referential checksum while keeping every byte independently verifiable.

The first schema intentionally excludes Entity and domain Profile exports. They remain available through the Public API, but do not enter a Data Release until they carry the same release-grade provenance guarantees as Events. This limitation is visible in both Trust Center languages.

## Owner publication workflow

1. Choose a unique public ID, data version, Data Cutoff and GitHub Release tag.
2. Create a draft GitHub Release for `cryanskl/ai-radar`; its tag URL is the canonical URL recorded by AI Radar.
3. As the authenticated Owner, call `POST /api/v1/admin/data-releases` with that canonical URL, license and attribution. A successful response has `status: generated`; it is not visible in the Public API or Trust Center.
4. If the request returns `validation_failed`, repair every reported Rights, provenance, bilingual localization, cutoff or privacy issue. The service never silently drops a record that claims to be publicly publishable.
5. Download all five files from the returned `downloadUrl` values. Recalculate every SHA-256 and compare it with the response and manifest.
6. Attach the exact five files to the corresponding GitHub Release, then publish that GitHub Release. Large files do not enter Git history.
7. Call `POST /api/v1/admin/data-releases/{publicId}/publish`. AI Radar reads the GitHub Release API, downloads all five canonical assets, recalculates SHA-256 and inserts the immutable publication row only if every byte matches. Until this succeeds, the generated version stays private.
8. Copy the exact canonical bytes to Feishu or Baidu Netdisk.
9. Call `POST /api/v1/admin/data-releases/{publicId}/mirror` with the five provider-hosted file URLs and use the same `manifest.json` file URL as `url`. AI Radar downloads and hashes every mirror file itself. A mismatch returns `checksum_mismatch` and no mirror URL becomes public.
10. Inspect `/en/trust`, `/zh/trust`, `/api/v1/releases` and the Release detail before announcing the version.

Example generation body:

```json
{
  "publicId": "data-release-public-alpha-1",
  "dataVersion": "public-alpha-release-1",
  "dataCutoff": "2026-08-31T12:00:00.000Z",
  "canonicalUrl": "https://github.com/cryanskl/ai-radar/releases/tag/data-public-alpha-1",
  "license": "CC-BY-4.0",
  "attribution": "AI Radar and the named source publishers"
}
```

## Validation behavior

Generation runs in one repeatable-read PostgreSQL transaction:

1. audit all publicly visible published/corrected candidates;
2. reject non-exportable Rights states;
3. reject missing public Source evidence;
4. reject missing reviewed English or Chinese Event content;
5. reject Events, Localized Content or Source evidence verified or updated after the Data Cutoff;
6. treat `public_visibility = true` as the record-level privacy publication decision and transform only declared public fields;
7. keep Fact Layer fields separate from reviewed Localized Content and validate both internal schemas;
8. redact Correction changes and evidence whenever the target or any evidence fails public Rights/visibility gates;
9. scan the serialized package for operational identity/internal-field leakage;
10. calculate byte sizes and SHA-256 values;
11. insert immutable generated metadata and all files atomically.

Repeatable Read freezes the generation transaction; it does not reconstruct earlier database states. Explicit object update-time and relationship creation-time gates are what make the chosen Data Cutoff honest. Generated Release metadata and files have database triggers that reject updates and deletes. A separate immutable publication row is accepted only when the exact five-file set exists and canonical GitHub bytes have been verified. Corrections require a new data version rather than an in-place rewrite. Verified mirror metadata is stored separately because mirror availability can change without changing canonical artifact bytes.
