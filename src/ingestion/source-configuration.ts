import { database } from "@/db/client";
import {
  sourceCursors,
  sourceHealth,
  sourcePolicies,
  sources,
} from "@/db/schema";

export const arxivSourcePolicy = {
  adapterKey: "arxiv_api",
  query: "cat:cs.AI OR cat:cs.CL OR cat:cs.LG",
  minRequestIntervalMs: 3000,
  maxItemsPerRun: 25,
  requestTimeoutMs: 10_000,
  userAgent: "AI-Radar/0.1 (+https://github.com/cryanskl/ai-radar)",
  retainRawPayload: false,
  defaultRightsStatus: "open",
  defaultAttribution: "arXiv",
  defaultLicenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  termsUrl: "https://info.arxiv.org/help/api/tou.html",
  policyEvidenceVersion: "arxiv-api-tou-accessed-2026-08-30",
  allowedFields: [
    "arxiv_id",
    "title",
    "authors",
    "abstract_url",
    "published_at",
  ] as string[],
  prohibitedFields: ["abstract_text", "pdf", "source_files"] as string[],
  publicDisplayScope: "metadata_and_ai_radar_authored_summary",
  exportScope: "cc0_descriptive_metadata_only",
  enabled: true,
} as const;

export const configureArxivSource = async (
  reviewedAt = new Date("2026-08-30T07:25:52.000Z"),
) =>
  database.transaction(async (transaction) => {
    const [source] = await transaction
      .insert(sources)
      .values({
        publicId: "arxiv",
        name: "arXiv",
        homepageUrl: "https://arxiv.org/",
        tier: "S",
        accessStatus: "approved",
        acquisitionMethod: "api",
        policyLastReviewedAt: reviewedAt,
      })
      .onConflictDoUpdate({
        target: sources.publicId,
        set: {
          accessStatus: "approved",
          acquisitionMethod: "api",
          policyLastReviewedAt: reviewedAt,
          updatedAt: reviewedAt,
        },
      })
      .returning({ id: sources.id });

    await transaction
      .insert(sourcePolicies)
      .values({ sourceId: source.id, ...arxivSourcePolicy })
      .onConflictDoUpdate({
        target: sourcePolicies.sourceId,
        set: { ...arxivSourcePolicy, updatedAt: reviewedAt },
      });
    await transaction
      .insert(sourceCursors)
      .values({ sourceId: source.id })
      .onConflictDoNothing({ target: sourceCursors.sourceId });
    await transaction
      .insert(sourceHealth)
      .values({ sourceId: source.id })
      .onConflictDoNothing({ target: sourceHealth.sourceId });

    return {
      sourcePublicId: "arxiv" as const,
      adapterKey: arxivSourcePolicy.adapterKey,
      minRequestIntervalMs: arxivSourcePolicy.minRequestIntervalMs,
      maxItemsPerRun: arxivSourcePolicy.maxItemsPerRun,
      retainRawPayload: arxivSourcePolicy.retainRawPayload,
    };
  });
