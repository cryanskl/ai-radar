CREATE TYPE "public"."skill_installation_method" AS ENUM('manual', 'package_manager', 'marketplace', 'repository');--> statement-breakpoint
CREATE TYPE "public"."skill_maintenance_status" AS ENUM('maintained', 'limited', 'unmaintained', 'archived');--> statement-breakpoint
CREATE TYPE "public"."skill_security_review_status" AS ENUM('not_reviewed', 'metadata_reviewed', 'manual_reviewed', 'issues_found');--> statement-breakpoint
CREATE TABLE "skill_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entity_id" uuid NOT NULL,
	"source_item_id" uuid NOT NULL,
	"author_name" text NOT NULL,
	"author_url" text,
	"task" text NOT NULL,
	"rights_status" "rights_status" NOT NULL,
	"official_installation_url" text NOT NULL,
	"public_visibility" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skill_profiles_entity_id_unique" UNIQUE("entity_id"),
	CONSTRAINT "skill_profiles_public_rights" CHECK ("skill_profiles"."rights_status" in ('open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'))
);
--> statement-breakpoint
CREATE TABLE "skill_version_localized_contents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"skill_version_profile_id" uuid NOT NULL,
	"locale" "content_locale" NOT NULL,
	"permission_reasons" jsonb NOT NULL,
	"external_api_purposes" jsonb NOT NULL,
	"security_check_descriptions" jsonb NOT NULL,
	"authorship" "localization_authorship" NOT NULL,
	"review_status" "review_status" NOT NULL,
	"public_visibility" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skill_version_localization_version_locale_unique" UNIQUE("skill_version_profile_id","locale")
);
--> statement-breakpoint
CREATE TABLE "skill_version_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"skill_profile_id" uuid NOT NULL,
	"entity_version_id" uuid NOT NULL,
	"source_item_id" uuid NOT NULL,
	"author_name" text NOT NULL,
	"author_url" text,
	"documentation_rights_status" "rights_status" NOT NULL,
	"documentation_license_name" text NOT NULL,
	"documentation_license_url" text NOT NULL,
	"repository_rights_status" "rights_status" NOT NULL,
	"repository_license_name" text NOT NULL,
	"repository_license_url" text NOT NULL,
	"supported_platforms" text[] NOT NULL,
	"dependencies" jsonb NOT NULL,
	"permissions" jsonb NOT NULL,
	"external_apis" jsonb NOT NULL,
	"installation_method" "skill_installation_method" NOT NULL,
	"maintenance_status" "skill_maintenance_status" NOT NULL,
	"security_review_status" "skill_security_review_status" NOT NULL,
	"security_checks_performed" text[] NOT NULL,
	"security_reviewed_at" timestamp with time zone,
	"public_visibility" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skill_version_profiles_entity_version_id_unique" UNIQUE("entity_version_id"),
	CONSTRAINT "skill_version_profiles_platforms_nonempty" CHECK (cardinality("skill_version_profiles"."supported_platforms") > 0),
	CONSTRAINT "skill_version_profiles_review_evidence" CHECK (("skill_version_profiles"."security_review_status" = 'not_reviewed' and cardinality("skill_version_profiles"."security_checks_performed") = 0 and "skill_version_profiles"."security_reviewed_at" is null) or ("skill_version_profiles"."security_review_status" <> 'not_reviewed' and cardinality("skill_version_profiles"."security_checks_performed") > 0 and "skill_version_profiles"."security_reviewed_at" is not null)),
	CONSTRAINT "skill_version_profiles_public_rights" CHECK ("skill_version_profiles"."documentation_rights_status" in ('open', 'attribution_required', 'source_license', 'metadata_only', 'link_only') and "skill_version_profiles"."repository_rights_status" in ('open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'))
);
--> statement-breakpoint
ALTER TABLE "skill_profiles" ADD CONSTRAINT "skill_profiles_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_profiles" ADD CONSTRAINT "skill_profiles_source_item_id_source_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."source_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_version_localized_contents" ADD CONSTRAINT "skill_version_localized_contents_skill_version_profile_id_skill_version_profiles_id_fk" FOREIGN KEY ("skill_version_profile_id") REFERENCES "public"."skill_version_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_version_profiles" ADD CONSTRAINT "skill_version_profiles_skill_profile_id_skill_profiles_id_fk" FOREIGN KEY ("skill_profile_id") REFERENCES "public"."skill_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_version_profiles" ADD CONSTRAINT "skill_version_profiles_entity_version_id_entity_versions_id_fk" FOREIGN KEY ("entity_version_id") REFERENCES "public"."entity_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_version_profiles" ADD CONSTRAINT "skill_version_profiles_source_item_id_source_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."source_items"("id") ON DELETE restrict ON UPDATE no action;