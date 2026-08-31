import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { databasePool } from "@/db/client";
import {
  dataReleaseCreateRequestSchema,
  dataReleaseFileSchema,
  dataReleaseMirrorRequestSchema,
  dataReleaseValidationIssueSchema,
  generatedDataReleaseSchema,
  publicDataReleaseDetailSchema,
} from "./contracts";
import { verifyCanonicalRelease, verifyMirrorFiles } from "./remote";

const schemaVersion = "1.0.0";
const publicRights = [
  "open",
  "attribution_required",
  "source_license",
  "metadata_only",
  "link_only",
] as const;
const fileNames = [
  "schema.json",
  "records.json",
  "corrections.json",
  "tombstones.json",
  "manifest.json",
] as const;

const releaseSourceSchema = z
  .object({
    publicId: z.string().min(1),
    name: z.string().min(1),
    url: z.url(),
    rightsStatus: z.enum(publicRights),
    attribution: z.string().min(1),
    licenseUrl: z.url().nullable(),
    rightsCheckedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

const releaseLocalizationSchema = z
  .object({
    locale: z.enum(["en", "zh"]),
    title: z.string().min(1),
    summary: z.string(),
    authorship: z.enum([
      "human_authored",
      "ai_translated",
      "official_translation",
    ]),
    reviewStatus: z.literal("reviewed"),
  })
  .strict();

const releaseEventSchema = z
  .object({
    type: z.literal("event"),
    publicId: z.string().min(1),
    eventType: z.string().min(1),
    factStatus: z.string().min(1),
    occurredAt: z.iso.datetime({ offset: true }),
    occurredAtPrecision: z.enum(["day", "minute", "second"]),
    firstPublishedAt: z.iso.datetime({ offset: true }),
    rightsStatus: z.enum(publicRights),
    privacyStatus: z.literal("public"),
    lastVerifiedAt: z.iso.datetime({ offset: true }),
    sources: z.array(releaseSourceSchema).min(1),
    localizations: z.array(releaseLocalizationSchema).length(2),
  })
  .strict();

const correctionChangeSchema = z
  .object({
    field: z.string().min(1),
    previousValue: z.string(),
    correctedValue: z.string(),
  })
  .strict();

const correctionEvidenceSchema = z
  .object({
    sourceItemPublicId: z.string().min(1),
    originalTitle: z.string().min(1),
    originalUrl: z.url(),
    rightsStatus: z.enum(publicRights),
    attribution: z.string().min(1),
    licenseUrl: z.url().nullable(),
    rightsCheckedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

const releaseCorrectionSchema = z.union([
  z
    .object({
      publicId: z.string().min(1),
      targetType: z.enum(["event", "entity"]),
      targetPublicId: z.string().min(1),
      casePublicId: z.string().min(1),
      reasonCode: z.string().min(1),
      changes: z.array(correctionChangeSchema).min(1),
      evidence: z.array(correctionEvidenceSchema).min(1),
      effectiveAt: z.iso.datetime({ offset: true }),
      lastVerifiedAt: z.iso.datetime({ offset: true }),
      replacementVersion: z.string().min(1),
    })
    .strict(),
  z
    .object({
      publicId: z.string().min(1),
      targetType: z.enum(["event", "entity"]),
      targetPublicId: z.string().min(1),
      casePublicId: z.string().min(1),
      reasonCode: z.string().min(1),
      status: z.literal("redacted_due_to_rights"),
      effectiveAt: z.iso.datetime({ offset: true }),
      lastVerifiedAt: z.iso.datetime({ offset: true }),
      replacementVersion: z.string().min(1),
    })
    .strict(),
]);

const releaseTombstoneSchema = z
  .object({
    publicId: z.string().min(1),
    objectType: z.enum(["event", "entity"]),
    status: z.enum([
      "merged_into",
      "withdrawn",
      "source_withdrawn",
      "reviewing",
    ]),
    reasonCode: z.string().min(1),
    effectiveAt: z.iso.datetime({ offset: true }),
    replacementPublicId: z.string().nullable(),
    caseReferencePublicId: z.string().nullable(),
  })
  .strict();

const releaseRecordsSchema = z
  .object({ events: z.array(releaseEventSchema) })
  .strict();

type CreateDataReleaseInput = z.infer<typeof dataReleaseCreateRequestSchema>;

type StoredFile = {
  name: (typeof fileNames)[number];
  mediaType: "application/json";
  byteSize: number;
  recordCount: number | null;
  checksumSha256: string;
  content: string;
};

const publicArtifactSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://github.com/cryanskl/ai-radar/releases/download/data-schema-1.0.0/schema.json",
  title: "AI Radar Public Data Release",
  version: schemaVersion,
  $defs: {
    source: {
      type: "object",
      additionalProperties: false,
      required: [
        "publicId",
        "name",
        "url",
        "rightsStatus",
        "attribution",
        "licenseUrl",
        "rightsCheckedAt",
      ],
      properties: {
        publicId: { type: "string", minLength: 1 },
        name: { type: "string", minLength: 1 },
        url: { type: "string", format: "uri" },
        rightsStatus: { enum: [...publicRights] },
        attribution: { type: "string", minLength: 1 },
        licenseUrl: {
          anyOf: [{ type: "string", format: "uri" }, { type: "null" }],
        },
        rightsCheckedAt: { type: "string", format: "date-time" },
      },
    },
    localization: {
      type: "object",
      additionalProperties: false,
      required: ["locale", "title", "summary", "authorship", "reviewStatus"],
      properties: {
        locale: { enum: ["en", "zh"] },
        title: { type: "string", minLength: 1 },
        summary: { type: "string" },
        authorship: {
          enum: ["human_authored", "ai_translated", "official_translation"],
        },
        reviewStatus: { const: "reviewed" },
      },
    },
    event: {
      type: "object",
      additionalProperties: false,
      required: [
        "type",
        "publicId",
        "eventType",
        "factStatus",
        "occurredAt",
        "occurredAtPrecision",
        "firstPublishedAt",
        "rightsStatus",
        "privacyStatus",
        "lastVerifiedAt",
        "sources",
        "localizations",
      ],
      properties: {
        type: { const: "event" },
        publicId: { type: "string", minLength: 1 },
        eventType: { type: "string", minLength: 1 },
        factStatus: { type: "string", minLength: 1 },
        occurredAt: { type: "string", format: "date-time" },
        occurredAtPrecision: { enum: ["day", "minute", "second"] },
        firstPublishedAt: { type: "string", format: "date-time" },
        rightsStatus: { enum: [...publicRights] },
        privacyStatus: { const: "public" },
        lastVerifiedAt: { type: "string", format: "date-time" },
        sources: {
          type: "array",
          minItems: 1,
          items: { $ref: "#/$defs/source" },
        },
        localizations: {
          type: "array",
          minItems: 2,
          maxItems: 2,
          items: { $ref: "#/$defs/localization" },
        },
      },
    },
    correctionDetails: {
      type: "object",
      additionalProperties: false,
      required: [
        "publicId",
        "targetType",
        "targetPublicId",
        "casePublicId",
        "reasonCode",
        "changes",
        "evidence",
        "effectiveAt",
        "lastVerifiedAt",
        "replacementVersion",
      ],
      properties: {
        publicId: { type: "string", minLength: 1 },
        targetType: { enum: ["event", "entity"] },
        targetPublicId: { type: "string", minLength: 1 },
        casePublicId: { type: "string", minLength: 1 },
        reasonCode: { type: "string", minLength: 1 },
        changes: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["field", "previousValue", "correctedValue"],
            properties: {
              field: { type: "string", minLength: 1 },
              previousValue: { type: "string" },
              correctedValue: { type: "string" },
            },
          },
        },
        evidence: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "sourceItemPublicId",
              "originalTitle",
              "originalUrl",
              "rightsStatus",
              "attribution",
              "licenseUrl",
              "rightsCheckedAt",
            ],
            properties: {
              sourceItemPublicId: { type: "string", minLength: 1 },
              originalTitle: { type: "string", minLength: 1 },
              originalUrl: { type: "string", format: "uri" },
              rightsStatus: { enum: [...publicRights] },
              attribution: { type: "string", minLength: 1 },
              licenseUrl: {
                anyOf: [{ type: "string", format: "uri" }, { type: "null" }],
              },
              rightsCheckedAt: { type: "string", format: "date-time" },
            },
          },
        },
        effectiveAt: { type: "string", format: "date-time" },
        lastVerifiedAt: { type: "string", format: "date-time" },
        replacementVersion: { type: "string", minLength: 1 },
      },
    },
    correctionRedacted: {
      type: "object",
      additionalProperties: false,
      required: [
        "publicId",
        "targetType",
        "targetPublicId",
        "casePublicId",
        "reasonCode",
        "status",
        "effectiveAt",
        "lastVerifiedAt",
        "replacementVersion",
      ],
      properties: {
        publicId: { type: "string", minLength: 1 },
        targetType: { enum: ["event", "entity"] },
        targetPublicId: { type: "string", minLength: 1 },
        casePublicId: { type: "string", minLength: 1 },
        reasonCode: { type: "string", minLength: 1 },
        status: { const: "redacted_due_to_rights" },
        effectiveAt: { type: "string", format: "date-time" },
        lastVerifiedAt: { type: "string", format: "date-time" },
        replacementVersion: { type: "string", minLength: 1 },
      },
    },
    tombstone: {
      type: "object",
      additionalProperties: false,
      required: [
        "publicId",
        "objectType",
        "status",
        "reasonCode",
        "effectiveAt",
        "replacementPublicId",
        "caseReferencePublicId",
      ],
      properties: {
        publicId: { type: "string", minLength: 1 },
        objectType: { enum: ["event", "entity"] },
        status: {
          enum: ["merged_into", "withdrawn", "source_withdrawn", "reviewing"],
        },
        reasonCode: { type: "string", minLength: 1 },
        effectiveAt: { type: "string", format: "date-time" },
        replacementPublicId: {
          type: ["string", "null"],
        },
        caseReferencePublicId: {
          type: ["string", "null"],
        },
      },
    },
    recordsFile: {
      type: "object",
      additionalProperties: false,
      required: ["events"],
      properties: {
        events: { type: "array", items: { $ref: "#/$defs/event" } },
      },
    },
    correctionsFile: {
      type: "array",
      items: {
        oneOf: [
          { $ref: "#/$defs/correctionDetails" },
          { $ref: "#/$defs/correctionRedacted" },
        ],
      },
    },
    tombstonesFile: {
      type: "array",
      items: { $ref: "#/$defs/tombstone" },
    },
  },
} as const;

