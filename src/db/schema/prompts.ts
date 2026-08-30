import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { entities, entityVersions } from "./entities";
import {
  localeEnum,
  localizationAuthorshipEnum,
  reviewStatusEnum,
  rightsStatusEnum,
  sourceItems,
} from "./events";

export const promptProvenanceEnum = pgEnum("prompt_provenance", [
  "ai_radar_original",
  "authorized_submission",
  "open_licensed",
  "written_permission",
  "external_link",
]);

export const promptValidationStatusEnum = pgEnum("prompt_validation_status", [
  "current",
  "stale",
  "unvalidated",
]);

export const promptProfiles = pgTable(
  "prompt_profiles",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    entityId: uuid("entity_id")
      .notNull()
      .unique()
      .references(() => entities.id, { onDelete: "restrict" }),
    sourceItemId: uuid("source_item_id")
      .notNull()
      .references(() => sourceItems.id, { onDelete: "restrict" }),
    authorName: text("author_name").notNull(),
    authorUrl: text("author_url"),
    provenance: promptProvenanceEnum("provenance").notNull(),
    task: text("task").notNull(),
    inputTypes: text("input_types").array().notNull(),
    rightsStatus: rightsStatusEnum("rights_status").notNull(),
    licenseName: text("license_name"),
    licenseUrl: text("license_url"),
    fullText: text("full_text"),
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
      "prompt_profiles_dimensions_nonempty",
      sql`cardinality(${profile.inputTypes}) > 0`,
    ),
    check(
      "prompt_profiles_license_pair",
      sql`(${profile.licenseName} is null) = (${profile.licenseUrl} is null)`,
    ),
    check(
      "prompt_profiles_full_text_rights",
      sql`${profile.fullText} is null or (${profile.provenance} <> 'external_link' and ${profile.rightsStatus} in ('open', 'attribution_required', 'source_license') and ${profile.licenseName} is not null)`,
    ),
    check(
      "prompt_profiles_external_link_rights",
      sql`${profile.provenance} <> 'external_link' or (${profile.rightsStatus} in ('metadata_only', 'link_only') and ${profile.fullText} is null)`,
    ),
  ],
);

export const promptLocalizedContents = pgTable(
  "prompt_localized_contents",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    promptProfileId: uuid("prompt_profile_id")
      .notNull()
      .references(() => promptProfiles.id, { onDelete: "cascade" }),
    locale: localeEnum("locale").notNull(),
    purpose: text("purpose").notNull(),
    variables: jsonb("variables").notNull(),
    inputExample: text("input_example").notNull(),
    expectedOutputExample: text("expected_output_example").notNull(),
    knownLimitations: text("known_limitations").array().notNull(),
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
  (content) => [
    unique().on(content.promptProfileId, content.locale),
    check(
      "prompt_localized_contents_limitations_nonempty",
      sql`cardinality(${content.knownLimitations}) > 0`,
    ),
  ],
);

export const promptCompatibilities = pgTable(
  "prompt_compatibilities",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    publicId: text("public_id").notNull().unique(),
    promptProfileId: uuid("prompt_profile_id")
      .notNull()
      .references(() => promptProfiles.id, { onDelete: "restrict" }),
    targetEntityId: uuid("target_entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "restrict" }),
    targetVersionId: uuid("target_version_id").references(
      () => entityVersions.id,
      { onDelete: "restrict" },
    ),
    verifiedVersion: text("verified_version").notNull(),
    publicVisibility: boolean("public_visibility").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (compatibility) => [
    unique().on(
      compatibility.promptProfileId,
      compatibility.targetEntityId,
      compatibility.verifiedVersion,
    ),
    index("prompt_compatibilities_profile_idx").on(
      compatibility.promptProfileId,
    ),
    index("prompt_compatibilities_target_idx").on(compatibility.targetEntityId),
  ],
);

export const promptValidationObservations = pgTable(
  "prompt_validation_observations",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    publicId: text("public_id").notNull().unique(),
    compatibilityId: uuid("compatibility_id")
      .notNull()
      .references(() => promptCompatibilities.id, { onDelete: "restrict" }),
    sourceItemId: uuid("source_item_id")
      .notNull()
      .references(() => sourceItems.id, { onDelete: "restrict" }),
    status: promptValidationStatusEnum("status").notNull(),
    validatedAt: timestamp("validated_at", { withTimezone: true }).notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    publicVisibility: boolean("public_visibility").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (observation) => [
    unique().on(observation.compatibilityId, observation.observedAt),
    index("prompt_validation_compatibility_time_idx").on(
      observation.compatibilityId,
      observation.observedAt,
    ),
  ],
);

export const promptValidationLocalizedContents = pgTable(
  "prompt_validation_localized_contents",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    validationObservationId: uuid("validation_observation_id")
      .notNull()
      .references(() => promptValidationObservations.id, {
        onDelete: "cascade",
      }),
    locale: localeEnum("locale").notNull(),
    staleReason: text("stale_reason").notNull(),
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
  (content) => [
    unique("prompt_validation_localization_observation_locale_unique").on(
      content.validationObservationId,
      content.locale,
    ),
  ],
);
