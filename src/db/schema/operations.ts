import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  check,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { entities, entityAliases, entityVersions, relations } from "./entities";
import { events, eventMerges, rightsStatusEnum, sourceItems } from "./events";

export const correctionTargetTypeEnum = pgEnum("correction_target_type", [
  "event",
  "entity",
]);
export const correctionReasonCodeEnum = pgEnum("correction_reason_code", [
  "factual_error",
]);
export const rightsDecisionTargetTypeEnum = pgEnum(
  "rights_decision_target_type",
  ["event", "entity", "source_item"],
);
export const rightsDecisionReasonCodeEnum = pgEnum(
  "rights_decision_reason_code",
  ["source_withdrawal", "rights_withdrawal"],
);
export const tombstoneObjectTypeEnum = pgEnum("tombstone_object_type", [
  "event",
  "entity",
]);
export const tombstoneStatusEnum = pgEnum("tombstone_status", [
  "merged_into",
  "withdrawn",
  "source_withdrawn",
  "reviewing",
]);
export const tombstoneReasonCodeEnum = pgEnum("tombstone_reason_code", [
  "duplicate_coverage",
  "duplicate_identity",
  "rights_withdrawal",
  "source_withdrawal",
  "high_risk_review",
]);
export const entityMergeReasonCodeEnum = pgEnum("entity_merge_reason_code", [
  "duplicate_identity",
]);
export const entityMergeRelationRoleEnum = pgEnum(
  "entity_merge_relation_role",
  ["subject", "object"],
);
export const editorialCaseKindEnum = pgEnum("editorial_case_kind", [
  "correction",
  "rights",
]);
export const editorialCaseTargetTypeEnum = pgEnum(
  "editorial_case_target_type",
  ["event", "entity", "source_item"],
);
export const editorialCaseStatusEnum = pgEnum("editorial_case_status", [
  "received",
  "reviewing",
  "actioned",
  "rejected",
  "appealed",
  "closed",
]);
export const editorialCaseDecisionEnum = pgEnum("editorial_case_decision", [
  "corrected",
  "withdrawn",
  "rejected",
]);

