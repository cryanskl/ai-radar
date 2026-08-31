import { z } from "zod";
import { localeSchema, publicRightsStatusSchema } from "@/events/contracts";

const publicIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const timestampSchema = z.iso.datetime({ offset: true });
const httpUrlSchema = z.url().regex(/^https?:\/\//);
const methodologyVersionSchema = z.string().regex(/^\d+\.\d+\.\d+$/);
const authorshipSchema = z.enum([
  "human_authored",
  "ai_translated",
  "official_translation",
]);

export const rankingTargetTypeSchema = z.enum([
  "event",
  "model",
  "paper",
  "product",
  "repository",
  "prompt",
  "skill",
  "guide",
]);
export const rankingKindSchema = z.enum([
  "latest",
  "trending",
  "benchmark",
  "value",
]);
export const rankingConfidenceSchema = z.enum(["high", "medium", "low"]);
export const rankingObservationStatusSchema = z.enum([
  "active",
  "insufficient_evidence",
  "stale",
  "withdrawn",
]);

const definitionLocalizationSchema = z
  .object({
    locale: localeSchema,
    title: z.string().trim().min(1),
    question: z.string().trim().min(1),
    eligibilitySummary: z.string().trim().min(1),
    limitations: z.array(z.string().trim().min(1)).min(1),
    authorship: authorshipSchema,
    reviewStatus: z.literal("reviewed"),
  })
  .strict();

const latestMethodSchema = z
  .object({
    kind: z.literal("latest"),
    timeField: z.enum([
      "occurred_at",
      "published_at",
      "released_at",
      "created_at",
      "effective_at",
    ]),
    tieBreaker: z.literal("confidence_then_public_id"),
  })
  .strict();

const trendingMethodSchema = z
  .object({
    kind: z.literal("trending"),
    windowHours: z.number().int().positive(),
    sourceNormalization: z.literal("within_source_percentile"),
    minimumSignals: z.number().int().min(2),
    minimumSources: z.number().int().min(2),
    breadthSaturationSources: z.number().int().min(3),
    freshnessHalfLifeHours: z.number().int().positive(),
    formula: z.literal(
      "mean_by_source(mean((0.6 * source percentile + 0.4 * velocity) * freshness)) * confidence * source breadth",
    ),
    tieBreaker: z.literal("score_then_public_id"),
  })
  .strict()
  .refine(
    ({ minimumSources, breadthSaturationSources }) =>
      breadthSaturationSources > minimumSources,
    {
      path: ["breadthSaturationSources"],
      message: "breadth saturation must exceed the minimum source threshold",
    },
  );

const benchmarkMethodSchema = z
  .object({
    kind: z.literal("benchmark"),
    scenario: z.string().trim().min(1),
    benchmarkPublicId: publicIdSchema,
    benchmarkVersion: z.string().trim().min(1),
    scoreUnit: z.string().trim().min(1),
    direction: z.enum(["higher_is_better", "lower_is_better"]),
    tieBreaker: z.literal("score_then_version_or_public_id"),
  })
  .strict();

const valueMethodSchema = z
  .object({
    kind: z.literal("value"),
    scenario: z.string().trim().min(1),
    qualityBenchmarkPublicId: publicIdSchema,
    qualityBenchmarkVersion: z.string().trim().min(1),
    qualityScoreUnit: z.string().trim().min(1),
    qualityThreshold: z.number(),
    qualityDirection: z.enum(["at_least", "at_most"]),
    priceCategory: z.enum([
      "input_tokens",
      "output_tokens",
      "cached_input_tokens",
      "cached_output_tokens",
      "batch_input_tokens",
      "batch_output_tokens",
      "image",
      "audio",
      "video",
    ]),
    priceUnit: z.enum([
      "per_million_tokens",
      "per_image",
      "per_minute",
      "per_second",
    ]),
    currency: z.string().regex(/^[A-Z]{3}$/),
    region: z.string().trim().min(1),
    costBasis: z.literal("hosted_api_list_price"),
    exchangeRatePolicy: z.literal("no_conversion"),
    selfDeploymentAssumptions: z.null(),
    tieBreaker: z.literal("score_then_version_or_public_id"),
  })
  .strict()
  .superRefine(({ priceCategory, priceUnit }, context) => {
    const expectedUnit = priceCategory.endsWith("_tokens")
      ? "per_million_tokens"
      : priceCategory === "image"
        ? "per_image"
        : priceCategory === "audio"
          ? "per_minute"
          : "per_second";
    if (priceUnit !== expectedUnit) {
      context.addIssue({
        code: "custom",
        path: ["priceUnit"],
        message: `${priceCategory} value rankings must use ${expectedUnit}`,
      });
    }
  });

export const rankingMethodSchema = z.discriminatedUnion("kind", [
  latestMethodSchema,
  trendingMethodSchema,
  benchmarkMethodSchema,
  valueMethodSchema,
]);

export const rankingDefinitionCreateRequestSchema = z
  .object({
    definitionPublicId: publicIdSchema,
    targetType: rankingTargetTypeSchema,
    methodologyVersion: methodologyVersionSchema,
    effectiveAt: timestampSchema,
    eligibility: z.array(z.string().trim().min(1)).min(1),
    dimensions: z.array(z.string().trim().min(1)).min(1),
    method: rankingMethodSchema,
    localizations: z.array(definitionLocalizationSchema).length(2),
  })
  .strict()
  .superRefine((input, context) => {
    if (new Set(input.localizations.map(({ locale }) => locale)).size !== 2) {
      context.addIssue({
        code: "custom",
        path: ["localizations"],
        message: "English and Chinese Ranking localizations are required",
      });
    }
    if (
      ["benchmark", "value"].includes(input.method.kind) &&
      input.targetType !== "model"
    ) {
      context.addIssue({
        code: "custom",
        path: ["targetType"],
        message: "Benchmark and Value definitions rank Model versions only",
      });
    }
    if (input.method.kind === "latest") {
      const requiredTimeField = {
        event: "occurred_at",
        model: "released_at",
        paper: "released_at",
        product: "effective_at",
        repository: "created_at",
        prompt: "published_at",
        skill: "released_at",
        guide: "published_at",
      }[input.targetType];
      if (input.method.timeField !== requiredTimeField) {
        context.addIssue({
          code: "custom",
          path: ["method", "timeField"],
          message: `${input.targetType} Latest must use ${requiredTimeField}`,
        });
      }
    }
  });

export const rankingDefinitionCreateResponseSchema = z
  .object({
    status: z.enum(["created_definition", "created_version"]),
    definitionPublicId: publicIdSchema,
    methodologyVersion: methodologyVersionSchema,
  })
  .strict();

const rawMetricValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

const trendingSignalSchema = z
  .object({
    sourceItemPublicId: publicIdSchema,
    origin: z.enum([
      "independent_publication",
      "commercial",
      "submission_volume",
      "onsite_engagement",
    ]),
    normalizedPercentile: z.number().min(0).max(1),
    velocity: z.number().min(0).max(1),
    observedAt: timestampSchema,
  })
  .strict();

const rankingComparisonSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("benchmark"),
      benchmarkRunPublicId: publicIdSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("value"),
      benchmarkRunPublicId: publicIdSchema,
      priceRecordPublicId: publicIdSchema,
    })
    .strict(),
]);

