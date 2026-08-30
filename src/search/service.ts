import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { databasePool } from "@/db/client";
import {
  searchCursorSchema,
  searchResultSchema,
  searchSnapshotIdentitySchema,
  type SearchCursor,
  type SearchRequest,
  type SearchResult,
  type SearchSnapshotIdentity,
} from "./contracts";

const MAX_SEARCH_SNAPSHOT_ITEMS = 1000;

type SearchRow = {
  kind: "event" | "entity";
  entity_type: SearchResult["entityType"];
  public_id: string;
  status: SearchResult["status"];
  name: string;
  summary: string;
  locale: "en" | "zh";
  matched_locale: "en" | "zh";
  match_reason: SearchResult["matchReason"];
  matched_text: string;
  effective_at: Date;
  occurred_at: Date | null;
  last_verified_at: Date;
  source_name: string | null;
  source_url: string | null;
  signal_languages: Array<"en" | "zh">;
  replacement_public_id: string | null;
  match_priority: number;
  score: number;
};

type SnapshotRow = {
  data_cutoff: Date;
  expires_at: Date;
  ranking_state: "available" | "insufficient_evidence";
  total_count: number;
  truncated: boolean;
};

type SnapshotItemRow = { payload: unknown };

type CurrentDocumentRow = {
  kind: "event" | "entity";
  entity_type: SearchResult["entityType"];
  public_id: string;
  status: "public" | "source_withdrawn";
  name: string;
  summary: string;
  locale: "en" | "zh";
  occurred_at: Date | null;
  last_verified_at: Date;
  source_name: string | null;
  source_url: string | null;
  signal_languages: Array<"en" | "zh">;
  current_matched_locale: "en" | "zh" | null;
  current_match_reason: SearchResult["matchReason"] | null;
  current_matched_text: string | null;
};

type CurrentTombstoneRow = {
  kind: "event" | "entity";
  public_id: string;
  entity_type: SearchResult["entityType"];
  status: "merged_into" | "withdrawn" | "source_withdrawn" | "under_review";
  reason: string;
  effective_at: Date;
  replacement_public_id: string | null;
};

const normalizeSearchText = (value: string) =>
  value.normalize("NFKC").trim().toLocaleLowerCase();

const requestKeyFor = (input: SearchRequest) =>
  JSON.stringify({
    q: normalizeSearchText(input.q),
    locale: input.locale,
    type: input.type,
    from: input.from ?? null,
    to: input.to ?? null,
    topic: input.topic || null,
    organization: input.organization || null,
    signalLanguage: input.signalLanguage,
    sort: input.sort,
    limit: input.limit,
  });

const decodeCursor = (value: string): SearchCursor | null => {
  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    const cursor = searchCursorSchema.safeParse(decoded);
    return cursor.success ? cursor.data : null;
  } catch {
    return null;
  }
};

const encodeCursor = (cursor: SearchCursor) =>
  Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");

