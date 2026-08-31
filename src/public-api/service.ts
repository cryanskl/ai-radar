import { databasePool } from "@/db/client";
import { getPublicCorrection } from "@/operations/service";
import {
  publicEntitySummarySchema,
  publicRelationSchema,
  publicTombstoneSchema,
} from "./contracts";
import { encodePublicCursor } from "./cursor";

const publicRights = [
  "open",
  "attribution_required",
  "source_license",
  "metadata_only",
  "link_only",
] as const;

const finishPublicIdPage = <T extends { publicId: string }>(
  rows: T[],
  limit: number,
  resource: string,
  requestKey: string,
) => {
  const hasNextPage = rows.length > limit;
  const items = rows.slice(0, limit);
  return {
    items,
    nextCursor: hasNextPage
      ? encodePublicCursor(resource, requestKey, {
          publicId: items[items.length - 1].publicId,
        })
      : null,
  };
};

export const listPublicEntitySummaries = async (input: {
  locale: "en" | "zh";
  limit: number;
  afterPublicId?: string;
  requestKey: string;
}) => {
  const result = await databasePool.query<{
    public_id: string;
    type: string;
    name: string;
    summary: string;
    official_url: string;
    rights_status: string;
    last_verified_at: Date;
  }>(
    `select entity.public_id, entity.type::text, localization.name,
       localization.summary, entity.official_url,
       entity.rights_status::text, entity.last_verified_at
     from entities entity
     join entity_localized_contents localization
       on localization.entity_id = entity.id
      and localization.locale = $1::content_locale
      and localization.review_status = 'reviewed'
      and localization.public_visibility = true
     where entity.lifecycle_status = 'active'
       and entity.public_visibility = true
       and entity.rights_status::text = any($2::text[])
       and ($3::text is null or entity.public_id > $3)
     order by entity.public_id
     limit $4`,
    [input.locale, publicRights, input.afterPublicId ?? null, input.limit + 1],
  );
  return finishPublicIdPage(
    result.rows.map((row) =>
      publicEntitySummarySchema.parse({
        publicId: row.public_id,
        type: row.type,
        name: row.name,
        summary: row.summary,
        officialUrl: row.official_url,
        rightsStatus: row.rights_status,
        lastVerifiedAt: row.last_verified_at.toISOString(),
      }),
    ),
    input.limit,
    "entities",
    input.requestKey,
  );
};

type RelationRow = {
  public_id: string;
  predicate: string;
  subject_type: "event" | "entity";
  subject_public_id: string;
  subject_name: string;
  object_public_id: string;
  object_name: string;
  rights_status: string;
  valid_from: Date | null;
  valid_to: Date | null;
  first_verified_at: Date;
  last_verified_at: Date;
  confidence: number;
  review_status: "reviewed";
  evidence: Array<{
    sourceItemPublicId: string;
    sourceName: string;
    sourceUrl: string;
    rightsStatus: string;
    attribution: string;
    licenseUrl: string | null;
    rightsCheckedAt: string;
  }>;
};