const forbiddenPrivacyPattern =
  /(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|"(?:internalNote|originalRequest|accessToken|cookie|email)"\s*:)/i;

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (content: string) =>
  createHash("sha256").update(content).digest("hex");

const artifactFile = (
  name: StoredFile["name"],
  value: unknown,
  recordCount: number | null,
): StoredFile => {
  const content = json(value);
  return {
    name,
    mediaType: "application/json",
    byteSize: Buffer.byteLength(content),
    recordCount,
    checksumSha256: sha256(content),
    content,
  };
};

const fileMetadata = (file: StoredFile) => ({
  name: file.name,
  mediaType: file.mediaType,
  byteSize: file.byteSize,
  recordCount: file.recordCount,
  checksumSha256: file.checksumSha256,
});

export class DataReleaseValidationError extends Error {
  constructor(
    readonly issues: Array<z.infer<typeof dataReleaseValidationIssueSchema>>,
  ) {
    super("Data Release validation failed");
  }
}

const validatePublicCandidates = async (
  client: PoolClient,
  dataCutoff: Date,
) => {
  const result = await client.query<{
    code: z.infer<typeof dataReleaseValidationIssueSchema>["code"];
    record_type: "event" | "correction";
    public_id: string;
  }>(
    `select code, record_type, public_id
     from (
       select 'rights_not_exportable'::text as code, 'event'::text as record_type,
         event.public_id
       from events event
       where event.public_visibility = true
         and event.publication_state in ('published', 'corrected')
         and event.rights_status::text <> all($1::text[])
       union all
       select 'public_schema_violation', 'event', event.public_id
       from events event
       where event.public_visibility = true
         and event.publication_state in ('published', 'corrected')
         and event.rights_status::text = any($1::text[])
         and event.first_published_at is null
       union all
       select 'record_after_data_cutoff', 'event', event.public_id
       from events event
       where event.public_visibility = true
         and event.publication_state in ('published', 'corrected')
         and event.rights_status::text = any($1::text[])
         and (
           event.last_verified_at > $2 or event.updated_at > $2
           or exists (
             select 1 from localized_contents localization
             where localization.event_id = event.id
               and localization.public_visibility = true
               and localization.updated_at > $2
           )
           or exists (
             select 1
             from event_sources event_source
             join source_items source_item on source_item.id = event_source.source_item_id
             join sources source on source.id = source_item.source_id
             where event_source.event_id = event.id
               and (event_source.created_at > $2
                 or source_item.updated_at > $2
                 or source_item.rights_checked_at > $2
                 or source.updated_at > $2)
           )
         )
       union all
       select 'record_after_data_cutoff', 'correction', correction.public_id
       from corrections correction
       where correction.effective_at <= $2
         and correction.created_at <= $2
         and (
           exists (
             select 1 from correction_changes change
             where change.correction_id = correction.id
               and change.created_at > $2
           )
           or exists (
             select 1 from correction_evidence evidence
             where evidence.correction_id = correction.id
               and evidence.created_at > $2
           )
         )
       union all
       select 'missing_provenance', 'event', event.public_id
       from events event
       where event.public_visibility = true
         and event.publication_state in ('published', 'corrected')
         and event.rights_status::text = any($1::text[])
         and event.last_verified_at <= $2
         and event.updated_at <= $2
         and not exists (
           select 1 from event_sources event_source
           where event_source.event_id = event.id
             and event_source.created_at > $2
         )
         and not exists (
           select 1
           from event_sources event_source
           join source_items source_item on source_item.id = event_source.source_item_id
           join sources source on source.id = source_item.source_id
           where event_source.event_id = event.id
             and event_source.created_at <= $2
             and source_item.public_visibility = true
             and source_item.rights_status::text = any($1::text[])
             and source_item.updated_at <= $2
             and source_item.rights_checked_at <= $2
             and source.access_status in ('approved', 'approved_limited')
             and source.updated_at <= $2
         )
       union all
       select 'missing_localization', 'event', event.public_id
       from events event
       where event.public_visibility = true
         and event.publication_state in ('published', 'corrected')
         and event.rights_status::text = any($1::text[])
         and event.last_verified_at <= $2
         and event.updated_at <= $2
         and (
           select count(distinct localization.locale)
           from localized_contents localization
           where localization.event_id = event.id
             and localization.review_status = 'reviewed'
             and localization.public_visibility = true
             and localization.updated_at <= $2
         ) < 2
     ) issue
     order by record_type, public_id, code`,
    [publicRights, dataCutoff],
  );
  return result.rows.map((row) =>
    dataReleaseValidationIssueSchema.parse({
      code: row.code,
      recordType: row.record_type,
      publicId: row.public_id,
    }),
  );
};

