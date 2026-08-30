import { randomUUID } from "node:crypto";
import {
  bigint,
  boolean,
  index,
  pgTable,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { entities } from "./entities";
import { sourceItems } from "./events";

export const repositoryIdentities = pgTable("repository_identities", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  entityId: uuid("entity_id")
    .notNull()
    .unique()
    .references(() => entities.id, { onDelete: "restrict" }),
  githubRepositoryId: bigint("github_repository_id", { mode: "number" })
    .notNull()
    .unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const repositoryObservations = pgTable(
  "repository_observations",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    repositoryIdentityId: uuid("repository_identity_id")
      .notNull()
      .references(() => repositoryIdentities.id, { onDelete: "restrict" }),
    metadataSourceItemId: uuid("metadata_source_item_id")
      .notNull()
      .references(() => sourceItems.id, { onDelete: "restrict" }),
    publicVisibility: boolean("public_visibility").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (observation) => [
    unique().on(observation.metadataSourceItemId),
    index("repository_observations_identity_idx").on(
      observation.repositoryIdentityId,
    ),
  ],
);
