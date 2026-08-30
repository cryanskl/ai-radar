CREATE TYPE "public"."product_change_kind" AS ENUM('launch', 'product_update', 'pricing_change', 'availability_change');--> statement-breakpoint
CREATE TYPE "public"."product_commercial_relationship" AS ENUM('none_disclosed', 'vendor_submitted', 'affiliate', 'sponsored');--> statement-breakpoint
CREATE TYPE "public"."product_lifecycle_status" AS ENUM('beta', 'active', 'deprecated', 'discontinued');--> statement-breakpoint
CREATE TYPE "public"."product_pricing_mode" AS ENUM('free', 'freemium', 'subscription', 'usage_based', 'contact_sales', 'open_source');--> statement-breakpoint
CREATE TYPE "public"."product_vendor_metric" AS ENUM('users', 'revenue', 'adoption', 'downloads');--> statement-breakpoint
CREATE TABLE "product_observations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"product_profile_id" uuid NOT NULL,
	"source_item_id" uuid NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"change_kind" "product_change_kind" NOT NULL,
	"lifecycle_status" "product_lifecycle_status" NOT NULL,
	"availability_regions" text[] NOT NULL,
	"pricing_mode" "product_pricing_mode" NOT NULL,
	"commercial_relationship" "product_commercial_relationship" NOT NULL,
	"commercial_disclosure" text,
	"public_visibility" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_observations_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "product_observations_product_profile_id_observed_at_unique" UNIQUE("product_profile_id","observed_at"),
	CONSTRAINT "product_observations_regions_nonempty" CHECK (cardinality("product_observations"."availability_regions") > 0),
	CONSTRAINT "product_observations_disclosure_required" CHECK ("product_observations"."commercial_relationship" = 'none_disclosed' or "product_observations"."commercial_disclosure" is not null)
);
--> statement-breakpoint
CREATE TABLE "product_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entity_id" uuid NOT NULL,
	"category" text NOT NULL,
	"platforms" text[] NOT NULL,
	"audience_types" text[] NOT NULL,
	"public_visibility" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_profiles_entity_id_unique" UNIQUE("entity_id"),
	CONSTRAINT "product_profiles_dimensions_nonempty" CHECK (cardinality("product_profiles"."platforms") > 0 and cardinality("product_profiles"."audience_types") > 0)
);
--> statement-breakpoint
CREATE TABLE "product_vendor_reported_metrics" (
	"id" uuid PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"product_observation_id" uuid NOT NULL,
	"metric" "product_vendor_metric" NOT NULL,
	"value" numeric(24, 4) NOT NULL,
	"unit" text NOT NULL,
	"period_ended_at" timestamp with time zone NOT NULL,
	"public_visibility" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_vendor_reported_metrics_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "product_vendor_metrics_nonnegative" CHECK ("product_vendor_reported_metrics"."value" >= 0)
);
--> statement-breakpoint
ALTER TABLE "product_observations" ADD CONSTRAINT "product_observations_product_profile_id_product_profiles_id_fk" FOREIGN KEY ("product_profile_id") REFERENCES "public"."product_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_observations" ADD CONSTRAINT "product_observations_source_item_id_source_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."source_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_profiles" ADD CONSTRAINT "product_profiles_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_vendor_reported_metrics" ADD CONSTRAINT "product_vendor_reported_metrics_product_observation_id_product_observations_id_fk" FOREIGN KEY ("product_observation_id") REFERENCES "public"."product_observations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_observations_profile_time_idx" ON "product_observations" USING btree ("product_profile_id","observed_at");--> statement-breakpoint
CREATE INDEX "product_vendor_metrics_observation_idx" ON "product_vendor_reported_metrics" USING btree ("product_observation_id");
