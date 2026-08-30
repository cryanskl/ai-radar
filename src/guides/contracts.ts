import { z } from "zod";
import { relationTypeSchema } from "@/entities/contracts";
import { localeSchema, publicRightsStatusSchema } from "@/events/contracts";

const publicIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const timestampSchema = z.iso.datetime({ offset: true });
const httpUrlSchema = z.url().regex(/^https?:\/\//);
const authorshipSchema = z.enum([
  "human_authored",
  "ai_translated",
  "official_translation",
]);
const authorSchema = z
  .object({ name: z.string().trim().min(1), url: httpUrlSchema.nullable() })
  .strict();
const licenseSchema = z
  .object({ name: z.string().trim().min(1), url: httpUrlSchema })
  .strict();
const sourceSchema = z
  .object({
    sourceItemPublicId: publicIdSchema,
    title: z.string().min(1),
    url: httpUrlSchema,
    attribution: z.string().min(1),
  })
  .strict();

export const guideProvenanceSchema = z.enum([
  "ai_radar_original",
  "authorized_submission",
  "external_guidance",
]);
export const guideContentModeSchema = z.enum(["full_guide", "summary_link"]);
export const guideStatusSchema = z.enum(["current", "stale"]);
export const guideStepKindSchema = z.enum([
  "settings",
  "price",
  "interface",
  "durable",
]);

const mutableGuideStepKindSchema = z.enum(["settings", "price", "interface"]);

const stepFactSchema = z.discriminatedUnion("kind", [
  z
    .object({
      id: publicIdSchema,
      kind: mutableGuideStepKindSchema,
      verifiedAt: timestampSchema,
    })
    .strict(),
  z
    .object({
      id: publicIdSchema,
      kind: z.literal("durable"),
      verifiedAt: z.null(),
    })
    .strict(),
]);

const fullGuideVersionLocalizationSchema = z
  .object({
    locale: localeSchema,
    prerequisites: z.array(z.string().trim().min(1)).min(1),
    steps: z
      .array(
        z
          .object({
            id: publicIdSchema,
            instruction: z.string().trim().min(1),
          })
          .strict(),
      )
      .min(1),
    expectedOutcome: z.string().trim().min(1),
    limitations: z.array(z.string().trim().min(1)).min(1),
    authorship: authorshipSchema,
    reviewStatus: z.literal("reviewed"),
  })
  .strict();

const summaryLinkLocalizationSchema = z
  .object({
    locale: localeSchema,
    authorship: authorshipSchema,
    reviewStatus: z.literal("reviewed"),
  })
  .strict();

const statusLocalizationSchema = z
  .object({
    locale: localeSchema,
    staleReason: z.string().trim().min(1),
    authorship: authorshipSchema,
    reviewStatus: z.literal("reviewed"),
  })
  .strict();

const statusObservationSchema = z
  .object({
    publicId: publicIdSchema,
    sourceItemPublicId: publicIdSchema,
    status: guideStatusSchema,
    observedAt: timestampSchema,
    localizations: z.array(statusLocalizationSchema).max(2),
  })
  .strict()
  .superRefine(({ status, localizations }, context) => {
    const hasBothLocales =
      localizations.length === 2 &&
      new Set(localizations.map(({ locale }) => locale)).size === 2;
    if (status === "stale" && !hasBothLocales) {
      context.addIssue({
        code: "custom",
        path: ["localizations"],
        message: "Stale Guide observations require reviewed en and zh reasons",
      });
    }
    if (status === "current" && localizations.length !== 0) {
      context.addIssue({
        code: "custom",
        path: ["localizations"],
        message: "Current Guide observations do not accept stale reasons",
      });
    }
  });

const guideProfileBaseShape = {
  guidePublicId: publicIdSchema,
  sourceItemPublicId: publicIdSchema,
  author: authorSchema,
  category: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/),
};

const guideVersionBaseShape = {
  entityVersionPublicId: publicIdSchema,
  sourceItemPublicId: publicIdSchema,
  publishedAt: timestampSchema,
  reviewedAt: timestampSchema,
  statusObservation: statusObservationSchema,
};

