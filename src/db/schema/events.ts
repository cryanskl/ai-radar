import { randomUUID } from "node:crypto";
import {
  boolean,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const sourceTierEnum = pgEnum("source_tier", ["S", "A", "B", "C"]);
export const sourceAccessStatusEnum = pgEnum("source_access_status", [
  "approved",
  "approved_limited",
  "permission_pending",
  "blocked",
  "retired",
]);
export const acquisitionMethodEnum = pgEnum("acquisition_method", [
  "manual",
  "rss",
  "api",
  "web",
]);
export const localeEnum = pgEnum("content_locale", ["en", "zh"]);
export const timePrecisionEnum = pgEnum("time_precision", [
  "day",
  "minute",
  "second",
]);
export const rightsStatusEnum = pgEnum("rights_status", [
  "open",
  "attribution_required",
  "source_license",
  "metadata_only",
  "link_only",
  "permission_required",
  "internal_only",
  "withdrawn",
]);
export const eventTypeEnum = pgEnum("event_type", [
  "announces",
  "updates",
  "changes_price_of",
  "deprecates",
]);
export const factStatusEnum = pgEnum("fact_status", [
  "rumored",
  "confirmed",
  "corrected",
  "withdrawn",
]);
export const publicationStateEnum = pgEnum("publication_state", [
  "candidate",
  "verifying",
  "ready",
  "published",
  "updating",
  "corrected",
  "merged",
  "withdrawn",
]);
export const localizationAuthorshipEnum = pgEnum("localization_authorship", [
  "human_authored",
  "ai_translated",
  "official_translation",
]);
export const reviewStatusEnum = pgEnum("review_status", ["draft", "reviewed"]);

export const sources = pgTable("sources", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  publicId: text("public_id").notNull().unique(),
  name: text("name").notNull(),
  homepageUrl: text("homepage_url").notNull(),
  tier: sourceTierEnum("tier").notNull(),
  accessStatus: sourceAccessStatusEnum("access_status").notNull(),
  acquisitionMethod: acquisitionMethodEnum("acquisition_method").notNull(),
  policyLastReviewedAt: timestamp("policy_last_reviewed_at", {
    withTimezone: true,
  }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sourceItems = pgTable(
  "source_items",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    publicId: text("public_id").notNull().unique(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "restrict" }),
    externalId: text("external_id").notNull(),
    originalUrl: text("original_url").notNull(),
    canonicalUrl: text("canonical_url").notNull(),
    originalTitle: text("original_title").notNull(),
    originalLanguage: localeEnum("original_language").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    publishedAtPrecision: timePrecisionEnum("published_at_precision").notNull(),
    discoveredAt: timestamp("discovered_at", { withTimezone: true }).notNull(),
    rightsStatus: rightsStatusEnum("rights_status").notNull(),
    rightsCheckedAt: timestamp("rights_checked_at", {
      withTimezone: true,
    }).notNull(),
    attribution: text("attribution").notNull(),
    licenseUrl: text("license_url"),
    publicVisibility: boolean("public_visibility").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (sourceItem) => [unique().on(sourceItem.sourceId, sourceItem.externalId)],
);

export const events = pgTable("events", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  publicId: text("public_id").notNull().unique(),
  eventType: eventTypeEnum("event_type").notNull(),
  factStatus: factStatusEnum("fact_status").notNull(),
  publicationState: publicationStateEnum("publication_state")
    .notNull()
    .default("ready"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  occurredAtPrecision: timePrecisionEnum("occurred_at_precision").notNull(),
  discoveredAt: timestamp("discovered_at", { withTimezone: true }).notNull(),
  lastVerifiedAt: timestamp("last_verified_at", {
    withTimezone: true,
  }).notNull(),
  rightsStatus: rightsStatusEnum("rights_status").notNull(),
  publicVisibility: boolean("public_visibility").notNull().default(false),
  firstPublishedAt: timestamp("first_published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const eventSources = pgTable(
  "event_sources",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    sourceItemId: uuid("source_item_id")
      .notNull()
      .references(() => sourceItems.id, { onDelete: "restrict" }),
    isPrimary: boolean("is_primary").notNull().default(false),
  },
  (eventSource) => [
    primaryKey({ columns: [eventSource.eventId, eventSource.sourceItemId] }),
  ],
);

export const localizedContents = pgTable(
  "localized_contents",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    locale: localeEnum("locale").notNull(),
    title: text("title").notNull(),
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
  (content) => [unique().on(content.eventId, content.locale)],
);

export const eventPublicationAudits = pgTable("event_publication_audits", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  eventId: uuid("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  actorRole: text("actor_role").notNull(),
  fromState: publicationStateEnum("from_state").notNull(),
  toState: publicationStateEnum("to_state").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
