import { randomUUID } from "node:crypto";
import {
  boolean,
  index,
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
import { entityTypeEnum } from "./entities";
import { localeEnum } from "./events";

export const searchObjectKindEnum = pgEnum("search_object_kind", [
  "event",
  "entity",
]);
export const searchTermReasonEnum = pgEnum("search_term_reason", [
  "public_id",
  "canonical_url",
  "external_id",
  "official_name",
  "alias",
]);
export const searchPublicStatusEnum = pgEnum("search_public_status", [
  "public",
  "source_withdrawn",
]);

export const searchDocuments = pgTable(
  "search_documents",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    objectKind: searchObjectKindEnum("object_kind").notNull(),
    objectId: uuid("object_id").notNull(),
    publicId: text("public_id").notNull(),
    entityType: entityTypeEnum("entity_type"),
    locale: localeEnum("locale").notNull(),
    name: text("name").notNull(),
    summary: text("summary").notNull(),
    searchName: text("search_name").notNull(),
    searchText: text("search_text").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    latestAt: timestamp("latest_at", { withTimezone: true }).notNull(),
    lastVerifiedAt: timestamp("last_verified_at", {
      withTimezone: true,
    }).notNull(),
    sourceName: text("source_name"),
    sourceUrl: text("source_url"),
    status: searchPublicStatusEnum("status").notNull(),
    indexedAt: timestamp("indexed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (document) => [
    unique().on(document.objectKind, document.objectId, document.locale),
    index("search_documents_object_idx").on(
      document.objectKind,
      document.objectId,
    ),
    index("search_documents_public_id_idx").on(document.publicId),
  ],
);

export const searchTerms = pgTable(
  "search_terms",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    objectKind: searchObjectKindEnum("object_kind").notNull(),
    objectId: uuid("object_id").notNull(),
    locale: localeEnum("locale"),
    reason: searchTermReasonEnum("reason").notNull(),
    value: text("value").notNull(),
    normalizedValue: text("normalized_value").notNull(),
  },
  (term) => [
    index("search_terms_exact_idx").on(term.normalizedValue),
    index("search_terms_object_idx").on(term.objectKind, term.objectId),
  ],
);

export const searchSnapshots = pgTable("search_snapshots", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  requestKey: text("request_key").notNull(),
  rankingState: text("ranking_state").notNull(),
  dataCutoff: timestamp("data_cutoff", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  totalCount: integer("total_count").notNull(),
  truncated: boolean("truncated").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const searchSnapshotItems = pgTable(
  "search_snapshot_items",
  {
    snapshotId: uuid("snapshot_id")
      .notNull()
      .references(() => searchSnapshots.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  },
  (item) => [primaryKey({ columns: [item.snapshotId, item.position] })],
);