export const rankingObservationCreateRequestSchema = z
  .object({
    definitionPublicId: publicIdSchema,
    methodologyVersion: methodologyVersionSchema,
    observation: z
      .object({
        publicId: publicIdSchema,
        target: z
          .object({
            type: rankingTargetTypeSchema,
            publicId: publicIdSchema,
            versionPublicId: publicIdSchema.nullable(),
          })
          .strict(),
        observedAt: timestampSchema,
        dataCutoff: timestampSchema,
        comparison: rankingComparisonSchema.nullable(),
        confidence: rankingConfidenceSchema,
        rawMetrics: z.record(z.string(), rawMetricValueSchema),
        evidenceSourceItemPublicIds: z.array(publicIdSchema),
        signals: z.array(trendingSignalSchema),
      })
      .strict(),
  })
  .strict()
  .superRefine((input, context) => {
    const { observation } = input;
    if (new Date(observation.dataCutoff) > new Date(observation.observedAt)) {
      context.addIssue({
        code: "custom",
        path: ["observation", "dataCutoff"],
        message: "Ranking Data Cutoff cannot follow observation time",
      });
    }
    if (
      observation.signals.some(
        ({ observedAt }) =>
          new Date(observedAt) > new Date(observation.dataCutoff),
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["observation", "signals"],
        message: "Trending signals cannot follow the Data Cutoff",
      });
    }
  });

