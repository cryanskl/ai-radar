CREATE TYPE "public"."github_license_status" AS ENUM('detected', 'missing');--> statement-breakpoint
CREATE TYPE "public"."github_repository_lifecycle" AS ENUM('active', 'archived', 'mirrored', 'unavailable');--> statement-breakpoint
CREATE TABLE "github_source_item_metadata" (
	"source_item_id" uuid PRIMARY KEY NOT NULL,
	"github_repository_id" bigint NOT NULL,
	"github_owner_id" bigint NOT NULL,
	"owner_login" text NOT NULL,
	"name" text NOT NULL,
	"full_name" text NOT NULL,
	"url" text NOT NULL,
	"description" text,
	"topics" text[] NOT NULL,
	"primary_language" text,
	"languages" jsonb NOT NULL,
	"license_status" "github_license_status" NOT NULL,
	"license_spdx_id" text,
	"license_name" text,
	"stars" integer NOT NULL,
	"forks" integer NOT NULL,
	"open_issues" integer NOT NULL,
	"subscribers" integer NOT NULL,
	"lifecycle_state" "github_repository_lifecycle" NOT NULL,
	"fork" boolean NOT NULL,
	"mirror_url" text,
	"template" boolean NOT NULL,
	"repository_created_at" timestamp with time zone NOT NULL,
	"repository_updated_at" timestamp with time zone NOT NULL,
	"pushed_at" timestamp with time zone,
	"observed_at" timestamp with time zone NOT NULL,
	"releases" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_source_item_metadata_github_repository_id_observed_at_unique" UNIQUE("github_repository_id","observed_at")
);
--> statement-breakpoint
ALTER TABLE "github_source_item_metadata" ADD CONSTRAINT "github_source_item_metadata_source_item_id_source_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."source_items"("id") ON DELETE cascade ON UPDATE no action;