export const listPublicRelations = async (input: {
  locale: "en" | "zh";
  limit: number;
  afterPublicId?: string;
  exactPublicId?: string;
  requestKey: string;
}) => {
  const result = await databasePool.query<RelationRow>(
    `select relation.public_id, relation.predicate::text,
       case when relation.subject_event_id is not null then 'event' else 'entity' end as subject_type,
       coalesce(subject_event.public_id, subject_entity.public_id) as subject_public_id,
       coalesce(subject_event_content.title, subject_entity_content.name) as subject_name,
       object_entity.public_id as object_public_id,
       object_content.name as object_name,
       relation.rights_status::text, relation.valid_from, relation.valid_to,
       relation.first_verified_at, relation.last_verified_at,
       relation.confidence, relation.review_status::text,
       json_agg(json_build_object(
         'sourceItemPublicId', evidence_source.public_id,
         'sourceName', source.name,
         'sourceUrl', evidence_source.original_url,
         'rightsStatus', evidence_source.rights_status::text,
         'attribution', evidence_source.attribution,
         'licenseUrl', evidence_source.license_url,
         'rightsCheckedAt', to_char(evidence_source.rights_checked_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
       ) order by evidence_source.public_id) as evidence
     from relations relation
     left join events subject_event
       on subject_event.id = relation.subject_event_id
      and subject_event.public_visibility = true
      and subject_event.publication_state in ('published', 'corrected')
      and subject_event.rights_status::text = any($2::text[])
     left join localized_contents subject_event_content
       on subject_event_content.event_id = subject_event.id
      and subject_event_content.locale = $1::content_locale
      and subject_event_content.review_status = 'reviewed'
      and subject_event_content.public_visibility = true
     left join entities subject_entity
       on subject_entity.id = relation.subject_entity_id
      and subject_entity.public_visibility = true
      and subject_entity.lifecycle_status = 'active'
      and subject_entity.rights_status::text = any($2::text[])
     left join entity_localized_contents subject_entity_content
       on subject_entity_content.entity_id = subject_entity.id
      and subject_entity_content.locale = $1::content_locale
      and subject_entity_content.review_status = 'reviewed'
      and subject_entity_content.public_visibility = true
     join entities object_entity
       on object_entity.id = relation.object_entity_id
      and object_entity.public_visibility = true
      and object_entity.lifecycle_status = 'active'
      and object_entity.rights_status::text = any($2::text[])
     join entity_localized_contents object_content
       on object_content.entity_id = object_entity.id
      and object_content.locale = $1::content_locale
      and object_content.review_status = 'reviewed'
      and object_content.public_visibility = true
     join relation_evidence evidence on evidence.relation_id = relation.id
     join source_items evidence_source
       on evidence_source.id = evidence.source_item_id
      and evidence_source.public_visibility = true
      and evidence_source.rights_status::text = any($2::text[])
     join sources source
       on source.id = evidence_source.source_id
      and source.access_status in ('approved', 'approved_limited')
     where relation.public_visibility = true
       and relation.review_status = 'reviewed'
       and relation.rights_status::text = any($2::text[])
       and coalesce(subject_event.public_id, subject_entity.public_id) is not null
       and ($3::text is null or relation.public_id > $3)
       and ($5::text is null or relation.public_id = $5)
     group by relation.id, relation.public_id, relation.predicate,
       subject_event.public_id, subject_entity.public_id,
       subject_event_content.title, subject_entity_content.name,
       object_entity.public_id, object_content.name
     order by relation.public_id
     limit $4`,
    [
      input.locale,
      publicRights,
      input.afterPublicId ?? null,
      input.limit + 1,
      input.exactPublicId ?? null,
    ],
  );
  return finishPublicIdPage(
    result.rows.map((row) =>
      publicRelationSchema.parse({
        publicId: row.public_id,
        predicate: row.predicate,
        direction: "subject_to_object",
        subject: {
          type: row.subject_type,
          publicId: row.subject_public_id,
          name: row.subject_name,
        },
        object: {
          type: "entity",
          publicId: row.object_public_id,
          name: row.object_name,
        },
        rightsStatus: row.rights_status,
        validFrom: row.valid_from?.toISOString() ?? null,
        validTo: row.valid_to?.toISOString() ?? null,
        firstVerifiedAt: row.first_verified_at.toISOString(),
        lastVerifiedAt: row.last_verified_at.toISOString(),
        confidence: row.confidence,
        reviewStatus: row.review_status,
        evidence: row.evidence,
      }),
    ),
    input.limit,
    "relations",
    input.requestKey,
  );
};

export const getPublicRelation = async (
  publicId: string,
  locale: "en" | "zh",
) => {
  const page = await listPublicRelations({
    locale,
    limit: 1,
    exactPublicId: publicId,
    requestKey: "detail",
  });
  return page.items[0] ?? null;
};

export const listPublicCorrections = async (input: {
  limit: number;
  afterPublicId?: string;
  requestKey: string;
}) => {
  const result = await databasePool.query<{ public_id: string }>(
    `select public_id
     from corrections
     where ($1::text is null or public_id > $1)
     order by public_id
     limit $2`,
    [input.afterPublicId ?? null, input.limit + 1],
  );
  const records = await Promise.all(
    result.rows.map(({ public_id }) => getPublicCorrection(public_id)),
  );
  return finishPublicIdPage(
    records.filter((record) => record !== null),
    input.limit,
    "corrections",
    input.requestKey,
  );
};

export const listPublicTombstones = async (input: {
  limit: number;
  afterPublicId?: string;
  exactPublicId?: string;
  requestKey: string;
}) => {
  const result = await databasePool.query<{
    object_public_id: string;
    object_type: "event" | "entity";
    status: "merged_into" | "withdrawn" | "source_withdrawn" | "reviewing";
    public_reason_code: string;
    effective_at: Date;
    replacement_public_id: string | null;
    case_reference_public_id: string | null;
  }>(
    `select object_public_id, object_type::text, status::text,
       public_reason_code::text, effective_at, replacement_public_id,
       case_reference_public_id
     from tombstones
     where cleared_at is null
       and ($1::text is null or object_public_id > $1)
       and ($3::text is null or object_public_id = $3)
     order by object_public_id
     limit $2`,
    [input.afterPublicId ?? null, input.limit + 1, input.exactPublicId ?? null],
  );
  return finishPublicIdPage(
    result.rows.map((row) =>
      publicTombstoneSchema.parse({
        publicId: row.object_public_id,
        objectType: row.object_type,
        status: row.status,
        reasonCode: row.public_reason_code,
        effectiveAt: row.effective_at.toISOString(),
        replacementPublicId: row.replacement_public_id,
        caseReferencePublicId: row.case_reference_public_id,
      }),
    ),
    input.limit,
    "tombstones",
    input.requestKey,
  );
};

export const getPublicTombstoneRecord = async (publicId: string) => {
  const page = await listPublicTombstones({
    limit: 1,
    exactPublicId: publicId,
    requestKey: "detail",
  });
  return page.items[0] ?? null;
};
