import { z } from "zod";
import { localeSchema } from "@/events/contracts";

const publicIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const timestampSchema = z.iso.datetime({ offset: true });
const decimalSchema = z.string().regex(/^\d{1,12}(?:\.\d{1,8})?$/);
const signedDecimalSchema = z.string().regex(/^-?\d{1,12}(?:\.\d{1,8})?$/);
export const modelLifecycleStatusSchema = z.enum([
  "active",
  "deprecated",
  "retired",
]);
export const modelModalitySchema = z.enum(["text", "image", "audio", "video"]);
export const modelAccessMethodSchema = z.enum([
  "hosted_api",
  "open_weights",
  "self_hosted",
]);
export const priceCategorySchema = z.enum([
  "input_tokens",
  "output_tokens",
  "cached_input_tokens",
  "cached_output_tokens",
  "batch_input_tokens",
  "batch_output_tokens",
  "image",
  "audio",
  "video",
]);
export const priceUnitSchema = z.enum([
  "per_million_tokens",
  "per_image",
  "per_minute",
  "per_second",
]);
export const benchmarkProvenanceSchema = z.enum([
  "independent_reproduced",
  "independent_reported",
  "vendor_reported",
  "community_observation",
]);
const settingsValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

const priceRecordInputSchema = z
  .object({
    publicId: publicIdSchema,
    category: priceCategorySchema,
    amount: decimalSchema,
    currency: z.string().regex(/^[A-Z]{3}$/),
    unit: priceUnitSchema,
    region: z.string().trim().min(1),
    taxPolicy: z.enum(["inclusive", "exclusive", "unknown"]),
    validFrom: timestampSchema,
    validTo: timestampSchema.nullable(),
    sourceItemPublicId: publicIdSchema,
    lastVerifiedAt: timestampSchema,
  })
  .strict()
  .refine(
    ({ validFrom, validTo }) =>
      !validTo || Date.parse(validTo) >= Date.parse(validFrom),
    {
      path: ["validTo"],
      message: "validTo must not be before validFrom",
    },
  )
  .refine(
    ({ category, unit }) => {
      if (category.endsWith("_tokens")) return unit === "per_million_tokens";
      if (category === "image") return unit === "per_image";
      if (category === "audio") return unit === "per_minute";
      return unit === "per_second";
    },
    { path: ["unit"], message: "unit does not match price category" },
  );

const benchmarkRunInputSchema = z
  .object({
    publicId: publicIdSchema,
    benchmarkPublicId: publicIdSchema,
    benchmarkVersion: z.string().trim().min(1),
    task: z.string().trim().min(1),
    score: signedDecimalSchema,
    unit: z.string().trim().min(1),
    higherIsBetter: z.boolean(),
    settings: z.record(z.string(), settingsValueSchema),
    evaluatorPublicId: publicIdSchema,
    provenance: benchmarkProvenanceSchema,
    runAt: timestampSchema,
    evidenceSourceItemPublicId: publicIdSchema,
    reproducibility: z.enum(["reproduced", "reproducible", "reported_only"]),
    confidence: z.number().int().min(0).max(100),
    lastVerifiedAt: timestampSchema,
  })
  .strict();

export const modelVersionProfileCreateRequestSchema = z
  .object({
    familyPublicId: publicIdSchema,
    versionPublicId: publicIdSchema,
    providerPublicId: publicIdSchema,
    lifecycleStatus: modelLifecycleStatusSchema,
    inputModalities: z.array(modelModalitySchema).min(1),
    outputModalities: z.array(modelModalitySchema).min(1),
    contextWindowTokens: z.number().int().positive(),
    accessMethods: z.array(modelAccessMethodSchema).min(1),
    regions: z.array(z.string().trim().min(1)).min(1),
    priceRecords: z.array(priceRecordInputSchema),
    benchmarkRuns: z.array(benchmarkRunInputSchema),
  })
  .strict();

export const modelVersionProfileCreateResponseSchema = z
  .object({
    familyPublicId: publicIdSchema,
    versionPublicId: publicIdSchema,
    publicVisibility: z.boolean(),
    priceRecordPublicIds: z.array(publicIdSchema),
    benchmarkRunPublicIds: z.array(publicIdSchema),
  })
  .strict();

const publicEvidenceSchema = z
  .object({
    sourceItemPublicId: publicIdSchema,
    title: z.string().min(1),
    url: z.url(),
  })
  .strict();

export const publicPriceRecordSchema = z
  .object({
    publicId: publicIdSchema,
    category: priceCategorySchema,
    amount: decimalSchema,
    currency: z.string().regex(/^[A-Z]{3}$/),
    unit: priceUnitSchema,
    region: z.string().min(1),
    taxPolicy: z.enum(["inclusive", "exclusive", "unknown"]),
    validFrom: timestampSchema,
    validTo: timestampSchema.nullable(),
    lastVerifiedAt: timestampSchema,
    source: publicEvidenceSchema,
  })
  .strict();

