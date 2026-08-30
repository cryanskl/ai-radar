ALTER TABLE "github_source_item_metadata" ADD COLUMN "parent_repository" jsonb;--> statement-breakpoint
ALTER TABLE "github_source_item_metadata" ADD COLUMN "source_repository" jsonb;--> statement-breakpoint
ALTER TABLE "github_source_item_metadata" ADD COLUMN "template_repository" jsonb;