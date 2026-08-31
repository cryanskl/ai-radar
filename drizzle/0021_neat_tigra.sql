CREATE TYPE "public"."historical_backfill_candidate_kind" AS ENUM('entity', 'event', 'relation', 'unresolved');--> statement-breakpoint
CREATE TYPE "public"."historical_backfill_candidate_status" AS ENUM('imported', 'failed', 'unresolved');--> statement-breakpoint
CREATE TYPE "public"."historical_backfill_status" AS ENUM('running', 'completed', 'completed_with_issues', 'failed');--> statement-breakpoint
CREATE TABLE "historical_backfill_batches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"theme_slug" text NOT NULL,
	"version" text NOT NULL,
	"name_en" text NOT NULL,
	"name_zh" text NOT NULL,
	"timeline_start" timestamp with time zone NOT NULL,
	"coverage_end" timestamp with time zone NOT NULL,
	"prehistory_policy" text NOT NULL,
	"input_sha256" text NOT NULL,
	"input" jsonb NOT NULL,
	"status" "historical_backfill_status" NOT NULL,
	"quality_report" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "historical_backfill_batches_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "historical_backfill_batches_theme_slug_version_unique" UNIQUE("theme_slug","version"),
	CONSTRAINT "historical_backfill_coverage_order" CHECK ("historical_backfill_batches"."coverage_end" >= "historical_backfill_batches"."timeline_start"),
	CONSTRAINT "historical_backfill_prehistory_policy" CHECK ("historical_backfill_batches"."prehistory_policy" = 'curated_prehistory')
);
--> statement-breakpoint
CREATE TABLE "historical_backfill_candidates" (
	"batch_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"public_id" text NOT NULL,
	"kind" "historical_backfill_candidate_kind" NOT NULL,
	"status" "historical_backfill_candidate_status" NOT NULL,
	"target_public_id" text,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "historical_backfill_candidates_batch_id_public_id_pk" PRIMARY KEY("batch_id","public_id"),
	CONSTRAINT "historical_backfill_candidates_batch_id_ordinal_unique" UNIQUE("batch_id","ordinal")
);
--> statement-breakpoint
ALTER TABLE "historical_backfill_candidates" ADD CONSTRAINT "historical_backfill_candidates_batch_id_historical_backfill_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."historical_backfill_batches"("id") ON DELETE restrict ON UPDATE no action;