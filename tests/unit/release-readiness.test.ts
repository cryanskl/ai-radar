import { access, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildReleaseDecision } from "@/release-readiness/service";

const checklist = `
- [ ] P0 SITE-001: Public Alpha is visible.
- [ ] P0 I18N-001: English and Chinese routes exist.
- [ ] P0 E2E-001: A source adapter records an Ingest Run.
- [ ] P1 SITE-008: About page is available.
`;

const evidence = (checkIds: string[], result: "pass" | "fail" = "pass") => ({
  version: "public-alpha-v1",
  dataVersion: "public-alpha-test",
  verifiedAt: "2026-08-31T00:00:00.000Z",
  owner: "repository-owner",
  environment: "isolated-test",
  entries: [
    {
      checkIds,
      result,
      evidence: ["tests/e2e/release-rehearsal.spec.ts"],
      notes: result === "pass" ? "Verified." : "Not yet verified.",
    },
  ],
});

describe("Public Alpha release readiness", () => {
  it("returns GO only when every P0 has passing evidence", () => {
    const decision = buildReleaseDecision({
      checklistMarkdown: checklist,
      evidenceManifest: evidence(["SITE-001", "I18N-001", "E2E-001"]),
    });

    expect(decision.decision).toBe("go");
    expect(decision.summary).toEqual({ total: 3, passed: 3, failed: 0 });
    expect(decision.checks.map(({ checkId }) => checkId)).toEqual([
      "E2E-001",
      "I18N-001",
      "SITE-001",
    ]);
  });

  it("returns NO-GO and preserves the failing evidence", () => {
    const manifest = evidence(["SITE-001", "I18N-001", "E2E-001"]);
    manifest.entries[0].result = "fail";
    manifest.entries[0].notes = "Hosted performance evidence is missing.";

    const decision = buildReleaseDecision({
      checklistMarkdown: checklist,
      evidenceManifest: manifest,
    });

    expect(decision.decision).toBe("no_go");
    expect(decision.summary).toEqual({ total: 3, passed: 0, failed: 3 });
    expect(decision.checks[0]).toMatchObject({
      result: "fail",
      evidence: ["tests/e2e/release-rehearsal.spec.ts"],
      notes: "Hosted performance evidence is missing.",
    });
  });

  it("rejects a manifest that omits a P0 check", () => {
    expect(() =>
      buildReleaseDecision({
        checklistMarkdown: checklist,
        evidenceManifest: evidence(["SITE-001", "I18N-001"]),
      }),
    ).toThrowError("Missing P0 evidence: E2E-001");
  });

  it("rejects duplicate and unknown check IDs", () => {
    const manifest = evidence(["SITE-001", "I18N-001", "E2E-001"]);
    manifest.entries.push({
      checkIds: ["SITE-001", "UNKNOWN-001"],
      result: "pass",
      evidence: ["duplicate-evidence"],
      notes: "Invalid duplicate and unknown evidence.",
    });

    expect(() =>
      buildReleaseDecision({
        checklistMarkdown: checklist,
        evidenceManifest: manifest,
      }),
    ).toThrowError("Duplicate P0 evidence: SITE-001");
  });

  it("covers every accepted P0 with the checked-in release decision evidence", async () => {
    const [acceptedChecklist, checkedInEvidence] = await Promise.all([
      readFile(
        new URL("../../docs/10-acceptance-checklist.md", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../../docs/release-evidence/public-alpha-v1.json",
          import.meta.url,
        ),
        "utf8",
      ).then(JSON.parse),
    ]);

    const decision = buildReleaseDecision({
      checklistMarkdown: acceptedChecklist,
      evidenceManifest: checkedInEvidence,
    });

    expect(decision.summary.total).toBeGreaterThan(300);
    expect(decision.decision).toBe("no_go");
    expect(
      decision.checks.find(({ checkId }) => checkId === "SEC-009")?.evidence,
    ).toEqual(
      expect.arrayContaining([
        "scripts/release-security-scan.ts",
        "tests/e2e/data-releases.spec.ts",
      ]),
    );
    expect(
      Object.fromEntries(
        decision.checks
          .filter(({ checkId }) =>
            ["CORR-001", "RSS-003", "SEC-010", "SITE-004"].includes(checkId),
          )
          .map(({ checkId, result }) => [checkId, result]),
      ),
    ).toEqual({
      "CORR-001": "fail",
      "RSS-003": "fail",
      "SEC-010": "fail",
      "SITE-004": "fail",
    });
    expect(
      decision.checks
        .filter(({ result }) => result === "fail")
        .map(({ checkId }) => checkId),
    ).toEqual(
      expect.arrayContaining([
        "DR-001",
        "OPEN-009",
        "PERF-008",
        "RESP-008",
        "SAMPLE-001",
      ]),
    );
  });

  it("keeps the Public Alpha repository governance evidence checked in", async () => {
    const repositoryRoot = new URL("../../", import.meta.url);
    const requiredFiles = [
      "NOTICE",
      "docs/release-evidence/dependency-license-audit.md",
      ".github/ISSUE_TEMPLATE/bug.yml",
      ".github/ISSUE_TEMPLATE/source-suggestion.yml",
      ".github/ISSUE_TEMPLATE/correction.yml",
      ".github/ISSUE_TEMPLATE/rights.yml",
      ".github/ISSUE_TEMPLATE/config.yml",
    ];

    await Promise.all(
      requiredFiles.map((path) => access(new URL(path, repositoryRoot))),
    );
    const licenseAudit = await readFile(
      new URL(
        "docs/release-evidence/dependency-license-audit.md",
        repositoryRoot,
      ),
      "utf8",
    );
    expect(licenseAudit).toContain("538 packages");
    expect(licenseAudit).toContain("0 unknown");
    expect(licenseAudit).toContain("0 unlicensed");
  });
});
