import { z } from "zod";
import {
  publicCorrectionSchema,
  publicRightsDecisionSchema,
  publicReviewingTombstoneSchema,
  publicSourceWithdrawnTombstoneSchema,
  publicWithdrawnTombstoneSchema,
} from "@/operations/contracts";

export const localeSchema = z.enum(["en", "zh"]);
export const rightsStatusSchema = z.enum([
  "open",
  "attribution_required",
  "source_license",
  "metadata_only",
  "link_only",
  "permission_required",
  "internal_only",
  "withdrawn",
]);
export const publicRightsStatusSchema = z.enum([
  "open",
  "attribution_required",
  "source_license",
  "metadata_only",
  "link_only",
]);
const publicIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const timestampSchema = z.iso.datetime({ offset: true });
const httpUrlSchema = z.url().regex(/^https?:\/\//);

export const eventDraftRequestSchema = z
  .object({
    source: z
      .object({
        publicId: publicIdSchema,
        name: z.string().min(1),
        homepageUrl: httpUrlSchema,
        tier: z.enum(["S", "A", "B", "C"]),
        accessStatus: z.enum([
          "approved",
          "approved_limited",
          "permission_pending",
          "blocked",
          "retired",
        ]),
        acquisitionMethod: z.enum(["manual", "rss", "api", "web"]),
        policyLastReviewedAt: timestampSchema,
      })
      .strict(),
    sourceItem: z
      .object({
        publicId: publicIdSchema,
        externalId: z.string().min(1),
        externalIdVerifiedAt: timestampSchema.nullable().optional(),
        isOriginalSource: z.boolean().optional(),
        originalUrl: httpUrlSchema,
        canonicalUrl: httpUrlSchema,
        originalTitle: z.string().min(1),
        originalLanguage: localeSchema,
        publishedAt: timestampSchema,
        publishedAtPrecision: z.enum(["day", "minute", "second"]),
        discoveredAt: timestampSchema,
        rightsStatus: rightsStatusSchema,
        rightsCheckedAt: timestampSchema,
        attribution: z.string().min(1),
        licenseUrl: httpUrlSchema.nullable(),
      })
      .strict(),
    event: z
      .object({
        publicId: publicIdSchema,
        eventType: z.enum([
          "announces",
          "updates",
          "changes_price_of",
          "deprecates",
        ]),
        factStatus: z.enum(["rumored", "confirmed", "corrected", "withdrawn"]),
        occurredAt: timestampSchema,
        occurredAtPrecision: z.enum(["day", "minute", "second"]),
        lastVerifiedAt: timestampSchema,
        rightsStatus: rightsStatusSchema,
      })
      .strict(),
    localizations: z
      .array(
        z
          .object({
            locale: localeSchema,
            title: z.string().min(1),
            summary: z.string().min(1),
            authorship: z.enum([
              "human_authored",
              "ai_translated",
              "official_translation",
            ]),
            reviewStatus: z.enum(["draft", "reviewed"]),
          })
          .strict(),
      )
      .length(2)
      .refine(
        (localizations) =>
          new Set(localizations.map(({ locale }) => locale)).size === 2,
        {
          message: "English and Chinese localizations are required",
        },
      ),
  })
  .strict();

export const eventDraftResponseSchema = z
  .object({
    publicId: publicIdSchema,
    publicationState: z.enum(["verifying", "ready", "withdrawn"]),
    locales: z.array(localeSchema),
  })
  .strict();

const publicSourceSchema = z
  .object({
    publicId: publicIdSchema,
    sourceItemPublicId: publicIdSchema,
    name: z.string().min(1),
    tier: z.enum(["S", "A", "B", "C"]),
    originalTitle: z.string().min(1),
    originalUrl: httpUrlSchema,
    publishedAt: timestampSchema,
    publishedAtPrecision: z.enum(["day", "minute", "second"]),
    rightsStatus: publicRightsStatusSchema,
    attribution: z.string().min(1),
    licenseUrl: httpUrlSchema.nullable(),
    isPrimary: z.boolean(),
    isOriginalSource: z.boolean(),
  })
  .strict();

const publicEventEntitySchema = z
  .object({
    publicId: publicIdSchema,
    type: z.enum([
      "model",
      "paper",
      "product",
      "repository",
      "prompt",
      "skill",
      "guide",
      "organization",
      "person",
      "benchmark",
      "topic",
    ]),
    name: z.string().min(1),
    relationPublicId: publicIdSchema,
    predicate: z.enum([
      "ANNOUNCES",
      "UPDATES",
      "CHANGES_PRICE_OF",
      "DEPRECATES",
    ]),
  })
  .strict();

export const publicEventSchema = z
  .object({
    publicId: publicIdSchema,
    eventType: z.enum([
      "announces",
      "updates",
      "changes_price_of",
      "deprecates",
    ]),
    factStatus: z.enum(["rumored", "confirmed", "corrected", "withdrawn"]),
    publicationState: z.literal("published"),
    occurredAt: timestampSchema,
    occurredAtPrecision: z.enum(["day", "minute", "second"]),
    discoveredAt: timestampSchema,
    lastVerifiedAt: timestampSchema,
    rightsStatus: publicRightsStatusSchema,
    sourceStatus: z.enum(["active", "source_withdrawn"]),
    evidenceConfidence: z.enum(["high", "medium", "low"]),
    localization: z
      .object({
        locale: localeSchema,
        title: z.string().min(1),
        summary: z.string().min(1),
        authorship: z.enum([
          "human_authored",
          "ai_translated",
          "official_translation",
        ]),
        reviewStatus: z.literal("reviewed"),
      })
      .strict(),
    sources: z.array(publicSourceSchema).min(1),
    entities: z.array(publicEventEntitySchema),
    corrections: z.array(publicCorrectionSchema),
    rightsDecisions: z.array(publicRightsDecisionSchema),
  })
  .strict();

export const publicEventListSchema = z
  .object({
    items: z.array(publicEventSchema),
  })
  .strict();

export const publicEventTombstoneSchema = z
  .object({
    publicId: publicIdSchema,
    status: z.literal("merged_into"),
    targetEventPublicId: publicIdSchema,
    reasonCode: z.literal("duplicate_coverage"),
    mergedAt: timestampSchema,
  })
  .strict();

export const publicEventResponseSchema = z.union([
  publicEventSchema,
  publicEventTombstoneSchema,
  publicReviewingTombstoneSchema.extend({ objectType: z.literal("event") }),
  publicSourceWithdrawnTombstoneSchema,
  publicWithdrawnTombstoneSchema.extend({ objectType: z.literal("event") }),
]);

const candidateSignalsSchema = z
  .object({
    verifiedExternalIds: z.array(z.string().min(1)),
    canonicalUrls: z.array(httpUrlSchema),
    timeDistanceMinutes: z.number().int().nonnegative(),
    sharedEntityPublicIds: z.array(publicIdSchema),
  })
  .strict();

const eventMergePreviewSchema = z
  .object({
    sourceItemPublicIdsToMove: z.array(publicIdSchema).min(1),
    relationPublicIdsToMove: z.array(publicIdSchema),
    localizedContentLocalesPreserved: z.array(localeSchema).min(1),
    representativeSourceItemPublicId: publicIdSchema,
    tombstone: z
      .object({
        publicId: publicIdSchema,
        status: z.literal("merged_into"),
        targetEventPublicId: publicIdSchema,
      })
      .strict(),
  })
  .strict();

export const eventCandidatesResponseSchema = z
  .object({
    eventPublicId: publicIdSchema,
    candidates: z.array(
      z
        .object({
          eventPublicId: publicIdSchema,
          confidence: z.number().int().min(0).max(100),
          highImpact: z.boolean(),
          requiresOwnerReview: z.boolean(),
          signals: candidateSignalsSchema,
          mergePreview: eventMergePreviewSchema,
        })
        .strict(),
    ),
  })
  .strict();

export const eventMergeRequestSchema = z
  .object({
    targetEventPublicId: publicIdSchema,
    sourceEventPublicId: publicIdSchema,
    publicReasonCode: z.literal("duplicate_coverage"),
    internalNote: z.string().trim().min(1),
  })
  .strict()
  .refine(
    ({ sourceEventPublicId, targetEventPublicId }) =>
      sourceEventPublicId !== targetEventPublicId,
    { message: "Source and target Events must be distinct" },
  );

export const eventMergeResponseSchema = z
  .object({
    status: z.literal("merged"),
    sourceEventPublicId: publicIdSchema,
    targetEventPublicId: publicIdSchema,
    sourceCount: z.number().int().positive(),
  })
  .strict();

export const eventSplitRequestSchema = z
  .object({
    mergedEventPublicId: publicIdSchema,
    internalNote: z.string().trim().min(1),
  })
  .strict();

export const eventSplitPreviewResponseSchema = z
  .object({
    mergedEventPublicId: publicIdSchema,
    targetEventPublicId: publicIdSchema,
    sourceItemPublicIdsToRestore: z.array(publicIdSchema).min(1),
    relationPublicIdsToRestore: z.array(publicIdSchema),
    localizedContentLocalesToRestore: z.array(localeSchema).min(1),
    restoredRepresentativeSourceItemPublicId: publicIdSchema,
    targetRepresentativeSourceItemPublicId: publicIdSchema,
    tombstoneStatusAfterSplit: z.literal("removed"),
  })
  .strict();

export const eventSplitResponseSchema = z
  .object({
    status: z.literal("split"),
    restoredEventPublicId: publicIdSchema,
    targetEventPublicId: publicIdSchema,
  })
  .strict();

export const eventPublishResponseSchema = z
  .object({
    status: z.literal("published"),
    publicId: publicIdSchema,
  })
  .strict();

export const eventErrorResponseSchema = z
  .object({
    error: z.enum([
      "unauthorized",
      "invalid_json",
      "invalid_locale",
      "not_found",
      "not_publishable",
      "not_mergeable",
      "not_splittable",
      "already_exists",
    ]),
  })
  .strict();

export const invalidEventRequestResponseSchema = z
  .object({
    error: z.literal("invalid_request"),
    issues: z.array(z.unknown()),
  })
  .strict();

export type EventDraftRequest = z.infer<typeof eventDraftRequestSchema>;
export type EventMergeRequest = z.infer<typeof eventMergeRequestSchema>;
export type EventSplitRequest = z.infer<typeof eventSplitRequestSchema>;
