import { z } from "zod";
import {
  publicEventListSchema,
  publicRightsStatusSchema,
} from "@/events/contracts";
import { searchResponseSchema } from "@/search/contracts";
import { publicRankingListSchema } from "@/rankings/contracts";
import { publicCorrectionSchema } from "@/operations/contracts";
import { entityTypeSchema, relationTypeSchema } from "@/entities/contracts";

const publicIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const timestampSchema = z.iso.datetime({ offset: true });
const urlSchema = z.url().regex(/^https?:\/\//);

export const publicApiDataVersionSchema = z
  .string()
  .regex(/^public-[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const publicApiPaginationRequestSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().min(1).max(2_000).optional(),
  })
  .strict();

const collectionMetadata = {
  dataVersion: publicApiDataVersionSchema,
  nextCursor: z.string().nullable(),
};

export const versionedPublicEventListSchema =
  publicEventListSchema.extend(collectionMetadata);
export const versionedSearchResponseSchema = searchResponseSchema.extend({
  dataVersion: publicApiDataVersionSchema,
});
export const versionedPublicRankingListSchema =
  publicRankingListSchema.extend(collectionMetadata);

export const publicEntitySummarySchema = z
  .object({
    publicId: publicIdSchema,
    type: entityTypeSchema,
    name: z.string().min(1),
    summary: z.string(),
    officialUrl: urlSchema,
    rightsStatus: publicRightsStatusSchema,
    lastVerifiedAt: timestampSchema,
  })
  .strict();

export const publicRelationSchema = z
  .object({
    publicId: publicIdSchema,
    predicate: relationTypeSchema,
    direction: z.literal("subject_to_object"),
    subject: z
      .object({
        type: z.enum(["event", "entity"]),
        publicId: publicIdSchema,
        name: z.string().min(1),
      })
      .strict(),
    object: z
      .object({
        type: z.literal("entity"),
        publicId: publicIdSchema,
        name: z.string().min(1),
      })
      .strict(),
    rightsStatus: publicRightsStatusSchema,
    validFrom: timestampSchema.nullable(),
    validTo: timestampSchema.nullable(),
    firstVerifiedAt: timestampSchema,
    lastVerifiedAt: timestampSchema,
    confidence: z.number().int().min(0).max(100),
    reviewStatus: z.literal("reviewed"),
    evidence: z
      .array(
        z
          .object({
            sourceItemPublicId: publicIdSchema,
            sourceName: z.string().min(1),
            sourceUrl: urlSchema,
            rightsStatus: publicRightsStatusSchema,
            attribution: z.string().min(1),
            licenseUrl: urlSchema.nullable(),
            rightsCheckedAt: timestampSchema,
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export const publicTombstoneSchema = z
  .object({
    publicId: publicIdSchema,
    objectType: z.enum(["event", "entity"]),
    status: z.enum([
      "merged_into",
      "withdrawn",
      "source_withdrawn",
      "reviewing",
    ]),
    reasonCode: z.enum([
      "duplicate_coverage",
      "duplicate_identity",
      "rights_withdrawal",
      "source_withdrawal",
      "high_risk_review",
    ]),
    effectiveAt: timestampSchema,
    replacementPublicId: publicIdSchema.nullable(),
    caseReferencePublicId: publicIdSchema.nullable(),
  })
  .strict();

export const publicReleaseSchema = z
  .object({
    publicId: publicIdSchema,
    dataVersion: publicApiDataVersionSchema,
    dataCutoff: timestampSchema,
    publishedAt: timestampSchema,
    canonicalUrl: urlSchema,
    checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
    license: z.string().min(1),
    attribution: z.string().min(1),
    lastVerifiedAt: timestampSchema,
  })
  .strict();

const collectionSchema = <T extends z.ZodType>(item: T) =>
  z
    .object({
      ...collectionMetadata,
      items: z.array(item),
    })
    .strict();

export const publicEntityListSchema = collectionSchema(
  publicEntitySummarySchema,
);
export const publicRelationListSchema = collectionSchema(publicRelationSchema);
export const publicCorrectionListSchema = collectionSchema(
  publicCorrectionSchema,
);
export const publicTombstoneListSchema = collectionSchema(
  publicTombstoneSchema,
);
export const publicReleaseListSchema = collectionSchema(publicReleaseSchema);

export const publicApiErrorResponseSchema = z
  .object({
    error: z.enum([
      "invalid_request",
      "invalid_cursor",
      "not_found",
      "rate_limit_exceeded",
    ]),
    message: z.string().min(1),
  })
  .strict();
