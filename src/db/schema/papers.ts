import { randomUUID } from "node:crypto";
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
import { sql } from "drizzle-orm";
import { entityVersions } from "./entities";
import { entities } from "./entities";
import {
  localeEnum,
  localizationAuthorshipEnum,
  reviewStatusEnum,
  rightsStatusEnum,
  sourceItems,
} from "./events";

export const paperResourceKindEnum = pgEnum("paper_resource_kind", [
  "code",
  "dataset",
  "product",
]);

export const paperIdentities = pgTable("paper_identities", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  entityId: uuid("entity_id")
    .notNull()
    .unique()
    .references(() => entities.id, { onDelete: "restrict" }),
  arxivId: text("arxiv_id").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const paperRevisionProfiles = pgTable(
  "paper_revision_profiles",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    paperIdentityId: uuid("paper_identity_id")
      .notNull()
      .references(() => paperIdentities.id, { onDelete: "restrict" }),
    entityVersionId: uuid("entity_version_id")
      .notNull()
      .references(() => entityVersions.id, { onDelete: "restrict" }),
    metadataSourceItemId: uuid("metadata_source_item_id")
      .notNull()
      .references(() => sourceItems.id, { onDelete: "restrict" }),
    arxivVersion: text("arxiv_version").notNull(),
    title: text("title").notNull(),
    authors: jsonb("authors")
      .$type<Array<{ name: string; institutions: string[] }>>()
      .notNull(),
    topics: text("topics").array().notNull(),
    metadataLicenseUrl: text("metadata_license_url").notNull(),
    fullTextRightsStatus: rightsStatusEnum("full_text_rights_status").notNull(),
    fullTextLicenseUrl: text("full_text_license_url"),
    pdfPackaged: boolean("pdf_packaged").notNull().default(false),
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
    unique().on(profile.paperIdentityId, profile.arxivVersion),
    unique().on(profile.metadataSourceItemId),
    check(
      "paper_revision_profiles_pdf_not_packaged",
      sql`not ${profile.pdfPackaged}`,
    ),
    check(
      "paper_revision_profiles_reusable_full_text_requires_license",
      sql`${profile.fullTextRightsStatus} not in ('open', 'attribution_required', 'source_license') or ${profile.fullTextLicenseUrl} is not null`,
    ),
  ],
);

export const paperRevisionGuidance = pgTable(
  "paper_revision_guidance",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    paperRevisionProfileId: uuid("paper_revision_profile_id")
      .notNull()
      .references(() => paperRevisionProfiles.id, { onDelete: "cascade" }),
    locale: localeEnum("locale").notNull(),
    claimedContributions: text("claimed_contributions").array().notNull(),
    limitations: text("limitations").array().notNull(),
    inference: text("inference").array().notNull(),
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
  (guidance) => [unique().on(guidance.paperRevisionProfileId, guidance.locale)],
);

export const paperResourceLinks = pgTable(
  "paper_resource_links",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    publicId: text("public_id").notNull().unique(),
    paperRevisionProfileId: uuid("paper_revision_profile_id")
      .notNull()
      .references(() => paperRevisionProfiles.id, { onDelete: "cascade" }),
    kind: paperResourceKindEnum("kind").notNull(),
    label: text("label").notNull(),
    url: text("url").notNull(),
    evidenceSourceItemId: uuid("evidence_source_item_id")
      .notNull()
      .references(() => sourceItems.id, { onDelete: "restrict" }),
    publicVisibility: boolean("public_visibility").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (resource) => [
    index("paper_resource_links_profile_kind_visibility_idx").on(
      resource.paperRevisionProfileId,
      resource.kind,
      resource.publicVisibility,
    ),
  ],
);