const searchSql = `
with public_relations as (
  select relation.*
  from relations relation
  join entities object_entity
    on object_entity.id = relation.object_entity_id
    and object_entity.lifecycle_status = 'active'
    and object_entity.public_visibility = true
  left join entities subject_entity
    on subject_entity.id = relation.subject_entity_id
  left join events subject_event
    on subject_event.id = relation.subject_event_id
  where relation.public_visibility = true
    and relation.review_status = 'reviewed'
    and (
      (subject_entity.id is not null
        and subject_entity.lifecycle_status = 'active'
        and subject_entity.public_visibility = true)
      or
      (subject_event.id is not null
        and subject_event.publication_state in ('published', 'corrected')
        and subject_event.public_visibility = true)
    )
    and exists (
      select 1
      from relation_evidence evidence
      join source_items source_item
        on source_item.id = evidence.source_item_id
        and source_item.public_visibility = true
      where evidence.relation_id = relation.id
    )
),
entity_facets as (
  select relation.subject_entity_id as object_id,
    relation.object_entity_id as facet_id,
    facet.type::text as facet_type
  from public_relations relation
  join entities facet on facet.id = relation.object_entity_id
  where relation.subject_entity_id is not null
  union
  select relation.object_entity_id,
    relation.subject_entity_id,
    facet.type::text
  from public_relations relation
  join entities facet on facet.id = relation.subject_entity_id
  where relation.subject_entity_id is not null
),
record_facets as (
  select 'entity'::text as kind, object_id, facet_id, facet_type
  from entity_facets
  union
  select 'event', relation.subject_event_id, relation.object_entity_id,
    facet.type::text
  from public_relations relation
  join entities facet on facet.id = relation.object_entity_id
  where relation.subject_event_id is not null
  union
  select 'event', event_relation.subject_event_id, entity_facet.facet_id,
    entity_facet.facet_type
  from public_relations event_relation
  join entity_facets entity_facet
    on entity_facet.object_id = event_relation.object_entity_id
  where event_relation.subject_event_id is not null
),
event_signals as (
  select event_source.event_id,
    array_agg(distinct source_item.original_language order by source_item.original_language) as languages
  from event_sources event_source
  join source_items source_item
    on source_item.id = event_source.source_item_id
    and source_item.public_visibility = true
  group by event_source.event_id
),
entity_signals as (
  select relation.object_entity_id as entity_id,
    array_agg(distinct source_item.original_language order by source_item.original_language) as languages
  from public_relations relation
  join event_sources event_source on event_source.event_id = relation.subject_event_id
  join source_items source_item
    on source_item.id = event_source.source_item_id
    and source_item.public_visibility = true
  where relation.subject_event_id is not null
  group by relation.object_entity_id
),
presentation_documents as (
  select document.*,
    case when document.object_kind = 'event'
      then coalesce(event_signal.languages, array[]::content_locale[])
      else coalesce(entity_signal.languages, array[]::content_locale[])
    end as signal_languages
  from search_documents document
  left join event_signals event_signal
    on document.object_kind = 'event' and event_signal.event_id = document.object_id
  left join entity_signals entity_signal
    on document.object_kind = 'entity' and entity_signal.entity_id = document.object_id
  where document.locale = $3::content_locale
    and (document.entity_type is distinct from 'product' or (
      exists (
        select 1 from product_profiles profile
        join product_observations observation
          on observation.product_profile_id = profile.id
          and observation.public_visibility = true
        join source_items observation_source
          on observation_source.id = observation.source_item_id
          and observation_source.public_visibility = true
          and observation_source.rights_status in (
            'open', 'attribution_required', 'source_license',
            'metadata_only', 'link_only'
          )
        where profile.entity_id = document.object_id
          and profile.public_visibility = true
          and observation.effective_at <= (
            select max(cutoff_observation.observed_at)
            from product_observations cutoff_observation
            join source_items cutoff_source
              on cutoff_source.id = cutoff_observation.source_item_id
              and cutoff_source.public_visibility = true
              and cutoff_source.rights_status in (
                'open', 'attribution_required', 'source_license',
                'metadata_only', 'link_only'
              )
            where cutoff_observation.product_profile_id = profile.id
              and cutoff_observation.public_visibility = true
          )
      )
      and exists (
        select 1 from relations ownership
        join entities organization
          on organization.id = ownership.subject_entity_id
          and organization.type = 'organization'
          and organization.lifecycle_status = 'active'
          and organization.public_visibility = true
        join entity_localized_contents organization_localization
          on organization_localization.entity_id = organization.id
          and organization_localization.locale = $3::content_locale
          and organization_localization.review_status = 'reviewed'
          and organization_localization.public_visibility = true
        where ownership.object_entity_id = document.object_id
          and ownership.predicate = 'DEVELOPS'
          and ownership.review_status = 'reviewed'
          and ownership.public_visibility = true
          and exists (
            select 1 from relation_evidence evidence
            join source_items ownership_source
              on ownership_source.id = evidence.source_item_id
              and ownership_source.public_visibility = true
              and ownership_source.rights_status in (
                'open', 'attribution_required', 'source_license',
                'metadata_only', 'link_only'
              )
            where evidence.relation_id = ownership.id
          )
      )
    ))
),
matches as (
  select term.object_kind::text as kind, term.object_id,
    case term.reason
      when 'public_id' then 1000
      when 'canonical_url' then 990
      when 'external_id' then 980
      when 'official_name' then 970
      when 'alias' then 960
    end as match_priority,
    1::double precision as score,
    coalesce(term.locale::text, $3::text) as matched_locale,
    term.reason::text as match_reason,
    term.value as matched_text
  from search_terms term
  where term.normalized_value = $2
  union all
  select document.object_kind::text, document.object_id, 500,
    ts_rank_cd(
      to_tsvector('simple', document.search_text),
      websearch_to_tsquery('simple', $1)
    )::double precision,
    document.locale::text, 'full_text',
    concat_ws(' — ', document.name, document.summary)
  from search_documents document
  where to_tsvector('simple', document.search_text)
    @@ websearch_to_tsquery('simple', $1)
  union all
  select term.object_kind::text, term.object_id, 500,
    ts_rank_cd(
      to_tsvector('simple', term.value),
      websearch_to_tsquery('simple', $1)
    )::double precision,
    coalesce(term.locale::text, $3::text), 'full_text', term.value
  from search_terms term
  where term.reason = 'alias'
    and to_tsvector('simple', term.value) @@ websearch_to_tsquery('simple', $1)
  union all
  select term.object_kind::text, term.object_id,
    case when term.reason = 'official_name' then 150 else 100 end,
    similarity(term.normalized_value, $2)::double precision,
    coalesce(term.locale::text, $3::text), 'trigram', term.value
  from search_terms term
  where term.reason in ('official_name', 'alias')
    and term.normalized_value % $2
  union all
  select document.object_kind::text, document.object_id, 100,
    similarity(lower(document.search_name), $2)::double precision,
    document.locale::text, 'trigram', document.name
  from search_documents document
  where lower(document.search_name) % $2
),
best_matches as (
  select ranked.*
  from (
    select matches.*,
      row_number() over (
        partition by matches.kind, matches.object_id
        order by matches.match_priority desc,
          matches.score desc,
          (matches.matched_locale = $3::text) desc,
          matches.matched_text
      ) as match_rank
    from matches
  ) ranked
  where ranked.match_rank = 1
),
matched_records as (
  select document.object_kind::text as kind,
    document.entity_type::text as entity_type,
    document.public_id,
    document.status::text,
    document.name,
    document.summary,
    document.locale::text,
    match.matched_locale,
    match.match_reason,
    match.matched_text,
    document.latest_at as effective_at,
    document.occurred_at,
    document.last_verified_at,
    document.source_name,
    document.source_url,
    document.signal_languages::text[] as signal_languages,
    null::text as replacement_public_id,
    match.match_priority,
    match.score
  from best_matches match
  join presentation_documents document
    on document.object_kind::text = match.kind
    and document.object_id = match.object_id
  where ($4 = 'all'
      or ($4 = 'event' and document.object_kind = 'event')
      or document.entity_type::text = $4)
    and ($5::timestamptz is null
      or document.latest_at >= $5::timestamptz)
    and ($6::timestamptz is null
      or document.latest_at <= $6::timestamptz)
    and ($7::text is null or exists (
      select 1 from record_facets facet
      join entities facet_entity on facet_entity.id = facet.facet_id
      where facet.kind = document.object_kind::text
        and facet.object_id = document.object_id
        and facet.facet_type = 'topic'
        and facet_entity.public_id = $7
    ))
    and ($8::text is null or exists (
      select 1 from record_facets facet
      join entities facet_entity on facet_entity.id = facet.facet_id
      where facet.kind = document.object_kind::text
        and facet.object_id = document.object_id
        and facet.facet_type = 'organization'
        and facet_entity.public_id = $8
    ))
    and ($9 = 'all' or $9 = any(document.signal_languages::text[]))
    and $10 <> 'trending'
),
exact_tombstones as (
  select tombstone.object_type::text as kind,
    case when tombstone.object_type = 'entity' then entity.type::text else null::text end,
    tombstone.object_public_id,
    case when tombstone.status = 'reviewing'
      then 'under_review' else tombstone.status::text end,
    tombstone.object_public_id,
    tombstone.public_reason_code::text,
    $3::text,
    $3::text,
    'public_id'::text,
    tombstone.object_public_id,
    tombstone.effective_at,
    case when tombstone.object_type = 'event'
      then tombstone.effective_at else null::timestamptz end,
    tombstone.effective_at,
    null::text,
    null::text,
    array[]::text[],
    tombstone.replacement_public_id,
    1000,
    1::double precision
  from tombstones tombstone
  left join entities entity
    on tombstone.object_type = 'entity'
    and entity.public_id = tombstone.object_public_id
  where tombstone.cleared_at is null
    and lower(tombstone.object_public_id) = $2
    and ($4 = 'all'
      or ($4 = 'event' and tombstone.object_type = 'event')
      or (tombstone.object_type = 'entity' and entity.type::text = $4))
    and ($5::timestamptz is null or tombstone.effective_at >= $5::timestamptz)
    and ($6::timestamptz is null or tombstone.effective_at <= $6::timestamptz)
    and $7::text is null
    and $8::text is null
    and $9 = 'all'
    and $10 <> 'trending'
),
all_records as (
  select * from matched_records
  union all
  select * from exact_tombstones
)
select * from all_records
order by
  case when $10 = 'relevance' then match_priority end desc,
  case when $10 = 'relevance' then score end desc,
  effective_at desc,
  kind,
  public_id
limit $11::integer;
`;