export const editorialCases = pgTable(
  "editorial_cases",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    publicId: text("public_id").notNull().unique(),
    kind: editorialCaseKindEnum("kind").notNull(),
    targetType: editorialCaseTargetTypeEnum("target_type").notNull(),
    targetPublicId: text("target_public_id").notNull(),
    targetEventId: uuid("target_event_id").references(() => events.id, {
      onDelete: "restrict",
    }),
    targetEntityId: uuid("target_entity_id").references(() => entities.id, {
      onDelete: "restrict",
    }),
    targetSourceItemId: uuid("target_source_item_id").references(
      () => sourceItems.id,
      { onDelete: "restrict" },
    ),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    originalRequest: text("original_request").notNull(),
    evidenceSummary: text("evidence_summary").notNull(),
    status: editorialCaseStatusEnum("status").notNull(),
    decision: editorialCaseDecisionEnum("decision"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    previousRightsStatus: rightsStatusEnum("previous_rights_status").notNull(),
    actorRole: text("actor_role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (editorialCase) => [
    check(
      "editorial_cases_target_matches_type",
      sql`(${editorialCase.targetType} = 'event' and ${editorialCase.targetEventId} is not null and num_nonnulls(${editorialCase.targetEntityId}, ${editorialCase.targetSourceItemId}) = 0) or (${editorialCase.targetType} = 'entity' and ${editorialCase.targetEntityId} is not null and num_nonnulls(${editorialCase.targetEventId}, ${editorialCase.targetSourceItemId}) = 0) or (${editorialCase.targetType} = 'source_item' and ${editorialCase.targetSourceItemId} is not null and num_nonnulls(${editorialCase.targetEventId}, ${editorialCase.targetEntityId}) = 0)`,
    ),
    check(
      "editorial_cases_decision_matches_status",
      sql`(${editorialCase.status} in ('received', 'reviewing') and ${editorialCase.decision} is null and ${editorialCase.decidedAt} is null and ${editorialCase.closedAt} is null) or (${editorialCase.status} in ('actioned', 'rejected', 'appealed') and ${editorialCase.decision} is not null and ${editorialCase.decidedAt} is not null and ${editorialCase.closedAt} is null) or (${editorialCase.status} = 'closed' and ${editorialCase.decision} is not null and ${editorialCase.decidedAt} is not null and ${editorialCase.closedAt} is not null)`,
    ),
    check(
      "editorial_cases_timestamps_move_forward",
      sql`(${editorialCase.decidedAt} is null or ${editorialCase.decidedAt} >= ${editorialCase.receivedAt}) and (${editorialCase.closedAt} is null or (${editorialCase.decidedAt} is not null and ${editorialCase.closedAt} >= ${editorialCase.decidedAt})) and ${editorialCase.updatedAt} >= ${editorialCase.receivedAt}`,
    ),
  ],
);

export const entityMerges = pgTable("entity_merges", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  sourceEntityId: uuid("source_entity_id")
    .notNull()
    .unique()
    .references(() => entities.id, { onDelete: "restrict" }),
  targetEntityId: uuid("target_entity_id")
    .notNull()
    .references(() => entities.id, { onDelete: "restrict" }),
  publicReasonCode: entityMergeReasonCodeEnum("public_reason_code").notNull(),
  internalNote: text("internal_note").notNull(),
  effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
  actorRole: text("actor_role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const corrections = pgTable(
  "corrections",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    publicId: text("public_id").notNull().unique(),
    caseId: uuid("case_id")
      .notNull()
      .unique()
      .references(() => editorialCases.id, { onDelete: "restrict" }),
    targetType: correctionTargetTypeEnum("target_type").notNull(),
    targetPublicId: text("target_public_id").notNull(),
    targetEventId: uuid("target_event_id").references(() => events.id, {
      onDelete: "restrict",
    }),
    targetEntityId: uuid("target_entity_id").references(() => entities.id, {
      onDelete: "restrict",
    }),
    reasonCode: correctionReasonCodeEnum("reason_code").notNull(),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
    replacementVersion: text("replacement_version").notNull(),
    internalNote: text("internal_note").notNull(),
    actorRole: text("actor_role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (correction) => [
    check(
      "corrections_target_matches_type",
      sql`(${correction.targetType} = 'event' and ${correction.targetEventId} is not null and ${correction.targetEntityId} is null) or (${correction.targetType} = 'entity' and ${correction.targetEntityId} is not null and ${correction.targetEventId} is null)`,
    ),
  ],
);

export const correctionChanges = pgTable(
  "correction_changes",
  {
    correctionId: uuid("correction_id")
      .notNull()
      .references(() => corrections.id, { onDelete: "restrict" }),
    field: text("field").notNull(),
    previousValue: text("previous_value").notNull(),
    correctedValue: text("corrected_value").notNull(),
  },
  (change) => [primaryKey({ columns: [change.correctionId, change.field] })],
);

export const correctionEvidence = pgTable(
  "correction_evidence",
  {
    correctionId: uuid("correction_id")
      .notNull()
      .references(() => corrections.id, { onDelete: "restrict" }),
    sourceItemId: uuid("source_item_id")
      .notNull()
      .references(() => sourceItems.id, { onDelete: "restrict" }),
  },
  (evidence) => [
    primaryKey({ columns: [evidence.correctionId, evidence.sourceItemId] }),
  ],
);

export const rightsDecisions = pgTable(
  "rights_decisions",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    publicId: text("public_id").notNull().unique(),
    caseId: uuid("case_id")
      .notNull()
      .unique()
      .references(() => editorialCases.id, { onDelete: "restrict" }),
    targetType: rightsDecisionTargetTypeEnum("target_type").notNull(),
    targetPublicId: text("target_public_id").notNull(),
    targetEventId: uuid("target_event_id").references(() => events.id, {
      onDelete: "restrict",
    }),
    targetEntityId: uuid("target_entity_id").references(() => entities.id, {
      onDelete: "restrict",
    }),
    targetSourceItemId: uuid("target_source_item_id").references(
      () => sourceItems.id,
      { onDelete: "restrict" },
    ),
    fromStatus: rightsStatusEnum("from_status").notNull(),
    toStatus: rightsStatusEnum("to_status").notNull(),
    publicReasonCode:
      rightsDecisionReasonCodeEnum("public_reason_code").notNull(),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
    internalNote: text("internal_note").notNull(),
    actorRole: text("actor_role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (decision) => [
    check(
      "rights_decisions_target_matches_type",
      sql`(${decision.targetType} = 'event' and ${decision.targetEventId} is not null and num_nonnulls(${decision.targetEntityId}, ${decision.targetSourceItemId}) = 0) or (${decision.targetType} = 'entity' and ${decision.targetEntityId} is not null and num_nonnulls(${decision.targetEventId}, ${decision.targetSourceItemId}) = 0) or (${decision.targetType} = 'source_item' and ${decision.targetSourceItemId} is not null and num_nonnulls(${decision.targetEventId}, ${decision.targetEntityId}) = 0)`,
    ),
    check(
      "rights_decisions_withdrawal_semantics",
      sql`${decision.toStatus} = 'withdrawn' and ((${decision.targetType} = 'source_item' and ${decision.publicReasonCode} = 'source_withdrawal') or (${decision.targetType} in ('event', 'entity') and ${decision.publicReasonCode} = 'rights_withdrawal'))`,
    ),
  ],
);

export const tombstones = pgTable(
  "tombstones",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    objectPublicId: text("object_public_id").notNull(),
    objectType: tombstoneObjectTypeEnum("object_type").notNull(),
    status: tombstoneStatusEnum("status").notNull(),
    publicReasonCode: tombstoneReasonCodeEnum("public_reason_code").notNull(),
    replacementPublicId: text("replacement_public_id"),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
    caseReferencePublicId: text("case_reference_public_id"),
    eventMergeId: uuid("event_merge_id").references(() => eventMerges.id, {
      onDelete: "restrict",
    }),
    entityMergeId: uuid("entity_merge_id").references(() => entityMerges.id, {
      onDelete: "restrict",
    }),
    rightsDecisionId: uuid("rights_decision_id").references(
      () => rightsDecisions.id,
      { onDelete: "restrict" },
    ),
    clearedAt: timestamp("cleared_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (tombstone) => [
    uniqueIndex("tombstones_active_object_unique")
      .on(tombstone.objectType, tombstone.objectPublicId)
      .where(sql`${tombstone.clearedAt} is null`),
    check(
      "tombstones_payload_matches_status",
      sql`(${tombstone.status} = 'merged_into' and ((${tombstone.objectType} = 'event' and ${tombstone.publicReasonCode} = 'duplicate_coverage' and ${tombstone.eventMergeId} is not null and ${tombstone.entityMergeId} is null) or (${tombstone.objectType} = 'entity' and ${tombstone.publicReasonCode} = 'duplicate_identity' and ${tombstone.entityMergeId} is not null and ${tombstone.eventMergeId} is null)) and ${tombstone.replacementPublicId} is not null and ${tombstone.caseReferencePublicId} is null and ${tombstone.rightsDecisionId} is null) or (${tombstone.status} = 'withdrawn' and ${tombstone.objectType} in ('event', 'entity') and ${tombstone.publicReasonCode} = 'rights_withdrawal' and ${tombstone.replacementPublicId} is null and ${tombstone.caseReferencePublicId} is not null and ${tombstone.rightsDecisionId} is not null and num_nonnulls(${tombstone.eventMergeId}, ${tombstone.entityMergeId}) = 0) or (${tombstone.status} = 'source_withdrawn' and ${tombstone.objectType} = 'event' and ${tombstone.publicReasonCode} = 'source_withdrawal' and ${tombstone.replacementPublicId} is null and ${tombstone.caseReferencePublicId} is not null and ${tombstone.rightsDecisionId} is not null and num_nonnulls(${tombstone.eventMergeId}, ${tombstone.entityMergeId}) = 0) or (${tombstone.status} = 'reviewing' and ${tombstone.objectType} in ('event', 'entity') and ${tombstone.publicReasonCode} = 'high_risk_review' and ${tombstone.replacementPublicId} is null and ${tombstone.caseReferencePublicId} is not null and num_nonnulls(${tombstone.eventMergeId}, ${tombstone.entityMergeId}, ${tombstone.rightsDecisionId}) = 0)`,
    ),
  ],
);

export const entityMergeAliasMoves = pgTable(
  "entity_merge_alias_moves",
  {
    entityMergeId: uuid("entity_merge_id")
      .notNull()
      .references(() => entityMerges.id, { onDelete: "restrict" }),
    aliasId: uuid("alias_id")
      .notNull()
      .references(() => entityAliases.id, { onDelete: "restrict" }),
  },
  (move) => [primaryKey({ columns: [move.entityMergeId, move.aliasId] })],
);

export const entityMergeVersionMoves = pgTable(
  "entity_merge_version_moves",
  {
    entityMergeId: uuid("entity_merge_id")
      .notNull()
      .references(() => entityMerges.id, { onDelete: "restrict" }),
    versionId: uuid("version_id")
      .notNull()
      .references(() => entityVersions.id, { onDelete: "restrict" }),
  },
  (move) => [primaryKey({ columns: [move.entityMergeId, move.versionId] })],
);

export const entityMergeRelationMoves = pgTable(
  "entity_merge_relation_moves",
  {
    entityMergeId: uuid("entity_merge_id")
      .notNull()
      .references(() => entityMerges.id, { onDelete: "restrict" }),
    relationId: uuid("relation_id")
      .notNull()
      .references(() => relations.id, { onDelete: "restrict" }),
    role: entityMergeRelationRoleEnum("role").notNull(),
  },
  (move) => [
    primaryKey({ columns: [move.entityMergeId, move.relationId, move.role] }),
  ],
);

export const eventMergeCorrectionMoves = pgTable(
  "event_merge_correction_moves",
  {
    eventMergeId: uuid("event_merge_id")
      .notNull()
      .references(() => eventMerges.id, { onDelete: "restrict" }),
    correctionId: uuid("correction_id")
      .notNull()
      .references(() => corrections.id, { onDelete: "restrict" }),
  },
  (move) => [primaryKey({ columns: [move.eventMergeId, move.correctionId] })],
);
