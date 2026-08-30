import { z } from "zod";
import {
  localeSchema,
  publicRightsStatusSchema,
  rightsStatusSchema,
} from "@/events/contracts";
import {
  publicCorrectionSchema,
  publicEntityMergedTombstoneSchema,
  publicReviewingTombstoneSchema,
  publicWithdrawnTombstoneSchema,
} from "@/operations/contracts";

export const entityTypeSchema = z.enum([
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
]);
export const relationTypeSchema = z.enum([
  "INTRODUCES",
  "IMPLEMENTS",
  "USES",
  "EVALUATES",
  "WORKS_WITH",
  "SUPPORTS",
  "EXPLAINS",
  "ANNOUNCES",
  "UPDATES",
  "CHANGES_PRICE_OF",
  "DEPRECATES",
  "DEVELOPS",
  "AFFILIATED_WITH",
  "TAGGED_WITH",
]);
const publicIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const timestampSchema = z.iso.datetime({ offset: true });
const httpUrlSchema = z.url().regex(/^https?:\/\//);
const localizationSchema = z
  .object({
    locale: localeSchema,
    name: z.string().trim().min(1),
    summary: z.string().trim().min(1),
    authorship: z.enum([
      "human_authored",
      "ai_translated",
      "official_translation",
    ]),
    reviewStatus: z.enum(["draft", "reviewed"]),
  })
  .strict();

export const entityCreateRequestSchema = z
  .object({
    entity: z
      .object({
        publicId: publicIdSchema,
        type: entityTypeSchema,
        officialName: z.string().trim().min(1),
        officialUrl: httpUrlSchema,
        lastVerifiedAt: timestampSchema,
        rightsStatus: rightsStatusSchema,
      })
      .strict(),
    localizations: z
      .array(localizationSchema)
      .length(2)
      .refine(
        (localizations) =>
          new Set(localizations.map(({ locale }) => locale)).size === 2,
        { message: "English and Chinese localizations are required" },
      ),
    aliases: z.array(
      z
        .object({
          publicId: publicIdSchema,
          locale: localeSchema,
          kind: z.enum(["official", "localized", "historical"]),
          value: z.string().trim().min(1),
        })
        .strict(),
    ),
    versions: z.array(
      z
        .object({
          publicId: publicIdSchema,
          versionLabel: z.string().trim().min(1),
          releasedAt: timestampSchema.nullable(),
          releasedAtPrecision: z.enum(["day", "minute", "second"]).nullable(),
        })
        .strict()
        .refine(
          ({ releasedAt, releasedAtPrecision }) =>
            (releasedAt === null) === (releasedAtPrecision === null),
          { message: "Release time and precision must be provided together" },
        ),
    ),
  })
  .strict();

export const entityCreateResponseSchema = z
  .object({
    publicId: publicIdSchema,
    type: entityTypeSchema,
    publicVisibility: z.boolean(),
    locales: z.array(localeSchema),
    aliasPublicIds: z.array(publicIdSchema),
    versionPublicIds: z.array(publicIdSchema),
  })
  .strict();

export const relationCreateRequestSchema = z
  .object({
    relation: z
      .object({
        publicId: publicIdSchema,
        subject: z.discriminatedUnion("type", [
          z
            .object({ type: z.literal("entity"), publicId: publicIdSchema })
            .strict(),
          z
            .object({ type: z.literal("event"), publicId: publicIdSchema })
            .strict(),
        ]),
        predicate: relationTypeSchema,
        objectEntityPublicId: publicIdSchema,
        validFrom: timestampSchema.nullable(),
        validTo: timestampSchema.nullable(),
        firstVerifiedAt: timestampSchema,
        lastVerifiedAt: timestampSchema,
        confidence: z.number().int().min(0).max(100),
        reviewStatus: z.enum(["draft", "reviewed"]),
        creationMethod: z.enum(["automatic", "editor", "submission"]),
        rightsStatus: rightsStatusSchema,
      })
      .strict()
      .refine(
        ({ validFrom, validTo }) =>
          validFrom === null ||
          validTo === null ||
          new Date(validTo) >= new Date(validFrom),
        { message: "Relation validity must not end before it starts" },
      )
      .refine(
        ({ firstVerifiedAt, lastVerifiedAt }) =>
          new Date(lastVerifiedAt) >= new Date(firstVerifiedAt),
        { message: "Relation verification must move forward in time" },
      ),
    evidenceSourceItemPublicIds: z.array(publicIdSchema).min(1),
  })
  .strict();

export const relationCreateResponseSchema = z
  .object({
    publicId: publicIdSchema,
    publicVisibility: z.boolean(),
    evidenceSourceItemPublicIds: z.array(publicIdSchema).min(1),
  })
  .strict();

const publicEndpointSchema = z
  .object({
    type: z.enum(["entity", "event"]),
    publicId: publicIdSchema,
    name: z.string().min(1),
  })
  .strict();
const publicEvidenceSchema = z
  .object({
    sourceItemPublicId: publicIdSchema,
    originalTitle: z.string().min(1),
    originalUrl: httpUrlSchema,
  })
  .strict();
const publicRelationSchema = z
  .object({
    publicId: publicIdSchema,
    predicate: relationTypeSchema,
    direction: z.enum(["outgoing", "incoming"]),
    subject: publicEndpointSchema,
    object: publicEndpointSchema,
    validFrom: timestampSchema.nullable(),
    validTo: timestampSchema.nullable(),
    firstVerifiedAt: timestampSchema,
    lastVerifiedAt: timestampSchema,
    confidence: z.number().int().min(0).max(100),
    reviewStatus: z.literal("reviewed"),
    evidence: z.array(publicEvidenceSchema).min(1),
  })
  .strict();

export const publicEntitySchema = z
  .object({
    publicId: publicIdSchema,
    type: entityTypeSchema,
    officialName: z.string().min(1),
    officialUrl: httpUrlSchema,
    lifecycleStatus: z.literal("active"),
    lastVerifiedAt: timestampSchema,
    rightsStatus: publicRightsStatusSchema,
    localization: localizationSchema.extend({
      reviewStatus: z.literal("reviewed"),
    }),
    aliases: z.array(
      z
        .object({
          publicId: publicIdSchema,
          locale: localeSchema,
          kind: z.enum(["official", "localized", "historical"]),
          value: z.string().min(1),
        })
        .strict(),
    ),
    versions: z.array(
      z
        .object({
          publicId: publicIdSchema,
          versionLabel: z.string().min(1),
          releasedAt: timestampSchema.nullable(),
          releasedAtPrecision: z.enum(["day", "minute", "second"]).nullable(),
          lastVerifiedAt: timestampSchema,
        })
        .strict(),
    ),
    outgoingRelations: z.array(publicRelationSchema),
    backlinks: z.array(publicRelationSchema),
    timeline: z.array(
      z
        .object({
          eventPublicId: publicIdSchema,
          occurredAt: timestampSchema,
          occurredAtPrecision: z.enum(["day", "minute", "second"]),
          relationPublicId: publicIdSchema,
          predicate: relationTypeSchema,
          title: z.string().min(1),
        })
        .strict(),
    ),
    graph: z
      .object({
        nodes: z
          .array(
            z
              .object({
                nodeId: z.string().min(1),
                type: z.enum(["entity", "event"]),
                publicId: publicIdSchema,
                label: z.string().min(1),
              })
              .strict(),
          )
          .max(20),
        edges: z
          .array(
            z
              .object({
                relationPublicId: publicIdSchema,
                fromNodeId: z.string().min(1),
                toNodeId: z.string().min(1),
                predicate: relationTypeSchema,
              })
              .strict(),
          )
          .max(19),
        truncated: z.boolean(),
      })
      .strict(),
    corrections: z.array(publicCorrectionSchema),
  })
  .strict();

export const publicEntityResponseSchema = z.union([
  publicEntitySchema,
  publicEntityMergedTombstoneSchema,
  publicReviewingTombstoneSchema.extend({ objectType: z.literal("entity") }),
  publicWithdrawnTombstoneSchema.extend({ objectType: z.literal("entity") }),
]);

export const aliasResolutionResponseSchema = z
  .object({
    publicId: publicIdSchema,
    type: entityTypeSchema,
    matchedAlias: z.string().min(1),
    aliasKind: z.enum(["official", "localized", "historical"]),
  })
  .strict();

export const publicEntityVersionSchema = z
  .object({
    publicId: publicIdSchema,
    entityPublicId: publicIdSchema,
    entityName: z.string().min(1),
    versionLabel: z.string().min(1),
    releasedAt: timestampSchema.nullable(),
    releasedAtPrecision: z.enum(["day", "minute", "second"]).nullable(),
    lastVerifiedAt: timestampSchema,
  })
  .strict();

export const entityErrorResponseSchema = z
  .object({
    error: z.enum([
      "unauthorized",
      "invalid_json",
      "invalid_locale",
      "invalid_entity_type",
      "invalid_relation_type",
      "invalid_relation",
      "ambiguous_alias",
      "not_found",
      "already_exists",
    ]),
  })
  .strict();

export const invalidEntityRequestResponseSchema = z
  .object({
    error: z.literal("invalid_request"),
    issues: z.array(z.unknown()),
  })
  .strict();

export type EntityCreateRequest = z.infer<typeof entityCreateRequestSchema>;
export type RelationCreateRequest = z.infer<typeof relationCreateRequestSchema>;