const toSearchResult = (row: SearchRow): SearchResult =>
  searchResultSchema.parse({
    kind: row.kind,
    entityType: row.entity_type,
    publicId: row.public_id,
    status: row.status,
    name: row.name,
    summary: row.summary,
    locale: row.locale,
    matchedLocale: row.matched_locale,
    matchReason: row.match_reason,
    matchedText: row.matched_text,
    occurredAt: row.occurred_at?.toISOString() ?? null,
    lastVerifiedAt: row.last_verified_at.toISOString(),
    source:
      row.source_name && row.source_url
        ? { name: row.source_name, url: row.source_url }
        : null,
    signalLanguages: row.signal_languages,
    replacementPublicId: row.replacement_public_id,
  });

const tombstoneResult = (
  row: CurrentTombstoneRow,
  locale: "en" | "zh",
): SearchResult =>
  searchResultSchema.parse({
    kind: row.kind,
    entityType: row.entity_type,
    publicId: row.public_id,
    status: row.status,
    name: row.public_id,
    summary: row.reason,
    locale,
    matchedLocale: locale,
    matchReason: "public_id",
    matchedText: row.public_id,
    occurredAt: row.kind === "event" ? row.effective_at.toISOString() : null,
    lastVerifiedAt: row.effective_at.toISOString(),
    source: null,
    signalLanguages: [],
    replacementPublicId: row.replacement_public_id,
  });

