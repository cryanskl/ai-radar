import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  check,
  date,
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
  sourceItems,
} from "./events";

export const dailyBriefStateEnum = pgEnum("daily_brief_state", [
  "draft",
  "published",
]);
export const dailyBriefSectionEnum = pgEnum("daily_brief_section", [
  "key_developments",
  "models_research",
  "products_open_source",
  "prompts_skills_guides",
]);
export const emailSubscriptionStateEnum = pgEnum("email_subscription_state", [
  "pending",
  "confirmed",
  "unsubscribed",
]);
export const emailDeliveryKindEnum = pgEnum("email_delivery_kind", [
  "confirmation",
  "daily_brief",
]);
export const emailDeliveryStatusEnum = pgEnum("email_delivery_status", [
  "pending",
  "accepted",
  "delivered",
  "failed",
  "bounced",
]);
export const emailProviderEventTypeEnum = pgEnum("email_provider_event_type", [
  "delivered",
  "failed",
  "bounced",
]);

export const dailyBriefs = pgTable(
  "daily_briefs",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    publicId: text("public_id").notNull().unique(),
    editionPublicId: text("edition_public_id").notNull(),
    locale: localeEnum("locale").notNull(),
    briefDate: date("brief_date", { mode: "string" }).notNull(),
    version: text("version").notNull(),
    dataCutoff: timestamp("data_cutoff", { withTimezone: true }).notNull(),
    state: dailyBriefStateEnum("state").notNull().default("draft"),
    title: text("title").notNull(),
    overview: text("overview").notNull(),
    coverageNote: text("coverage_note").notNull(),
    whatToWatch: text("what_to_watch").notNull(),
    authorship: localizationAuthorshipEnum("authorship").notNull(),
    reviewStatus: reviewStatusEnum("review_status").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (brief) => [
    unique("daily_brief_edition_locale_unique").on(
      brief.editionPublicId,
      brief.locale,
    ),
    unique("daily_brief_locale_date_version_unique").on(
      brief.locale,
      brief.briefDate,
      brief.version,
    ),
    check(
      "daily_brief_publication_state_valid",
      sql`(${brief.state} = 'draft' and ${brief.publishedAt} is null) or (${brief.state} = 'published' and ${brief.publishedAt} is not null and ${brief.reviewStatus} = 'reviewed')`,
    ),
  ],
);

export const dailyBriefItems = pgTable(
  "daily_brief_items",
  {
    briefId: uuid("brief_id")
      .notNull()
      .references(() => dailyBriefs.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "restrict" }),
    sourceItemId: uuid("source_item_id")
      .notNull()
      .references(() => sourceItems.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    section: dailyBriefSectionEnum("section").notNull(),
    commentary: text("commentary").notNull(),
    eventPublicId: text("event_public_id").notNull(),
    eventTitle: text("event_title").notNull(),
    eventSummary: text("event_summary").notNull(),
    eventOccurredAt: timestamp("event_occurred_at", {
      withTimezone: true,
    }).notNull(),
    eventHref: text("event_href").notNull(),
    sourceTitle: text("source_title"),
    sourceUrl: text("source_url"),
  },
  (item) => [
    primaryKey({ columns: [item.briefId, item.eventId] }),
    unique("daily_brief_item_position_unique").on(item.briefId, item.position),
    check("daily_brief_item_position_positive", sql`${item.position} > 0`),
    check(
      "daily_brief_item_source_snapshot_complete",
      sql`(${item.sourceTitle} is null and ${item.sourceUrl} is null) or (${item.sourceTitle} is not null and ${item.sourceUrl} is not null)`,
    ),
  ],
);

export const emailSubscriptions = pgTable(
  "email_subscriptions",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    email: text("email").notNull(),
    locale: localeEnum("locale").notNull(),
    state: emailSubscriptionStateEnum("state").notNull().default("pending"),
    consentVersion: uuid("consent_version").notNull(),
    consentedAt: timestamp("consented_at", { withTimezone: true }).notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (subscription) => [
    unique("email_subscription_identity_unique").on(
      subscription.email,
      subscription.locale,
    ),
    check(
      "email_subscription_state_timestamps_valid",
      sql`(${subscription.state} = 'pending' and ${subscription.confirmedAt} is null and ${subscription.unsubscribedAt} is null) or (${subscription.state} = 'confirmed' and ${subscription.confirmedAt} is not null and ${subscription.unsubscribedAt} is null) or (${subscription.state} = 'unsubscribed' and ${subscription.unsubscribedAt} is not null)`,
    ),
  ],
);

export const emailDeliveries = pgTable(
  "email_deliveries",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    publicId: text("public_id").notNull().unique(),
    kind: emailDeliveryKindEnum("kind").notNull(),
    briefId: uuid("brief_id").references(() => dailyBriefs.id, {
      onDelete: "restrict",
    }),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => emailSubscriptions.id, { onDelete: "restrict" }),
    provider: text("provider").notNull(),
    providerMessageId: text("provider_message_id").unique(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    status: emailDeliveryStatusEnum("status").notNull().default("pending"),
    failureReason: text("failure_reason"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (delivery) => [
    unique("daily_brief_subscription_delivery_unique").on(
      delivery.briefId,
      delivery.subscriptionId,
      delivery.kind,
    ),
    check(
      "email_delivery_kind_reference_valid",
      sql`(${delivery.kind} = 'confirmation' and ${delivery.briefId} is null) or (${delivery.kind} = 'daily_brief' and ${delivery.briefId} is not null)`,
    ),
  ],
);

export const emailDeliveryEvents = pgTable("email_delivery_events", {
  providerEventId: text("provider_event_id").primaryKey(),
  deliveryId: uuid("delivery_id")
    .notNull()
    .references(() => emailDeliveries.id, { onDelete: "restrict" }),
  type: emailProviderEventTypeEnum("type").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
