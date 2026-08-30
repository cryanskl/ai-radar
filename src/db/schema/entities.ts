import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import {
  events,
  localeEnum,
  localizationAuthorshipEnum,
  reviewStatusEnum,
  rightsStatusEnum,
  sourceItems,
  timePrecisionEnum,
} from "./events";

export const entityTypeEnum = pgEnum("entity_type", [
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
export const entityLifecycleStatusEnum = pgEnum("entity_lifecycle_status", [
  "active",
  "merged",
  "withdrawn",
]);
export const entityAliasKindEnum = pgEnum("entity_alias_kind", [
  "official",
  "localized",
  "historical",
]);
export const relationTypeEnum = pgEnum("relation_type", [
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
export const relationReviewStatusEnum = pgEnum("relation_review_status", [
  "draft",
  "reviewed",
]);
export const relationCreationMethodEnum = pgEnum("relation_creation_method", [
  "automatic",
  "editor",
  "submission",
]);

export const entities = pgTable("entities", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  publicId: text("public_id").notNull().unique(),
  type: entityTypeEnum("type").notNull(),
  officialName: text("official_name").notNull(),
  officialUrl: text("official_url").notNull(),
  lifecycleStatus: entityLifecycleStatusEnum("lifecycle_status")
    .notNull()
    .default("active"),
  lastVerifiedAt: timestamp("last_verified_at", {
    withTimezone: true,
  }).notNull(),
  rightsStatus: rightsStatusEnum("rights_status").notNull(),
  publicVisibility: boolean("public_visibility").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const entityLocalizedContents = pgTable(
  "entity_localized_contents",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    locale: localeEnum("locale").notNull(),
    name: text("name").notNull(),
    summary: text("summary").notNull(),
    authorship: localizationAuthorshipEnum("authorship").notNull(),
    reviewStatus: reviewStatusEnum("review_status").notNull(),
    publicVisibility: boolean("public_visibility").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (content) => [unique().on(content.entityId, content.locale)],
);

export const entityAliases = pgTable(
  "entity_aliases",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    publicId: text("public_id").notNull().unique(),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    locale: localeEnum("locale").notNull(),
    kind: entityAliasKindEnum("kind").notNull(),
    value: text("value").notNull(),
    normalizedValue: text("normalized_value").notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull(),
    publicVisibility: boolean("public_visibility").notNull().default(false),
  },
  (entityAlias) => [
    index("entity_aliases_resolution_idx").on(
      entityAlias.normalizedValue,
      entityAlias.locale,
    ),
    unique().on(
      entityAlias.entityId,
      entityAlias.locale,
      entityAlias.normalizedValue,
    ),
  ],
);

export const entityVersions = pgTable(
  "entity_versions",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    publicId: text("public_id").notNull().unique(),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    versionLabel: text("version_label").notNull(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    releasedAtPrecision: timePrecisionEnum("released_at_precision"),
    lastVerifiedAt: timestamp("last_verified_at", {
      withTimezone: true,
    }).notNull(),
    publicVisibility: boolean("public_visibility").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (version) => [unique().on(version.entityId, version.versionLabel)],
);

export const relations = pgTable(
  "relations",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    publicId: text("public_id").notNull().unique(),
    subjectEntityId: uuid("subject_entity_id").references(() => entities.id, {
      onDelete: "restrict",
    }),
    subjectEventId: uuid("subject_event_id").references(() => events.id, {
      onDelete: "restrict",
    }),
    predicate: relationTypeEnum("predicate").notNull(),
    objectEntityId: uuid("object_entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "restrict" }),
    validFrom: timestamp("valid_from", { withTimezone: true }),
    validTo: timestamp("valid_to", { withTimezone: true }),
    firstVerifiedAt: timestamp("first_verified_at", {
      withTimezone: true,
    }).notNull(),
    lastVerifiedAt: timestamp("last_verified_at", {
      withTimezone: true,
    }).notNull(),
    confidence: integer("confidence").notNull(),
    reviewStatus: relationReviewStatusEnum("review_status").notNull(),
    creationMethod: relationCreationMethodEnum("creation_method").notNull(),
    rightsStatus: rightsStatusEnum("rights_status").notNull(),
    publicVisibility: boolean("public_visibility").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (relation) => [
    index("relations_subject_entity_idx").on(relation.subjectEntityId),
    index("relations_subject_event_idx").on(relation.subjectEventId),
    index("relations_object_entity_idx").on(relation.objectEntityId),
    check(
      "relations_exactly_one_subject",
      sql`num_nonnulls(${relation.subjectEntityId}, ${relation.subjectEventId}) = 1`,
    ),
    check(
      "relations_confidence_range",
      sql`${relation.confidence} between 0 and 100`,
    ),
    check(
      "relations_valid_time_order",
      sql`${relation.validTo} is null or ${relation.validFrom} is null or ${relation.validTo} >= ${relation.validFrom}`,
    ),
    check(
      "relations_verification_time_order",
      sql`${relation.lastVerifiedAt} >= ${relation.firstVerifiedAt}`,
    ),
  ],
);

export const relationEvidence = pgTable(
  "relation_evidence",
  {
    relationId: uuid("relation_id")
      .notNull()
      .references(() => relations.id, { onDelete: "cascade" }),
    sourceItemId: uuid("source_item_id")
      .notNull()
      .references(() => sourceItems.id, { onDelete: "restrict" }),
  },
  (evidence) => [
    primaryKey({ columns: [evidence.relationId, evidence.sourceItemId] }),
  ],
);

export const ownerOperationAudits = pgTable("owner_operation_audits", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  actorRole: text("actor_role").notNull(),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetPublicId: text("target_public_id").notNull(),
  publicVisibility: boolean("public_visibility").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
