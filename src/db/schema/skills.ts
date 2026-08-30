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

export const skillInstallationMethodEnum = pgEnum("skill_installation_method", [
  "manual",
  "package_manager",
  "marketplace",
  "repository",
]);

export const skillMaintenanceStatusEnum = pgEnum("skill_maintenance_status", [
  "maintained",
  "limited",
  "unmaintained",
  "archived",
]);

export const skillSecurityReviewStatusEnum = pgEnum(
  "skill_security_review_status",
  ["not_reviewed", "metadata_reviewed", "manual_reviewed", "issues_found"],
);

export const skillProfiles = pgTable(
  "skill_profiles",
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
    task: text("task").notNull(),
    rightsStatus: rightsStatusEnum("rights_status").notNull(),
    officialInstallationUrl: text("official_installation_url").notNull(),
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
      "skill_profiles_public_rights",
      sql`${profile.rightsStatus} in ('open', 'attribution_required', 'source_license', 'metadata_only', 'link_only')`,
    ),
  ],
);

export const skillVersionProfiles = pgTable(
  "skill_version_profiles",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    skillProfileId: uuid("skill_profile_id")
      .notNull()
      .references(() => skillProfiles.id, { onDelete: "restrict" }),
    entityVersionId: uuid("entity_version_id")
      .notNull()
      .unique()
      .references(() => entityVersions.id, { onDelete: "restrict" }),
    sourceItemId: uuid("source_item_id")
      .notNull()
      .references(() => sourceItems.id, { onDelete: "restrict" }),
    authorName: text("author_name").notNull(),
    authorUrl: text("author_url"),
    documentationRightsStatus: rightsStatusEnum(
      "documentation_rights_status",
    ).notNull(),
    documentationLicenseName: text("documentation_license_name").notNull(),
    documentationLicenseUrl: text("documentation_license_url").notNull(),
    repositoryRightsStatus: rightsStatusEnum(
      "repository_rights_status",
    ).notNull(),
    repositoryLicenseName: text("repository_license_name").notNull(),
    repositoryLicenseUrl: text("repository_license_url").notNull(),
    supportedPlatforms: text("supported_platforms").array().notNull(),
    dependencies: jsonb("dependencies").notNull(),
    permissions: jsonb("permissions").notNull(),
    externalApis: jsonb("external_apis").notNull(),
    installationMethod: skillInstallationMethodEnum(
      "installation_method",
    ).notNull(),
    maintenanceStatus:
      skillMaintenanceStatusEnum("maintenance_status").notNull(),
    securityReviewStatus: skillSecurityReviewStatusEnum(
      "security_review_status",
    ).notNull(),
    securityChecksPerformed: text("security_checks_performed")
      .array()
      .notNull(),
    securityReviewedAt: timestamp("security_reviewed_at", {
      withTimezone: true,
    }),
    publicVisibility: boolean("public_visibility").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (version) => [
    check(
      "skill_version_profiles_platforms_nonempty",
      sql`cardinality(${version.supportedPlatforms}) > 0`,
    ),
    check(
      "skill_version_profiles_review_evidence",
      sql`(${version.securityReviewStatus} = 'not_reviewed' and cardinality(${version.securityChecksPerformed}) = 0 and ${version.securityReviewedAt} is null) or (${version.securityReviewStatus} <> 'not_reviewed' and cardinality(${version.securityChecksPerformed}) > 0 and ${version.securityReviewedAt} is not null)`,
    ),
    check(
      "skill_version_profiles_public_rights",
      sql`${version.documentationRightsStatus} in ('open', 'attribution_required', 'source_license', 'metadata_only', 'link_only') and ${version.repositoryRightsStatus} in ('open', 'attribution_required', 'source_license', 'metadata_only', 'link_only')`,
    ),
  ],
);

export const skillVersionLocalizedContents = pgTable(
  "skill_version_localized_contents",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    skillVersionProfileId: uuid("skill_version_profile_id")
      .notNull()
      .references(() => skillVersionProfiles.id, { onDelete: "cascade" }),
    locale: localeEnum("locale").notNull(),
    permissionReasons: jsonb("permission_reasons").notNull(),
    externalApiPurposes: jsonb("external_api_purposes").notNull(),
    securityCheckDescriptions: jsonb("security_check_descriptions").notNull(),
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
    unique("skill_version_localization_version_locale_unique").on(
      content.skillVersionProfileId,
      content.locale,
    ),
  ],
);
