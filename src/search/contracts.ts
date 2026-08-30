import { z } from "zod";
import { entityTypeSchema } from "@/entities/contracts";
import { localeSchema } from "@/events/contracts";

export const searchMatchReasonSchema = z.enum([
  "public_id",
  "canonical_url",
  "external_id",
  "official_name",
  "alias",
  "full_text",
  "trigram",
  "snapshot_member",
]);

export const searchTypeSchema = z.enum([
  "all",
  "event",
  ...entityTypeSchema.options,
]);
export const signalLanguageSchema = z.enum(["all", "en", "zh"]);
export const searchSortSchema = z.enum(["relevance", "latest", "trending"]);
const publicIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const optionalTimestampSchema = z
  .union([z.iso.datetime({ offset: true }), z.literal("")])
  .transform((value) => value || undefined)
  .optional();

export const searchRequestSchema = z
  .object({
    q: z.string().trim().min(1).max(200),
    locale: localeSchema.default("en"),
    type: searchTypeSchema.default("all"),
    from: optionalTimestampSchema,
    to: optionalTimestampSchema,
    topic: z.union([publicIdSchema, z.literal("")]).optional(),
    organization: z.union([publicIdSchema, z.literal("")]).optional(),
    signalLanguage: signalLanguageSchema.default("all"),
    sort: searchSortSchema.default("relevance"),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().min(1).optional(),
  })
  .refine(({ from, to }) => !from || !to || new Date(from) <= new Date(to), {
    path: ["to"],
    message: "to must not be before from",
  });

export const searchResultSchema = z.object({
  kind: z.enum(["event", "entity"]),
  entityType: entityTypeSchema.nullable(),
  publicId: z.string().min(1),
  status: z.enum([
    "public",
    "merged_into",
    "withdrawn",
    "source_withdrawn",
    "under_review",
  ]),
  name: z.string().min(1),
  summary: z.string(),
  locale: localeSchema,
  matchedLocale: localeSchema,
  matchReason: searchMatchReasonSchema,
  matchedText: z.string().min(1),
  occurredAt: z.iso.datetime().nullable(),
  lastVerifiedAt: z.iso.datetime(),
  source: z
    .object({
      name: z.string().min(1),
      url: z.url(),
    })
    .nullable(),
  signalLanguages: z.array(localeSchema),
  replacementPublicId: z.string().min(1).nullable(),
});

export const searchResponseSchema = z.object({
  query: z.string().min(1),
  locale: localeSchema,
  sort: searchSortSchema,
  rankingState: z.enum(["available", "insufficient_evidence"]),
  items: z.array(searchResultSchema),
  resultSet: z.object({
    capturedCount: z.number().int().nonnegative(),
    limit: z.literal(1000),
    truncated: z.boolean(),
  }),
  nextCursor: z.string().nullable(),
  dataCutoff: z.iso.datetime(),
});

export const searchErrorResponseSchema = z.object({
  error: z.literal("invalid_search_request"),
  issues: z.array(
    z.object({
      path: z.string(),
      message: z.string(),
    }),
  ),
});

export type SearchRequest = z.infer<typeof searchRequestSchema>;
export type SearchResult = z.infer<typeof searchResultSchema>;

export const searchSnapshotIdentitySchema = searchResultSchema.pick({
  kind: true,
  publicId: true,
  matchedLocale: true,
  matchReason: true,
});
export type SearchSnapshotIdentity = z.infer<
  typeof searchSnapshotIdentitySchema
>;

export const searchCursorSchema = z
  .object({
    version: z.literal(1),
    requestKey: z.string().min(1),
    dataCutoff: z.iso.datetime(),
    snapshotId: z.uuid(),
    offset: z.number().int().positive(),
  })
  .strict();

export type SearchCursor = z.infer<typeof searchCursorSchema>;
