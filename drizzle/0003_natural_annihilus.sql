CREATE TYPE "public"."entity_alias_kind" AS ENUM('official', 'localized', 'historical');--> statement-breakpoint
CREATE TYPE "public"."entity_lifecycle_status" AS ENUM('active', 'merged', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('model', 'paper', 'product', 'repository', 'prompt', 'skill', 'guide', 'organization', 'person', 'benchmark', 'topic');--> statement-breakpoint
CREATE TYPE "public"."relation_creation_method" AS ENUM('automatic', 'editor', 'submission');--> statement-breakpoint
CREATE TYPE "public"."relation_review_status" AS ENUM('draft', 'reviewed');--> statement-breakpoint
CREATE TYPE "public"."relation_type" AS ENUM('INTRODUCES', 'IMPLEMENTS', 'USES', 'EVALUATES', 'WORKS_WITH', 'SUPPORTS', 'EXPLAINS', 'ANNOUNCES', 'UPDATES', 'CHANGES_PRICE_OF', 'DEPRECATES', 'DEVELOPS', 'AFFILIATED_WITH', 'TAGGED_WITH');--> statement-breakpoint
CREATE TABLE "entities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"type" "entity_type" NOT NULL,
	"official_name" text NOT NULL,
	"official_url" text NOT NULL,
	"lifecycle_status" "entity_lifecycle_status" DEFAULT 'active' NOT NULL,
	"last_verified_at" timestamp with time zone NOT NULL,
	"rights_status" "rights_status" NOT NULL,
	"public_visibility" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entities_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "entity_aliases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"locale" "content_locale" NOT NULL,
	"kind" "entity_alias_kind" NOT NULL,
	"value" text NOT NULL,
	"normalized_value" text NOT NULL,
	"reviewed_at" timestamp with time zone NOT NULL,
	"public_visibility" boolean DEFAULT false NOT NULL,
	CONSTRAINT "entity_aliases_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "entity_aliases_entity_id_locale_normalized_value_unique" UNIQUE("entity_id","locale","normalized_value")
);
--> statement-breakpoint
CREATE TABLE "entity_localized_contents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entity_id" uuid NOT NULL,
	"locale" "content_locale" NOT NULL,
	"name" text NOT NULL,
	"summary" text NOT NULL,
	"authorship" "localization_authorship" NOT NULL,
	"review_status" "review_status" NOT NULL,
	"public_visibility" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entity_localized_contents_entity_id_locale_unique" UNIQUE("entity_id","locale")
);
--> statement-breakpoint
CREATE TABLE "entity_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"version_label" text NOT NULL,
	"released_at" timestamp with time zone,
	"released_at_precision" time_precision,
	"last_verified_at" timestamp with time zone NOT NULL,
	"public_visibility" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entity_versions_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "entity_versions_entity_id_version_label_unique" UNIQUE("entity_id","version_label")
);
--> statement-breakpoint
CREATE TABLE "owner_operation_audits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_role" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_public_id" text NOT NULL,
	"public_visibility" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relation_evidence" (
	"relation_id" uuid NOT NULL,
	"source_item_id" uuid NOT NULL,
	CONSTRAINT "relation_evidence_relation_id_source_item_id_pk" PRIMARY KEY("relation_id","source_item_id")
);
--> statement-breakpoint
CREATE TABLE "relations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"subject_entity_id" uuid,
	"subject_event_id" uuid,
	"predicate" "relation_type" NOT NULL,
	"object_entity_id" uuid NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_to" timestamp with time zone,
	"first_verified_at" timestamp with time zone NOT NULL,
	"last_verified_at" timestamp with time zone NOT NULL,
	"confidence" integer NOT NULL,
	"review_status" "relation_review_status" NOT NULL,
	"creation_method" "relation_creation_method" NOT NULL,
	"rights_status" "rights_status" NOT NULL,
	"public_visibility" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "relations_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "relations_exactly_one_subject" CHECK (num_nonnulls("relations"."subject_entity_id", "relations"."subject_event_id") = 1),
	CONSTRAINT "relations_confidence_range" CHECK ("relations"."confidence" between 0 and 100),
	CONSTRAINT "relations_valid_time_order" CHECK ("relations"."valid_to" is null or "relations"."valid_from" is null or "relations"."valid_to" >= "relations"."valid_from"),
	CONSTRAINT "relations_verification_time_order" CHECK ("relations"."last_verified_at" >= "relations"."first_verified_at")
);
--> statement-breakpoint
ALTER TABLE "entity_aliases" ADD CONSTRAINT "entity_aliases_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_localized_contents" ADD CONSTRAINT "entity_localized_contents_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_versions" ADD CONSTRAINT "entity_versions_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relation_evidence" ADD CONSTRAINT "relation_evidence_relation_id_relations_id_fk" FOREIGN KEY ("relation_id") REFERENCES "public"."relations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relation_evidence" ADD CONSTRAINT "relation_evidence_source_item_id_source_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."source_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relations" ADD CONSTRAINT "relations_subject_entity_id_entities_id_fk" FOREIGN KEY ("subject_entity_id") REFERENCES "public"."entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relations" ADD CONSTRAINT "relations_subject_event_id_events_id_fk" FOREIGN KEY ("subject_event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relations" ADD CONSTRAINT "relations_object_entity_id_entities_id_fk" FOREIGN KEY ("object_entity_id") REFERENCES "public"."entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entity_aliases_resolution_idx" ON "entity_aliases" USING btree ("normalized_value","locale");--> statement-breakpoint
CREATE INDEX "relations_subject_entity_idx" ON "relations" USING btree ("subject_entity_id");--> statement-breakpoint
CREATE INDEX "relations_subject_event_idx" ON "relations" USING btree ("subject_event_id");--> statement-breakpoint
CREATE INDEX "relations_object_entity_idx" ON "relations" USING btree ("object_entity_id");