export const publicBenchmarkRunSchema = z
  .object({
    publicId: publicIdSchema,
    benchmark: z
      .object({
        publicId: publicIdSchema,
        name: z.string().min(1),
        version: z.string().min(1),
      })
      .strict(),
    task: z.string().min(1),
    score: z.string().min(1),
    unit: z.string().min(1),
    higherIsBetter: z.boolean(),
    settings: z.record(z.string(), settingsValueSchema),
    evaluator: z
      .object({ publicId: publicIdSchema, name: z.string().min(1) })
      .strict(),
    provenance: benchmarkProvenanceSchema,
    runAt: timestampSchema,
    lastVerifiedAt: timestampSchema,
    evidence: publicEvidenceSchema,
    reproducibility: z.enum(["reproduced", "reproducible", "reported_only"]),
    confidence: z.number().int().min(0).max(100),
  })
  .strict();

export const publicModelVersionSchema = z
  .object({
    publicId: publicIdSchema,
    versionLabel: z.string().min(1),
    releasedAt: timestampSchema.nullable(),
    lifecycleStatus: modelLifecycleStatusSchema.nullable(),
    inputModalities: z.array(modelModalitySchema),
    outputModalities: z.array(modelModalitySchema),
    contextWindowTokens: z.number().int().positive().nullable(),
    accessMethods: z.array(modelAccessMethodSchema),
    regions: z.array(z.string().min(1)),
    provider: z
      .object({ publicId: publicIdSchema, name: z.string().min(1) })
      .strict()
      .nullable(),
    prices: z.array(publicPriceRecordSchema),
    benchmarkRuns: z.array(publicBenchmarkRunSchema),
    evidenceState: z.enum(["available", "insufficient_evidence"]),
    predecessorPublicId: publicIdSchema.nullable(),
    successorPublicId: publicIdSchema.nullable(),
  })
  .strict();

export const publicModelDetailSchema = z
  .object({
    publicId: publicIdSchema,
    name: z.string().min(1),
    summary: z.string().min(1),
    officialUrl: z.url(),
    lifecycleStatus: z.literal("active"),
    lastVerifiedAt: timestampSchema,
    dataCutoff: timestampSchema,
    provider: z
      .object({ publicId: publicIdSchema, name: z.string().min(1) })
      .strict()
      .nullable(),
    versions: z.array(publicModelVersionSchema),
    relatedEntities: z.array(
      z
        .object({
          publicId: publicIdSchema,
          name: z.string().min(1),
          relation: z.string().min(1),
        })
        .strict(),
    ),
    timeline: z.array(
      z
        .object({
          eventPublicId: publicIdSchema,
          occurredAt: timestampSchema,
          title: z.string().min(1),
        })
        .strict(),
    ),
  })
  .strict();

export const publicModelListSchema = z
  .object({
    locale: localeSchema,
    items: z.array(
      publicModelDetailSchema
        .pick({
          publicId: true,
          name: true,
          summary: true,
          provider: true,
        })
        .extend({ latestVersion: publicModelVersionSchema.nullable() }),
    ),
    dataCutoff: timestampSchema.nullable(),
  })
  .strict();

export const publicModelVersionDetailSchema = publicModelVersionSchema.extend({
  family: publicModelDetailSchema.pick({
    publicId: true,
    name: true,
    summary: true,
    officialUrl: true,
    provider: true,
    dataCutoff: true,
    relatedEntities: true,
    timeline: true,
  }),
});

export const modelListRequestSchema = z
  .object({
    locale: localeSchema.default("en"),
    provider: publicIdSchema.optional(),
    modality: modelModalitySchema.optional(),
    access: modelAccessMethodSchema.optional(),
    region: z.string().trim().min(1).optional(),
  })
  .strict();

export const modelRecommendationRequestSchema = z
  .object({
    locale: localeSchema,
    task: z.string().trim().min(1),
    benchmarkPublicId: publicIdSchema,
    benchmarkVersion: z.string().trim().min(1),
    scoreUnit: z.string().trim().min(1),
    qualityThreshold: signedDecimalSchema,
    qualityDirection: z.enum(["at_least", "at_most"]),
    priceCategory: priceCategorySchema,
    priceUnit: priceUnitSchema,
    currency: z.string().regex(/^[A-Z]{3}$/),
    region: z.string().trim().min(1),
    maximumUnitPrice: decimalSchema,
    deployment: modelAccessMethodSchema,
    requireOpenWeights: z.boolean(),
    maximumLatencyMs: z.number().int().positive().optional(),
    latencyBenchmarkPublicId: publicIdSchema.optional(),
    latencyBenchmarkVersion: z.string().trim().min(1).optional(),
    versionPublicIds: z.array(publicIdSchema).min(1).max(4).optional(),
  })
  .strict()
  .refine(
    ({
      maximumLatencyMs,
      latencyBenchmarkPublicId,
      latencyBenchmarkVersion,
    }) =>
      maximumLatencyMs === undefined
        ? latencyBenchmarkPublicId === undefined &&
          latencyBenchmarkVersion === undefined
        : latencyBenchmarkPublicId !== undefined &&
          latencyBenchmarkVersion !== undefined,
    {
      path: ["maximumLatencyMs"],
      message:
        "latency benchmark identity is required exactly when a latency limit is selected",
    },
  );

