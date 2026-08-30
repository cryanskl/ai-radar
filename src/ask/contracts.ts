import { z } from "zod";
import { localeSchema } from "@/events/contracts";

const publicIdSchema = z
  .string()
  .max(200)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const timestampSchema = z.iso.datetime({ offset: true });

export const askRequestSchema = z
  .object({
    question: z.string().trim().min(1).max(200),
    locale: localeSchema.default("en"),
  })
  .strict();

const benchmarkComparisonBasisSchema = z
  .object({
    kind: z.literal("benchmark"),
    benchmarkPublicId: publicIdSchema,
    benchmarkVersion: z.string().min(1).max(200),
    task: z.string().min(1).max(200),
    unit: z.string().min(1).max(200),
    settings: z.record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.null()]),
    ),
    evaluatorPublicId: publicIdSchema,
    higherIsBetter: z.boolean(),
  })
  .strict();

const priceComparisonBasisSchema = z
  .object({
    kind: z.literal("price"),
    category: z.string().min(1).max(200),
    currency: z.string().regex(/^[A-Z]{3}$/),
    unit: z.string().min(1).max(200),
    region: z.string().min(1).max(200),
    taxPolicy: z.enum(["inclusive", "exclusive", "unknown"]),
  })
  .strict();

export const askComparisonBasisSchema = z.discriminatedUnion("kind", [
  benchmarkComparisonBasisSchema,
  priceComparisonBasisSchema,
]);

export const askEvidenceItemSchema = z
  .object({
    citationId: z.string().min(1).max(240),
    recordType: z.enum([
      "event",
      "entity",
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
      "price",
      "relation",
    ]),
    publicId: publicIdSchema,
    title: z.string().min(1).max(240),
    summary: z.string().max(1200),
    recordUrl: z.string().startsWith("/").max(500),
    source: z
      .object({
        title: z.string().min(1).max(240),
        url: z.url().max(2048),
      })
      .strict()
      .nullable(),
    lastVerifiedAt: timestampSchema,
    comparisonBasis: askComparisonBasisSchema.nullable(),
  })
  .strict();

export const askCandidateSchema = z
  .object({
    status: z.enum(["answered", "conflict", "abstained"]),
    answer: z.string().min(1).max(6000),
    claims: z
      .array(
        z
          .object({
            text: z.string().min(1).max(2000),
            citationIds: z.array(z.string().min(1)).min(1).max(8),
            comparison: z
              .object({ kind: z.enum(["benchmark", "price"]) })
              .strict()
              .nullable(),
          })
          .strict(),
      )
      .max(6),
  })
  .strict();

export const askStatusSchema = z.enum([
  "answered",
  "conflict",
  "not_comparable",
  "abstained",
]);

export const askReasonSchema = z.enum([
  "answered",
  "conflicting_evidence",
  "incompatible_comparison",
  "citation_validation_failed",
  "insufficient_evidence",
]);

const askCitationSchema = askEvidenceItemSchema.pick({
  citationId: true,
  recordType: true,
  publicId: true,
  title: true,
  recordUrl: true,
  source: true,
  lastVerifiedAt: true,
});

export const askResponseSchema = z
  .object({
    question: z.string().min(1),
    locale: localeSchema,
    status: askStatusSchema,
    reason: askReasonSchema,
    answer: z.string().min(1),
    claims: z.array(
      z
        .object({
          publicId: z.string().regex(/^claim-[1-9]\d*$/),
          text: z.string().min(1),
          citations: z.array(askCitationSchema).min(1).max(8),
        })
        .strict(),
    ),
    generatedAt: timestampSchema,
    dataCutoff: timestampSchema,
    dataVersion: z.string().regex(/^public-[a-f0-9]{16}$/),
    evidencePack: z
      .object({
        count: z.number().int().nonnegative().max(8),
        limit: z.literal(8),
      })
      .strict(),
  })
  .strict();

export const askErrorResponseSchema = z
  .object({
    error: z.literal("invalid_ask_request"),
    issues: z.array(
      z.object({ path: z.string(), message: z.string() }).strict(),
    ),
  })
  .strict();

export type AskRequest = z.infer<typeof askRequestSchema>;
export type AskEvidenceItem = z.infer<typeof askEvidenceItemSchema>;
export type AskCandidate = z.infer<typeof askCandidateSchema>;
export type AskResponse = z.infer<typeof askResponseSchema>;
