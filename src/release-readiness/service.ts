import {
  releaseEvidenceManifestSchema,
  type ReleaseDecision,
} from "./contracts";

const extractP0CheckIds = (checklistMarkdown: string) =>
  Array.from(
    new Set(
      Array.from(
        checklistMarkdown.matchAll(/\bP0\s+([A-Z][A-Z0-9]*-\d{3})\b/g),
        (match) => match[1],
      ),
    ),
  ).sort();

export const buildReleaseDecision = ({
  checklistMarkdown,
  evidenceManifest,
}: {
  checklistMarkdown: string;
  evidenceManifest: unknown;
}): ReleaseDecision => {
  const manifest = releaseEvidenceManifestSchema.parse(evidenceManifest);
  const checklistIds = extractP0CheckIds(checklistMarkdown);
  const checklistIdSet = new Set(checklistIds);
  const evidenceByCheckId = new Map<
    string,
    (typeof manifest.entries)[number]
  >();

  for (const entry of manifest.entries) {
    for (const checkId of entry.checkIds) {
      if (evidenceByCheckId.has(checkId)) {
        throw new Error(`Duplicate P0 evidence: ${checkId}`);
      }
      evidenceByCheckId.set(checkId, entry);
    }
  }

  const unknownIds = Array.from(evidenceByCheckId.keys())
    .filter((checkId) => !checklistIdSet.has(checkId))
    .sort();
  if (unknownIds.length > 0) {
    throw new Error(`Unknown P0 evidence: ${unknownIds.join(", ")}`);
  }

  const missingIds = checklistIds.filter(
    (checkId) => !evidenceByCheckId.has(checkId),
  );
  if (missingIds.length > 0) {
    throw new Error(`Missing P0 evidence: ${missingIds.join(", ")}`);
  }

  const checks = checklistIds.map((checkId) => {
    const entry = evidenceByCheckId.get(checkId)!;
    return {
      checkId,
      result: entry.result,
      evidence: entry.evidence,
      notes: entry.notes,
    };
  });
  const passed = checks.filter(({ result }) => result === "pass").length;
  const failed = checks.length - passed;

  return {
    version: manifest.version,
    dataVersion: manifest.dataVersion,
    verifiedAt: manifest.verifiedAt,
    owner: manifest.owner,
    environment: manifest.environment,
    decision: failed === 0 ? "go" : "no_go",
    summary: { total: checks.length, passed, failed },
    checks,
  };
};
