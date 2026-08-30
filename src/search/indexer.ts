import { sql } from "drizzle-orm";
import { database } from "@/db/client";

type SearchIndexExecutor = Pick<typeof database, "execute">;

const clearSearchObject = async (
  executor: SearchIndexExecutor,
  kind: "event" | "entity",
  objectId: string,
) => {
  await executor.execute(
    sql`delete from search_terms where object_kind = ${kind}::search_object_kind and object_id = ${objectId}::uuid`,
  );
  await executor.execute(
    sql`delete from search_documents where object_kind = ${kind}::search_object_kind and object_id = ${objectId}::uuid`,
  );
};

export const refreshEntitySearchIndex = async (
  executor: SearchIndexExecutor,
  entityId: string,
) => {
  await clearSearchObject(executor, "entity", entityId);
  await executor.execute(sql`
    insert into search_documents (
      id, object_kind, object_id, public_id, entity_type, locale,
      name, summary, search_name, search_text, occurred_at,
      latest_at, last_verified_at, source_name, source_url, status, indexed_at
    )
    select gen_random_uuid(), 'entity', entity.id, entity.public_id,
      entity.type, localization.locale, localization.name,
      localization.summary,
      concat_ws(' ', entity.official_name, localization.name),
      concat_ws(' ', entity.official_name, localization.name, localization.summary),
      null, greatest(
        entity.created_at,
        coalesce((
          select max(version.released_at)
          from entity_versions version
          where version.entity_id = entity.id
            and version.public_visibility = true
        ), entity.created_at)
      ), entity.last_verified_at,
      entity.official_name, entity.official_url,
      'public', clock_timestamp()
    from entities entity
    join entity_localized_contents localization
      on localization.entity_id = entity.id
      and localization.review_status = 'reviewed'
      and localization.public_visibility = true
    where entity.id = ${entityId}::uuid
      and entity.lifecycle_status = 'active'
      and entity.public_visibility = true
  `);
  await executor.execute(sql`
    insert into search_terms (
      id, object_kind, object_id, locale, reason, value, normalized_value
    )
    select gen_random_uuid(), 'entity', entity.id, term.locale,
      term.reason::search_term_reason, term.value,
      lower(normalize(term.value, NFKC))
    from entities entity
    cross join lateral (
      select null::content_locale as locale, 'public_id'::text as reason,
        entity.public_id as value
      union all
      select null, 'canonical_url', entity.official_url
      union all
      select null, 'official_name', entity.official_name
      union all
      select alias.locale, 'alias', alias.value
      from entity_aliases alias
      where alias.entity_id = entity.id and alias.public_visibility = true
      union all
      select null, 'external_id', version.public_id
      from entity_versions version
      where version.entity_id = entity.id and version.public_visibility = true
      union all
      select null, 'external_id', version.version_label
      from entity_versions version
      where version.entity_id = entity.id and version.public_visibility = true
    ) term
    where entity.id = ${entityId}::uuid
      and entity.lifecycle_status = 'active'
      and entity.public_visibility = true
  `);
};

export const refreshEventSearchIndex = async (
  executor: SearchIndexExecutor,
  eventId: string,
) => {
  await clearSearchObject(executor, "event", eventId);
  await executor.execute(sql`
    insert into search_documents (
      id, object_kind, object_id, public_id, entity_type, locale,
      name, summary, search_name, search_text, occurred_at,
      latest_at, last_verified_at, source_name, source_url, status, indexed_at
    )
    select gen_random_uuid(), 'event', event.id, event.public_id, null,
      localization.locale, localization.title, localization.summary,
      localization.title,
      concat_ws(' ', localization.title, localization.summary),
      event.occurred_at, event.occurred_at, event.last_verified_at,
      primary_source.source_name, primary_source.source_url,
      case when exists (
        select 1
        from event_sources withdrawn_link
        join source_items withdrawn_source
          on withdrawn_source.id = withdrawn_link.source_item_id
        where withdrawn_link.event_id = event.id
          and withdrawn_source.rights_status = 'withdrawn'
      ) then 'source_withdrawn'::search_public_status
      else 'public'::search_public_status end,
      clock_timestamp()
    from events event
    join localized_contents localization
      on localization.event_id = event.id
      and localization.review_status = 'reviewed'
      and localization.public_visibility = true
    join lateral (
      select source.name as source_name, source_item.canonical_url as source_url
      from event_sources event_source
      join source_items source_item
        on source_item.id = event_source.source_item_id
        and source_item.public_visibility = true
      join sources source on source.id = source_item.source_id
      where event_source.event_id = event.id
      order by event_source.is_primary desc, source_item.public_id
      limit 1
    ) primary_source on true
    where event.id = ${eventId}::uuid
      and event.publication_state in ('published', 'corrected')
      and event.public_visibility = true
  `);
  await executor.execute(sql`
    insert into search_terms (
      id, object_kind, object_id, locale, reason, value, normalized_value
    )
    select gen_random_uuid(), 'event', event.id, term.locale,
      term.reason::search_term_reason, term.value,
      lower(normalize(term.value, NFKC))
    from events event
    cross join lateral (
      select null::content_locale as locale, 'public_id'::text as reason,
        event.public_id as value
      union all
      select null, 'canonical_url', source_item.canonical_url
      from event_sources event_source
      join source_items source_item
        on source_item.id = event_source.source_item_id
        and source_item.public_visibility = true
      where event_source.event_id = event.id
      union all
      select null, 'canonical_url', source_item.original_url
      from event_sources event_source
      join source_items source_item
        on source_item.id = event_source.source_item_id
        and source_item.public_visibility = true
      where event_source.event_id = event.id
      union all
      select source_item.original_language, 'external_id', source_item.external_id
      from event_sources event_source
      join source_items source_item
        on source_item.id = event_source.source_item_id
        and source_item.public_visibility = true
      where event_source.event_id = event.id
      union all
      select source_item.original_language, 'external_id', source_item.public_id
      from event_sources event_source
      join source_items source_item
        on source_item.id = event_source.source_item_id
        and source_item.public_visibility = true
      where event_source.event_id = event.id
    ) term
    where event.id = ${eventId}::uuid
      and event.publication_state in ('published', 'corrected')
      and event.public_visibility = true
      and exists (
        select 1
        from event_sources public_link
        join source_items public_source
          on public_source.id = public_link.source_item_id
          and public_source.public_visibility = true
        where public_link.event_id = event.id
      )
  `);
};
