import { randomUUID } from "node:crypto";
import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { events, rightsStatusEnum, sourceItems, sources } from "./events";

export const ingestRunStatusEnum = pgEnum("ingest_run_status", [
  "running",
  "succeeded",
  "retryable_failure",
]);
export const ingestErrorKindEnum = pgEnum("ingest_error_kind", [
  "cursor_gap",
  "network",
  "rate_limit",
  "authentication",
  "parsing",
]);
export const sourceHealthStatusEnum = pgEnum("source_health_status", [
  "pending",
  "healthy",
  "degraded",
]);
export const inboxStatusEnum = pgEnum("inbox_status", ["new", "converted"]);
export const parseStatusEnum = pgEnum("parse_status", ["parsed"]);

export const sourcePolicies = pgTable("source_policies", {
  sourceId: uuid("source_id")
    .primaryKey()
    .references(() => sources.id, { onDelete: "cascade" }),
  adapterKey: text("adapter_key").notNull(),
  query: text("query").notNull(),
  minRequestIntervalMs: integer("min_request_interval_ms").notNull(),
  maxItemsPerRun: integer("max_items_per_run").notNull(),
  requestTimeoutMs: integer("request_timeout_ms").notNull(),
  userAgent: text("user_agent").notNull(),
  retainRawPayload: boolean("retain_raw_payload").notNull(),
  defaultRightsStatus: rightsStatusEnum("default_rights_status").notNull(),
  defaultAttribution: text("default_attribution").notNull(),
  defaultLicenseUrl: text("default_license_url"),
  termsUrl: text("terms_url").notNull(),
  policyEvidenceVersion: text("policy_evidence_version").notNull(),
  allowedFields: text("allowed_fields").array().notNull(),
  prohibitedFields: text("prohibited_fields").array().notNull(),
  publicDisplayScope: text("public_display_scope").notNull(),
  exportScope: text("export_scope").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sourceCursors = pgTable("source_cursors", {
  sourceId: uuid("source_id")
    .primaryKey()
    .references(() => sources.id, { onDelete: "cascade" }),
  cursorValue: text("cursor_value"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const ingestRuns = pgTable("ingest_runs", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  publicId: text("public_id").notNull().unique(),
  sourceId: uuid("source_id")
    .notNull()
    .references(() => sources.id, { onDelete: "restrict" }),
  status: ingestRunStatusEnum("status").notNull(),
  cursorBefore: text("cursor_before"),
  cursorAfter: text("cursor_after"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  fetchedCount: integer("fetched_count").notNull().default(0),
  createdCount: integer("created_count").notNull().default(0),
  responseContentHash: text("response_content_hash"),
  errorKind: ingestErrorKindEnum("error_kind"),
  errorMessage: text("error_message"),
  retryAfterAt: timestamp("retry_after_at", { withTimezone: true }),
});

export const sourceHealth = pgTable("source_health", {
  sourceId: uuid("source_id")
    .primaryKey()
    .references(() => sources.id, { onDelete: "cascade" }),
  status: sourceHealthStatusEnum("status").notNull().default("pending"),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastItemAt: timestamp("last_item_at", { withTimezone: true }),
  lagSeconds: integer("lag_seconds"),
  consecutiveErrorCount: integer("consecutive_error_count")
    .notNull()
    .default(0),
  lastErrorKind: ingestErrorKindEnum("last_error_kind"),
  lastErrorMessage: text("last_error_message"),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const inboxItems = pgTable("inbox_items", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  sourceItemId: uuid("source_item_id")
    .notNull()
    .unique()
    .references(() => sourceItems.id, { onDelete: "cascade" }),
  status: inboxStatusEnum("status").notNull().default("new"),
  parseStatus: parseStatusEnum("parse_status").notNull(),
  eventId: uuid("event_id").references(() => events.id, {
    onDelete: "restrict",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const arxivSourceItemMetadata = pgTable("arxiv_source_item_metadata", {
  sourceItemId: uuid("source_item_id")
    .primaryKey()
    .references(() => sourceItems.id, { onDelete: "cascade" }),
  authors: jsonb("authors").$type<Array<{ name: string }>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const githubLicenseStatusEnum = pgEnum("github_license_status", [
  "detected",
  "missing",
]);

export const githubRepositoryLifecycleEnum = pgEnum(
  "github_repository_lifecycle",
  ["active", "archived", "mirrored", "unavailable"],
);

export const githubSourceItemMetadata = pgTable(
  "github_source_item_metadata",
  {
    sourceItemId: uuid("source_item_id")
      .primaryKey()
      .references(() => sourceItems.id, { onDelete: "cascade" }),
    githubRepositoryId: bigint("github_repository_id", {
      mode: "number",
    }).notNull(),
    githubOwnerId: bigint("github_owner_id", { mode: "number" }).notNull(),
    ownerLogin: text("owner_login").notNull(),
    name: text("name").notNull(),
    fullName: text("full_name").notNull(),
    url: text("url").notNull(),
    description: text("description"),
    topics: text("topics").array().notNull(),
    primaryLanguage: text("primary_language"),
    languages: jsonb("languages")
      .$type<Array<{ name: string; bytes: number }>>()
      .notNull(),
    licenseStatus: githubLicenseStatusEnum("license_status").notNull(),
    licenseSpdxId: text("license_spdx_id"),
    licenseName: text("license_name"),
    stars: integer("stars").notNull(),
    forks: integer("forks").notNull(),
    openIssues: integer("open_issues").notNull(),
    subscribers: integer("subscribers").notNull(),
    lifecycleState: githubRepositoryLifecycleEnum("lifecycle_state").notNull(),
    fork: boolean("fork").notNull(),
    mirrorUrl: text("mirror_url"),
    template: boolean("template").notNull(),
    parentRepository: jsonb("parent_repository").$type<{
      githubRepositoryId: number;
      fullName: string;
      url: string;
    }>(),
    sourceRepository: jsonb("source_repository").$type<{
      githubRepositoryId: number;
      fullName: string;
      url: string;
    }>(),
    templateRepository: jsonb("template_repository").$type<{
      githubRepositoryId: number;
      fullName: string;
      url: string;
    }>(),
    repositoryCreatedAt: timestamp("repository_created_at", {
      withTimezone: true,
    }).notNull(),
    repositoryUpdatedAt: timestamp("repository_updated_at", {
      withTimezone: true,
    }).notNull(),
    pushedAt: timestamp("pushed_at", { withTimezone: true }),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    releases: jsonb("releases")
      .$type<
        Array<{
          githubReleaseId: number;
          tagName: string;
          name: string | null;
          url: string;
          prerelease: boolean;
          createdAt: string;
          publishedAt: string | null;
        }>
      >()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (metadata) => [unique().on(metadata.githubRepositoryId, metadata.observedAt)],
);
