import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
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

export const guideProvenanceEnum = pgEnum("guide_provenance", [
  "ai_radar_original",
  "authorized_submission",
  "external_guidance",
]);

export const guideContentModeEnum = pgEnum("guide_content_mode", [
  "full_guide",
  "summary_link",
]);

export const guideStatusEnum = pgEnum("guide_status", ["current", "stale"]);

export const guideProfiles = pgTable(
  "guide_profiles",
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
    provenance: guideProvenanceEnum("provenance").notNull(),
    category: text("category").notNull(),
    rightsStatus: rightsStatusEnum("rights_status").notNull(),
    licenseName: text("license_name"),
    licenseUrl: text("license_url"),
    contentMode: guideContentModeEnum("content_mode").notNull(),
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
      "guide_profiles_license_pair",
      sql`(${profile.licenseName} is null) = (${profile.licenseUrl} is null)`,
    ),
    check(
      "guide_profiles_full_content_rights",
      sql`${profile.contentMode} <> 'full_guide' or (${profile.provenance} <> 'external_guidance' and ${profile.rightsStatus} in ('open', 'attribution_required', 'source_license') and ${profile.licenseName} is not null)`,
    ),
    check(
      "guide_profiles_external_guidance_boundary",
      sql`${profile.provenance} <> 'external_guidance' or (${profile.contentMode} = 'summary_link' and ${profile.rightsStatus} in ('metadata_only', 'link_only'))`,
    ),
  ],
);

export const guideVersionProfiles = pgTable(
  "guide_version_profiles",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    guideProfileId: uuid("guide_profile_id")
      .notNull()
      .references(() => guideProfiles.id, { onDelete: "restrict" }),
    entityVersionId: uuid("entity_version_id")
      .notNull()
      .unique()
      .references(() => entityVersions.id, { onDelete: "restrict" }),
    sourceItemId: uuid("source_item_id")
      .notNull()
      .references(() => sourceItems.id, { onDelete: "restrict" }),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull(),
    steps: jsonb("steps").notNull(),
    publicVisibility: boolean("public_visibility").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (version) => [unique().on(version.guideProfileId, version.entityVersionId)],
);

export const guideVersionLocalizedContents = pgTable(
  "guide_version_localized_contents",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    guideVersionProfileId: uuid("guide_version_profile_id")
      .notNull()
      .references(() => guideVersionProfiles.id, { onDelete: "cascade" }),
    locale: localeEnum("locale").notNull(),
    prerequisites: text("prerequisites").array().notNull(),
    stepInstructions: jsonb("step_instructions").notNull(),
    expectedOutcome: text("expected_outcome"),
    limitations: text("limitations").array().notNull(),
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
    unique("guide_version_localization_version_locale_unique").on(
      content.guideVersionProfileId,
      content.locale,
    ),
  ],
);

export const guideStatusObservations = pgTable(
  "guide_status_observations",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    publicId: text("public_id").notNull().unique(),
    guideVersionProfileId: uuid("guide_version_profile_id")
      .notNull()
      .references(() => guideVersionProfiles.id, { onDelete: "restrict" }),
    sourceItemId: uuid("source_item_id")
      .notNull()
      .references(() => sourceItems.id, { onDelete: "restrict" }),
    status: guideStatusEnum("status").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    publicVisibility: boolean("public_visibility").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (observation) => [
    unique().on(observation.guideVersionProfileId, observation.observedAt),
  ],
);

export const guideStatusLocalizedContents = pgTable(
  "guide_status_localized_contents",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    guideStatusObservationId: uuid("guide_status_observation_id")
      .notNull()
      .references(() => guideStatusObservations.id, { onDelete: "cascade" }),
    locale: localeEnum("locale").notNull(),
    staleReason: text("stale_reason").notNull(),
    authorship: localizationAuthorshipEnum("authorship").notNull(),
    reviewStatus: reviewStatusEnum("review_status").notNull(),
    publicVisibility: boolean("public_visibility").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (content) => [
    unique("guide_status_localization_observation_locale_unique").on(
      content.guideStatusObservationId,
      content.locale,
    ),
  ],
);