const fullGuideCreateRequestSchema = z
  .object({
    ...guideProfileBaseShape,
    provenance: z.enum(["ai_radar_original", "authorized_submission"]),
    rightsStatus: z.enum(["open", "attribution_required", "source_license"]),
    license: licenseSchema,
    contentMode: z.literal("full_guide"),
    version: z
      .object({
        ...guideVersionBaseShape,
        steps: z.array(stepFactSchema).min(1),
        localizations: z.array(fullGuideVersionLocalizationSchema).length(2),
      })
      .strict(),
  })
  .strict();

const summaryLinkCreateRequestSchema = z
  .object({
    ...guideProfileBaseShape,
    provenance: z.literal("external_guidance"),
    rightsStatus: z.enum(["metadata_only", "link_only"]),
    license: z.null(),
    contentMode: z.literal("summary_link"),
    version: z
      .object({
        ...guideVersionBaseShape,
        localizations: z.array(summaryLinkLocalizationSchema).length(2),
      })
      .strict(),
  })
  .strict();

export const guideProfileCreateRequestSchema = z
  .discriminatedUnion("contentMode", [
    fullGuideCreateRequestSchema,
    summaryLinkCreateRequestSchema,
  ])
  .superRefine((input, context) => {
    const { version } = input;
    if (new Date(version.reviewedAt) < new Date(version.publishedAt)) {
      context.addIssue({
        code: "custom",
        path: ["version", "reviewedAt"],
        message: "Guide review cannot precede publication",
      });
    }
    if (
      new Date(version.statusObservation.observedAt) <
      new Date(version.reviewedAt)
    ) {
      context.addIssue({
        code: "custom",
        path: ["version", "statusObservation", "observedAt"],
        message: "Guide status observation cannot precede review",
      });
    }
    const locales = input.version.localizations.map(({ locale }) => locale);
    if (new Set(locales).size !== 2) {
      context.addIssue({
        code: "custom",
        path: ["version", "localizations"],
        message: "English and Chinese Guide localizations are required",
      });
    }
    if (input.contentMode !== "full_guide") return;
    const factIds = input.version.steps.map(({ id }) => id);
    if (factIds.length !== new Set(factIds).size) {
      context.addIssue({
        code: "custom",
        path: ["version", "steps"],
        message: "Guide step IDs must be unique",
      });
    }
    input.version.localizations.forEach((localization, index) => {
      const localizedIds = localization.steps.map(({ id }) => id);
      if (
        localizedIds.length !== new Set(localizedIds).size ||
        localizedIds.length !== factIds.length ||
        localizedIds.some((id) => !factIds.includes(id))
      ) {
        context.addIssue({
          code: "custom",
          path: ["version", "localizations", index, "steps"],
          message: "Localized Guide steps must match Fact Layer step IDs",
        });
      }
    });
    input.version.steps.forEach((step, index) => {
      if (
        new Date(step.verifiedAt ?? version.reviewedAt) >
        new Date(version.reviewedAt)
      ) {
        context.addIssue({
          code: "custom",
          path: ["version", "steps", index, "verifiedAt"],
          message: "Guide step verification cannot follow review",
        });
      }
    });
  });

export const guideProfileCreateResponseSchema = z
  .object({
    status: z.literal("created"),
    guidePublicId: publicIdSchema,
    versionPublicId: publicIdSchema,
    publicVisibility: z.literal(true),
  })
  .strict();

export const guideStatusAppendRequestSchema = z
  .object({
    guidePublicId: publicIdSchema,
    observation: statusObservationSchema,
  })
  .strict();

export const guideStatusAppendResponseSchema = z
  .object({
    guidePublicId: publicIdSchema,
    observationPublicId: publicIdSchema,
    status: guideStatusSchema,
  })
  .strict();

export const guideListRequestSchema = z
  .object({
    locale: localeSchema.default("en"),
    category: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/)
      .optional(),
    provenance: guideProvenanceSchema.optional(),
    status: guideStatusSchema.optional(),
    rightsStatus: publicRightsStatusSchema.optional(),
  })
  .strict();

