CREATE TYPE "public"."daily_brief_section" AS ENUM('key_developments', 'models_research', 'products_open_source', 'prompts_skills_guides');--> statement-breakpoint
CREATE TYPE "public"."daily_brief_state" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."email_delivery_kind" AS ENUM('confirmation', 'daily_brief');--> statement-breakpoint
CREATE TYPE "public"."email_delivery_status" AS ENUM('pending', 'accepted', 'delivered', 'failed', 'bounced');--> statement-breakpoint
CREATE TYPE "public"."email_provider_event_type" AS ENUM('delivered', 'failed', 'bounced');--> statement-breakpoint
CREATE TYPE "public"."email_subscription_state" AS ENUM('pending', 'confirmed', 'unsubscribed');--> statement-breakpoint
CREATE TABLE "daily_brief_items" (
	"brief_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"source_item_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"section" "daily_brief_section" NOT NULL,
	"commentary" text NOT NULL,
	"event_public_id" text NOT NULL,
	"event_title" text NOT NULL,
	"event_summary" text NOT NULL,
	"event_occurred_at" timestamp with time zone NOT NULL,
	"event_href" text NOT NULL,
	"source_title" text,
	"source_url" text,
	CONSTRAINT "daily_brief_items_brief_id_event_id_pk" PRIMARY KEY("brief_id","event_id"),
	CONSTRAINT "daily_brief_item_position_unique" UNIQUE("brief_id","position"),
	CONSTRAINT "daily_brief_item_position_positive" CHECK ("daily_brief_items"."position" > 0),
	CONSTRAINT "daily_brief_item_source_snapshot_complete" CHECK (("daily_brief_items"."source_title" is null and "daily_brief_items"."source_url" is null) or ("daily_brief_items"."source_title" is not null and "daily_brief_items"."source_url" is not null))
);
--> statement-breakpoint
CREATE TABLE "daily_briefs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"edition_public_id" text NOT NULL,
	"locale" "content_locale" NOT NULL,
	"brief_date" date NOT NULL,
	"version" text NOT NULL,
	"data_cutoff" timestamp with time zone NOT NULL,
	"state" "daily_brief_state" DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"overview" text NOT NULL,
	"coverage_note" text NOT NULL,
	"what_to_watch" text NOT NULL,
	"authorship" "localization_authorship" NOT NULL,
	"review_status" "review_status" NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_briefs_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "daily_brief_edition_locale_unique" UNIQUE("edition_public_id","locale"),
	CONSTRAINT "daily_brief_locale_date_version_unique" UNIQUE("locale","brief_date","version"),
	CONSTRAINT "daily_brief_publication_state_valid" CHECK (("daily_briefs"."state" = 'draft' and "daily_briefs"."published_at" is null) or ("daily_briefs"."state" = 'published' and "daily_briefs"."published_at" is not null and "daily_briefs"."review_status" = 'reviewed'))
);
--> statement-breakpoint
CREATE TABLE "email_deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"kind" "email_delivery_kind" NOT NULL,
	"brief_id" uuid,
	"subscription_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_message_id" text,
	"idempotency_key" text NOT NULL,
	"status" "email_delivery_status" DEFAULT 'pending' NOT NULL,
	"failure_reason" text,
	"accepted_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_deliveries_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "email_deliveries_provider_message_id_unique" UNIQUE("provider_message_id"),
	CONSTRAINT "email_deliveries_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "daily_brief_subscription_delivery_unique" UNIQUE("brief_id","subscription_id","kind"),
	CONSTRAINT "email_delivery_kind_reference_valid" CHECK (("email_deliveries"."kind" = 'confirmation' and "email_deliveries"."brief_id" is null) or ("email_deliveries"."kind" = 'daily_brief' and "email_deliveries"."brief_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "email_delivery_events" (
	"provider_event_id" text PRIMARY KEY NOT NULL,
	"delivery_id" uuid NOT NULL,
	"type" "email_provider_event_type" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"locale" "content_locale" NOT NULL,
	"state" "email_subscription_state" DEFAULT 'pending' NOT NULL,
	"consent_version" uuid NOT NULL,
	"consented_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_subscription_identity_unique" UNIQUE("email","locale"),
	CONSTRAINT "email_subscription_state_timestamps_valid" CHECK (("email_subscriptions"."state" = 'pending' and "email_subscriptions"."confirmed_at" is null and "email_subscriptions"."unsubscribed_at" is null) or ("email_subscriptions"."state" = 'confirmed' and "email_subscriptions"."confirmed_at" is not null and "email_subscriptions"."unsubscribed_at" is null) or ("email_subscriptions"."state" = 'unsubscribed' and "email_subscriptions"."unsubscribed_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "daily_brief_items" ADD CONSTRAINT "daily_brief_items_brief_id_daily_briefs_id_fk" FOREIGN KEY ("brief_id") REFERENCES "public"."daily_briefs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_brief_items" ADD CONSTRAINT "daily_brief_items_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_brief_items" ADD CONSTRAINT "daily_brief_items_source_item_id_source_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."source_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_brief_id_daily_briefs_id_fk" FOREIGN KEY ("brief_id") REFERENCES "public"."daily_briefs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_subscription_id_email_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."email_subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_delivery_events" ADD CONSTRAINT "email_delivery_events_delivery_id_email_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."email_deliveries"("id") ON DELETE restrict ON UPDATE no action;