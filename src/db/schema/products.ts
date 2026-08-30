import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { entities } from "./entities";
import { sourceItems } from "./events";

export const productLifecycleStatusEnum = pgEnum("product_lifecycle_status", [
  "beta",
  "active",
  "deprecated",
  "discontinued",
]);
export const productPricingModeEnum = pgEnum("product_pricing_mode", [
  "free",
  "freemium",
  "subscription",
  "usage_based",
  "contact_sales",
  "open_source",
]);
export const productChangeKindEnum = pgEnum("product_change_kind", [
  "launch",
  "product_update",
  "pricing_change",
  "availability_change",
]);
export const productCommercialRelationshipEnum = pgEnum(
  "product_commercial_relationship",
  ["none_disclosed", "vendor_submitted", "affiliate", "sponsored"],
);
export const productVendorMetricEnum = pgEnum("product_vendor_metric", [
  "users",
  "revenue",
  "adoption",
  "downloads",
]);

export const productProfiles = pgTable(
  "product_profiles",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    entityId: uuid("entity_id")
      .notNull()
      .unique()
      .references(() => entities.id, { onDelete: "restrict" }),
    category: text("category").notNull(),
    platforms: text("platforms").array().notNull(),
    audienceTypes: text("audience_types").array().notNull(),
    publicVisibility: boolean("public_visibility").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (profile) => [
    check(
      "product_profiles_dimensions_nonempty",
      sql`cardinality(${profile.platforms}) > 0 and cardinality(${profile.audienceTypes}) > 0`,
    ),
  ],
);

export const productObservations = pgTable(
  "product_observations",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    publicId: text("public_id").notNull().unique(),
    productProfileId: uuid("product_profile_id")
      .notNull()
      .references(() => productProfiles.id, { onDelete: "restrict" }),
    sourceItemId: uuid("source_item_id")
      .notNull()
      .references(() => sourceItems.id, { onDelete: "restrict" }),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    changeKind: productChangeKindEnum("change_kind").notNull(),
    lifecycleStatus: productLifecycleStatusEnum("lifecycle_status").notNull(),
    availabilityRegions: text("availability_regions").array().notNull(),
    pricingMode: productPricingModeEnum("pricing_mode").notNull(),
    commercialRelationship: productCommercialRelationshipEnum(
      "commercial_relationship",
    ).notNull(),
    commercialDisclosure: text("commercial_disclosure"),
    publicVisibility: boolean("public_visibility").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (observation) => [
    unique().on(observation.productProfileId, observation.observedAt),
    index("product_observations_profile_time_idx").on(
      observation.productProfileId,
      observation.observedAt,
    ),
    check(
      "product_observations_regions_nonempty",
      sql`cardinality(${observation.availabilityRegions}) > 0`,
    ),
    check(
      "product_observations_disclosure_required",
      sql`${observation.commercialRelationship} = 'none_disclosed' or ${observation.commercialDisclosure} is not null`,
    ),
  ],
);

export const productVendorReportedMetrics = pgTable(
  "product_vendor_reported_metrics",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    publicId: text("public_id").notNull().unique(),
    productObservationId: uuid("product_observation_id")
      .notNull()
      .references(() => productObservations.id, { onDelete: "restrict" }),
    metric: productVendorMetricEnum("metric").notNull(),
    value: numeric("value", { precision: 24, scale: 4 }).notNull(),
    unit: text("unit").notNull(),
    periodEndedAt: timestamp("period_ended_at", {
      withTimezone: true,
    }).notNull(),
    publicVisibility: boolean("public_visibility").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (metric) => [
    index("product_vendor_metrics_observation_idx").on(
      metric.productObservationId,
    ),
    check("product_vendor_metrics_nonnegative", sql`${metric.value} >= 0`),
  ],
);
