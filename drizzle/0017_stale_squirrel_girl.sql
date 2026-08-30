CREATE TYPE "public"."commercial_relationship" AS ENUM('none', 'sponsor', 'affiliate', 'other');--> statement-breakpoint
CREATE TYPE "public"."ranking_confidence" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."ranking_kind" AS ENUM('latest', 'trending', 'benchmark', 'value');--> statement-breakpoint
CREATE TYPE "public"."ranking_observation_status" AS ENUM('active', 'insufficient_evidence', 'stale', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."ranking_target_type" AS ENUM('event', 'model', 'paper', 'product', 'repository', 'prompt', 'skill', 'guide');--> statement-breakpoint
CREATE TABLE "featured_selection_evidence" (
	"featured_selection_id" uuid NOT NULL,
	"source_item_id" uuid NOT NULL,
	CONSTRAINT "featured_selection_evidence_featured_selection_id_source_item_id_pk" PRIMARY KEY("featured_selection_id","source_item_id")
);
--> statement-breakpoint
CREATE TABLE "featured_selection_localized_contents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"featured_selection_id" uuid NOT NULL,
	"locale" "content_locale" NOT NULL,
	"reason" text NOT NULL,
	"audience" text NOT NULL,
	"commercial_disclosure" text NOT NULL,
	"authorship" "localization_authorship" NOT NULL,
	"review_status" "review_status" NOT NULL,
	"public_visibility" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "featured_selection_localization_unique" UNIQUE("featured_selection_id","locale")
);
--> statement-breakpoint
CREATE TABLE "featured_selections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"target_type" "ranking_target_type" NOT NULL,
	"target_event_id" uuid,
	"target_entity_id" uuid,
	"selected_at" timestamp with time zone NOT NULL,
	"review_due_at" timestamp with time zone NOT NULL,
	"editor_role" text NOT NULL,
	"topic" text NOT NULL,
	"commercial_relationship" "commercial_relationship" NOT NULL,
	"ranking_influence" boolean DEFAULT false NOT NULL,
	"public_visibility" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "featured_selections_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "featured_selection_exactly_one_target" CHECK (num_nonnulls("featured_selections"."target_event_id", "featured_selections"."target_entity_id") = 1),
	CONSTRAINT "featured_selection_review_after_selection" CHECK ("featured_selections"."review_due_at" > "featured_selections"."selected_at"),
	CONSTRAINT "featured_selection_never_influences_ranking" CHECK ("featured_selections"."ranking_influence" = false)
);
--> statement-breakpoint
CREATE TABLE "ranking_definition_localized_contents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"ranking_definition_version_id" uuid NOT NULL,
	"locale" "content_locale" NOT NULL,
	"title" text NOT NULL,
	"question" text NOT NULL,
	"eligibility_summary" text NOT NULL,
	"limitations" text[] NOT NULL,
	"authorship" "localization_authorship" NOT NULL,
	"review_status" "review_status" NOT NULL,
	"public_visibility" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ranking_definition_localization_unique" UNIQUE("ranking_definition_version_id","locale"),
	CONSTRAINT "ranking_definition_limitations_nonempty" CHECK (cardinality("ranking_definition_localized_contents"."limitations") > 0)
);
--> statement-breakpoint
CREATE TABLE "ranking_definition_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"definition_id" uuid NOT NULL,
	"methodology_version" text NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"eligibility" text[] NOT NULL,
	"dimensions" text[] NOT NULL,
	"method" jsonb NOT NULL,
	"public_visibility" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ranking_definition_version_unique" UNIQUE("definition_id","methodology_version"),
	CONSTRAINT "ranking_definition_eligibility_nonempty" CHECK (cardinality("ranking_definition_versions"."eligibility") > 0),
	CONSTRAINT "ranking_definition_dimensions_nonempty" CHECK (cardinality("ranking_definition_versions"."dimensions") > 0)
);
--> statement-breakpoint
CREATE TABLE "ranking_definitions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"target_type" "ranking_target_type" NOT NULL,
	"kind" "ranking_kind" NOT NULL,
	"public_visibility" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ranking_definitions_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "ranking_observation_evidence" (
	"ranking_observation_id" uuid NOT NULL,
	"source_item_id" uuid NOT NULL,
	CONSTRAINT "ranking_observation_evidence_ranking_observation_id_source_item_id_pk" PRIMARY KEY("ranking_observation_id","source_item_id")
);
--> statement-breakpoint
CREATE TABLE "ranking_observations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"ranking_definition_version_id" uuid NOT NULL,
	"target_event_id" uuid,
	"target_entity_id" uuid,
	"target_entity_version_id" uuid,
	"benchmark_run_id" uuid,
	"price_record_id" uuid,
	"observed_at" timestamp with time zone NOT NULL,
	"data_cutoff" timestamp with time zone NOT NULL,
	"candidate_time" timestamp with time zone,
	"score" numeric(14, 8),
	"raw_metrics" jsonb NOT NULL,
	"signals" jsonb NOT NULL,
	"confidence" "ranking_confidence" NOT NULL,
	"status" "ranking_observation_status" NOT NULL,
	"public_visibility" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ranking_observations_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "ranking_observation_exactly_one_target" CHECK (num_nonnulls("ranking_observations"."target_event_id", "ranking_observations"."target_entity_id") = 1 and ("ranking_observations"."target_entity_version_id" is null or "ranking_observations"."target_entity_id" is not null)),
	CONSTRAINT "ranking_observation_cutoff_not_future" CHECK ("ranking_observations"."data_cutoff" <= "ranking_observations"."observed_at")
);
--> statement-breakpoint
ALTER TABLE "featured_selection_evidence" ADD CONSTRAINT "featured_selection_evidence_featured_selection_id_featured_selections_id_fk" FOREIGN KEY ("featured_selection_id") REFERENCES "public"."featured_selections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "featured_selection_evidence" ADD CONSTRAINT "featured_selection_evidence_source_item_id_source_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."source_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "featured_selection_localized_contents" ADD CONSTRAINT "featured_selection_localized_contents_featured_selection_id_featured_selections_id_fk" FOREIGN KEY ("featured_selection_id") REFERENCES "public"."featured_selections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "featured_selections" ADD CONSTRAINT "featured_selections_target_event_id_events_id_fk" FOREIGN KEY ("target_event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "featured_selections" ADD CONSTRAINT "featured_selections_target_entity_id_entities_id_fk" FOREIGN KEY ("target_entity_id") REFERENCES "public"."entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_definition_localized_contents" ADD CONSTRAINT "ranking_definition_localized_contents_ranking_definition_version_id_ranking_definition_versions_id_fk" FOREIGN KEY ("ranking_definition_version_id") REFERENCES "public"."ranking_definition_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_definition_versions" ADD CONSTRAINT "ranking_definition_versions_definition_id_ranking_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."ranking_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_observation_evidence" ADD CONSTRAINT "ranking_observation_evidence_ranking_observation_id_ranking_observations_id_fk" FOREIGN KEY ("ranking_observation_id") REFERENCES "public"."ranking_observations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_observation_evidence" ADD CONSTRAINT "ranking_observation_evidence_source_item_id_source_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."source_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_observations" ADD CONSTRAINT "ranking_observations_ranking_definition_version_id_ranking_definition_versions_id_fk" FOREIGN KEY ("ranking_definition_version_id") REFERENCES "public"."ranking_definition_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_observations" ADD CONSTRAINT "ranking_observations_target_event_id_events_id_fk" FOREIGN KEY ("target_event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_observations" ADD CONSTRAINT "ranking_observations_target_entity_id_entities_id_fk" FOREIGN KEY ("target_entity_id") REFERENCES "public"."entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_observations" ADD CONSTRAINT "ranking_observations_target_entity_version_id_entity_versions_id_fk" FOREIGN KEY ("target_entity_version_id") REFERENCES "public"."entity_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_observations" ADD CONSTRAINT "ranking_observations_benchmark_run_id_benchmark_runs_id_fk" FOREIGN KEY ("benchmark_run_id") REFERENCES "public"."benchmark_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_observations" ADD CONSTRAINT "ranking_observations_price_record_id_price_records_id_fk" FOREIGN KEY ("price_record_id") REFERENCES "public"."price_records"("id") ON DELETE restrict ON UPDATE no action;