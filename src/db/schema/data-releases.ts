import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const dataReleaseMirrorProviderEnum = pgEnum(
  "data_release_mirror_provider",
  ["feishu", "baidu"],
);

export const dataReleaseFileNameEnum = pgEnum("data_release_file_name", [
  "schema.json",
  "records.json",
  "corrections.json",
  "tombstones.json",
  "manifest.json",
]);

export const dataReleases = pgTable("data_releases", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  publicId: text("public_id").notNull().unique(),
  dataVersion: text("data_version").notNull().unique(),
  schemaVersion: text("schema_version").notNull(),
  dataCutoff: timestamp("data_cutoff", { withTimezone: true }).notNull(),
  canonicalUrl: text("canonical_url").notNull(),
  manifestSha256: text("manifest_sha256").notNull(),
  license: text("license").notNull(),
  attribution: text("attribution").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const dataReleaseFiles = pgTable(
  "data_release_files",
  {
    releaseId: uuid("release_id")
      .notNull()
      .references(() => dataReleases.id, { onDelete: "restrict" }),
    name: dataReleaseFileNameEnum("name").notNull(),
    mediaType: text("media_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    recordCount: integer("record_count"),
    checksumSha256: text("checksum_sha256").notNull(),
    content: text("content").notNull(),
  },
  (file) => [primaryKey({ columns: [file.releaseId, file.name] })],
);

export const dataReleasePublications = pgTable(
  "data_release_publications",
  {
    releaseId: uuid("release_id")
      .primaryKey()
      .references(() => dataReleases.id, { onDelete: "restrict" }),
    canonicalVerifiedAt: timestamp("canonical_verified_at", {
      withTimezone: true,
    }).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
  },
  (publication) => [
    index("data_release_publications_published_at_idx").on(
      publication.publishedAt,
    ),
    check(
      "data_release_publication_verification_order",
      sql`${publication.publishedAt} >= ${publication.canonicalVerifiedAt}`,
    ),
  ],
);

export const dataReleaseMirrors = pgTable("data_release_mirrors", {
  releaseId: uuid("release_id")
    .primaryKey()
    .references(() => dataReleasePublications.releaseId, {
      onDelete: "restrict",
    }),
  provider: dataReleaseMirrorProviderEnum("provider").notNull(),
  url: text("url").notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(),
});