const readReleaseEvents = async (client: PoolClient, dataCutoff: Date) => {
  const result = await client.query<{ record: unknown }>(
    `select json_build_object(
       'type', 'event',
       'publicId', event.public_id,
       'eventType', event.event_type::text,
       'factStatus', event.fact_status::text,
       'occurredAt', to_char(event.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
       'occurredAtPrecision', event.occurred_at_precision::text,
       'firstPublishedAt', to_char(event.first_published_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
       'rightsStatus', event.rights_status::text,
       'privacyStatus', 'public',
       'lastVerifiedAt', to_char(event.last_verified_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
       'sources', (
         select json_agg(json_build_object(
           'publicId', source_item.public_id,
           'name', source.name,
           'url', source_item.original_url,
           'rightsStatus', source_item.rights_status::text,
           'attribution', source_item.attribution,
           'licenseUrl', source_item.license_url,
           'rightsCheckedAt', to_char(source_item.rights_checked_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
         ) order by source_item.public_id)
         from event_sources event_source
         join source_items source_item on source_item.id = event_source.source_item_id
         join sources source on source.id = source_item.source_id
         where event_source.event_id = event.id
           and event_source.created_at <= $2
           and source_item.public_visibility = true
           and source_item.rights_status::text = any($1::text[])
           and source_item.updated_at <= $2
           and source_item.rights_checked_at <= $2
           and source.access_status in ('approved', 'approved_limited')
           and source.updated_at <= $2
       ),
       'localizations', (
         select json_agg(json_build_object(
           'locale', localization.locale::text,
           'title', localization.title,
           'summary', localization.summary,
           'authorship', localization.authorship::text,
           'reviewStatus', localization.review_status::text
         ) order by localization.locale)
         from localized_contents localization
         where localization.event_id = event.id
           and localization.review_status = 'reviewed'
           and localization.public_visibility = true
           and localization.updated_at <= $2
       )
     ) as record
     from events event
     where event.public_visibility = true
       and event.publication_state in ('published', 'corrected')
       and event.rights_status::text = any($1::text[])
       and event.last_verified_at <= $2
       and event.updated_at <= $2
     order by event.public_id`,
    [publicRights, dataCutoff],
  );
  return result.rows.map(({ record }) => releaseEventSchema.parse(record));
};

