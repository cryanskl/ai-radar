CREATE TYPE "public"."correction_reason_code" AS ENUM('factual_error');--> statement-breakpoint
CREATE TYPE "public"."correction_target_type" AS ENUM('event', 'entity');--> statement-breakpoint
CREATE TYPE "public"."editorial_case_decision" AS ENUM('corrected', 'withdrawn', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."editorial_case_kind" AS ENUM('correction', 'rights');--> statement-breakpoint
CREATE TYPE "public"."editorial_case_status" AS ENUM('received', 'reviewing', 'actioned', 'rejected', 'appealed', 'closed');--> statement-breakpoint
CREATE TYPE "public"."editorial_case_target_type" AS ENUM('event', 'entity', 'source_item');--> statement-breakpoint
CREATE TYPE "public"."entity_merge_reason_code" AS ENUM('duplicate_identity');--> statement-breakpoint
CREATE TYPE "public"."entity_merge_relation_role" AS ENUM('subject', 'object');--> statement-breakpoint
CREATE TYPE "public"."rights_decision_reason_code" AS ENUM('source_withdrawal', 'rights_withdrawal');--> statement-breakpoint
CREATE TYPE "public"."rights_decision_target_type" AS ENUM('event', 'entity', 'source_item');--> statement-breakpoint
CREATE TYPE "public"."tombstone_object_type" AS ENUM('event', 'entity');--> statement-breakpoint
CREATE TYPE "public"."tombstone_reason_code" AS ENUM('duplicate_coverage', 'duplicate_identity', 'rights_withdrawal', 'source_withdrawal', 'high_risk_review');--> statement-breakpoint
CREATE TYPE "public"."tombstone_status" AS ENUM('merged_into', 'withdrawn', 'source_withdrawn', 'reviewing');--> statement-breakpoint
CREATE TABLE "correction_changes" (
	"correction_id" uuid NOT NULL,
	"field" text NOT NULL,
	"previous_value" text NOT NULL,
	"corrected_value" text NOT NULL,
	CONSTRAINT "correction_changes_correction_id_field_pk" PRIMARY KEY("correction_id","field")
);
--> statement-breakpoint
CREATE TABLE "correction_evidence" (
	"correction_id" uuid NOT NULL,
	"source_item_id" uuid NOT NULL,
	CONSTRAINT "correction_evidence_correction_id_source_item_id_pk" PRIMARY KEY("correction_id","source_item_id")
);
--> statement-breakpoint
CREATE TABLE "corrections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"case_id" uuid NOT NULL,
	"target_type" "correction_target_type" NOT NULL,
	"target_public_id" text NOT NULL,
	"target_event_id" uuid,
	"target_entity_id" uuid,
	"reason_code" "correction_reason_code" NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"replacement_version" text NOT NULL,
	"internal_note" text NOT NULL,
	"actor_role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "corrections_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "corrections_case_id_unique" UNIQUE("case_id"),
	CONSTRAINT "corrections_target_matches_type" CHECK (("corrections"."target_type" = 'event' and "corrections"."target_event_id" is not null and "corrections"."target_entity_id" is null) or ("corrections"."target_type" = 'entity' and "corrections"."target_entity_id" is not null and "corrections"."target_event_id" is null))
);
--> statement-breakpoint
CREATE TABLE "editorial_cases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"kind" "editorial_case_kind" NOT NULL,
	"target_type" "editorial_case_target_type" NOT NULL,
	"target_public_id" text NOT NULL,
	"target_event_id" uuid,
	"target_entity_id" uuid,
	"target_source_item_id" uuid,
	"received_at" timestamp with time zone NOT NULL,
	"original_request" text NOT NULL,
	"evidence_summary" text NOT NULL,
	"status" "editorial_case_status" NOT NULL,
	"decision" "editorial_case_decision",
	"decided_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"previous_rights_status" "rights_status" NOT NULL,
	"actor_role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "editorial_cases_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "editorial_cases_target_matches_type" CHECK (("editorial_cases"."target_type" = 'event' and "editorial_cases"."target_event_id" is not null and num_nonnulls("editorial_cases"."target_entity_id", "editorial_cases"."target_source_item_id") = 0) or ("editorial_cases"."target_type" = 'entity' and "editorial_cases"."target_entity_id" is not null and num_nonnulls("editorial_cases"."target_event_id", "editorial_cases"."target_source_item_id") = 0) or ("editorial_cases"."target_type" = 'source_item' and "editorial_cases"."target_source_item_id" is not null and num_nonnulls("editorial_cases"."target_event_id", "editorial_cases"."target_entity_id") = 0)),
	CONSTRAINT "editorial_cases_decision_matches_status" CHECK (("editorial_cases"."status" in ('received', 'reviewing') and "editorial_cases"."decision" is null and "editorial_cases"."decided_at" is null and "editorial_cases"."closed_at" is null) or ("editorial_cases"."status" in ('actioned', 'rejected', 'appealed') and "editorial_cases"."decision" is not null and "editorial_cases"."decided_at" is not null and "editorial_cases"."closed_at" is null) or ("editorial_cases"."status" = 'closed' and "editorial_cases"."decision" is not null and "editorial_cases"."decided_at" is not null and "editorial_cases"."closed_at" is not null)),
	CONSTRAINT "editorial_cases_timestamps_move_forward" CHECK (("editorial_cases"."decided_at" is null or "editorial_cases"."decided_at" >= "editorial_cases"."received_at") and ("editorial_cases"."closed_at" is null or ("editorial_cases"."decided_at" is not null and "editorial_cases"."closed_at" >= "editorial_cases"."decided_at")) and "editorial_cases"."updated_at" >= "editorial_cases"."received_at")
);
--> statement-breakpoint
CREATE TABLE "entity_merge_alias_moves" (
	"entity_merge_id" uuid NOT NULL,
	"alias_id" uuid NOT NULL,
	CONSTRAINT "entity_merge_alias_moves_entity_merge_id_alias_id_pk" PRIMARY KEY("entity_merge_id","alias_id")
);
--> statement-breakpoint
CREATE TABLE "entity_merge_relation_moves" (
	"entity_merge_id" uuid NOT NULL,
	"relation_id" uuid NOT NULL,
	"role" "entity_merge_relation_role" NOT NULL,
	CONSTRAINT "entity_merge_relation_moves_entity_merge_id_relation_id_role_pk" PRIMARY KEY("entity_merge_id","relation_id","role")
);
--> statement-breakpoint
CREATE TABLE "entity_merge_version_moves" (
	"entity_merge_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	CONSTRAINT "entity_merge_version_moves_entity_merge_id_version_id_pk" PRIMARY KEY("entity_merge_id","version_id")
);
--> statement-breakpoint
CREATE TABLE "entity_merges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source_entity_id" uuid NOT NULL,
	"target_entity_id" uuid NOT NULL,
	"public_reason_code" "entity_merge_reason_code" NOT NULL,
	"internal_note" text NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"actor_role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entity_merges_source_entity_id_unique" UNIQUE("source_entity_id")
);
--> statement-breakpoint
CREATE TABLE "event_merge_correction_moves" (
	"event_merge_id" uuid NOT NULL,
	"correction_id" uuid NOT NULL,
	CONSTRAINT "event_merge_correction_moves_event_merge_id_correction_id_pk" PRIMARY KEY("event_merge_id","correction_id")
);
--> statement-breakpoint
CREATE TABLE "rights_decisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"case_id" uuid NOT NULL,
	"target_type" "rights_decision_target_type" NOT NULL,
	"target_public_id" text NOT NULL,
	"target_event_id" uuid,
	"target_entity_id" uuid,
	"target_source_item_id" uuid,
	"from_status" "rights_status" NOT NULL,
	"to_status" "rights_status" NOT NULL,
	"public_reason_code" "rights_decision_reason_code" NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"internal_note" text NOT NULL,
	"actor_role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rights_decisions_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "rights_decisions_case_id_unique" UNIQUE("case_id"),
	CONSTRAINT "rights_decisions_target_matches_type" CHECK (("rights_decisions"."target_type" = 'event' and "rights_decisions"."target_event_id" is not null and num_nonnulls("rights_decisions"."target_entity_id", "rights_decisions"."target_source_item_id") = 0) or ("rights_decisions"."target_type" = 'entity' and "rights_decisions"."target_entity_id" is not null and num_nonnulls("rights_decisions"."target_event_id", "rights_decisions"."target_source_item_id") = 0) or ("rights_decisions"."target_type" = 'source_item' and "rights_decisions"."target_source_item_id" is not null and num_nonnulls("rights_decisions"."target_event_id", "rights_decisions"."target_entity_id") = 0)),
	CONSTRAINT "rights_decisions_withdrawal_semantics" CHECK ("rights_decisions"."to_status" = 'withdrawn' and (("rights_decisions"."target_type" = 'source_item' and "rights_decisions"."public_reason_code" = 'source_withdrawal') or ("rights_decisions"."target_type" in ('event', 'entity') and "rights_decisions"."public_reason_code" = 'rights_withdrawal')))
);
--> statement-breakpoint
CREATE TABLE "tombstones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"object_public_id" text NOT NULL,
	"object_type" "tombstone_object_type" NOT NULL,
	"status" "tombstone_status" NOT NULL,
	"public_reason_code" "tombstone_reason_code" NOT NULL,
	"replacement_public_id" text,
	"effective_at" timestamp with time zone NOT NULL,
	"case_reference_public_id" text,
	"event_merge_id" uuid,
	"entity_merge_id" uuid,
	"rights_decision_id" uuid,
	"cleared_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tombstones_payload_matches_status" CHECK (("tombstones"."status" = 'merged_into' and (("tombstones"."object_type" = 'event' and "tombstones"."public_reason_code" = 'duplicate_coverage' and "tombstones"."event_merge_id" is not null and "tombstones"."entity_merge_id" is null) or ("tombstones"."object_type" = 'entity' and "tombstones"."public_reason_code" = 'duplicate_identity' and "tombstones"."entity_merge_id" is not null and "tombstones"."event_merge_id" is null)) and "tombstones"."replacement_public_id" is not null and "tombstones"."case_reference_public_id" is null and "tombstones"."rights_decision_id" is null) or ("tombstones"."status" = 'withdrawn' and "tombstones"."object_type" in ('event', 'entity') and "tombstones"."public_reason_code" = 'rights_withdrawal' and "tombstones"."replacement_public_id" is null and "tombstones"."case_reference_public_id" is not null and "tombstones"."rights_decision_id" is not null and num_nonnulls("tombstones"."event_merge_id", "tombstones"."entity_merge_id") = 0) or ("tombstones"."status" = 'source_withdrawn' and "tombstones"."object_type" = 'event' and "tombstones"."public_reason_code" = 'source_withdrawal' and "tombstones"."replacement_public_id" is null and "tombstones"."case_reference_public_id" is not null and "tombstones"."rights_decision_id" is not null and num_nonnulls("tombstones"."event_merge_id", "tombstones"."entity_merge_id") = 0) or ("tombstones"."status" = 'reviewing' and "tombstones"."object_type" in ('event', 'entity') and "tombstones"."public_reason_code" = 'high_risk_review' and "tombstones"."replacement_public_id" is null and "tombstones"."case_reference_public_id" is not null and num_nonnulls("tombstones"."event_merge_id", "tombstones"."entity_merge_id", "tombstones"."rights_decision_id") = 0))
);
--> statement-breakpoint
ALTER TABLE "correction_changes" ADD CONSTRAINT "correction_changes_correction_id_corrections_id_fk" FOREIGN KEY ("correction_id") REFERENCES "public"."corrections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correction_evidence" ADD CONSTRAINT "correction_evidence_correction_id_corrections_id_fk" FOREIGN KEY ("correction_id") REFERENCES "public"."corrections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correction_evidence" ADD CONSTRAINT "correction_evidence_source_item_id_source_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."source_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_case_id_editorial_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."editorial_cases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_target_event_id_events_id_fk" FOREIGN KEY ("target_event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_target_entity_id_entities_id_fk" FOREIGN KEY ("target_entity_id") REFERENCES "public"."entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_cases" ADD CONSTRAINT "editorial_cases_target_event_id_events_id_fk" FOREIGN KEY ("target_event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_cases" ADD CONSTRAINT "editorial_cases_target_entity_id_entities_id_fk" FOREIGN KEY ("target_entity_id") REFERENCES "public"."entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_cases" ADD CONSTRAINT "editorial_cases_target_source_item_id_source_items_id_fk" FOREIGN KEY ("target_source_item_id") REFERENCES "public"."source_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_merge_alias_moves" ADD CONSTRAINT "entity_merge_alias_moves_entity_merge_id_entity_merges_id_fk" FOREIGN KEY ("entity_merge_id") REFERENCES "public"."entity_merges"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_merge_alias_moves" ADD CONSTRAINT "entity_merge_alias_moves_alias_id_entity_aliases_id_fk" FOREIGN KEY ("alias_id") REFERENCES "public"."entity_aliases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_merge_relation_moves" ADD CONSTRAINT "entity_merge_relation_moves_entity_merge_id_entity_merges_id_fk" FOREIGN KEY ("entity_merge_id") REFERENCES "public"."entity_merges"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_merge_relation_moves" ADD CONSTRAINT "entity_merge_relation_moves_relation_id_relations_id_fk" FOREIGN KEY ("relation_id") REFERENCES "public"."relations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_merge_version_moves" ADD CONSTRAINT "entity_merge_version_moves_entity_merge_id_entity_merges_id_fk" FOREIGN KEY ("entity_merge_id") REFERENCES "public"."entity_merges"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_merge_version_moves" ADD CONSTRAINT "entity_merge_version_moves_version_id_entity_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."entity_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_merges" ADD CONSTRAINT "entity_merges_source_entity_id_entities_id_fk" FOREIGN KEY ("source_entity_id") REFERENCES "public"."entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_merges" ADD CONSTRAINT "entity_merges_target_entity_id_entities_id_fk" FOREIGN KEY ("target_entity_id") REFERENCES "public"."entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_merge_correction_moves" ADD CONSTRAINT "event_merge_correction_moves_event_merge_id_event_merges_id_fk" FOREIGN KEY ("event_merge_id") REFERENCES "public"."event_merges"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_merge_correction_moves" ADD CONSTRAINT "event_merge_correction_moves_correction_id_corrections_id_fk" FOREIGN KEY ("correction_id") REFERENCES "public"."corrections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rights_decisions" ADD CONSTRAINT "rights_decisions_case_id_editorial_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."editorial_cases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rights_decisions" ADD CONSTRAINT "rights_decisions_target_event_id_events_id_fk" FOREIGN KEY ("target_event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rights_decisions" ADD CONSTRAINT "rights_decisions_target_entity_id_entities_id_fk" FOREIGN KEY ("target_entity_id") REFERENCES "public"."entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rights_decisions" ADD CONSTRAINT "rights_decisions_target_source_item_id_source_items_id_fk" FOREIGN KEY ("target_source_item_id") REFERENCES "public"."source_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tombstones" ADD CONSTRAINT "tombstones_event_merge_id_event_merges_id_fk" FOREIGN KEY ("event_merge_id") REFERENCES "public"."event_merges"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tombstones" ADD CONSTRAINT "tombstones_entity_merge_id_entity_merges_id_fk" FOREIGN KEY ("entity_merge_id") REFERENCES "public"."entity_merges"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tombstones" ADD CONSTRAINT "tombstones_rights_decision_id_rights_decisions_id_fk" FOREIGN KEY ("rights_decision_id") REFERENCES "public"."rights_decisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tombstones_active_object_unique" ON "tombstones" USING btree ("object_type","object_public_id") WHERE "tombstones"."cleared_at" is null;--> statement-breakpoint
INSERT INTO "tombstones" (
	"id",
	"object_public_id",
	"object_type",
	"status",
	"public_reason_code",
	"replacement_public_id",
	"effective_at",
	"event_merge_id"
)
SELECT
	"event_merges"."id",
	"source_events"."public_id",
	'event',
	'merged_into',
	'duplicate_coverage',
	"target_events"."public_id",
	"event_merges"."merged_at",
	"event_merges"."id"
FROM "event_merges"
INNER JOIN "events" AS "source_events"
	ON "source_events"."id" = "event_merges"."source_event_id"
INNER JOIN "events" AS "target_events"
	ON "target_events"."id" = "event_merges"."target_event_id"
WHERE "event_merges"."status" = 'active';
