CREATE TYPE "public"."data_release_file_name" AS ENUM('schema.json', 'records.json', 'corrections.json', 'tombstones.json', 'manifest.json');--> statement-breakpoint
CREATE TYPE "public"."data_release_mirror_provider" AS ENUM('feishu', 'baidu');--> statement-breakpoint
CREATE TABLE "data_release_files" (
	"release_id" uuid NOT NULL,
	"name" "data_release_file_name" NOT NULL,
	"media_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"record_count" integer,
	"checksum_sha256" text NOT NULL,
	"content" text NOT NULL,
	CONSTRAINT "data_release_files_release_id_name_pk" PRIMARY KEY("release_id","name")
);
--> statement-breakpoint
CREATE TABLE "data_release_mirrors" (
	"release_id" uuid PRIMARY KEY NOT NULL,
	"provider" "data_release_mirror_provider" NOT NULL,
	"url" text NOT NULL,
	"verified_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_release_publications" (
	"release_id" uuid PRIMARY KEY NOT NULL,
	"canonical_verified_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	CONSTRAINT "data_release_publication_verification_order" CHECK ("data_release_publications"."published_at" >= "data_release_publications"."canonical_verified_at")
);
--> statement-breakpoint
CREATE TABLE "data_releases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"data_version" text NOT NULL,
	"schema_version" text NOT NULL,
	"data_cutoff" timestamp with time zone NOT NULL,
	"canonical_url" text NOT NULL,
	"manifest_sha256" text NOT NULL,
	"license" text NOT NULL,
	"attribution" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_releases_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "data_releases_data_version_unique" UNIQUE("data_version")
);
--> statement-breakpoint
ALTER TABLE "data_release_files" ADD CONSTRAINT "data_release_files_release_id_data_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."data_releases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_release_mirrors" ADD CONSTRAINT "data_release_mirrors_release_id_data_release_publications_release_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."data_release_publications"("release_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_release_publications" ADD CONSTRAINT "data_release_publications_release_id_data_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."data_releases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "data_release_publications_published_at_idx" ON "data_release_publications" USING btree ("published_at");
--> statement-breakpoint
CREATE FUNCTION reject_data_release_artifact_mutation() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'Data Release artifacts are immutable';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER data_releases_immutable
	BEFORE UPDATE OR DELETE ON "data_releases"
	FOR EACH ROW EXECUTE FUNCTION reject_data_release_artifact_mutation();
--> statement-breakpoint
CREATE TRIGGER data_release_files_immutable
	BEFORE UPDATE OR DELETE ON "data_release_files"
	FOR EACH ROW EXECUTE FUNCTION reject_data_release_artifact_mutation();
--> statement-breakpoint
CREATE TRIGGER data_release_publications_immutable
	BEFORE UPDATE OR DELETE ON "data_release_publications"
	FOR EACH ROW EXECUTE FUNCTION reject_data_release_artifact_mutation();
--> statement-breakpoint
CREATE FUNCTION require_complete_data_release_files() RETURNS trigger AS $$
BEGIN
	IF (SELECT count(*) FROM data_release_files WHERE release_id = NEW.release_id) <> 5 THEN
		RAISE EXCEPTION 'Data Release publication requires exactly five files';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER data_release_publication_requires_files
	BEFORE INSERT ON "data_release_publications"
	FOR EACH ROW EXECUTE FUNCTION require_complete_data_release_files();
