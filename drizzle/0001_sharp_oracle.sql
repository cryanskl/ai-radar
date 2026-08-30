CREATE TYPE "public"."acquisition_method" AS ENUM('manual', 'rss', 'api', 'web');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('announces', 'updates', 'changes_price_of', 'deprecates');--> statement-breakpoint
CREATE TYPE "public"."fact_status" AS ENUM('rumored', 'confirmed', 'corrected', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."content_locale" AS ENUM('en', 'zh');--> statement-breakpoint
CREATE TYPE "public"."localization_authorship" AS ENUM('human_authored', 'ai_translated', 'official_translation');--> statement-breakpoint
CREATE TYPE "public"."publication_state" AS ENUM('candidate', 'verifying', 'ready', 'published', 'updating', 'corrected', 'merged', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('draft', 'reviewed');--> statement-breakpoint
CREATE TYPE "public"."rights_status" AS ENUM('open', 'attribution_required', 'source_license', 'metadata_only', 'link_only', 'permission_required', 'internal_only', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."source_access_status" AS ENUM('approved', 'approved_limited', 'permission_pending', 'blocked', 'retired');--> statement-breakpoint
CREATE TYPE "public"."source_tier" AS ENUM('S', 'A', 'B', 'C');--> statement-breakpoint
CREATE TYPE "public"."time_precision" AS ENUM('day', 'minute', 'second');--> statement-breakpoint
CREATE TABLE "event_publication_audits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"action" text NOT NULL,
	"actor_role" text NOT NULL,
	"from_state" "publication_state" NOT NULL,
	"to_state" "publication_state" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_sources" (
	"event_id" uuid NOT NULL,
	"source_item_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	CONSTRAINT "event_sources_event_id_source_item_id_pk" PRIMARY KEY("event_id","source_item_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"event_type" "event_type" NOT NULL,
	"fact_status" "fact_status" NOT NULL,
	"publication_state" "publication_state" DEFAULT 'ready' NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"occurred_at_precision" time_precision NOT NULL,
	"discovered_at" timestamp with time zone NOT NULL,
	"last_verified_at" timestamp with time zone NOT NULL,
	"rights_status" "rights_status" NOT NULL,
	"public_visibility" boolean DEFAULT false NOT NULL,
	"first_published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "localized_contents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"locale" "content_locale" NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"authorship" "localization_authorship" NOT NULL,
	"review_status" "review_status" NOT NULL,
	"public_visibility" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "localized_contents_event_id_locale_unique" UNIQUE("event_id","locale")
);
--> statement-breakpoint
CREATE TABLE "source_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"source_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"original_url" text NOT NULL,
	"canonical_url" text NOT NULL,
	"original_title" text NOT NULL,
	"original_language" "content_locale" NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"published_at_precision" time_precision NOT NULL,
	"discovered_at" timestamp with time zone NOT NULL,
	"rights_status" "rights_status" NOT NULL,
	"rights_checked_at" timestamp with time zone NOT NULL,
	"attribution" text NOT NULL,
	"license_url" text,
	"public_visibility" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_items_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "source_items_source_id_external_id_unique" UNIQUE("source_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"name" text NOT NULL,
	"homepage_url" text NOT NULL,
	"tier" "source_tier" NOT NULL,
	"access_status" "source_access_status" NOT NULL,
	"acquisition_method" "acquisition_method" NOT NULL,
	"policy_last_reviewed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sources_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "event_publication_audits" ADD CONSTRAINT "event_publication_audits_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_sources" ADD CONSTRAINT "event_sources_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_sources" ADD CONSTRAINT "event_sources_source_item_id_source_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."source_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "localized_contents" ADD CONSTRAINT "localized_contents_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_items" ADD CONSTRAINT "source_items_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;