export const modelRecommendationQuerySchema = z
  .object({
    locale: localeSchema.default("en"),
    task: z.string().trim().min(1),
    benchmarkPublicId: publicIdSchema,
    benchmarkVersion: z.string().trim().min(1),
    scoreUnit: z.string().trim().min(1),
    qualityThreshold: signedDecimalSchema,
    qualityDirection: z.enum(["at_least", "at_most"]),
    priceCategory: priceCategorySchema,
    priceUnit: priceUnitSchema,
    currency: z.string().regex(/^[A-Z]{3}$/),
    region: z.string().trim().min(1),
    maximumUnitPrice: decimalSchema,
    deployment: modelAccessMethodSchema,
    requireOpenWeights: z
      .enum(["true", "false"])
      .transform((value) => (value === "true" ? true : false)),
    maximumLatencyMs: z.coerce.number().int().positive().optional(),
    latencyBenchmarkPublicId: publicIdSchema.optional(),
    latencyBenchmarkVersion: z.string().trim().min(1).optional(),
    versions: z
      .string()
      .transform((value) => value.split(","))
      .pipe(z.array(publicIdSchema).min(1).max(4))
      .optional(),
  })
  .strict()
  .transform(({ versions, ...input }) => ({
    ...input,
    ...(versions ? { versionPublicIds: versions } : {}),
  }))
  .pipe(modelRecommendationRequestSchema);

export const modelRecommendationReasonCodeSchema = z.enum([
  "quality_threshold_met",
  "budget_met",
  "latency_met",
  "deployment_met",
  "region_met",
  "open_weights_met",
  "configuration_evidence_missing",
  "lifecycle_not_active",
  "deployment_not_supported",
  "open_weights_required",
  "region_unavailable",
  "quality_evidence_missing",
  "quality_threshold_not_met",
  "current_price_missing",
  "budget_exceeded",
  "latency_evidence_missing",
  "latency_exceeded",
  "price_unit_incompatible",
  "quality_direction_incompatible",
  "benchmark_conditions_incompatible",
  "price_conditions_incompatible",
  "ambiguous_current_price",
  "deployment_cost_basis_missing",
]);

const modelRecommendationReasonSchema = z
  .object({
    code: modelRecommendationReasonCodeSchema,
    message: z.string().min(1),
  })
  .strict();

export const publicModelRecommendationSchema = z
  .object({
    locale: localeSchema,
    status: z.enum(["available", "not_comparable", "insufficient_evidence"]),
    methodology: z
      .object({
        publicId: z.literal("model-configuration-fit"),
        version: z.literal("1.0.0"),
        question: z.string().min(1),
        eligibility: z.array(z.string().min(1)).min(1),
        limitations: z.array(z.string().min(1)).min(1),
      })
      .strict(),
    constraints: modelRecommendationRequestSchema,
    dataCutoff: timestampSchema.nullable(),
    candidates: z.array(
      z
        .object({
          familyPublicId: publicIdSchema,
          familyName: z.string().min(1),
          familySummary: z.string().min(1),
          versionPublicId: publicIdSchema,
          versionLabel: z.string().min(1),
          provider: z
            .object({ publicId: publicIdSchema, name: z.string().min(1) })
            .strict()
            .nullable(),
          outcome: z.enum([
            "fit",
            "not_fit",
            "not_comparable",
            "insufficient_evidence",
          ]),
          rank: z.number().int().positive().nullable(),
          fitReasons: z.array(modelRecommendationReasonSchema),
          nonFitReasons: z.array(modelRecommendationReasonSchema),
          priceEvidence: publicPriceRecordSchema.nullable(),
          qualityEvidence: publicBenchmarkRunSchema.nullable(),
          latencyEvidence: publicBenchmarkRunSchema.nullable(),
        })
        .strict(),
    ),
  })
  .strict();

export const modelErrorResponseSchema = z
  .object({
    error: z.enum([
      "unauthorized",
      "invalid_json",
      "invalid_locale",
      "invalid_reference",
      "not_found",
      "already_exists",
    ]),
  })
  .strict();

export const invalidModelRequestResponseSchema = z
  .object({
    error: z.literal("invalid_request"),
    issues: z.array(z.unknown()),
  })
  .strict();

export type ModelVersionProfileCreateRequest = z.infer<
  typeof modelVersionProfileCreateRequestSchema
>;
export type ModelListRequest = z.infer<typeof modelListRequestSchema>;
export type PublicModelDetail = z.infer<typeof publicModelDetailSchema>;
export type ModelRecommendationRequest = z.infer<
  typeof modelRecommendationRequestSchema
>;
export type PublicModelRecommendation = z.infer<
  typeof publicModelRecommendationSchema
>;
