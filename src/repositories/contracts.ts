import { z } from "zod";
import { localeSchema } from "@/events/contracts";

const publicIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const timestampSchema = z.iso.datetime({ offset: true });
const urlSchema = z.url().regex(/^https:\/\//);

export const repositoryObservationCreateRequestSchema = z
  .object({
    familyPublicId: publicIdSchema,
    sourceItemPublicId: publicIdSchema,
  })
  .strict();

export const repositoryObservationCreateResponseSchema = z
  .object({
    familyPublicId: publicIdSchema,
    githubRepositoryId: z.number().int().positive(),
    observedAt: timestampSchema,
    publicVisibility: z.boolean(),
  })
  .strict();

export const repositoryListRequestSchema = z
  .object({
    locale: localeSchema.default("en"),
    view: z
      .enum(["new", "rising", "recently_released", "featured"])
      .default("new"),
    topic: z.string().trim().min(1).optional(),
    language: z.string().trim().min(1).optional(),
    license: z.enum(["detected", "missing"]).optional(),
    lifecycle: z
      .enum(["active", "archived", "mirrored", "unavailable"])
      .optional(),
    createdAfter: timestampSchema.optional(),
    updatedAfter: timestampSchema.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().min(1).max(4096).optional(),
  })
  .strict();

const repositoryLicenseSchema = z
  .object({
    status: z.enum(["detected", "missing"]),
    spdxId: z.string().min(1).nullable(),
    name: z.string().min(1).nullable(),
    reuseNotice: z.enum([
      "declared_license_review_terms",
      "no_license_do_not_assume_reuse",
    ]),
  })
  .strict();

const repositoryReleaseSchema = z
  .object({
    githubReleaseId: z.number().int().positive(),
    tagName: z.string().min(1),
    name: z.string().min(1).nullable(),
    url: urlSchema,
    prerelease: z.boolean(),
    createdAt: timestampSchema,
    publishedAt: timestampSchema.nullable(),
  })
  .strict();

const repositoryMetricsSchema = z
  .object({
    sourceItemPublicId: publicIdSchema,
    observedAt: timestampSchema,
    stars: z.number().int().nonnegative(),
    forks: z.number().int().nonnegative(),
    openIssues: z.number().int().nonnegative(),
    subscribers: z.number().int().nonnegative(),
  })
  .strict();

const repositoryReferenceSchema = z
  .object({
    githubRepositoryId: z.number().int().positive(),
    fullName: z.string().regex(/^[^/]+\/[^/]+$/),
    url: urlSchema,
  })
  .strict();

export const publicRepositoryListItemSchema = z
  .object({
    publicId: publicIdSchema,
    name: z.string().min(1),
    summary: z.string().min(1),
    ownerLogin: z.string().min(1),
    repositoryName: z.string().min(1),
    fullName: z.string().min(1),
    officialUrl: urlSchema,
    description: z.string().nullable(),
    topics: z.array(z.string().min(1)),
    languages: z.array(
      z
        .object({
          name: z.string().min(1),
          bytes: z.number().int().nonnegative(),
        })
        .strict(),
    ),
    license: repositoryLicenseSchema,
    lifecycleState: z.enum(["active", "archived", "mirrored", "unavailable"]),
    fork: z.boolean(),
    mirrorUrl: urlSchema.nullable(),
    template: z.boolean(),
    parentRepository: repositoryReferenceSchema.nullable(),
    sourceRepository: repositoryReferenceSchema.nullable(),
    templateRepository: repositoryReferenceSchema.nullable(),
    repositoryCreatedAt: timestampSchema,
    repositoryUpdatedAt: timestampSchema,
    pushedAt: timestampSchema.nullable(),
    latestMetrics: repositoryMetricsSchema,
    latestRelease: repositoryReleaseSchema.nullable(),
    rising: z
      .object({
        score: z.number().min(0).max(100),
        cohort: z.enum(["new", "established", "mature"]),
        starDelta: z.number().int(),
        forkDelta: z.number().int(),
        windowStart: timestampSchema,
        windowEnd: timestampSchema,
      })
      .strict()
      .nullable(),
  })
  .strict();

export const publicRepositoryListSchema = z
  .object({
    locale: localeSchema,
    view: z.enum(["new", "rising", "recently_released", "featured"]),
    rankingState: z.enum(["available", "insufficient_evidence"]),
    methodology: z
      .object({
        publicId: z.enum([
          "github-new",
          "github-rising",
          "github-recently-released",
          "github-featured",
        ]),
        version: z.literal("1.0.0"),
        kind: z.enum([
          "chronological_creation",
          "source_normalized_growth",
          "chronological_release",
          "editorial",
        ]),
        windowDays: z.literal(7).nullable(),
        limitation: z.string().min(1),
      })
      .strict(),
    dataCutoff: timestampSchema.nullable(),
    resultSet: z
      .object({
        capturedCount: z.number().int().nonnegative(),
        limit: z.literal(1000),
        truncated: z.boolean(),
      })
      .strict(),
    emptyState: z
      .enum(["no_matches", "insufficient_evidence", "no_editorial_selections"])
      .nullable(),
    nextCursor: z.string().nullable(),
    items: z.array(publicRepositoryListItemSchema),
  })
  .strict();

export const publicRepositoryDetailSchema = z
  .object({
    publicId: publicIdSchema,
    name: z.string().min(1),
    summary: z.string().min(1),
    githubRepositoryId: z.number().int().positive(),
    ownerLogin: z.string().min(1),
    repositoryName: z.string().min(1),
    fullName: z.string().min(1),
    officialUrl: urlSchema,
    description: z.string().nullable(),
    topics: z.array(z.string().min(1)),
    languages: z.array(
      z
        .object({
          name: z.string().min(1),
          bytes: z.number().int().nonnegative(),
        })
        .strict(),
    ),
    license: repositoryLicenseSchema,
    lifecycleState: z.enum(["active", "archived", "mirrored", "unavailable"]),
    fork: z.boolean(),
    mirrorUrl: urlSchema.nullable(),
    template: z.boolean(),
    parentRepository: repositoryReferenceSchema.nullable(),
    sourceRepository: repositoryReferenceSchema.nullable(),
    templateRepository: repositoryReferenceSchema.nullable(),
    repositoryCreatedAt: timestampSchema,
    repositoryUpdatedAt: timestampSchema,
    pushedAt: timestampSchema.nullable(),
    dataCutoff: timestampSchema,
    observations: z.array(repositoryMetricsSchema).min(1),
    releases: z.array(repositoryReleaseSchema),
    relatedEntities: z.array(
      z
        .object({
          relationPublicId: publicIdSchema,
          publicId: publicIdSchema,
          name: z.string().min(1),
          type: z.string().min(1),
          predicate: z.string().min(1),
          direction: z.enum(["outgoing", "incoming"]),
          confidence: z.number().int().min(0).max(100),
          firstVerifiedAt: timestampSchema,
          lastVerifiedAt: timestampSchema,
          evidence: z
            .array(
              z
                .object({
                  sourceItemPublicId: publicIdSchema,
                  originalTitle: z.string().min(1),
                  originalUrl: urlSchema,
                })
                .strict(),
            )
            .min(1),
        })
        .strict(),
    ),
  })
  .strict();

export const repositoryListCursorSchema = z
  .object({
    version: z.literal(1),
    requestKey: z.string().min(1),
    dataCutoff: timestampSchema,
    snapshotId: z.uuid(),
    offset: z.number().int().positive(),
  })
  .strict();

export const repositoryErrorResponseSchema = z
  .object({
    error: z.enum([
      "unauthorized",
      "invalid_json",
      "invalid_reference",
      "already_exists",
      "not_found",
      "invalid_locale",
    ]),
  })
  .strict();

export const invalidRepositoryRequestResponseSchema = z
  .object({ error: z.literal("invalid_request"), issues: z.array(z.unknown()) })
  .strict();

export type RepositoryObservationCreateRequest = z.infer<
  typeof repositoryObservationCreateRequestSchema
>;
export type RepositoryListRequest = z.infer<typeof repositoryListRequestSchema>;
export type RepositoryListCursor = z.infer<typeof repositoryListCursorSchema>;
export type PublicRepositoryListItem = z.infer<
  typeof publicRepositoryListItemSchema
>;
export type PublicRepositoryDetail = z.infer<
  typeof publicRepositoryDetailSchema
>;