const hydrateSnapshotItems = async (
  client: PoolClient,
  storedItems: SearchSnapshotIdentity[],
  input: SearchRequest,
): Promise<SearchResult[]> => {
  if (storedItems.length === 0) return [];
  const publicIds = [...new Set(storedItems.map(({ publicId }) => publicId))];
  const currentDocuments = await client.query<CurrentDocumentRow>(
    `with selected_objects as (
      select distinct document.object_kind, document.object_id
      from search_documents document
      where document.public_id = any($2::text[])
    ),
    current_matches as (
      select term.object_kind, term.object_id,
        case term.reason
          when 'public_id' then 1000
          when 'canonical_url' then 990
          when 'external_id' then 980
          when 'official_name' then 970
          when 'alias' then 960
        end as match_priority,
        1::double precision as score,
        coalesce(term.locale::text, $1::text) as matched_locale,
        term.reason::text as match_reason,
        term.value as matched_text
      from search_terms term
      join selected_objects selected
        on selected.object_kind = term.object_kind
        and selected.object_id = term.object_id
      where term.normalized_value = $3
      union all
      select document.object_kind, document.object_id, 500,
        ts_rank_cd(
          to_tsvector('simple', document.search_text),
          websearch_to_tsquery('simple', $4)
        )::double precision,
        document.locale::text, 'full_text',
        concat_ws(' — ', document.name, document.summary)
      from search_documents document
      join selected_objects selected
        on selected.object_kind = document.object_kind
        and selected.object_id = document.object_id
      where to_tsvector('simple', document.search_text)
        @@ websearch_to_tsquery('simple', $4)
      union all
      select term.object_kind, term.object_id, 500,
        ts_rank_cd(
          to_tsvector('simple', term.value),
          websearch_to_tsquery('simple', $4)
        )::double precision,
        coalesce(term.locale::text, $1::text), 'full_text', term.value
      from search_terms term
      join selected_objects selected
        on selected.object_kind = term.object_kind
        and selected.object_id = term.object_id
      where term.reason = 'alias'
        and to_tsvector('simple', term.value)
          @@ websearch_to_tsquery('simple', $4)
      union all
      select term.object_kind, term.object_id,
        case when term.reason = 'official_name' then 150 else 100 end,
        similarity(term.normalized_value, $3)::double precision,
        coalesce(term.locale::text, $1::text), 'trigram', term.value
      from search_terms term
      join selected_objects selected
        on selected.object_kind = term.object_kind
        and selected.object_id = term.object_id
      where term.reason in ('official_name', 'alias')
        and term.normalized_value % $3
      union all
      select document.object_kind, document.object_id, 100,
        similarity(lower(document.search_name), $3)::double precision,
        document.locale::text, 'trigram', document.name
      from search_documents document
      join selected_objects selected
        on selected.object_kind = document.object_kind
        and selected.object_id = document.object_id
      where lower(document.search_name) % $3
    ),
    best_current_match as (
      select ranked.*
      from (
        select current_match.*,
          row_number() over (
            partition by current_match.object_kind, current_match.object_id
            order by current_match.match_priority desc,
              current_match.score desc,
              (current_match.matched_locale = $1::text) desc,
              current_match.matched_text
          ) as match_rank
        from current_matches current_match
      ) ranked
      where ranked.match_rank = 1
    )
    select document.object_kind::text as kind,
      document.entity_type::text as entity_type,
      document.public_id, document.status::text, document.name,
      document.summary, document.locale::text, document.occurred_at,
      document.last_verified_at, document.source_name, document.source_url,
      case when document.object_kind = 'event' then array(
        select distinct source_item.original_language::text
        from event_sources event_source
        join source_items source_item
          on source_item.id = event_source.source_item_id
          and source_item.public_visibility = true
        where event_source.event_id = document.object_id
        order by source_item.original_language::text
      ) else array(
        select distinct source_item.original_language::text
        from relations relation
        join event_sources event_source
          on event_source.event_id = relation.subject_event_id
        join source_items source_item
          on source_item.id = event_source.source_item_id
          and source_item.public_visibility = true
        where relation.object_entity_id = document.object_id
          and relation.public_visibility = true
          and relation.review_status = 'reviewed'
          and exists (
            select 1 from relation_evidence evidence
            join source_items evidence_source
              on evidence_source.id = evidence.source_item_id
              and evidence_source.public_visibility = true
            where evidence.relation_id = relation.id
          )
        order by source_item.original_language::text
      ) end as signal_languages,
      current_match.matched_locale as current_matched_locale,
      current_match.match_reason as current_match_reason,
      current_match.matched_text as current_matched_text
    from search_documents document
    left join best_current_match current_match
      on current_match.object_kind = document.object_kind
      and current_match.object_id = document.object_id
    where document.locale = $1::content_locale
      and document.public_id = any($2::text[])
      and (document.entity_type is distinct from 'product' or (
        exists (
          select 1 from product_profiles profile
          join product_observations observation
            on observation.product_profile_id = profile.id
            and observation.public_visibility = true
          join source_items observation_source
            on observation_source.id = observation.source_item_id
            and observation_source.public_visibility = true
            and observation_source.rights_status in (
              'open', 'attribution_required', 'source_license',
              'metadata_only', 'link_only'
            )
          where profile.entity_id = document.object_id
            and profile.public_visibility = true
            and observation.effective_at <= (
              select max(cutoff_observation.observed_at)
              from product_observations cutoff_observation
              join source_items cutoff_source
                on cutoff_source.id = cutoff_observation.source_item_id
                and cutoff_source.public_visibility = true
                and cutoff_source.rights_status in (
                  'open', 'attribution_required', 'source_license',
                  'metadata_only', 'link_only'
                )
              where cutoff_observation.product_profile_id = profile.id
                and cutoff_observation.public_visibility = true
            )
        )
        and exists (
          select 1 from relations ownership
          join entities organization
            on organization.id = ownership.subject_entity_id
            and organization.type = 'organization'
            and organization.lifecycle_status = 'active'
            and organization.public_visibility = true
          join entity_localized_contents organization_localization
            on organization_localization.entity_id = organization.id
            and organization_localization.locale = $1::content_locale
            and organization_localization.review_status = 'reviewed'
            and organization_localization.public_visibility = true
          where ownership.object_entity_id = document.object_id
            and ownership.predicate = 'DEVELOPS'
            and ownership.review_status = 'reviewed'
            and ownership.public_visibility = true
            and exists (
              select 1 from relation_evidence evidence
              join source_items ownership_source
                on ownership_source.id = evidence.source_item_id
                and ownership_source.public_visibility = true
                and ownership_source.rights_status in (
                  'open', 'attribution_required', 'source_license',
                  'metadata_only', 'link_only'
                )
              where evidence.relation_id = ownership.id
            )
        )
      ))`,
    [input.locale, publicIds, normalizeSearchText(input.q), input.q],
  );
  const currentByKey = new Map(
    currentDocuments.rows.map((row) => [`${row.kind}:${row.public_id}`, row]),
  );
  const currentTombstones = await client.query<CurrentTombstoneRow>(
    `select tombstone.object_type::text as kind,
      tombstone.object_public_id as public_id,
      case when tombstone.object_type = 'entity' then entity.type::text else null::text end as entity_type,
      case when tombstone.status = 'reviewing'
        then 'under_review' else tombstone.status::text end as status,
      tombstone.public_reason_code::text as reason,
      tombstone.effective_at, tombstone.replacement_public_id
    from tombstones tombstone
    left join entities entity
      on tombstone.object_type = 'entity'
      and entity.public_id = tombstone.object_public_id
    where tombstone.cleared_at is null
      and tombstone.object_public_id = any($1::text[])`,
    [publicIds],
  );
  const tombstoneByKey = new Map(
    currentTombstones.rows.map((row) => [`${row.kind}:${row.public_id}`, row]),
  );

  return storedItems.flatMap((stored) => {
    const key = `${stored.kind}:${stored.publicId}`;
    const current = currentByKey.get(key);
    if (!current) {
      const tombstone = tombstoneByKey.get(key);
      return tombstone ? [tombstoneResult(tombstone, input.locale)] : [];
    }
    const currentMatch = current.current_match_reason
      ? {
          locale: current.current_matched_locale!,
          reason: current.current_match_reason,
          text: current.current_matched_text!,
        }
      : {
          locale: current.locale,
          reason: "snapshot_member" as const,
          text: `${current.name} — ${current.summary}`,
        };
    return [
      searchResultSchema.parse({
        kind: stored.kind,
        publicId: stored.publicId,
        entityType: current.entity_type,
        status: current.status,
        name: current.name,
        summary: current.summary,
        locale: current.locale,
        matchedLocale: currentMatch.locale,
        matchReason: currentMatch.reason,
        matchedText: currentMatch.text,
        occurredAt: current.occurred_at?.toISOString() ?? null,
        lastVerifiedAt: current.last_verified_at.toISOString(),
        source:
          current.source_name && current.source_url
            ? { name: current.source_name, url: current.source_url }
            : null,
        signalLanguages: current.signal_languages,
        replacementPublicId: null,
      }),
    ];
  });
};