export const rankingObservationCreateResponseSchema = z
  .object({
    status: z.enum(["active", "insufficient_evidence"]),
    observationPublicId: publicIdSchema,
    score: z.number().nullable(),
  })
  .strict();

const featuredLocalizationSchema = z
  .object({
    locale: localeSchema,
    reason: z.string().trim().min(1),
    audience: z.string().trim().min(1),
    commercialDisclosure: z.string().trim().min(1),
    authorship: authorshipSchema,
    reviewStatus: z.literal("reviewed"),
  })
  .strict();

export const featuredSelectionCreateRequestSchema = z
  .object({
    publicId: publicIdSchema,
    target: z
      .object({
        type: rankingTargetTypeSchema,
        publicId: publicIdSchema,
      })
      .strict(),
    selectedAt: timestampSchema,
    reviewDueAt: timestampSchema,
    editorRole: z.string().trim().min(1),
    topic: z.string().trim().min(1),
    commercialRelationship: z.enum(["none", "sponsor", "affiliate", "other"]),
    rankingInfluence: z.literal(false),
    evidenceSourceItemPublicIds: z.array(publicIdSchema).min(1),
    localizations: z.array(featuredLocalizationSchema).length(2),
  })
  .strict()
  .superRefine((input, context) => {
    if (new Date(input.reviewDueAt) <= new Date(input.selectedAt)) {
      context.addIssue({
        code: "custom",
        path: ["reviewDueAt"],
        message: "Featured review must follow selection",
      });
    }
    if (new Set(input.localizations.map(({ locale }) => locale)).size !== 2) {
      context.addIssue({
        code: "custom",
        path: ["localizations"],
        message: "English and Chinese Featured localizations are required",
      });
    }
  });

export const featuredSelectionCreateResponseSchema = z
  .object({
    status: z.literal("created"),
    publicId: publicIdSchema,
  })
  .strict();

export const rankingListRequestSchema = z
  .object({
    locale: localeSchema.default("en"),
    targetType: rankingTargetTypeSchema.optional(),
    kind: rankingKindSchema.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().min(1).max(2_000).optional(),
  })
  .strict();

export const rankingDetailRequestSchema = z
  .object({
    locale: localeSchema.default("en"),
    methodologyVersion: methodologyVersionSchema.optional(),
  })
  .strict();

const publicSourceSchema = z
  .object({
    sourceItemPublicId: publicIdSchema,
    title: z.string().min(1),
    url: httpUrlSchema,
    rightsStatus: publicRightsStatusSchema,
    attribution: z.string().min(1),
    licenseUrl: httpUrlSchema.nullable(),
    rightsCheckedAt: timestampSchema,
  })
  .strict();

const publicDefinitionSchema = z
  .object({
    publicId: publicIdSchema,
    targetType: rankingTargetTypeSchema,
    kind: rankingKindSchema,
    methodologyVersion: methodologyVersionSchema,
    effectiveAt: timestampSchema,
    title: z.string().min(1),
    question: z.string().min(1),
    eligibility: z.array(z.string().min(1)).min(1),
    eligibilitySummary: z.string().min(1),
    dimensions: z.array(z.string().min(1)).min(1),
    method: rankingMethodSchema,
    limitations: z.array(z.string().min(1)).min(1),
    rankingState: z.enum(["available", "insufficient_evidence"]),
    dataCutoff: timestampSchema.nullable(),
  })
  .strict();

