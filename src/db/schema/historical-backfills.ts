import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  check,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const historicalBackfillStatusEnum = pgEnum(
  "historical_backfill_status",
  ["running", "completed", "completed_with_issues", "failed"],
);

export const historicalBackfillCandidateKindEnum = pgEnum(
  "historical_backfill_candidate_kind",
  ["entity", "event", "relation", "unresolved"],
);

export const historicalBackfillCandidateStatusEnum = pgEnum(
  "historical_backfill_candidate_status",
  ["imported", "failed", "unresolved"],
);

export const historicalBackfillBatches = pgTable(
  "historical_backfill_batches",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    publicId: text("public_id").notNull().unique(),
    themeSlug: text("theme_slug").notNull(),
    version: text("version").notNull(),
    nameEn: text("name_en").notNull(),
    nameZh: text("name_zh").notNull(),
    timelineStart: timestamp("timeline_start", {
      withTimezone: true,
    }).notNull(),
    coverageEnd: timestamp("coverage_end", { withTimezone: true }).notNull(),
    prehistoryPolicy: text("prehistory_policy").notNull(),
    inputSha256: text("input_sha256").notNull(),
    input: jsonb("input").notNull(),
    status: historicalBackfillStatusEnum("status").notNull(),
    qualityReport: jsonb("quality_report"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (batch) => [
    unique().on(batch.themeSlug, batch.version),
    check(
      "historical_backfill_coverage_order",
      sql`${batch.coverageEnd} >= ${batch.timelineStart}`,
    ),
    check(
      "historical_backfill_prehistory_policy",
      sql`${batch.prehistoryPolicy} = 'curated_prehistory'`,
    ),
  ],
);

export const historicalBackfillCandidates = pgTable(
  "historical_backfill_candidates",
  {
    batchId: uuid("batch_id")
      .notNull()
      .references(() => historicalBackfillBatches.id, { onDelete: "restrict" }),
    ordinal: integer("ordinal").notNull(),
    publicId: text("public_id").notNull(),
    kind: historicalBackfillCandidateKindEnum("kind").notNull(),
    status: historicalBackfillCandidateStatusEnum("status").notNull(),
    targetPublicId: text("target_public_id"),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (candidate) => [
    primaryKey({ columns: [candidate.batchId, candidate.publicId] }),
    unique().on(candidate.batchId, candidate.ordinal),
  ],
);
