import { z } from "zod";

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
  })
  .strict();

export const publicEventListSchema = z
  .object({
    items: z.array(publicEventSchema),
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
