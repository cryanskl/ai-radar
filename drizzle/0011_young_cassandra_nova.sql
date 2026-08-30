CREATE TABLE "repository_identities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entity_id" uuid NOT NULL,
	"github_repository_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repository_identities_entity_id_unique" UNIQUE("entity_id"),
	CONSTRAINT "repository_identities_github_repository_id_unique" UNIQUE("github_repository_id")
);
--> statement-breakpoint
CREATE TABLE "repository_observations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"repository_identity_id" uuid NOT NULL,
	"metadata_source_item_id" uuid NOT NULL,
	"public_visibility" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repository_observations_metadata_source_item_id_unique" UNIQUE("metadata_source_item_id")
);
--> statement-breakpoint
ALTER TABLE "repository_identities" ADD CONSTRAINT "repository_identities_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_observations" ADD CONSTRAINT "repository_observations_repository_identity_id_repository_identities_id_fk" FOREIGN KEY ("repository_identity_id") REFERENCES "public"."repository_identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_observations" ADD CONSTRAINT "repository_observations_metadata_source_item_id_source_items_id_fk" FOREIGN KEY ("metadata_source_item_id") REFERENCES "public"."source_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "repository_observations_identity_idx" ON "repository_observations" USING btree ("repository_identity_id");