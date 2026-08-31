import { z } from "zod";
import {
  entityCreateRequestSchema,
  relationCreateRequestSchema,
} from "@/entities/contracts";
import { eventDraftRequestSchema } from "@/events/contracts";

const publicIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const timestampSchema = z.iso.datetime({ offset: true });
const mainTimelineStart = new Date("2022-11-30T00:00:00.000Z");

const batchSchema = z
  .object({
    publicId: publicIdSchema,
    themeSlug: publicIdSchema,
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    name: z
      .object({ en: z.string().trim().min(1), zh: z.string().trim().min(1) })
      .strict(),
    timelineStart: timestampSchema,
    coverageEnd: timestampSchema,
    prehistoryPolicy: z.literal("curated_prehistory"),
  })
  .strict()
  .refine(
    ({ coverageEnd, timelineStart }) =>
      new Date(coverageEnd) >= new Date(timelineStart),
    { message: "Historical coverage must not end before it starts" },
  );

const candidateBaseSchema = z.object({ publicId: publicIdSchema });

export const historicalBackfillRequestSchema = z
  .object({
    batch: batchSchema,
    candidates: z
      .array(
        z.discriminatedUnion("kind", [
          candidateBaseSchema
            .extend({
              kind: z.literal("entity"),
              input: entityCreateRequestSchema,
            })
            .strict(),
          candidateBaseSchema
            .extend({
              kind: z.literal("event"),
              input: eventDraftRequestSchema,
            })
            .strict(),
          candidateBaseSchema
            .extend({
              kind: z.literal("relation"),
              input: relationCreateRequestSchema,
            })
            .strict(),
          candidateBaseSchema
            .extend({
              kind: z.literal("unresolved"),
              targetPublicId: publicIdSchema,
              reasonCode: z.enum([
                "curated_prehistory",
                "ambiguous_identity",
                "insufficient_evidence",
                "rights_unresolved",
              ]),
            })
            .strict(),
        ]),
      )
      .min(1)
      .refine(
        (candidates) =>
          new Set(candidates.map(({ publicId }) => publicId)).size ===
          candidates.length,
        { message: "Historical candidate public IDs must be unique" },
      ),
  })
  .strict()
  .superRefine(({ batch, candidates }, context) => {
    const timelineStart = new Date(batch.timelineStart);
    const coverageEnd = new Date(batch.coverageEnd);
    for (const [index, candidate] of candidates.entries()) {
      if (candidate.kind !== "event") continue;
      const occurredAt = new Date(candidate.input.event.occurredAt);
      if (occurredAt < mainTimelineStart) {
        context.addIssue({
          code: "custom",
          message:
            "Events before 2022-11-30 must be unresolved Curated Prehistory candidates",
          path: ["candidates", index, "input", "event", "occurredAt"],
        });
      }
      if (occurredAt < timelineStart || occurredAt > coverageEnd) {
        context.addIssue({
          code: "custom",
          message:
            "Event occurrence must be inside the batch coverage interval",
          path: ["candidates", index, "input", "event", "occurredAt"],
        });
      }
    }
  });

export const historicalBackfillQualityReportSchema = z
  .object({
    candidateCount: z.number().int().nonnegative(),
    importedCount: z.number().int().nonnegative(),
    failedCount: z.number().int().nonnegative(),
    unresolvedCount: z.number().int().nonnegative(),
    eventCount: z.number().int().nonnegative(),
    publishedEventCount: z.number().int().nonnegative(),
    entityCount: z.number().int().nonnegative(),
    versionCount: z.number().int().nonnegative(),
    relationCount: z.number().int().nonnegative(),
    reviewedBilingualRecordCount: z.number().int().nonnegative(),
    rightsClassifiedCandidateCount: z.number().int().nonnegative(),
    originalOrHighQualitySourceCount: z.number().int().nonnegative(),
    allEventsPublished: z.boolean(),
    allEventsBilingual: z.boolean(),
    allEventsSourced: z.boolean(),
    allCandidatesResolved: z.boolean(),
  })
  .strict();

export const historicalBackfillCandidateResultSchema = z
  .object({
    publicId: publicIdSchema,
    kind: z.enum(["entity", "event", "relation", "unresolved"]),
    status: z.enum(["imported", "failed", "unresolved"]),
    targetPublicId: publicIdSchema.nullable(),
    errorCode: z.string().min(1).nullable(),
  })
  .strict();

export const historicalBackfillReportSchema = z
  .object({
    publicId: publicIdSchema,
    themeSlug: publicIdSchema,
    version: z.string().min(1),
    theme: z.object({ en: z.string().min(1), zh: z.string().min(1) }).strict(),
    timelineStart: timestampSchema,
    coverageEnd: timestampSchema,
    prehistoryPolicy: z.literal("curated_prehistory"),
    status: z.enum(["completed", "completed_with_issues", "failed"]),
    replayed: z.boolean(),
    qualityReport: historicalBackfillQualityReportSchema,
    candidates: z.array(historicalBackfillCandidateResultSchema),
  })
  .strict();

export type HistoricalBackfillRequest = z.infer<
  typeof historicalBackfillRequestSchema
>;
export type HistoricalBackfillQualityReport = z.infer<
  typeof historicalBackfillQualityReportSchema
>;
export type HistoricalBackfillCandidateResult = z.infer<
  typeof historicalBackfillCandidateResultSchema
>;
