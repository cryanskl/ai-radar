CREATE TYPE "public"."guide_content_mode" AS ENUM('full_guide', 'summary_link');--> statement-breakpoint
CREATE TYPE "public"."guide_provenance" AS ENUM('ai_radar_original', 'authorized_submission', 'external_guidance');--> statement-breakpoint
CREATE TYPE "public"."guide_status" AS ENUM('current', 'stale');--> statement-breakpoint
CREATE TABLE "guide_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entity_id" uuid NOT NULL,
	"source_item_id" uuid NOT NULL,
	"author_name" text NOT NULL,
	"author_url" text,
	"provenance" "guide_provenance" NOT NULL,
	"category" text NOT NULL,
	"rights_status" "rights_status" NOT NULL,
	"license_name" text,
	"license_url" text,
	"content_mode" "guide_content_mode" NOT NULL,
	"public_visibility" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guide_profiles_entity_id_unique" UNIQUE("entity_id"),
	CONSTRAINT "guide_profiles_license_pair" CHECK (("guide_profiles"."license_name" is null) = ("guide_profiles"."license_url" is null)),
	CONSTRAINT "guide_profiles_full_content_rights" CHECK ("guide_profiles"."content_mode" <> 'full_guide' or ("guide_profiles"."provenance" <> 'external_guidance' and "guide_profiles"."rights_status" in ('open', 'attribution_required', 'source_license') and "guide_profiles"."license_name" is not null)),
	CONSTRAINT "guide_profiles_external_guidance_boundary" CHECK ("guide_profiles"."provenance" <> 'external_guidance' or ("guide_profiles"."content_mode" = 'summary_link' and "guide_profiles"."rights_status" in ('metadata_only', 'link_only')))
);
--> statement-breakpoint
CREATE TABLE "guide_status_localized_contents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"guide_status_observation_id" uuid NOT NULL,
	"locale" "content_locale" NOT NULL,
	"stale_reason" text NOT NULL,
	"authorship" "localization_authorship" NOT NULL,
	"review_status" "review_status" NOT NULL,
	"public_visibility" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guide_status_localization_observation_locale_unique" UNIQUE("guide_status_observation_id","locale")
);
--> statement-breakpoint
CREATE TABLE "guide_status_observations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"guide_version_profile_id" uuid NOT NULL,
	"source_item_id" uuid NOT NULL,
	"status" "guide_status" NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"public_visibility" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guide_status_observations_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "guide_status_observations_guide_version_profile_id_observed_at_unique" UNIQUE("guide_version_profile_id","observed_at")
);
--> statement-breakpoint
CREATE TABLE "guide_version_localized_contents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"guide_version_profile_id" uuid NOT NULL,
	"locale" "content_locale" NOT NULL,
	"prerequisites" text[] NOT NULL,
	"step_instructions" jsonb NOT NULL,
	"expected_outcome" text,
	"limitations" text[] NOT NULL,
	"authorship" "localization_authorship" NOT NULL,
	"review_status" "review_status" NOT NULL,
	"public_visibility" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guide_version_localization_version_locale_unique" UNIQUE("guide_version_profile_id","locale")
);
--> statement-breakpoint
CREATE TABLE "guide_version_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"guide_profile_id" uuid NOT NULL,
	"entity_version_id" uuid NOT NULL,
	"source_item_id" uuid NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"reviewed_at" timestamp with time zone NOT NULL,
	"steps" jsonb NOT NULL,
	"public_visibility" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guide_version_profiles_entity_version_id_unique" UNIQUE("entity_version_id"),
	CONSTRAINT "guide_version_profiles_guide_profile_id_entity_version_id_unique" UNIQUE("guide_profile_id","entity_version_id")
);
--> statement-breakpoint
ALTER TABLE "guide_profiles" ADD CONSTRAINT "guide_profiles_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_profiles" ADD CONSTRAINT "guide_profiles_source_item_id_source_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."source_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_status_localized_contents" ADD CONSTRAINT "guide_status_localized_contents_guide_status_observation_id_guide_status_observations_id_fk" FOREIGN KEY ("guide_status_observation_id") REFERENCES "public"."guide_status_observations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_status_observations" ADD CONSTRAINT "guide_status_observations_guide_version_profile_id_guide_version_profiles_id_fk" FOREIGN KEY ("guide_version_profile_id") REFERENCES "public"."guide_version_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_status_observations" ADD CONSTRAINT "guide_status_observations_source_item_id_source_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."source_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_version_localized_contents" ADD CONSTRAINT "guide_version_localized_contents_guide_version_profile_id_guide_version_profiles_id_fk" FOREIGN KEY ("guide_version_profile_id") REFERENCES "public"."guide_version_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_version_profiles" ADD CONSTRAINT "guide_version_profiles_guide_profile_id_guide_profiles_id_fk" FOREIGN KEY ("guide_profile_id") REFERENCES "public"."guide_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_version_profiles" ADD CONSTRAINT "guide_version_profiles_entity_version_id_entity_versions_id_fk" FOREIGN KEY ("entity_version_id") REFERENCES "public"."entity_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_version_profiles" ADD CONSTRAINT "guide_version_profiles_source_item_id_source_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."source_items"("id") ON DELETE restrict ON UPDATE no action;