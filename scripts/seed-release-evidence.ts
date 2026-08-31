import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

type EvidenceRule = {
  evidence: string[];
  notes: string;
  result: "pass" | "fail";
};

type ConfirmedPass = EvidenceRule & { checkIds: string[] };

const checklistPath = resolve("docs/10-acceptance-checklist.md");
const outputPath = resolve("docs/release-evidence/public-alpha-v1.json");
const checklist = await readFile(checklistPath, "utf8");
const checkIds = Array.from(
  new Set(
    Array.from(
      checklist.matchAll(/\bP0\s+([A-Z][A-Z0-9]*-\d{3})\b/g),
      (match) => match[1],
    ),
  ),
).sort();

const confirmedPasses: ConfirmedPass[] = [
  {
    checkIds: ["SITE-001", "SITE-002", "SITE-003"],
    result: "pass",
    evidence: ["src/app/[locale]/page.tsx", "tests/e2e/homepage.spec.ts"],
    notes:
      "The bilingual homepage explicitly labels Public Alpha, uses the accepted positioning and states the coverage boundary.",
  },
  {
    checkIds: ["DATA-008"],
    result: "pass",
    evidence: ["tests/e2e/release-rehearsal.spec.ts"],
    notes:
      "The release rehearsal proves a source failure is retryable, visible in its Ingest Run and reflected as degraded Source Health.",
  },
  {
    checkIds: ["DR-002", "DR-003", "DR-005", "DR-006"],
    result: "pass",
    evidence: [
      "tests/e2e/release-rehearsal.spec.ts",
      "docs/14-public-alpha-release-decision.md",
    ],
    notes:
      "An isolated PostgreSQL restore compares release-critical facts and audits; the recovery boundary, ownership and prohibition on treating a Data Release as the sole backup are documented.",
  },
  {
    checkIds: [
      "E2E-001",
      "E2E-002",
      "E2E-003",
      "E2E-004",
      "E2E-005",
      "E2E-006",
      "E2E-007",
      "E2E-008",
      "E2E-009",
      "E2E-010",
      "E2E-011",
      "E2E-012",
      "E2E-013",
    ],
    result: "pass",
    evidence: [
      "tests/e2e/release-rehearsal.spec.ts",
      "tests/fixtures/arxiv-attention-paper.xml",
      "https://arxiv.org/abs/1706.03762",
      "https://research.google/pubs/attention-is-all-you-need/",
    ],
    notes:
      "One official arXiv record and an official second source traverse the complete accepted release rehearsal, including correction and Open Data outputs.",
  },
  {
    checkIds: ["REPO-006"],
    result: "pass",
    evidence: [".github/ISSUE_TEMPLATE", "SECURITY.md"],
    notes:
      "Bug, Source suggestion, Correction and Rights templates are public; Security reports use the private advisory entry.",
  },
  {
    checkIds: ["REPO-008"],
    result: "pass",
    evidence: ["NOTICE", "docs/release-evidence/dependency-license-audit.md"],
    notes:
      "All 538 installed packages have recognized licenses; the audit has no unknown or unlicensed package.",
  },
  {
    checkIds: ["SEC-009"],
    result: "pass",
    evidence: [
      "scripts/release-security-scan.ts",
      "tests/unit/release-security.test.ts",
      "tests/e2e/data-releases.spec.ts",
    ],
    notes:
      "The checked-in repository passes strong-secret scanning, and a generated Data Release is verified to exclude private and restricted fields.",
  },
  {
    checkIds: ["SEC-011"],
    result: "pass",
    evidence: ["SECURITY.md", ".github/ISSUE_TEMPLATE/config.yml"],
    notes:
      "The repository publishes a private security-advisory reporting path.",
  },
  {
    checkIds: [
      "TEST-004",
      "TEST-006",
      "TEST-007",
      "TEST-008",
      "TEST-009",
      "TEST-010",
    ],
    result: "pass",
    evidence: ["tests/e2e", "tests/unit", ".github/workflows/ci.yml"],
    notes:
      "The focused integration, Ask, delivery, bilingual and browser journeys are exercised by the complete automated suite.",
  },
];

const reviewedFailures: Record<string, string> = {
  "CORR-001":
    "Every domain detail page does not yet expose a Correction or report entry.",
  "DR-001":
    "No production PostgreSQL provider or automatic backup schedule is configured.",
  "RSS-003": "Eight domain-specific Latest RSS feeds are not implemented.",
  "SEC-010":
    "The dependency audit passes, but no deployment-image vulnerability scan is attached.",
  "SITE-004":
    "Known Limitations does not yet cover source, history, benchmark, translation and Agent limitations.",
};

const passByCheckId = new Map<string, EvidenceRule>();
const checklistIdSet = new Set(checkIds);
for (const { checkIds: passedIds, ...rule } of confirmedPasses) {
  for (const checkId of passedIds) {
    if (!checklistIdSet.has(checkId))
      throw new Error(`Confirmed pass is not a current P0: ${checkId}`);
    if (passByCheckId.has(checkId))
      throw new Error(`Duplicate confirmed pass: ${checkId}`);
    passByCheckId.set(checkId, rule);
  }
}

const blocked = (checkId: string): EvidenceRule => ({
  result: "fail",
  evidence: ["docs/14-public-alpha-release-decision.md"],
  notes:
    reviewedFailures[checkId] ??
    "No individually reviewed release evidence is attached for this P0; it remains blocked by default.",
});

const grouped = new Map<string, { rule: EvidenceRule; checkIds: string[] }>();
for (const checkId of checkIds) {
  const rule = passByCheckId.get(checkId) ?? blocked(checkId);
  const key = JSON.stringify(rule);
  const group = grouped.get(key) ?? { rule, checkIds: [] };
  group.checkIds.push(checkId);
  grouped.set(key, group);
}

const manifest = {
  version: "public-alpha-v1",
  dataVersion: "public-alpha-release-candidate-1",
  verifiedAt: "2026-08-31T05:26:26.000Z",
  owner: "AI Radar repository owner",
  environment: "local isolated PostgreSQL and Chromium release candidate",
  entries: Array.from(grouped.values()).map(({ rule, checkIds: ids }) => ({
    checkIds: ids,
    ...rule,
  })),
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
