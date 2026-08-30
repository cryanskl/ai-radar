CREATE TYPE "public"."prompt_provenance" AS ENUM('ai_radar_original', 'authorized_submission', 'open_licensed', 'written_permission', 'external_link');--> statement-breakpoint
CREATE TYPE "public"."prompt_validation_status" AS ENUM('current', 'stale', 'unvalidated');--> statement-breakpoint
CREATE TABLE "prompt_compatibilities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"prompt_profile_id" uuid NOT NULL,
	"target_entity_id" uuid NOT NULL,
	"target_version_id" uuid,
	"verified_version" text NOT NULL,
	"public_visibility" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prompt_compatibilities_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "prompt_compatibilities_prompt_profile_id_target_entity_id_verified_version_unique" UNIQUE("prompt_profile_id","target_entity_id","verified_version")
);
--> statement-breakpoint
CREATE TABLE "prompt_localized_contents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"prompt_profile_id" uuid NOT NULL,
	"locale" "content_locale" NOT NULL,
	"purpose" text NOT NULL,
	"variables" jsonb NOT NULL,
	"input_example" text NOT NULL,
	"expected_output_example" text NOT NULL,
	"known_limitations" text[] NOT NULL,
	"authorship" "localization_authorship" NOT NULL,
	"review_status" "review_status" NOT NULL,
	"public_visibility" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prompt_localized_contents_prompt_profile_id_locale_unique" UNIQUE("prompt_profile_id","locale"),
	CONSTRAINT "prompt_localized_contents_limitations_nonempty" CHECK (cardinality("prompt_localized_contents"."known_limitations") > 0)
);
--> statement-breakpoint
CREATE TABLE "prompt_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entity_id" uuid NOT NULL,
	"source_item_id" uuid NOT NULL,
	"author_name" text NOT NULL,
	"author_url" text,
	"provenance" "prompt_provenance" NOT NULL,
	"task" text NOT NULL,
	"input_types" text[] NOT NULL,
	"rights_status" "rights_status" NOT NULL,
	"license_name" text,
	"license_url" text,
	"full_text" text,
	"public_visibility" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prompt_profiles_entity_id_unique" UNIQUE("entity_id"),
	CONSTRAINT "prompt_profiles_dimensions_nonempty" CHECK (cardinality("prompt_profiles"."input_types") > 0),
	CONSTRAINT "prompt_profiles_license_pair" CHECK (("prompt_profiles"."license_name" is null) = ("prompt_profiles"."license_url" is null)),
	CONSTRAINT "prompt_profiles_full_text_rights" CHECK ("prompt_profiles"."full_text" is null or ("prompt_profiles"."provenance" <> 'external_link' and "prompt_profiles"."rights_status" in ('open', 'attribution_required', 'source_license') and "prompt_profiles"."license_name" is not null)),
	CONSTRAINT "prompt_profiles_external_link_rights" CHECK ("prompt_profiles"."provenance" <> 'external_link' or ("prompt_profiles"."rights_status" in ('metadata_only', 'link_only') and "prompt_profiles"."full_text" is null))
);
--> statement-breakpoint
CREATE TABLE "prompt_validation_localized_contents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"validation_observation_id" uuid NOT NULL,
	"locale" "content_locale" NOT NULL,
	"stale_reason" text NOT NULL,
	"authorship" "localization_authorship" NOT NULL,
	"review_status" "review_status" NOT NULL,
	"public_visibility" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prompt_validation_localization_observation_locale_unique" UNIQUE("validation_observation_id","locale")
);
--> statement-breakpoint
CREATE TABLE "prompt_validation_observations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"compatibility_id" uuid NOT NULL,
	"source_item_id" uuid NOT NULL,
	"status" "prompt_validation_status" NOT NULL,
	"validated_at" timestamp with time zone NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"public_visibility" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prompt_validation_observations_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "prompt_validation_observations_compatibility_id_observed_at_unique" UNIQUE("compatibility_id","observed_at")
);
--> statement-breakpoint
ALTER TABLE "prompt_compatibilities" ADD CONSTRAINT "prompt_compatibilities_prompt_profile_id_prompt_profiles_id_fk" FOREIGN KEY ("prompt_profile_id") REFERENCES "public"."prompt_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_compatibilities" ADD CONSTRAINT "prompt_compatibilities_target_entity_id_entities_id_fk" FOREIGN KEY ("target_entity_id") REFERENCES "public"."entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_compatibilities" ADD CONSTRAINT "prompt_compatibilities_target_version_id_entity_versions_id_fk" FOREIGN KEY ("target_version_id") REFERENCES "public"."entity_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_localized_contents" ADD CONSTRAINT "prompt_localized_contents_prompt_profile_id_prompt_profiles_id_fk" FOREIGN KEY ("prompt_profile_id") REFERENCES "public"."prompt_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_profiles" ADD CONSTRAINT "prompt_profiles_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_profiles" ADD CONSTRAINT "prompt_profiles_source_item_id_source_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."source_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_validation_localized_contents" ADD CONSTRAINT "prompt_validation_localized_contents_validation_observation_id_prompt_validation_observations_id_fk" FOREIGN KEY ("validation_observation_id") REFERENCES "public"."prompt_validation_observations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_validation_observations" ADD CONSTRAINT "prompt_validation_observations_compatibility_id_prompt_compatibilities_id_fk" FOREIGN KEY ("compatibility_id") REFERENCES "public"."prompt_compatibilities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_validation_observations" ADD CONSTRAINT "prompt_validation_observations_source_item_id_source_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."source_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prompt_compatibilities_profile_idx" ON "prompt_compatibilities" USING btree ("prompt_profile_id");--> statement-breakpoint
CREATE INDEX "prompt_compatibilities_target_idx" ON "prompt_compatibilities" USING btree ("target_entity_id");--> statement-breakpoint
CREATE INDEX "prompt_validation_compatibility_time_idx" ON "prompt_validation_observations" USING btree ("compatibility_id","observed_at");