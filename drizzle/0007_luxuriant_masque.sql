CREATE TYPE "public"."search_object_kind" AS ENUM('event', 'entity');--> statement-breakpoint
CREATE TYPE "public"."search_public_status" AS ENUM('public', 'source_withdrawn');--> statement-breakpoint
CREATE TYPE "public"."search_term_reason" AS ENUM('public_id', 'canonical_url', 'external_id', 'official_name', 'alias');--> statement-breakpoint
CREATE TABLE "search_documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"object_kind" "search_object_kind" NOT NULL,
	"object_id" uuid NOT NULL,
	"public_id" text NOT NULL,
	"entity_type" "entity_type",
	"locale" "content_locale" NOT NULL,
	"name" text NOT NULL,
	"summary" text NOT NULL,
	"search_name" text NOT NULL,
	"search_text" text NOT NULL,
	"occurred_at" timestamp with time zone,
	"latest_at" timestamp with time zone NOT NULL,
	"last_verified_at" timestamp with time zone NOT NULL,
	"source_name" text,
	"source_url" text,
	"status" "search_public_status" NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_documents_object_kind_object_id_locale_unique" UNIQUE("object_kind","object_id","locale")
);
--> statement-breakpoint
CREATE TABLE "search_snapshot_items" (
	"snapshot_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"payload" jsonb NOT NULL,
	CONSTRAINT "search_snapshot_items_snapshot_id_position_pk" PRIMARY KEY("snapshot_id","position")
);
--> statement-breakpoint
CREATE TABLE "search_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"request_key" text NOT NULL,
	"ranking_state" text NOT NULL,
	"data_cutoff" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"total_count" integer NOT NULL,
	"truncated" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_terms" (
	"id" uuid PRIMARY KEY NOT NULL,
	"object_kind" "search_object_kind" NOT NULL,
	"object_id" uuid NOT NULL,
	"locale" "content_locale",
	"reason" "search_term_reason" NOT NULL,
	"value" text NOT NULL,
	"normalized_value" text NOT NULL
);
--> statement-breakpoint
INSERT INTO "search_documents" (
	"id", "object_kind", "object_id", "public_id", "entity_type", "locale",
	"name", "summary", "search_name", "search_text", "occurred_at",
	"latest_at", "last_verified_at", "source_name", "source_url", "status", "indexed_at"
)
SELECT gen_random_uuid(), 'entity', entity."id", entity."public_id",
	entity."type", localization."locale", localization."name",
	localization."summary",
	concat_ws(' ', entity."official_name", localization."name"),
	concat_ws(' ', entity."official_name", localization."name", localization."summary"),
	NULL, greatest(
		entity."created_at",
		coalesce((
			SELECT max(version."released_at")
			FROM "entity_versions" version
			WHERE version."entity_id" = entity."id"
				AND version."public_visibility" = true
		), entity."created_at")
	), entity."last_verified_at",
	entity."official_name", entity."official_url", 'public', clock_timestamp()
FROM "entities" entity
JOIN "entity_localized_contents" localization
	ON localization."entity_id" = entity."id"
	AND localization."review_status" = 'reviewed'
	AND localization."public_visibility" = true
WHERE entity."lifecycle_status" = 'active'
	AND entity."public_visibility" = true;--> statement-breakpoint
INSERT INTO "search_documents" (
	"id", "object_kind", "object_id", "public_id", "entity_type", "locale",
	"name", "summary", "search_name", "search_text", "occurred_at",
	"latest_at", "last_verified_at", "source_name", "source_url", "status", "indexed_at"
)
SELECT gen_random_uuid(), 'event', event."id", event."public_id", NULL,
	localization."locale", localization."title", localization."summary",
	localization."title",
	concat_ws(' ', localization."title", localization."summary"),
	event."occurred_at", event."occurred_at", event."last_verified_at",
	primary_source."source_name", primary_source."source_url",
	CASE WHEN EXISTS (
		SELECT 1 FROM "event_sources" withdrawn_link
		JOIN "source_items" withdrawn_source
			ON withdrawn_source."id" = withdrawn_link."source_item_id"
		WHERE withdrawn_link."event_id" = event."id"
			AND withdrawn_source."rights_status" = 'withdrawn'
	) THEN 'source_withdrawn'::search_public_status
	ELSE 'public'::search_public_status END, clock_timestamp()
FROM "events" event
JOIN "localized_contents" localization
	ON localization."event_id" = event."id"
	AND localization."review_status" = 'reviewed'
	AND localization."public_visibility" = true