const readReleaseCorrections = async (client: PoolClient, dataCutoff: Date) => {
  const result = await client.query<{ record: unknown }>(
    `select case when (
       ((correction.target_type = 'event'
           and target_event.public_visibility = true
           and target_event.rights_status::text = any($1::text[]))
        or (correction.target_type = 'entity'
           and target_entity.public_visibility = true
           and target_entity.rights_status::text = any($1::text[])))
       and exists (
         select 1 from correction_evidence evidence
         where evidence.correction_id = correction.id
           and evidence.created_at <= $2
       )
       and not exists (
         select 1
         from correction_evidence evidence
         join source_items source_item on source_item.id = evidence.source_item_id
         join sources source on source.id = source_item.source_id
         where evidence.correction_id = correction.id
           and (evidence.created_at > $2
             or source_item.public_visibility = false
             or source_item.rights_status::text <> all($1::text[])
             or source_item.updated_at > $2
             or source_item.rights_checked_at > $2
             or source.access_status not in ('approved', 'approved_limited')
             or source.updated_at > $2)
       )
     ) then json_build_object(
       'publicId', correction.public_id,
       'targetType', correction.target_type::text,
       'targetPublicId', correction.target_public_id,
       'casePublicId', editorial_case.public_id,
       'reasonCode', correction.reason_code::text,
       'changes', (
         select json_agg(json_build_object(
           'field', change.field,
           'previousValue', change.previous_value,
           'correctedValue', change.corrected_value
         ) order by change.field)
         from correction_changes change
         where change.correction_id = correction.id
           and change.created_at <= $2
       ),
       'evidence', (
         select json_agg(json_build_object(
           'sourceItemPublicId', source_item.public_id,
           'originalTitle', source_item.original_title,
           'originalUrl', source_item.original_url,
           'rightsStatus', source_item.rights_status::text,
           'attribution', source_item.attribution,
           'licenseUrl', source_item.license_url,
           'rightsCheckedAt', to_char(source_item.rights_checked_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
         ) order by source_item.public_id)
         from correction_evidence evidence
         join source_items source_item on source_item.id = evidence.source_item_id
         where evidence.correction_id = correction.id
           and evidence.created_at <= $2
       ),
       'effectiveAt', to_char(correction.effective_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
       'lastVerifiedAt', to_char(correction.effective_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
       'replacementVersion', correction.replacement_version
     ) else json_build_object(
       'publicId', correction.public_id,
       'targetType', correction.target_type::text,
       'targetPublicId', correction.target_public_id,
       'casePublicId', editorial_case.public_id,
       'reasonCode', correction.reason_code::text,
       'status', 'redacted_due_to_rights',
       'effectiveAt', to_char(correction.effective_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
       'lastVerifiedAt', to_char(correction.effective_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
       'replacementVersion', correction.replacement_version
     ) end as record
     from corrections correction
     join editorial_cases editorial_case on editorial_case.id = correction.case_id
     left join events target_event on target_event.id = correction.target_event_id
     left join entities target_entity on target_entity.id = correction.target_entity_id
     where correction.effective_at <= $2
       and correction.created_at <= $2
       and not exists (
         select 1 from correction_changes change
         where change.correction_id = correction.id
           and change.created_at > $2
       )
       and not exists (
         select 1 from correction_evidence evidence
         where evidence.correction_id = correction.id
           and evidence.created_at > $2
       )
     order by correction.public_id`,
    [publicRights, dataCutoff],
  );
  return result.rows.map(({ record }) => releaseCorrectionSchema.parse(record));
};

