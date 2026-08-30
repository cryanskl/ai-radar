CREATE TYPE "public"."inbox_status" AS ENUM('new', 'converted');--> statement-breakpoint
CREATE TYPE "public"."ingest_error_kind" AS ENUM('cursor_gap', 'network', 'rate_limit', 'authentication', 'parsing');--> statement-breakpoint
CREATE TYPE "public"."ingest_run_status" AS ENUM('running', 'succeeded', 'retryable_failure');--> statement-breakpoint
CREATE TYPE "public"."parse_status" AS ENUM('parsed');--> statement-breakpoint
CREATE TYPE "public"."source_health_status" AS ENUM('pending', 'healthy', 'degraded');--> statement-breakpoint
CREATE TABLE "inbox_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source_item_id" uuid NOT NULL,
	"status" "inbox_status" DEFAULT 'new' NOT NULL,
	"parse_status" "parse_status" NOT NULL,
	"event_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inbox_items_source_item_id_unique" UNIQUE("source_item_id")
);
--> statement-breakpoint
CREATE TABLE "ingest_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"source_id" uuid NOT NULL,
	"status" "ingest_run_status" NOT NULL,
	"cursor_before" text,
	"cursor_after" text,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"fetched_count" integer DEFAULT 0 NOT NULL,
	"created_count" integer DEFAULT 0 NOT NULL,
	"response_content_hash" text,
	"error_kind" "ingest_error_kind",
	"error_message" text,
	"retry_after_at" timestamp with time zone,
	CONSTRAINT "ingest_runs_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "source_cursors" (
	"source_id" uuid PRIMARY KEY NOT NULL,
	"cursor_value" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_health" (
	"source_id" uuid PRIMARY KEY NOT NULL,
	"status" "source_health_status" DEFAULT 'pending' NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_item_at" timestamp with time zone,
	"lag_seconds" integer,
	"consecutive_error_count" integer DEFAULT 0 NOT NULL,
	"last_error_kind" "ingest_error_kind",
	"last_error_message" text,
	"next_run_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_policies" (
	"source_id" uuid PRIMARY KEY NOT NULL,
	"adapter_key" text NOT NULL,
	"query" text NOT NULL,
	"min_request_interval_ms" integer NOT NULL,
	"max_items_per_run" integer NOT NULL,
	"request_timeout_ms" integer NOT NULL,
	"user_agent" text NOT NULL,
	"retain_raw_payload" boolean NOT NULL,
	"default_rights_status" "rights_status" NOT NULL,
	"default_attribution" text NOT NULL,
	"default_license_url" text,
	"terms_url" text NOT NULL,
	"policy_evidence_version" text NOT NULL,
	"allowed_fields" text[] NOT NULL,
	"prohibited_fields" text[] NOT NULL,
	"public_display_scope" text NOT NULL,
	"export_scope" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_source_item_id_source_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."source_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingest_runs" ADD CONSTRAINT "ingest_runs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_cursors" ADD CONSTRAINT "source_cursors_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_health" ADD CONSTRAINT "source_health_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_policies" ADD CONSTRAINT "source_policies_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;