JOIN LATERAL (
	SELECT source."name" AS source_name, source_item."canonical_url" AS source_url
	FROM "event_sources" event_source
	JOIN "source_items" source_item
		ON source_item."id" = event_source."source_item_id"
		AND source_item."public_visibility" = true
	JOIN "sources" source ON source."id" = source_item."source_id"
	WHERE event_source."event_id" = event."id"
	ORDER BY event_source."is_primary" DESC, source_item."public_id"
	LIMIT 1
) primary_source ON true
WHERE event."publication_state" IN ('published', 'corrected')
	AND event."public_visibility" = true;--> statement-breakpoint
INSERT INTO "search_terms" (
	"id", "object_kind", "object_id", "locale", "reason", "value", "normalized_value"
)
SELECT gen_random_uuid(), 'entity', entity."id", term.locale,
	term.reason::search_term_reason, term.value, lower(normalize(term.value, NFKC))
FROM "entities" entity
CROSS JOIN LATERAL (
	SELECT NULL::content_locale AS locale, 'public_id'::text AS reason,
		entity."public_id" AS value
	UNION ALL SELECT NULL, 'canonical_url', entity."official_url"
	UNION ALL SELECT NULL, 'official_name', entity."official_name"
	UNION ALL
	SELECT alias."locale", 'alias', alias."value"
	FROM "entity_aliases" alias
	WHERE alias."entity_id" = entity."id" AND alias."public_visibility" = true
	UNION ALL
	SELECT NULL, 'external_id', version."public_id"
	FROM "entity_versions" version
	WHERE version."entity_id" = entity."id" AND version."public_visibility" = true
	UNION ALL
	SELECT NULL, 'external_id', version."version_label"
	FROM "entity_versions" version
	WHERE version."entity_id" = entity."id" AND version."public_visibility" = true
) term
WHERE entity."lifecycle_status" = 'active'
	AND entity."public_visibility" = true;--> statement-breakpoint
INSERT INTO "search_terms" (
	"id", "object_kind", "object_id", "locale", "reason", "value", "normalized_value"
)
SELECT gen_random_uuid(), 'event', event."id", term.locale,
	term.reason::search_term_reason, term.value, lower(normalize(term.value, NFKC))
FROM "events" event
CROSS JOIN LATERAL (
	SELECT NULL::content_locale AS locale, 'public_id'::text AS reason,
		event."public_id" AS value
	UNION ALL
	SELECT NULL, 'canonical_url', source_item."canonical_url"
	FROM "event_sources" event_source
	JOIN "source_items" source_item
		ON source_item."id" = event_source."source_item_id"
		AND source_item."public_visibility" = true
	WHERE event_source."event_id" = event."id"
	UNION ALL
	SELECT NULL, 'canonical_url', source_item."original_url"
	FROM "event_sources" event_source
	JOIN "source_items" source_item
		ON source_item."id" = event_source."source_item_id"
		AND source_item."public_visibility" = true
	WHERE event_source."event_id" = event."id"
	UNION ALL
	SELECT source_item."original_language", 'external_id', source_item."external_id"
	FROM "event_sources" event_source
	JOIN "source_items" source_item
		ON source_item."id" = event_source."source_item_id"
		AND source_item."public_visibility" = true
	WHERE event_source."event_id" = event."id"
	UNION ALL
	SELECT source_item."original_language", 'external_id', source_item."public_id"
	FROM "event_sources" event_source
	JOIN "source_items" source_item
		ON source_item."id" = event_source."source_item_id"
		AND source_item."public_visibility" = true
	WHERE event_source."event_id" = event."id"
) term
WHERE event."publication_state" IN ('published', 'corrected')
	AND event."public_visibility" = true
	AND EXISTS (
		SELECT 1 FROM "event_sources" public_link
		JOIN "source_items" public_source
			ON public_source."id" = public_link."source_item_id"
			AND public_source."public_visibility" = true
		WHERE public_link."event_id" = event."id"
	);--> statement-breakpoint
ALTER TABLE "search_snapshot_items" ADD CONSTRAINT "search_snapshot_items_snapshot_id_search_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."search_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "search_documents_object_idx" ON "search_documents" USING btree ("object_kind","object_id");--> statement-breakpoint
CREATE INDEX "search_documents_public_id_idx" ON "search_documents" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "search_documents_search_vector_idx" ON "search_documents" USING gin (to_tsvector('simple', "search_text"));--> statement-breakpoint
CREATE INDEX "search_documents_name_trgm_idx" ON "search_documents" USING gin (lower("search_name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "search_terms_exact_idx" ON "search_terms" USING btree ("normalized_value");--> statement-breakpoint
CREATE INDEX "search_terms_object_idx" ON "search_terms" USING btree ("object_kind","object_id");--> statement-breakpoint
CREATE INDEX "search_terms_trgm_idx" ON "search_terms" USING gin ("normalized_value" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "search_terms_search_vector_idx" ON "search_terms" USING gin (to_tsvector('simple', "value"));--> statement-breakpoint
CREATE INDEX "search_snapshots_expiry_idx" ON "search_snapshots" USING btree ("expires_at");
