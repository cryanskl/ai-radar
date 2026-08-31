import { z } from "zod";
import { localeSchema, publicRightsStatusSchema } from "@/events/contracts";
import { publicEvidenceSchema } from "@/entities/contracts";

const publicIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const timestampSchema = z.iso.datetime({ offset: true });
const urlSchema = z.url().regex(/^https?:\/\//);
const arxivIdSchema = z.string().regex(/^\d{4}\.\d{4,5}$/);
const arxivVersionSchema = z.string().regex(/^v[1-9]\d*$/);
const authorSchema = z
  .object({
    name: z.string().trim().min(1),
    institutions: z.array(z.string().trim().min(1)),
  })
  .strict();

const guidanceSchema = z
  .object({
    locale: localeSchema,
    claimedContributions: z.array(z.string().trim().min(1)).min(1),
    limitations: z.array(z.string().trim().min(1)).min(1),
    inference: z.array(z.string().trim().min(1)).min(1),
    authorship: z.enum([
      "human_authored",
      "ai_translated",
      "official_translation",
    ]),
    reviewStatus: z.enum(["draft", "reviewed"]),
  })
  .strict();

const resourceLinkSchema = z
  .object({
    publicId: publicIdSchema,
    kind: z.enum(["code", "dataset", "product"]),
    label: z.string().trim().min(1),
    url: urlSchema,
    evidenceSourceItemPublicId: publicIdSchema,
  })
  .strict();

export const paperRevisionProfileCreateRequestSchema = z
  .object({
    familyPublicId: publicIdSchema,
    versionPublicId: publicIdSchema,
    sourceItemPublicId: publicIdSchema,
    arxivId: arxivIdSchema,
    arxivVersion: arxivVersionSchema,
    title: z.string().trim().min(1),
    authors: z.array(authorSchema).min(1),
    topics: z.array(z.string().trim().min(1)),
    fullTextRightsStatus: publicRightsStatusSchema,
    fullTextLicenseUrl: urlSchema.nullable(),
    guidance: z
      .array(guidanceSchema)
      .length(2)
      .refine(
        (items) => new Set(items.map(({ locale }) => locale)).size === 2,
        { message: "English and Chinese guidance are required" },
      ),
    resourceLinks: z.array(resourceLinkSchema),
  })
  .strict()
  .refine(
    ({ fullTextRightsStatus, fullTextLicenseUrl }) =>
      ["open", "attribution_required", "source_license"].includes(
        fullTextRightsStatus,
      )
        ? fullTextLicenseUrl !== null
        : true,
    {
      path: ["fullTextLicenseUrl"],
      message: "Reusable full text requires a per-Paper license URL",
    },
  );

export const paperRevisionProfileCreateResponseSchema = z
  .object({
    familyPublicId: publicIdSchema,
    versionPublicId: publicIdSchema,
    arxivId: arxivIdSchema,
    arxivVersion: arxivVersionSchema,
    publicVisibility: z.boolean(),
  })
  .strict();

export const paperListRequestSchema = z
  .object({
    locale: localeSchema.default("en"),
    view: z.enum(["latest", "trending", "featured"]).default("latest"),
    topic: z.string().trim().min(1).optional(),
    author: z.string().trim().min(1).optional(),
    institution: z.string().trim().min(1).optional(),
    publishedFrom: timestampSchema.optional(),
    publishedTo: timestampSchema.optional(),
    hasCode: z.enum(["true", "false"]).optional(),
    relatedModelPublicId: publicIdSchema.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().min(1).max(2048).optional(),
  })
  .strict()
  .refine(
    ({ publishedFrom, publishedTo }) =>
      !publishedFrom ||
      !publishedTo ||
      Date.parse(publishedFrom) <= Date.parse(publishedTo),
    {
      path: ["publishedTo"],
      message: "Published-to must not precede published-from",
    },
  );

const paperGuidancePublicSchema = guidanceSchema
  .omit({ locale: true, reviewStatus: true })
  .extend({ reviewStatus: z.literal("reviewed") })
  .strict();

const publicPaperRevisionSchema = z
  .object({
    versionPublicId: publicIdSchema,
    versionLabel: z.string().min(1),
    releasedAt: timestampSchema,
    arxivVersion: arxivVersionSchema,
    title: z.string().min(1),
    abstractUrl: urlSchema,
    authors: z.array(authorSchema).min(1),
    topics: z.array(z.string().min(1)),
    fullTextRightsStatus: publicRightsStatusSchema,
    fullTextLicenseUrl: urlSchema.nullable(),
    guidance: paperGuidancePublicSchema,
    resourceLinks: z.array(resourceLinkSchema),
    lastVerifiedAt: timestampSchema,
  })
  .strict();

export const publicPaperDetailSchema = z
  .object({
    publicId: publicIdSchema,
    name: z.string().min(1),
    summary: z.string().min(1),
    arxivId: arxivIdSchema,
    metadataRights: z
      .object({ status: publicRightsStatusSchema, licenseUrl: urlSchema })
      .strict(),
    pdfPackaged: z.literal(false),
    dataCutoff: timestampSchema,
    revisions: z.array(publicPaperRevisionSchema).min(1),
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
          evidence: z.array(publicEvidenceSchema).min(1),
        })
        .strict(),
    ),
    relatedEvents: z.array(
      z
        .object({
          relationPublicId: publicIdSchema,
          eventPublicId: publicIdSchema,
          title: z.string().min(1),
          occurredAt: timestampSchema,
          predicate: z.string().min(1),
          confidence: z.number().int().min(0).max(100),
          lastVerifiedAt: timestampSchema,
          evidence: z.array(publicEvidenceSchema).min(1),
        })
        .strict(),
    ),
  })
  .strict();

export const publicPaperListItemSchema = z
  .object({
    publicId: publicIdSchema,
    name: z.string().min(1),
    summary: z.string().min(1),
    latestRevision: publicPaperRevisionSchema.pick({
      versionPublicId: true,
      arxivVersion: true,
      title: true,
      releasedAt: true,
      authors: true,
    }),
  })
  .strict();

export const publicPaperListSchema = z
  .object({
    locale: localeSchema,
    view: z.enum(["latest", "trending", "featured"]),
    rankingState: z.enum(["available", "insufficient_evidence"]),
    methodology: z
      .object({
        publicId: z.literal("paper-discovery"),
        version: z.literal("1.0.0"),
        kind: z.enum(["chronological", "attention", "editorial"]),
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
    items: z.array(publicPaperListItemSchema),
  })
  .strict();

export const paperErrorResponseSchema = z
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

export const invalidPaperRequestResponseSchema = z
  .object({
    error: z.literal("invalid_request"),
    issues: z.array(z.unknown()),
  })
  .strict();

export const paperListCursorSchema = z
  .object({
    version: z.literal(1),
    requestKey: z.string().min(1),
    dataCutoff: timestampSchema,
    snapshotId: z.uuid(),
    offset: z.number().int().positive(),
  })
  .strict();

export type PaperRevisionProfileCreateRequest = z.infer<
  typeof paperRevisionProfileCreateRequestSchema
>;
export type PaperListRequest = z.infer<typeof paperListRequestSchema>;
export type PaperListCursor = z.infer<typeof paperListCursorSchema>;
export type PublicPaperDetail = z.infer<typeof publicPaperDetailSchema>;
export type PublicPaperListItem = z.infer<typeof publicPaperListItemSchema>;
