CREATE TYPE "public"."event_merge_status" AS ENUM('active', 'split');--> statement-breakpoint
CREATE TABLE "event_cluster_audits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"actor_role" text NOT NULL,
	"source_event_id" uuid NOT NULL,
	"target_event_id" uuid NOT NULL,
	"internal_note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_merge_source_moves" (
	"event_merge_id" uuid NOT NULL,
	"source_item_id" uuid NOT NULL,
	CONSTRAINT "event_merge_source_moves_event_merge_id_source_item_id_pk" PRIMARY KEY("event_merge_id","source_item_id")
);
--> statement-breakpoint
CREATE TABLE "event_merges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source_event_id" uuid NOT NULL,
	"target_event_id" uuid NOT NULL,
	"status" "event_merge_status" DEFAULT 'active' NOT NULL,
	"public_reason_code" text NOT NULL,
	"merged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"split_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "event_merge_relation_moves" (
	"event_merge_id" uuid NOT NULL,
	"relation_id" uuid NOT NULL,
	"original_event_id" uuid NOT NULL,
	CONSTRAINT "event_merge_relation_moves_event_merge_id_relation_id_pk" PRIMARY KEY("event_merge_id","relation_id")
);
--> statement-breakpoint
ALTER TABLE "source_items" ADD COLUMN "external_id_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "source_items" ADD COLUMN "is_original_source" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "event_cluster_audits" ADD CONSTRAINT "event_cluster_audits_source_event_id_events_id_fk" FOREIGN KEY ("source_event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_cluster_audits" ADD CONSTRAINT "event_cluster_audits_target_event_id_events_id_fk" FOREIGN KEY ("target_event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_merge_source_moves" ADD CONSTRAINT "event_merge_source_moves_event_merge_id_event_merges_id_fk" FOREIGN KEY ("event_merge_id") REFERENCES "public"."event_merges"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_merge_source_moves" ADD CONSTRAINT "event_merge_source_moves_source_item_id_source_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."source_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_merges" ADD CONSTRAINT "event_merges_source_event_id_events_id_fk" FOREIGN KEY ("source_event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_merges" ADD CONSTRAINT "event_merges_target_event_id_events_id_fk" FOREIGN KEY ("target_event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_merge_relation_moves" ADD CONSTRAINT "event_merge_relation_moves_event_merge_id_event_merges_id_fk" FOREIGN KEY ("event_merge_id") REFERENCES "public"."event_merges"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_merge_relation_moves" ADD CONSTRAINT "event_merge_relation_moves_relation_id_relations_id_fk" FOREIGN KEY ("relation_id") REFERENCES "public"."relations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_merge_relation_moves" ADD CONSTRAINT "event_merge_relation_moves_original_event_id_events_id_fk" FOREIGN KEY ("original_event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_merges_active_source_unique" ON "event_merges" USING btree ("source_event_id") WHERE "event_merges"."status" = 'active';--> statement-breakpoint
ALTER TABLE "event_sources" ADD CONSTRAINT "event_sources_source_item_id_unique" UNIQUE("source_item_id");