const readReleaseTombstones = async (client: PoolClient, dataCutoff: Date) => {
  const result = await client.query<{ record: unknown }>(
    `select json_build_object(
       'publicId', tombstone.object_public_id,
       'objectType', tombstone.object_type::text,
       'status', tombstone.status::text,
       'reasonCode', tombstone.public_reason_code::text,
       'effectiveAt', to_char(tombstone.effective_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
       'replacementPublicId', tombstone.replacement_public_id,
       'caseReferencePublicId', tombstone.case_reference_public_id
     ) as record
     from tombstones tombstone
     where tombstone.cleared_at is null
       and tombstone.effective_at <= $1
       and tombstone.created_at <= $1
     order by tombstone.object_public_id`,
    [dataCutoff],
  );
  return result.rows.map(({ record }) => releaseTombstoneSchema.parse(record));
};

const responseFile = (publicId: string, file: Omit<StoredFile, "content">) =>
  dataReleaseFileSchema.parse({
    ...file,
    downloadUrl: `/api/v1/releases/${publicId}/files/${file.name}`,
  });

export const createDataRelease = async (input: CreateDataReleaseInput) => {
  const client = await databasePool.connect();
  const dataCutoff = new Date(input.dataCutoff);
  const generatedAt = new Date();
  try {
    await client.query("begin isolation level repeatable read");
    const issues = await validatePublicCandidates(client, dataCutoff);
    if (issues.length > 0) throw new DataReleaseValidationError(issues);

    let events: z.infer<typeof releaseEventSchema>[];
    let corrections: z.infer<typeof releaseCorrectionSchema>[];
    let tombstones: z.infer<typeof releaseTombstoneSchema>[];
    let records: z.infer<typeof releaseRecordsSchema>;
    try {
      events = await readReleaseEvents(client, dataCutoff);
      corrections = await readReleaseCorrections(client, dataCutoff);
      tombstones = await readReleaseTombstones(client, dataCutoff);
      records = releaseRecordsSchema.parse({ events });
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new DataReleaseValidationError([
          dataReleaseValidationIssueSchema.parse({
            code: "public_schema_violation",
            recordType: "release",
            publicId: input.publicId,
          }),
        ]);
      }
      throw error;
    }
    const files: StoredFile[] = [
      artifactFile("schema.json", publicArtifactSchema, null),
      artifactFile("records.json", records, events.length),
      artifactFile("corrections.json", corrections, corrections.length),
      artifactFile("tombstones.json", tombstones, tombstones.length),
    ];
    const manifest = {
      publicId: input.publicId,
      dataVersion: input.dataVersion,
      schemaVersion,
      dataCutoff: input.dataCutoff,
      canonicalUrl: input.canonicalUrl,
      license: input.license,
      attribution: input.attribution,
      recordCounts: {
        events: events.length,
        corrections: corrections.length,
        tombstones: tombstones.length,
      },
      files: files.map(fileMetadata),
    };
    const manifestFile = artifactFile("manifest.json", manifest, null);
    files.push(manifestFile);

    if (
      forbiddenPrivacyPattern.test(
        files.map(({ content }) => content).join("\n"),
      )
    ) {
      throw new DataReleaseValidationError([
        dataReleaseValidationIssueSchema.parse({
          code: "privacy_violation",
          recordType: "release",
          publicId: input.publicId,
        }),
      ]);
    }

    const releaseResult = await client.query<{ id: string }>(
      `insert into data_releases (
         id, public_id, data_version, schema_version, data_cutoff,
         canonical_url, manifest_sha256, license, attribution, created_at
       ) values (
         gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9
       ) returning id`,
      [
        input.publicId,
        input.dataVersion,
        schemaVersion,
        dataCutoff,
        input.canonicalUrl,
        manifestFile.checksumSha256,
        input.license,
        input.attribution,
        generatedAt,
      ],
    );
    for (const file of files) {
      await client.query(
        `insert into data_release_files (
           release_id, name, media_type, byte_size, record_count,
           checksum_sha256, content
         ) values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          releaseResult.rows[0].id,
          file.name,
          file.mediaType,
          file.byteSize,
          file.recordCount,
          file.checksumSha256,
          file.content,
        ],
      );
    }
    const generatedRelease = generatedDataReleaseSchema.parse({
      status: "generated",
      publicId: input.publicId,
      dataVersion: input.dataVersion,
      schemaVersion,
      dataCutoff: input.dataCutoff,
      generatedAt: generatedAt.toISOString(),
      canonicalUrl: input.canonicalUrl,
      checksumSha256: manifestFile.checksumSha256,
      license: input.license,
      attribution: input.attribution,
      files: files.map((file) =>
        responseFile(input.publicId, fileMetadata(file)),
      ),
    });
    await client.query("commit");
    return generatedRelease;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
};

type ReleaseRow = {
  id: string;
  public_id: string;
  data_version: string;
  schema_version: string;
  data_cutoff: Date;
  published_at: Date;
  canonical_url: string;
  manifest_sha256: string;
  license: string;
  attribution: string;
  mirror_provider: "feishu" | "baidu" | null;
  mirror_url: string | null;
  mirror_verified_at: Date | null;
};

const readFileMetadata = async (releaseId: string) => {
  const files = await databasePool.query<{
    name: StoredFile["name"];
    media_type: "application/json";
    byte_size: number;
    record_count: number | null;
    checksum_sha256: string;
  }>(
    `select name::text, media_type, byte_size, record_count, checksum_sha256
     from data_release_files where release_id = $1
     order by array_position($2::text[], name::text)`,
    [releaseId, fileNames],
  );
  return files.rows;
};

const mapRelease = async (row: ReleaseRow) => {
  const files = await readFileMetadata(row.id);
  return publicDataReleaseDetailSchema.parse({
    publicId: row.public_id,
    dataVersion: row.data_version,
    schemaVersion: row.schema_version,
    dataCutoff: row.data_cutoff.toISOString(),
    publishedAt: row.published_at.toISOString(),
    canonicalUrl: row.canonical_url,
    checksumSha256: row.manifest_sha256,
    license: row.license,
    attribution: row.attribution,
    lastVerifiedAt: row.published_at.toISOString(),
    files: files.map((file) =>
      responseFile(row.public_id, {
        name: file.name,
        mediaType: file.media_type,
        byteSize: file.byte_size,
        recordCount: file.record_count,
        checksumSha256: file.checksum_sha256,
      }),
    ),
    mirror:
      row.mirror_provider && row.mirror_url && row.mirror_verified_at
        ? {
            status: "verified",
            provider: row.mirror_provider,
            url: row.mirror_url,
            verifiedAt: row.mirror_verified_at.toISOString(),
          }
        : null,
  });
};

const releaseSelect = `select release.id, release.public_id, release.data_version,
  release.schema_version, release.data_cutoff, publication.published_at,
  release.canonical_url, release.manifest_sha256, release.license,
  release.attribution, mirror.provider::text as mirror_provider,
  mirror.url as mirror_url, mirror.verified_at as mirror_verified_at
  from data_releases release
  join data_release_publications publication on publication.release_id = release.id
  left join data_release_mirrors mirror on mirror.release_id = release.id`;

export const getPublicDataRelease = async (publicId: string) => {
  const result = await databasePool.query<ReleaseRow>(
    `${releaseSelect} where release.public_id = $1`,
    [publicId],
  );
  return result.rows[0] ? mapRelease(result.rows[0]) : null;
};

export const listPublicDataReleases = async (input: {
  limit: number;
  afterPublicId?: string;
}) => {
  const result = await databasePool.query<ReleaseRow>(
    `${releaseSelect}
     where ($1::text is null or release.public_id > $1)
     order by release.public_id limit $2`,
    [input.afterPublicId ?? null, input.limit + 1],
  );
  const hasNextPage = result.rows.length > input.limit;
  const selected = result.rows.slice(0, input.limit);
  return {
    items: await Promise.all(selected.map(mapRelease)),
    hasNextPage,
  };
};

const readFile = async (
  publicId: string,
  name: string,
  publishedOnly: boolean,
) => {
  const result = await databasePool.query<{
    media_type: string;
    checksum_sha256: string;
    content: string;
  }>(
    `select file.media_type, file.checksum_sha256, file.content
     from data_release_files file
     join data_releases release on release.id = file.release_id
     ${publishedOnly ? "join data_release_publications publication on publication.release_id = release.id" : ""}
     where release.public_id = $1 and file.name::text = $2`,
    [publicId, name],
  );
  return result.rows[0] ?? null;
};

export const readDataReleaseFile = (publicId: string, name: string) =>
  readFile(publicId, name, true);

export const readGeneratedDataReleaseFile = (publicId: string, name: string) =>
  readFile(publicId, name, false);

export const publishDataRelease = async (publicId: string) => {
  const release = await databasePool.query<{
    id: string;
    canonical_url: string;
    published_at: Date | null;
  }>(
    `select release.id, release.canonical_url, publication.published_at
     from data_releases release
     left join data_release_publications publication on publication.release_id = release.id
     where release.public_id = $1`,
    [publicId],
  );
  if (!release.rows[0]) return { status: "not_found" as const };
  if (release.rows[0].published_at) {
    return {
      status: "published" as const,
      publicId,
      publishedAt: release.rows[0].published_at.toISOString(),
    };
  }
  const files = await readFileMetadata(release.rows[0].id);
  await verifyCanonicalRelease(
    release.rows[0].canonical_url,
    files.map((file) => ({
      name: file.name,
      checksumSha256: file.checksum_sha256,
    })),
  );
  const publishedAt = new Date();
  const publication = await databasePool.query<{ published_at: Date }>(
    `insert into data_release_publications (
       release_id, canonical_verified_at, published_at
     ) values ($1, $2, $2)
     on conflict (release_id) do nothing
     returning published_at`,
    [release.rows[0].id, publishedAt],
  );
  const effectivePublishedAt =
    publication.rows[0]?.published_at ??
    (
      await databasePool.query<{ published_at: Date }>(
        "select published_at from data_release_publications where release_id = $1",
        [release.rows[0].id],
      )
    ).rows[0].published_at;
  return {
    status: "published" as const,
    publicId,
    publishedAt: effectivePublishedAt.toISOString(),
  };
};

export const verifyDataReleaseMirror = async (
  publicId: string,
  input: z.infer<typeof dataReleaseMirrorRequestSchema>,
) => {
  const release = await databasePool.query<{ id: string }>(
    `select release.id
     from data_releases release
     join data_release_publications publication on publication.release_id = release.id
     where release.public_id = $1`,
    [publicId],
  );
  if (!release.rows[0]) return { status: "not_found" as const };
  const files = await readFileMetadata(release.rows[0].id);
  await verifyMirrorFiles(
    input,
    files.map((file) => ({
      name: file.name,
      checksumSha256: file.checksum_sha256,
    })),
  );
  const verifiedAt = new Date();
  const result = await databasePool.query<{
    provider: "feishu" | "baidu";
    url: string;
    verified_at: Date;
  }>(
    `insert into data_release_mirrors (release_id, provider, url, verified_at)
     values ($1, $2, $3, $4)
     on conflict (release_id) do update
       set provider = excluded.provider, url = excluded.url,
           verified_at = excluded.verified_at
     returning provider::text, url, verified_at`,
    [release.rows[0].id, input.provider, input.url, verifiedAt],
  );
  return {
    status: "verified" as const,
    provider: result.rows[0].provider,
    url: result.rows[0].url,
    verifiedAt: result.rows[0].verified_at.toISOString(),
  };
};