const cursorFor = (
  requestKey: string,
  snapshotId: string,
  dataCutoff: string,
  offset: number,
) =>
  encodeCursor({
    version: 1,
    requestKey,
    dataCutoff,
    snapshotId,
    offset,
  });

const readSnapshotPage = async (
  input: SearchRequest,
  requestKey: string,
  cursor: SearchCursor,
) => {
  const client = await databasePool.connect();
  try {
    await client.query("begin isolation level repeatable read read only");
    const snapshot = await client.query<SnapshotRow>(
      `select data_cutoff, expires_at, ranking_state, total_count, truncated
       from search_snapshots
       where id = $1 and request_key = $2 and data_cutoff = $3::timestamptz
         and expires_at > clock_timestamp()`,
      [cursor.snapshotId, requestKey, cursor.dataCutoff],
    );
    const metadata = snapshot.rows[0];
    if (!metadata) {
      await client.query("rollback");
      return { status: "invalid_cursor" as const };
    }
    const page = await client.query<SnapshotItemRow>(
      `select payload
       from search_snapshot_items
       where snapshot_id = $1 and position >= $2 and position < $3
       order by position`,
      [cursor.snapshotId, cursor.offset, cursor.offset + input.limit],
    );
    const storedItems = page.rows.map(({ payload }) =>
      searchSnapshotIdentitySchema.parse(payload),
    );
    const items = await hydrateSnapshotItems(client, storedItems, input);
    const nextOffset = cursor.offset + storedItems.length;
    const response = {
      status: "ok" as const,
      response: {
        query: input.q,
        locale: input.locale,
        sort: input.sort,
        rankingState: metadata.ranking_state,
        items,
        resultSet: {
          capturedCount: metadata.total_count,
          limit: MAX_SEARCH_SNAPSHOT_ITEMS as 1000,
          truncated: metadata.truncated,
        },
        nextCursor:
          nextOffset < metadata.total_count
            ? cursorFor(
                requestKey,
                cursor.snapshotId,
                cursor.dataCutoff,
                nextOffset,
              )
            : null,
        dataCutoff: cursor.dataCutoff,
      },
    };
    await client.query("commit");
    return response;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
};

const createSnapshotPage = async (input: SearchRequest, requestKey: string) => {
  const client = await databasePool.connect();
  try {
    await client.query("begin isolation level repeatable read");
    const cutoffResult = await client.query<{ data_cutoff: Date }>(
      "select transaction_timestamp() as data_cutoff",
    );
    const dataCutoff = cutoffResult.rows[0].data_cutoff.toISOString();
    const result = await client.query<SearchRow>(searchSql, [
      input.q,
      normalizeSearchText(input.q),
      input.locale,
      input.type,
      input.from ?? null,
      input.to ?? null,
      input.topic || null,
      input.organization || null,
      input.signalLanguage,
      input.sort,
      MAX_SEARCH_SNAPSHOT_ITEMS + 1,
    ]);
    const truncated = result.rows.length > MAX_SEARCH_SNAPSHOT_ITEMS;
    const items = result.rows
      .slice(0, MAX_SEARCH_SNAPSHOT_ITEMS)
      .map(toSearchResult);
    const identities: SearchSnapshotIdentity[] = items.map(
      ({ kind, publicId, matchedLocale, matchReason }) => ({
        kind,
        publicId,
        matchedLocale,
        matchReason,
      }),
    );
    const rankingState =
      input.sort === "trending"
        ? ("insufficient_evidence" as const)
        : ("available" as const);
    const snapshotId = randomUUID();
    await client.query(
      "delete from search_snapshots where expires_at <= clock_timestamp()",
    );
    await client.query(
      `insert into search_snapshots (
        id, request_key, ranking_state, data_cutoff, expires_at, total_count,
        truncated
      ) values ($1, $2, $3, $4::timestamptz, $4::timestamptz + interval '24 hours', $5, $6)`,
      [
        snapshotId,
        requestKey,
        rankingState,
        dataCutoff,
        identities.length,
        truncated,
      ],
    );
    if (identities.length > 0) {
      await client.query(
        `insert into search_snapshot_items (snapshot_id, position, payload)
         select $1, (ordinality - 1)::integer, value
         from jsonb_array_elements($2::jsonb) with ordinality`,
        [snapshotId, JSON.stringify(identities)],
      );
    }
    await client.query("commit");
    const pageItems = items.slice(0, input.limit);
    return {
      status: "ok" as const,
      response: {
        query: input.q,
        locale: input.locale,
        sort: input.sort,
        rankingState,
        items: pageItems,
        resultSet: {
          capturedCount: identities.length,
          limit: MAX_SEARCH_SNAPSHOT_ITEMS as 1000,
          truncated,
        },
        nextCursor:
          identities.length > input.limit
            ? cursorFor(requestKey, snapshotId, dataCutoff, input.limit)
            : null,
        dataCutoff,
      },
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
};

export const searchPublicRecords = async (input: SearchRequest) => {
  const requestKey = requestKeyFor(input);
  const cursor = input.cursor ? decodeCursor(input.cursor) : null;
  if (input.cursor && (!cursor || cursor.requestKey !== requestKey)) {
    return { status: "invalid_cursor" as const };
  }
  return cursor
    ? readSnapshotPage(input, requestKey, cursor)
    : createSnapshotPage(input, requestKey);
};