const publicStatusSchema = z
  .object({
    publicId: publicIdSchema,
    status: guideStatusSchema,
    observedAt: timestampSchema,
    staleReason: z.string().min(1).nullable(),
    source: sourceSchema,
  })
  .strict();

const publicGuideStepSchema = z.discriminatedUnion("kind", [
  z
    .object({
      id: publicIdSchema,
      kind: mutableGuideStepKindSchema,
      instruction: z.string().min(1),
      verifiedAt: timestampSchema,
    })
    .strict(),
  z
    .object({
      id: publicIdSchema,
      kind: z.literal("durable"),
      instruction: z.string().min(1),
      verifiedAt: z.null(),
    })
    .strict(),
]);

export const publicGuideListItemSchema = z
  .object({
    publicId: publicIdSchema,
    name: z.string().min(1),
    summary: z.string().min(1),
    author: authorSchema,
    provenance: guideProvenanceSchema,
    category: z.string().min(1),
    rightsStatus: publicRightsStatusSchema,
    contentMode: guideContentModeSchema,
    version: z.string().min(1),
    reviewedAt: timestampSchema,
    lastVerifiedAt: timestampSchema,
    currentStatus: publicStatusSchema,
  })
  .strict();

export const publicGuideListSchema = z
  .object({
    locale: localeSchema,
    items: z.array(publicGuideListItemSchema),
    dataCutoff: timestampSchema.nullable(),
  })
  .strict();

const publicRelatedRecordSchema = z
  .object({
    publicId: publicIdSchema,
    predicate: relationTypeSchema,
    direction: z.enum(["outgoing", "incoming"]),
    target: z
      .object({
        publicId: publicIdSchema,
        type: z.enum([
          "model",
          "product",
          "repository",
          "prompt",
          "skill",
          "event",
        ]),
        name: z.string().min(1),
      })
      .strict(),
    evidence: z
      .array(
        sourceSchema.pick({ sourceItemPublicId: true, title: true, url: true }),
      )
      .min(1),
  })
  .strict();

const publicGuideDetailBaseShape = {
  officialUrl: httpUrlSchema,
  publishedAt: timestampSchema,
  license: licenseSchema.nullable(),
  localization: z
    .object({
      locale: localeSchema,
      authorship: authorshipSchema,
      reviewStatus: z.literal("reviewed"),
      lastLocalizedAt: timestampSchema,
    })
    .strict(),
  source: sourceSchema,
  versionSource: sourceSchema,
  relatedRecords: z.array(publicRelatedRecordSchema).min(1),
};

export const publicGuideDetailSchema = z.discriminatedUnion("contentMode", [
  publicGuideListItemSchema
    .extend({
      ...publicGuideDetailBaseShape,
      contentMode: z.literal("full_guide"),
      prerequisites: z.array(z.string().min(1)).min(1),
      steps: z.array(publicGuideStepSchema).min(1),
      expectedOutcome: z.string().min(1),
      limitations: z.array(z.string().min(1)).min(1),
    })
    .strict(),
  publicGuideListItemSchema
    .extend({
      ...publicGuideDetailBaseShape,
      contentMode: z.literal("summary_link"),
      license: z.null(),
    })
    .strict(),
]);

export const guideErrorResponseSchema = z
  .object({
    error: z.enum([
      "unauthorized",
      "invalid_json",
      "invalid_reference",
      "not_found",
      "already_exists",
    ]),
  })
  .strict();

export const invalidGuideRequestResponseSchema = z
  .object({
    error: z.literal("invalid_request"),
    issues: z.array(z.unknown()).min(1),
  })
  .strict();

export type GuideProfileCreateRequest = z.infer<
  typeof guideProfileCreateRequestSchema
>;
export type GuideListRequest = z.infer<typeof guideListRequestSchema>;
export type GuideStatusAppendRequest = z.infer<
  typeof guideStatusAppendRequestSchema
>;
