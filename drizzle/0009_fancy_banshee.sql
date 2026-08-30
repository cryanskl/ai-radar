CREATE TYPE "public"."paper_resource_kind" AS ENUM('code', 'dataset', 'product');--> statement-breakpoint
CREATE TABLE "arxiv_source_item_metadata" (
	"source_item_id" uuid PRIMARY KEY NOT NULL,
	"authors" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paper_identities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entity_id" uuid NOT NULL,
	"arxiv_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "paper_identities_entity_id_unique" UNIQUE("entity_id"),
	CONSTRAINT "paper_identities_arxiv_id_unique" UNIQUE("arxiv_id")
);
--> statement-breakpoint
CREATE TABLE "paper_resource_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"paper_revision_profile_id" uuid NOT NULL,
	"kind" "paper_resource_kind" NOT NULL,
	"label" text NOT NULL,
	"url" text NOT NULL,
	"evidence_source_item_id" uuid NOT NULL,
	"public_visibility" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "paper_resource_links_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "paper_revision_guidance" (
	"id" uuid PRIMARY KEY NOT NULL,
	"paper_revision_profile_id" uuid NOT NULL,
	"locale" "content_locale" NOT NULL,
	"claimed_contributions" text[] NOT NULL,
	"limitations" text[] NOT NULL,
	"inference" text[] NOT NULL,
	"authorship" "localization_authorship" NOT NULL,
	"review_status" "review_status" NOT NULL,
	"public_visibility" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "paper_revision_guidance_paper_revision_profile_id_locale_unique" UNIQUE("paper_revision_profile_id","locale")
);
--> statement-breakpoint
CREATE TABLE "paper_revision_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"paper_identity_id" uuid NOT NULL,
	"entity_version_id" uuid NOT NULL,
	"metadata_source_item_id" uuid NOT NULL,
	"arxiv_version" text NOT NULL,
	"title" text NOT NULL,
	"authors" jsonb NOT NULL,
	"topics" text[] NOT NULL,
	"metadata_license_url" text NOT NULL,
	"full_text_rights_status" "rights_status" NOT NULL,
	"full_text_license_url" text,
	"pdf_packaged" boolean DEFAULT false NOT NULL,
	"public_visibility" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "paper_revision_profiles_entity_version_id_unique" UNIQUE("entity_version_id"),
	CONSTRAINT "paper_revision_profiles_paper_identity_id_arxiv_version_unique" UNIQUE("paper_identity_id","arxiv_version"),
	CONSTRAINT "paper_revision_profiles_metadata_source_item_id_unique" UNIQUE("metadata_source_item_id"),
	CONSTRAINT "paper_revision_profiles_pdf_not_packaged" CHECK (not "paper_revision_profiles"."pdf_packaged"),
	CONSTRAINT "paper_revision_profiles_reusable_full_text_requires_license" CHECK ("paper_revision_profiles"."full_text_rights_status" not in ('open', 'attribution_required', 'source_license') or "paper_revision_profiles"."full_text_license_url" is not null)
);
--> statement-breakpoint
CREATE INDEX "paper_resource_links_profile_kind_visibility_idx" ON "paper_resource_links" USING btree ("paper_revision_profile_id","kind","public_visibility");--> statement-breakpoint
ALTER TABLE "arxiv_source_item_metadata" ADD CONSTRAINT "arxiv_source_item_metadata_source_item_id_source_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."source_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_identities" ADD CONSTRAINT "paper_identities_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_resource_links" ADD CONSTRAINT "paper_resource_links_paper_revision_profile_id_paper_revision_profiles_id_fk" FOREIGN KEY ("paper_revision_profile_id") REFERENCES "public"."paper_revision_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_resource_links" ADD CONSTRAINT "paper_resource_links_evidence_source_item_id_source_items_id_fk" FOREIGN KEY ("evidence_source_item_id") REFERENCES "public"."source_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_revision_guidance" ADD CONSTRAINT "paper_revision_guidance_paper_revision_profile_id_paper_revision_profiles_id_fk" FOREIGN KEY ("paper_revision_profile_id") REFERENCES "public"."paper_revision_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_revision_profiles" ADD CONSTRAINT "paper_revision_profiles_paper_identity_id_paper_identities_id_fk" FOREIGN KEY ("paper_identity_id") REFERENCES "public"."paper_identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_revision_profiles" ADD CONSTRAINT "paper_revision_profiles_entity_version_id_entity_versions_id_fk" FOREIGN KEY ("entity_version_id") REFERENCES "public"."entity_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_revision_profiles" ADD CONSTRAINT "paper_revision_profiles_metadata_source_item_id_source_items_id_fk" FOREIGN KEY ("metadata_source_item_id") REFERENCES "public"."source_items"("id") ON DELETE restrict ON UPDATE no action;
