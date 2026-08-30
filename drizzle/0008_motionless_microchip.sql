CREATE TYPE "public"."benchmark_provenance" AS ENUM('independent_reproduced', 'independent_reported', 'vendor_reported', 'community_observation');--> statement-breakpoint
CREATE TYPE "public"."benchmark_reproducibility" AS ENUM('reproduced', 'reproducible', 'reported_only');--> statement-breakpoint
CREATE TYPE "public"."model_access_method" AS ENUM('hosted_api', 'open_weights', 'self_hosted');--> statement-breakpoint
CREATE TYPE "public"."model_lifecycle_status" AS ENUM('active', 'deprecated', 'retired');--> statement-breakpoint
CREATE TYPE "public"."model_modality" AS ENUM('text', 'image', 'audio', 'video');--> statement-breakpoint
CREATE TYPE "public"."price_category" AS ENUM('input_tokens', 'output_tokens', 'cached_input_tokens', 'cached_output_tokens', 'batch_input_tokens', 'batch_output_tokens', 'image', 'audio', 'video');--> statement-breakpoint
CREATE TYPE "public"."price_unit" AS ENUM('per_million_tokens', 'per_image', 'per_minute', 'per_second');--> statement-breakpoint
CREATE TYPE "public"."tax_policy" AS ENUM('inclusive', 'exclusive', 'unknown');--> statement-breakpoint
CREATE TABLE "benchmark_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"entity_version_id" uuid NOT NULL,
	"benchmark_entity_id" uuid NOT NULL,
	"benchmark_version" text NOT NULL,
	"task" text NOT NULL,
	"score" numeric(20, 8) NOT NULL,
	"unit" text NOT NULL,
	"higher_is_better" boolean NOT NULL,
	"settings" jsonb NOT NULL,
	"evaluator_entity_id" uuid NOT NULL,
	"provenance" "benchmark_provenance" NOT NULL,
	"run_at" timestamp with time zone NOT NULL,
	"evidence_source_item_id" uuid NOT NULL,
	"reproducibility" "benchmark_reproducibility" NOT NULL,
	"confidence" integer NOT NULL,
	"last_verified_at" timestamp with time zone NOT NULL,
	"public_visibility" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "benchmark_runs_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "benchmark_runs_confidence_range" CHECK ("benchmark_runs"."confidence" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "model_version_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entity_version_id" uuid NOT NULL,
	"provider_entity_id" uuid NOT NULL,
	"lifecycle_status" "model_lifecycle_status" NOT NULL,
	"input_modalities" "model_modality"[] NOT NULL,
	"output_modalities" "model_modality"[] NOT NULL,
	"context_window_tokens" integer NOT NULL,
	"access_methods" "model_access_method"[] NOT NULL,
	"regions" text[] NOT NULL,
	"public_visibility" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "model_version_profiles_entity_version_id_unique" UNIQUE("entity_version_id"),
	CONSTRAINT "model_version_profiles_context_positive" CHECK ("model_version_profiles"."context_window_tokens" > 0),
	CONSTRAINT "model_version_profiles_modalities_nonempty" CHECK (cardinality("model_version_profiles"."input_modalities") > 0 and cardinality("model_version_profiles"."output_modalities") > 0),
	CONSTRAINT "model_version_profiles_access_regions_nonempty" CHECK (cardinality("model_version_profiles"."access_methods") > 0 and cardinality("model_version_profiles"."regions") > 0)
);
--> statement-breakpoint
CREATE TABLE "price_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"entity_version_id" uuid NOT NULL,
	"category" "price_category" NOT NULL,
	"amount" numeric(20, 8) NOT NULL,
	"currency" text NOT NULL,
	"unit" "price_unit" NOT NULL,
	"region" text NOT NULL,
	"tax_policy" "tax_policy" NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_to" timestamp with time zone,
	"source_item_id" uuid NOT NULL,
	"last_verified_at" timestamp with time zone NOT NULL,
	"public_visibility" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_records_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "price_records_amount_nonnegative" CHECK ("price_records"."amount" >= 0),
	CONSTRAINT "price_records_validity_order" CHECK ("price_records"."valid_to" is null or "price_records"."valid_to" >= "price_records"."valid_from")
);
--> statement-breakpoint
ALTER TABLE "benchmark_runs" ADD CONSTRAINT "benchmark_runs_entity_version_id_entity_versions_id_fk" FOREIGN KEY ("entity_version_id") REFERENCES "public"."entity_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_runs" ADD CONSTRAINT "benchmark_runs_benchmark_entity_id_entities_id_fk" FOREIGN KEY ("benchmark_entity_id") REFERENCES "public"."entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_runs" ADD CONSTRAINT "benchmark_runs_evaluator_entity_id_entities_id_fk" FOREIGN KEY ("evaluator_entity_id") REFERENCES "public"."entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_runs" ADD CONSTRAINT "benchmark_runs_evidence_source_item_id_source_items_id_fk" FOREIGN KEY ("evidence_source_item_id") REFERENCES "public"."source_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_version_profiles" ADD CONSTRAINT "model_version_profiles_entity_version_id_entity_versions_id_fk" FOREIGN KEY ("entity_version_id") REFERENCES "public"."entity_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_version_profiles" ADD CONSTRAINT "model_version_profiles_provider_entity_id_entities_id_fk" FOREIGN KEY ("provider_entity_id") REFERENCES "public"."entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_records" ADD CONSTRAINT "price_records_entity_version_id_entity_versions_id_fk" FOREIGN KEY ("entity_version_id") REFERENCES "public"."entity_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_records" ADD CONSTRAINT "price_records_source_item_id_source_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."source_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "benchmark_runs_version_task_idx" ON "benchmark_runs" USING btree ("entity_version_id","task","benchmark_version");--> statement-breakpoint
CREATE INDEX "model_version_profiles_provider_idx" ON "model_version_profiles" USING btree ("provider_entity_id");--> statement-breakpoint
CREATE INDEX "price_records_version_validity_idx" ON "price_records" USING btree ("entity_version_id","valid_from","valid_to");