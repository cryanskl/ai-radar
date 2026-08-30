import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { entities, entityVersions } from "./entities";
import { benchmarkRuns, priceRecords } from "./models";
import {
  events,
  localeEnum,
  localizationAuthorshipEnum,
  reviewStatusEnum,
  sourceItems,
} from "./events";

export const rankingTargetTypeEnum = pgEnum("ranking_target_type", [
  "event",
  "model",
  "paper",
  "product",
  "repository",
  "prompt",
  "skill",
  "guide",
]);
export const rankingKindEnum = pgEnum("ranking_kind", [
  "latest",
  "trending",
  "benchmark",
  "value",
]);
export const rankingConfidenceEnum = pgEnum("ranking_confidence", [
  "high",
  "medium",
  "low",
]);
export const rankingObservationStatusEnum = pgEnum(
  "ranking_observation_status",
  ["active", "insufficient_evidence", "stale", "withdrawn"],
);
export const commercialRelationshipEnum = pgEnum("commercial_relationship", [
  "none",
  "sponsor",
  "affiliate",
  "other",
]);

export const rankingDefinitions = pgTable("ranking_definitions", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  publicId: text("public_id").notNull().unique(),
  targetType: rankingTargetTypeEnum("target_type").notNull(),
  kind: rankingKindEnum("kind").notNull(),
  publicVisibility: boolean("public_visibility").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const rankingDefinitionVersions = pgTable(
  "ranking_definition_versions",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    definitionId: uuid("definition_id")
      .notNull()
      .references(() => rankingDefinitions.id, { onDelete: "restrict" }),
    methodologyVersion: text("methodology_version").notNull(),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
    eligibility: text("eligibility").array().notNull(),
    dimensions: text("dimensions").array().notNull(),
    method: jsonb("method").notNull(),
    publicVisibility: boolean("public_visibility").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (version) => [
    unique("ranking_definition_version_unique").on(
      version.definitionId,
      version.methodologyVersion,
    ),
    check(
      "ranking_definition_eligibility_nonempty",
      sql`cardinality(${version.eligibility}) > 0`,
    ),
    check(
      "ranking_definition_dimensions_nonempty",
      sql`cardinality(${version.dimensions}) > 0`,
    ),
  ],
);

export const rankingDefinitionLocalizedContents = pgTable(
  "ranking_definition_localized_contents",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    rankingDefinitionVersionId: uuid("ranking_definition_version_id")
      .notNull()
      .references(() => rankingDefinitionVersions.id, { onDelete: "cascade" }),
    locale: localeEnum("locale").notNull(),
    title: text("title").notNull(),
    question: text("question").notNull(),
    eligibilitySummary: text("eligibility_summary").notNull(),
    limitations: text("limitations").array().notNull(),
    authorship: localizationAuthorshipEnum("authorship").notNull(),
    reviewStatus: reviewStatusEnum("review_status").notNull(),
    publicVisibility: boolean("public_visibility").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (content) => [
    unique("ranking_definition_localization_unique").on(
      content.rankingDefinitionVersionId,
      content.locale,
    ),
    check(
      "ranking_definition_limitations_nonempty",
      sql`cardinality(${content.limitations}) > 0`,
    ),
  ],
);

export const rankingObservations = pgTable(
  "ranking_observations",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    publicId: text("public_id").notNull().unique(),
    rankingDefinitionVersionId: uuid("ranking_definition_version_id")
      .notNull()
      .references(() => rankingDefinitionVersions.id, {
        onDelete: "restrict",
      }),
    targetEventId: uuid("target_event_id").references(() => events.id, {
      onDelete: "restrict",
    }),
    targetEntityId: uuid("target_entity_id").references(() => entities.id, {
      onDelete: "restrict",
    }),
    targetEntityVersionId: uuid("target_entity_version_id").references(
      () => entityVersions.id,
      { onDelete: "restrict" },
    ),
    benchmarkRunId: uuid("benchmark_run_id").references(
      () => benchmarkRuns.id,
      { onDelete: "restrict" },
    ),
    priceRecordId: uuid("price_record_id").references(() => priceRecords.id, {
      onDelete: "restrict",
    }),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    dataCutoff: timestamp("data_cutoff", { withTimezone: true }).notNull(),
    candidateTime: timestamp("candidate_time", { withTimezone: true }),
    score: numeric("score", { precision: 14, scale: 8 }),
    rawMetrics: jsonb("raw_metrics").notNull(),
    signals: jsonb("signals").notNull(),
    confidence: rankingConfidenceEnum("confidence").notNull(),
    status: rankingObservationStatusEnum("status").notNull(),
    publicVisibility: boolean("public_visibility").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (observation) => [
    check(
      "ranking_observation_exactly_one_target",
      sql`num_nonnulls(${observation.targetEventId}, ${observation.targetEntityId}) = 1 and (${observation.targetEntityVersionId} is null or ${observation.targetEntityId} is not null)`,
    ),
    check(
      "ranking_observation_cutoff_not_future",
      sql`${observation.dataCutoff} <= ${observation.observedAt}`,
    ),
  ],
);

export const rankingObservationEvidence = pgTable(
  "ranking_observation_evidence",
  {
    rankingObservationId: uuid("ranking_observation_id")
      .notNull()
      .references(() => rankingObservations.id, { onDelete: "cascade" }),
    sourceItemId: uuid("source_item_id")
      .notNull()
      .references(() => sourceItems.id, { onDelete: "restrict" }),
  },
  (evidence) => [
    primaryKey({
      columns: [evidence.rankingObservationId, evidence.sourceItemId],
    }),
  ],
);

export const featuredSelections = pgTable(
  "featured_selections",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    publicId: text("public_id").notNull().unique(),
    targetType: rankingTargetTypeEnum("target_type").notNull(),
    targetEventId: uuid("target_event_id").references(() => events.id, {
      onDelete: "restrict",
    }),
    targetEntityId: uuid("target_entity_id").references(() => entities.id, {
      onDelete: "restrict",
    }),
    selectedAt: timestamp("selected_at", { withTimezone: true }).notNull(),
    reviewDueAt: timestamp("review_due_at", { withTimezone: true }).notNull(),
    editorRole: text("editor_role").notNull(),
    topic: text("topic").notNull(),
    commercialRelationship: commercialRelationshipEnum(
      "commercial_relationship",
    ).notNull(),
    rankingInfluence: boolean("ranking_influence").notNull().default(false),
    publicVisibility: boolean("public_visibility").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (selection) => [
    check(
      "featured_selection_exactly_one_target",
      sql`num_nonnulls(${selection.targetEventId}, ${selection.targetEntityId}) = 1`,
    ),
    check(
      "featured_selection_review_after_selection",
      sql`${selection.reviewDueAt} > ${selection.selectedAt}`,
    ),
    check(
      "featured_selection_never_influences_ranking",
      sql`${selection.rankingInfluence} = false`,
    ),
  ],
);

export const featuredSelectionLocalizedContents = pgTable(
  "featured_selection_localized_contents",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    featuredSelectionId: uuid("featured_selection_id")
      .notNull()
      .references(() => featuredSelections.id, { onDelete: "cascade" }),
    locale: localeEnum("locale").notNull(),
    reason: text("reason").notNull(),
    audience: text("audience").notNull(),
    commercialDisclosure: text("commercial_disclosure").notNull(),
    authorship: localizationAuthorshipEnum("authorship").notNull(),
    reviewStatus: reviewStatusEnum("review_status").notNull(),
    publicVisibility: boolean("public_visibility").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (content) => [
    unique("featured_selection_localization_unique").on(
      content.featuredSelectionId,
      content.locale,
    ),
  ],
);

export const featuredSelectionEvidence = pgTable(
  "featured_selection_evidence",
  {
    featuredSelectionId: uuid("featured_selection_id")
      .notNull()
      .references(() => featuredSelections.id, { onDelete: "cascade" }),
    sourceItemId: uuid("source_item_id")
      .notNull()
      .references(() => sourceItems.id, { onDelete: "restrict" }),
  },
  (evidence) => [
    primaryKey({
      columns: [evidence.featuredSelectionId, evidence.sourceItemId],
    }),
  ],
);
