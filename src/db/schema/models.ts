import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { entities, entityVersions } from "./entities";
import { sourceItems } from "./events";

export const modelLifecycleStatusEnum = pgEnum("model_lifecycle_status", [
  "active",
  "deprecated",
  "retired",
]);
export const modelModalityEnum = pgEnum("model_modality", [
  "text",
  "image",
  "audio",
  "video",
]);
export const modelAccessMethodEnum = pgEnum("model_access_method", [
  "hosted_api",
  "open_weights",
  "self_hosted",
]);
export const priceCategoryEnum = pgEnum("price_category", [
  "input_tokens",
  "output_tokens",
  "cached_input_tokens",
  "cached_output_tokens",
  "batch_input_tokens",
  "batch_output_tokens",
  "image",
  "audio",
  "video",
]);
export const priceUnitEnum = pgEnum("price_unit", [
  "per_million_tokens",
  "per_image",
  "per_minute",
  "per_second",
]);
export const taxPolicyEnum = pgEnum("tax_policy", [
  "inclusive",
  "exclusive",
  "unknown",
]);
export const benchmarkProvenanceEnum = pgEnum("benchmark_provenance", [
  "independent_reproduced",
  "independent_reported",
  "vendor_reported",
  "community_observation",
]);
export const benchmarkReproducibilityEnum = pgEnum(
  "benchmark_reproducibility",
  ["reproduced", "reproducible", "reported_only"],
);

export const modelVersionProfiles = pgTable(
  "model_version_profiles",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    entityVersionId: uuid("entity_version_id")
      .notNull()
      .references(() => entityVersions.id, { onDelete: "restrict" }),
    providerEntityId: uuid("provider_entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "restrict" }),
    lifecycleStatus: modelLifecycleStatusEnum("lifecycle_status").notNull(),
    inputModalities: modelModalityEnum("input_modalities").array().notNull(),
    outputModalities: modelModalityEnum("output_modalities").array().notNull(),
    contextWindowTokens: integer("context_window_tokens").notNull(),
    accessMethods: modelAccessMethodEnum("access_methods").array().notNull(),
    regions: text("regions").array().notNull(),
    publicVisibility: boolean("public_visibility").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (profile) => [
    unique().on(profile.entityVersionId),
    index("model_version_profiles_provider_idx").on(profile.providerEntityId),
    check(
      "model_version_profiles_context_positive",
      sql`${profile.contextWindowTokens} > 0`,
    ),
    check(
      "model_version_profiles_modalities_nonempty",
      sql`cardinality(${profile.inputModalities}) > 0 and cardinality(${profile.outputModalities}) > 0`,
    ),
    check(
      "model_version_profiles_access_regions_nonempty",
      sql`cardinality(${profile.accessMethods}) > 0 and cardinality(${profile.regions}) > 0`,
    ),
  ],
);

export const priceRecords = pgTable(
  "price_records",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    publicId: text("public_id").notNull().unique(),
    entityVersionId: uuid("entity_version_id")
      .notNull()
      .references(() => entityVersions.id, { onDelete: "restrict" }),
    category: priceCategoryEnum("category").notNull(),
    amount: numeric("amount", { precision: 20, scale: 8 }).notNull(),
    currency: text("currency").notNull(),
    unit: priceUnitEnum("unit").notNull(),
    region: text("region").notNull(),
    taxPolicy: taxPolicyEnum("tax_policy").notNull(),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
    validTo: timestamp("valid_to", { withTimezone: true }),
    sourceItemId: uuid("source_item_id")
      .notNull()
      .references(() => sourceItems.id, { onDelete: "restrict" }),
    lastVerifiedAt: timestamp("last_verified_at", {
      withTimezone: true,
    }).notNull(),
    publicVisibility: boolean("public_visibility").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (price) => [
    index("price_records_version_validity_idx").on(
      price.entityVersionId,
      price.validFrom,
      price.validTo,
    ),
    check("price_records_amount_nonnegative", sql`${price.amount} >= 0`),
    check(
      "price_records_validity_order",
      sql`${price.validTo} is null or ${price.validTo} >= ${price.validFrom}`,
    ),
  ],
);

export const benchmarkRuns = pgTable(
  "benchmark_runs",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    publicId: text("public_id").notNull().unique(),
    entityVersionId: uuid("entity_version_id")
      .notNull()
      .references(() => entityVersions.id, { onDelete: "restrict" }),
    benchmarkEntityId: uuid("benchmark_entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "restrict" }),
    benchmarkVersion: text("benchmark_version").notNull(),
    task: text("task").notNull(),
    score: numeric("score", { precision: 20, scale: 8 }).notNull(),
    unit: text("unit").notNull(),
    higherIsBetter: boolean("higher_is_better").notNull(),
    settings: jsonb("settings").notNull(),
    evaluatorEntityId: uuid("evaluator_entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "restrict" }),
    provenance: benchmarkProvenanceEnum("provenance").notNull(),
    runAt: timestamp("run_at", { withTimezone: true }).notNull(),
    evidenceSourceItemId: uuid("evidence_source_item_id")
      .notNull()
      .references(() => sourceItems.id, { onDelete: "restrict" }),
    reproducibility: benchmarkReproducibilityEnum("reproducibility").notNull(),
    confidence: integer("confidence").notNull(),
    lastVerifiedAt: timestamp("last_verified_at", {
      withTimezone: true,
    }).notNull(),
    publicVisibility: boolean("public_visibility").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (run) => [
    index("benchmark_runs_version_task_idx").on(
      run.entityVersionId,
      run.task,
      run.benchmarkVersion,
    ),
    check(
      "benchmark_runs_confidence_range",
      sql`${run.confidence} between 0 and 100`,
    ),
  ],
);
