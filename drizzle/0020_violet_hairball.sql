ALTER TABLE "event_sources" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "correction_changes" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "correction_evidence" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;