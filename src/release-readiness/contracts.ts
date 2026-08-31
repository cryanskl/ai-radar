import { z } from "zod";

const checkIdSchema = z.string().regex(/^[A-Z][A-Z0-9]*-\d{3}$/);

export const releaseEvidenceManifestSchema = z
  .object({
    version: z.string().trim().min(1),
    dataVersion: z.string().trim().min(1),
    verifiedAt: z.iso.datetime({ offset: true }),
    owner: z.string().trim().min(1),
    environment: z.string().trim().min(1),
    entries: z
      .array(
        z
          .object({
            checkIds: z.array(checkIdSchema).min(1),
            result: z.enum(["pass", "fail"]),
            evidence: z.array(z.string().trim().min(1)).min(1),
            notes: z.string().trim().min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export type ReleaseEvidenceManifest = z.infer<
  typeof releaseEvidenceManifestSchema
>;

export type ReleaseDecision = {
  version: string;
  dataVersion: string;
  verifiedAt: string;
  owner: string;
  environment: string;
  decision: "go" | "no_go";
  summary: { total: number; passed: number; failed: number };
  checks: Array<{
    checkId: string;
    result: "pass" | "fail";
    evidence: string[];
    notes: string;
  }>;
};