const publicObservationSchema = z
  .object({
    publicId: publicIdSchema,
    target: z
      .object({
        type: rankingTargetTypeSchema,
        publicId: publicIdSchema,
        name: z.string().min(1),
        versionPublicId: publicIdSchema.nullable(),
        versionLabel: z.string().min(1).nullable(),
      })
      .strict(),
    observedAt: timestampSchema,
    dataCutoff: timestampSchema,
    candidateTime: timestampSchema.nullable(),
    rank: z.number().int().positive().nullable(),
    score: z.number().nullable(),
    comparison: z
      .object({
        benchmarkRunPublicId: publicIdSchema,
        priceRecordPublicId: publicIdSchema.nullable(),
        benchmarkRun: z
          .object({
            runAt: timestampSchema,
            evaluator: z
              .object({
                publicId: publicIdSchema,
                name: z.string().min(1),
              })
              .strict(),
            settings: z.record(z.string(), rawMetricValueSchema),
            provenance: z.enum([
              "independent_reproduced",
              "independent_reported",
              "vendor_reported",
              "community_observation",
            ]),
            reproducibility: z.enum([
              "reproduced",
              "reproducible",
              "reported_only",
            ]),
            lastVerifiedAt: timestampSchema,
          })
          .strict(),
        priceRecord: z
          .object({
            amount: z.string().min(1),
            category: z.enum([
              "input_tokens",
              "output_tokens",
              "cached_input_tokens",
              "cached_output_tokens",
              "batch_input_tokens",
              "batch_output_tokens",
              "image",
              "audio",
              "video",
            ]),
            currency: z.string().regex(/^[A-Z]{3}$/),
            unit: z.enum([
              "per_million_tokens",
              "per_image",
              "per_minute",
              "per_second",
            ]),
            region: z.string().min(1),
            taxPolicy: z.enum(["inclusive", "exclusive", "unknown"]),
            validFrom: timestampSchema,
            validTo: timestampSchema.nullable(),
            lastVerifiedAt: timestampSchema,
            costBasis: z.literal("hosted_api_list_price"),
            exchangeRatePolicy: z.literal("no_conversion"),
            selfDeploymentAssumptions: z.null(),
          })
          .strict()
          .nullable(),
      })
      .strict()
      .nullable(),
    rawMetrics: z.record(z.string(), rawMetricValueSchema),
    signals: z.array(trendingSignalSchema),
    confidence: rankingConfidenceSchema,
    status: rankingObservationStatusSchema,
    evidence: z.array(publicSourceSchema).min(1),
  })
  .strict();

const publicFeaturedSchema = z
  .object({
    publicId: publicIdSchema,
    target: z
      .object({
        type: rankingTargetTypeSchema,
        publicId: publicIdSchema,
        name: z.string().min(1),
      })
      .strict(),
    selectedAt: timestampSchema,
    reviewDueAt: timestampSchema,
    editorRole: z.string().min(1),
    topic: z.string().min(1),
    reason: z.string().min(1),
    audience: z.string().min(1),
    commercialRelationship: z.enum(["none", "sponsor", "affiliate", "other"]),
    commercialDisclosure: z.string().min(1),
    rankingInfluence: z.literal(false),
    evidence: z.array(publicSourceSchema).min(1),
  })
  .strict();

export const publicRankingListSchema = z
  .object({
    locale: localeSchema,
    definitions: z.array(publicDefinitionSchema),
    featured: z.array(publicFeaturedSchema),
  })
  .strict();

export const publicRankingDetailSchema = z
  .object({
    locale: localeSchema,
    definition: publicDefinitionSchema,
    observations: z.array(publicObservationSchema),
  })
  .strict();

export const rankingErrorResponseSchema = z
  .object({
    error: z.enum([
      "unauthorized",
      "invalid_json",
      "invalid_reference",
      "invalid_method",
      "not_found",
      "already_exists",
    ]),
  })
  .strict();

export const invalidRankingRequestResponseSchema = z
  .object({
    error: z.literal("invalid_request"),
    issues: z.array(z.unknown()),
  })
  .strict();

export type RankingDefinitionCreateRequest = z.infer<
  typeof rankingDefinitionCreateRequestSchema
>;
export type RankingObservationCreateRequest = z.infer<
  typeof rankingObservationCreateRequestSchema
>;
export type FeaturedSelectionCreateRequest = z.infer<
  typeof featuredSelectionCreateRequestSchema
>;
export type RankingListRequest = z.infer<typeof rankingListRequestSchema>;
export type RankingDetailRequest = z.infer<typeof rankingDetailRequestSchema>;
