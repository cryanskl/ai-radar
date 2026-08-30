import { createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { PoolClient } from "pg";
import { database, databasePool } from "@/db/client";
import {
  entities,
  githubSourceItemMetadata,
  ownerOperationAudits,
  repositoryIdentities,
  repositoryObservations,
  sourceItems,
  sources,
} from "@/db/schema";
import { getPublicEntity } from "@/entities/service";
import {
  type PublicRepositoryDetail,
  type PublicRepositoryListItem,
  type RepositoryListCursor,
  type RepositoryListRequest,
  type RepositoryObservationCreateRequest,
  publicRepositoryDetailSchema,
  publicRepositoryListItemSchema,
  publicRepositoryListSchema,
  repositoryListCursorSchema,
} from "./contracts";
import { selectRisingBaseline } from "./rising";

const publicRights = [
  "open",
  "attribution_required",
  "source_license",
  "metadata_only",
  "link_only",
] as const;

export const createRepositoryObservation = async (
  input: RepositoryObservationCreateRequest,
) =>
  database.transaction(async (transaction) => {
    const [reference] = await transaction
      .select({
        entityId: entities.id,
        entityType: entities.type,
        entityName: entities.officialName,
        entityUrl: entities.officialUrl,
        entityVisibility: entities.publicVisibility,
        sourceItemId: sourceItems.id,
        sourceItemRights: sourceItems.rightsStatus,
        sourcePublicId: sources.publicId,
        sourceAccessStatus: sources.accessStatus,
        githubRepositoryId: githubSourceItemMetadata.githubRepositoryId,
        fullName: githubSourceItemMetadata.fullName,
        url: githubSourceItemMetadata.url,
        observedAt: githubSourceItemMetadata.observedAt,
      })
      .from(entities)
      .innerJoin(
        sourceItems,
        eq(sourceItems.publicId, input.sourceItemPublicId),
      )
      .innerJoin(sources, eq(sources.id, sourceItems.sourceId))
      .innerJoin(
        githubSourceItemMetadata,
        eq(githubSourceItemMetadata.sourceItemId, sourceItems.id),
      )
      .where(eq(entities.publicId, input.familyPublicId));
    if (
      !reference ||
      reference.entityType !== "repository" ||
      !reference.entityVisibility ||
      reference.sourcePublicId !== "github" ||
      !["approved", "approved_limited"].includes(
        reference.sourceAccessStatus,
      ) ||
      reference.sourceItemRights !== "metadata_only" ||
      reference.entityName !== reference.fullName ||
      reference.entityUrl !== reference.url
    ) {
      return { status: "invalid_reference" as const };
    }

    const [insertedIdentity] = await transaction
      .insert(repositoryIdentities)
      .values({
        entityId: reference.entityId,
        githubRepositoryId: reference.githubRepositoryId,
      })
      .onConflictDoNothing()
      .returning({
        id: repositoryIdentities.id,
        githubRepositoryId: repositoryIdentities.githubRepositoryId,
      });
    const [identity] = insertedIdentity
      ? [insertedIdentity]
      : await transaction
          .select({
            id: repositoryIdentities.id,
            githubRepositoryId: repositoryIdentities.githubRepositoryId,
          })
          .from(repositoryIdentities)
          .where(eq(repositoryIdentities.entityId, reference.entityId));
    if (
      !identity ||
      identity.githubRepositoryId !== reference.githubRepositoryId
    ) {
      return { status: "invalid_reference" as const };
    }

    await transaction.insert(repositoryObservations).values({
      repositoryIdentityId: identity.id,
      metadataSourceItemId: reference.sourceItemId,
      publicVisibility: true,
    });
    await transaction
      .update(sourceItems)
      .set({ publicVisibility: true })
      .where(eq(sourceItems.id, reference.sourceItemId));
    await transaction.insert(ownerOperationAudits).values({
      actorRole: "owner",
      action: "create_repository_observation",
      targetType: "entity",
      targetPublicId: input.familyPublicId,
      publicVisibility: true,
    });
    return {
      status: "created" as const,
      familyPublicId: input.familyPublicId,
      githubRepositoryId: reference.githubRepositoryId,
      observedAt: reference.observedAt.toISOString(),
      publicVisibility: true,
    };
  });

type RepositoryObservationRow = {
  entity_id: string;
  public_id: string;
  name: string;
  summary: string;
  github_repository_id: number;
  owner_login: string;
  repository_name: string;
  full_name: string;
  url: string;
  description: string | null;
  topics: string[];
  primary_language: string | null;
  languages: Array<{ name: string; bytes: number }>;
  license_status: "detected" | "missing";
  license_spdx_id: string | null;
  license_name: string | null;
  stars: number;
  forks: number;
  open_issues: number;
  subscribers: number;
  lifecycle_state: "active" | "archived" | "mirrored" | "unavailable";
  fork: boolean;
  mirror_url: string | null;
  template: boolean;
  parent_repository: PublicRepositoryListItem["parentRepository"];
  source_repository: PublicRepositoryListItem["sourceRepository"];
  template_repository: PublicRepositoryListItem["templateRepository"];
  repository_created_at: Date;
  repository_updated_at: Date;
  pushed_at: Date | null;
  observed_at: Date;
  releases: PublicRepositoryListItem["latestRelease"][];
  source_item_public_id: string;
  projection_cutoff: Date;
};

const repositoryRowsSql = `
  select family.id as entity_id, family.public_id,
    localization.name, localization.summary,
    identity.github_repository_id, metadata.owner_login,
    metadata.name as repository_name, metadata.full_name, metadata.url,
    metadata.description, metadata.topics, metadata.primary_language,
    metadata.languages, metadata.license_status::text,
    metadata.license_spdx_id, metadata.license_name,
    metadata.stars, metadata.forks, metadata.open_issues,
    metadata.subscribers, metadata.lifecycle_state::text,
    metadata.fork, metadata.mirror_url, metadata.template,
    metadata.parent_repository, metadata.source_repository,
    metadata.template_repository,
    metadata.repository_created_at, metadata.repository_updated_at,
    metadata.pushed_at, metadata.observed_at, metadata.releases,
    source_item.public_id as source_item_public_id,
    greatest(
      family.last_verified_at, family.updated_at, localization.updated_at,
      metadata.observed_at, source_item.rights_checked_at,
      source_item.updated_at, source.updated_at
    ) as projection_cutoff
  from entities family
  join entity_localized_contents localization
    on localization.entity_id = family.id
    and localization.locale = $1::content_locale
    and localization.review_status = 'reviewed'
    and localization.public_visibility = true
  join repository_identities identity on identity.entity_id = family.id
  join repository_observations observation
    on observation.repository_identity_id = identity.id
    and observation.public_visibility = true
  join source_items source_item
    on source_item.id = observation.metadata_source_item_id
    and source_item.public_visibility = true
    and source_item.rights_status in (
      'open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'
    )
  join sources source on source.id = source_item.source_id
    and source.public_id = 'github'
    and source.access_status in ('approved', 'approved_limited')
  join github_source_item_metadata metadata
    on metadata.source_item_id = source_item.id
    and metadata.github_repository_id = identity.github_repository_id
  where family.type = 'repository'
    and family.lifecycle_status = 'active'
    and family.public_visibility = true
    and family.rights_status in (
      'open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'
    )
  order by family.public_id, metadata.observed_at`;

const licenseFor = (row: RepositoryObservationRow) => ({
  status: row.license_status,
  spdxId: row.license_spdx_id,
  name: row.license_name,
  reuseNotice:
    row.license_status === "detected"
      ? ("declared_license_review_terms" as const)
      : ("no_license_do_not_assume_reuse" as const),
});

const releaseTime = (
  release: NonNullable<PublicRepositoryListItem["latestRelease"]>,
) => Date.parse(release.publishedAt ?? release.createdAt);

const latestReleaseFor = (row: RepositoryObservationRow) =>
  [...row.releases]
    .filter(
      (release): release is NonNullable<typeof release> => release !== null,
    )
    .sort((left, right) => releaseTime(right) - releaseTime(left))[0] ?? null;

const metricsFor = (row: RepositoryObservationRow) => ({
  sourceItemPublicId: row.source_item_public_id,
  observedAt: row.observed_at.toISOString(),
  stars: row.stars,
  forks: row.forks,
  openIssues: row.open_issues,
  subscribers: row.subscribers,
});

const cohortFor = (row: RepositoryObservationRow) => {
  const ageDays =
    (row.observed_at.getTime() - row.repository_created_at.getTime()) /
    86_400_000;
  return ageDays <= 30
    ? ("new" as const)
    : ageDays <= 365
      ? ("established" as const)
      : ("mature" as const);
};

type RankedRepository = {
  item: PublicRepositoryListItem;
  rawScore: number;
};

const toListItem = (
  row: RepositoryObservationRow,
  rising: PublicRepositoryListItem["rising"] = null,
) =>
  publicRepositoryListItemSchema.parse({
    publicId: row.public_id,
    name: row.name,
    summary: row.summary,
    ownerLogin: row.owner_login,
    repositoryName: row.repository_name,
    fullName: row.full_name,
    officialUrl: row.url,
    description: row.description,
    topics: row.topics,
    languages: row.languages,
    license: licenseFor(row),
    lifecycleState: row.lifecycle_state,
    fork: row.fork,
    mirrorUrl: row.mirror_url,
    template: row.template,
    parentRepository: row.parent_repository,
    sourceRepository: row.source_repository,
    templateRepository: row.template_repository,
    repositoryCreatedAt: row.repository_created_at.toISOString(),
    repositoryUpdatedAt: row.repository_updated_at.toISOString(),
    pushedAt: row.pushed_at?.toISOString() ?? null,
    latestMetrics: metricsFor(row),
    latestRelease: latestReleaseFor(row),
    rising,
  });

const methodology = {
  new: {
    publicId: "github-new" as const,
    kind: "chronological_creation" as const,
    windowDays: null,
    en: "New orders repositories by creation time; public metadata does not grant reuse rights.",
    zh: "新仓库按创建时间排序；公开元数据不等于授予复用权。",
  },
  rising: {
    publicId: "github-rising" as const,
    kind: "source_normalized_growth" as const,
    windowDays: 7,
    en: "Rising measures recent source-normalized growth, not code quality.",
    zh: "上升榜衡量近期经来源归一化的增长，不代表代码质量。",
  },
  recently_released: {
    publicId: "github-recently-released" as const,
    kind: "chronological_release" as const,
    windowDays: null,
    en: "Recently Released orders repositories by their latest public GitHub Release.",
    zh: "最近发布按最新公开 GitHub Release 时间排序。",
  },
  featured: {
    publicId: "github-featured" as const,
    kind: "editorial" as const,
    windowDays: null,
    en: "Featured is an editorial selection, not an algorithmic ranking.",
    zh: "精选是编辑选择，不是算法排名。",
  },
};

const maximumSnapshotItems = 1000;

const requestKeyFor = (input: RepositoryListRequest) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        locale: input.locale,
        view: input.view,
        topic: input.topic ?? null,
        language: input.language ?? null,
        license: input.license ?? null,
        lifecycle: input.lifecycle ?? null,
        createdAfter: input.createdAfter ?? null,
        updatedAfter: input.updatedAfter ?? null,
        limit: input.limit,
      }),
    )
    .digest("hex");

const decodeCursor = (value: string): RepositoryListCursor | null => {
  try {
    const parsed = repositoryListCursorSchema.safeParse(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8")),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

const encodeCursor = (cursor: RepositoryListCursor) =>
  Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");

const currentSnapshotItems = async (
  client: PoolClient,
  items: PublicRepositoryListItem[],
  locale: "en" | "zh",
) => {
  if (items.length === 0) return new Set<string>();
  const result = await client.query<{ source_item_public_id: string }>(
    `with requested as (
       select * from jsonb_to_recordset($1::jsonb)
         as item(public_id text, source_item_public_id text)
     )
     select requested.source_item_public_id
     from requested
     join entities family on family.public_id = requested.public_id
       and family.type = 'repository'
       and family.lifecycle_status = 'active'
       and family.public_visibility = true
       and family.rights_status = any($2::rights_status[])
     join entity_localized_contents localization
       on localization.entity_id = family.id
       and localization.locale = $3::content_locale
       and localization.review_status = 'reviewed'
       and localization.public_visibility = true
     join repository_identities identity on identity.entity_id = family.id
     join repository_observations observation
       on observation.repository_identity_id = identity.id
       and observation.public_visibility = true
     join source_items source_item
       on source_item.id = observation.metadata_source_item_id
       and source_item.public_id = requested.source_item_public_id
       and source_item.public_visibility = true
       and source_item.rights_status = any($2::rights_status[])
     join sources source on source.id = source_item.source_id
     join github_source_item_metadata metadata
       on metadata.source_item_id = source_item.id
       and metadata.github_repository_id = identity.github_repository_id
     where source.public_id = 'github'
       and source.access_status in ('approved', 'approved_limited')`,
    [
      JSON.stringify(
        items.map(({ publicId, latestMetrics }) => ({
          public_id: publicId,
          source_item_public_id: latestMetrics.sourceItemPublicId,
        })),
      ),
      publicRights,
      locale,
    ],
  );
  return new Set(
    result.rows.map(({ source_item_public_id }) => source_item_public_id),
  );
};

const responseFor = ({
  input,
  rankingState,
  dataCutoff,
  capturedCount,
  truncated,
  nextCursor,
  items,
}: {
  input: RepositoryListRequest;
  rankingState: "available" | "insufficient_evidence";
  dataCutoff: string | null;
  capturedCount: number;
  truncated: boolean;
  nextCursor: string | null;
  items: PublicRepositoryListItem[];
}) => {
  const selectedMethodology = methodology[input.view];
  const emptyState =
    items.length > 0
      ? null
      : input.view === "featured"
        ? ("no_editorial_selections" as const)
        : rankingState === "insufficient_evidence"
          ? ("insufficient_evidence" as const)
          : ("no_matches" as const);
  return publicRepositoryListSchema.parse({
    locale: input.locale,
    view: input.view,
    rankingState,
    methodology: {
      publicId: selectedMethodology.publicId,
      version: "1.0.0",
      kind: selectedMethodology.kind,
      windowDays: selectedMethodology.windowDays,
      limitation: selectedMethodology[input.locale],
    },
    dataCutoff,
    resultSet: {
      capturedCount,
      limit: maximumSnapshotItems,
      truncated,
    },
    emptyState,
    nextCursor,
    items,
  });
};

const readSnapshotPage = async (
  input: RepositoryListRequest,
  requestKey: string,
  cursor: RepositoryListCursor,
) => {
  const client = await databasePool.connect();
  try {
    await client.query("begin isolation level repeatable read read only");
    const snapshot = await client.query<{
      ranking_state: "available" | "insufficient_evidence";
      total_count: number;
      truncated: boolean;
    }>(
      `select ranking_state, total_count, truncated
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
    const page = await client.query<{ payload: unknown }>(
      `select payload from search_snapshot_items
       where snapshot_id = $1 and position >= $2 and position < $3
       order by position`,
      [cursor.snapshotId, cursor.offset, cursor.offset + input.limit],
    );
    const stored = page.rows.map(({ payload }) =>
      publicRepositoryListItemSchema.parse(payload),
    );
    const current = await currentSnapshotItems(client, stored, input.locale);
    const items = stored.filter(({ latestMetrics }) =>
      current.has(latestMetrics.sourceItemPublicId),
    );
    const nextOffset = cursor.offset + stored.length;
    await client.query("commit");
    return {
      status: "ok" as const,
      response: responseFor({
        input,
        rankingState: metadata.ranking_state,
        dataCutoff: cursor.dataCutoff,
        capturedCount: metadata.total_count,
        truncated: metadata.truncated,
        nextCursor:
          nextOffset < metadata.total_count
            ? encodeCursor({ ...cursor, offset: nextOffset })
            : null,
        items,
      }),
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
};

const applyFilters = (
  rows: RepositoryObservationRow[],
  input: RepositoryListRequest,
) =>
  rows.filter(
    (row) =>
      (!input.topic ||
        row.topics.some(
          (topic) => topic.toLowerCase() === input.topic!.toLowerCase(),
        )) &&
      (!input.language ||
        row.languages.some(
          ({ name }) => name.toLowerCase() === input.language!.toLowerCase(),
        )) &&
      (!input.license || row.license_status === input.license) &&
      (!input.lifecycle || row.lifecycle_state === input.lifecycle) &&
      (!input.createdAfter ||
        row.repository_created_at >= new Date(input.createdAfter)) &&
      (!input.updatedAfter ||
        row.repository_updated_at >= new Date(input.updatedAfter)),
  );

const rankRows = (
  grouped: RepositoryObservationRow[][],
  input: RepositoryListRequest,
) => {
  if (input.view === "featured") {
    return {
      rankingState: "available" as const,
      ranked: [] as RankedRepository[],
    };
  }
  if (input.view === "rising") {
    const eligible = grouped.flatMap((history) => {
      const latest = history.at(-1)!;
      if (
        latest.lifecycle_state !== "active" ||
        latest.fork ||
        latest.mirror_url
      ) {
        return [];
      }
      const baseline = selectRisingBaseline(
        history,
        latest.observed_at,
        ({ observed_at }) => observed_at,
      );
      if (!baseline) return [];
      const starDelta = latest.stars - baseline.stars;
      const forkDelta = latest.forks - baseline.forks;
      if (starDelta < 0 || forkDelta < 0) return [];
      const releaseFreshness = latestReleaseFor(latest)
        ? Math.max(
            0,
            1 -
              (latest.observed_at.getTime() -
                releaseTime(latestReleaseFor(latest)!)) /
                (30 * 86_400_000),
          )
        : 0;
      const pushFreshness = latest.pushed_at
        ? Math.max(
            0,
            1 -
              (latest.observed_at.getTime() - latest.pushed_at.getTime()) /
                (30 * 86_400_000),
          )
        : 0;
      return [
        {
          latest,
          cohort: cohortFor(latest),
          starDelta,
          forkDelta,
          windowStart: baseline.observed_at.toISOString(),
          windowEnd: latest.observed_at.toISOString(),
          rawScore:
            starDelta + forkDelta * 3 + releaseFreshness * 2 + pushFreshness,
        },
      ];
    });
    const maxima = new Map<string, number>();
    for (const item of eligible) {
      maxima.set(
        item.cohort,
        Math.max(maxima.get(item.cohort) ?? 0, item.rawScore),
      );
    }
    const ranked = eligible
      .map((candidate) => {
        const maximum = maxima.get(candidate.cohort)!;
        const score = maximum === 0 ? 0 : (candidate.rawScore / maximum) * 100;
        return {
          rawScore: candidate.rawScore,
          item: toListItem(candidate.latest, {
            score,
            cohort: candidate.cohort,
            starDelta: candidate.starDelta,
            forkDelta: candidate.forkDelta,
            windowStart: candidate.windowStart,
            windowEnd: candidate.windowEnd,
          }),
        };
      })
      .sort(
        (left, right) =>
          right.rawScore - left.rawScore ||
          left.item.publicId.localeCompare(right.item.publicId),
      );
    return {
      rankingState:
        ranked.length === 0
          ? ("insufficient_evidence" as const)
          : ("available" as const),
      ranked,
    };
  }
  const ranked = grouped.map((history) => {
    const latest = history.at(-1)!;
    const item = toListItem(latest);
    return {
      item,
      rawScore:
        input.view === "new"
          ? latest.repository_created_at.getTime()
          : latestReleaseFor(latest)
            ? releaseTime(latestReleaseFor(latest)!)
            : Number.NEGATIVE_INFINITY,
    };
  });
  return {
    rankingState: "available" as const,
    ranked: ranked
      .filter(({ rawScore }) => Number.isFinite(rawScore))
      .sort(
        (left, right) =>
          right.rawScore - left.rawScore ||
          left.item.publicId.localeCompare(right.item.publicId),
      ),
  };
};

export const listPublicRepositories = async (input: RepositoryListRequest) => {
  const requestKey = requestKeyFor(input);
  if (input.cursor) {
    const cursor = decodeCursor(input.cursor);
    if (!cursor || cursor.requestKey !== requestKey) {
      return { status: "invalid_cursor" as const };
    }
    return readSnapshotPage(input, requestKey, cursor);
  }
  const result = await databasePool.query<RepositoryObservationRow>(
    repositoryRowsSql,
    [input.locale],
  );
  const histories = new Map<string, RepositoryObservationRow[]>();
  for (const row of result.rows) {
    const history = histories.get(row.public_id) ?? [];
    history.push(row);
    histories.set(row.public_id, history);
  }
  const filtered = [...histories.values()].flatMap((history) => {
    const latest = history.at(-1)!;
    return applyFilters([latest], input).length > 0 ? [history] : [];
  });
  const { rankingState, ranked } = rankRows(filtered, input);
  const truncated = ranked.length > maximumSnapshotItems;
  const captured = ranked
    .slice(0, maximumSnapshotItems)
    .map(({ item }) => item);
  const dataCutoff =
    filtered.length === 0 || input.view === "featured"
      ? null
      : new Date(
          Math.max(
            ...filtered.flatMap((history) =>
              history.map(({ projection_cutoff }) =>
                projection_cutoff.getTime(),
              ),
            ),
          ),
        ).toISOString();
  if (!dataCutoff) {
    return {
      status: "ok" as const,
      response: responseFor({
        input,
        rankingState,
        dataCutoff,
        capturedCount: 0,
        truncated,
        nextCursor: null,
        items: [],
      }),
    };
  }
  const snapshotId = randomUUID();
  const client = await databasePool.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into search_snapshots (
         id, request_key, ranking_state, data_cutoff, expires_at,
         total_count, truncated
       ) values ($1, $2, $3, $4::timestamptz,
         clock_timestamp() + interval '15 minutes', $5, $6)`,
      [
        snapshotId,
        requestKey,
        rankingState,
        dataCutoff,
        captured.length,
        truncated,
      ],
    );
    if (captured.length > 0) {
      await client.query(
        `insert into search_snapshot_items (snapshot_id, position, payload)
         select $1, item.ordinality - 1, item.payload
         from jsonb_array_elements($2::jsonb) with ordinality as item(payload, ordinality)`,
        [snapshotId, JSON.stringify(captured)],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  const page = captured.slice(0, input.limit);
  return {
    status: "ok" as const,
    response: responseFor({
      input,
      rankingState,
      dataCutoff,
      capturedCount: captured.length,
      truncated,
      nextCursor:
        input.limit < captured.length
          ? encodeCursor({
              version: 1,
              requestKey,
              dataCutoff,
              snapshotId,
              offset: input.limit,
            })
          : null,
      items: page,
    }),
  };
};

export const getPublicRepository = async (
  publicId: string,
  locale: "en" | "zh",
) => {
  const generic = await getPublicEntity(publicId, locale);
  if (!generic || !("type" in generic) || generic.type !== "repository") {
    return generic;
  }
  const observations = await databasePool.query<RepositoryObservationRow>(
    `${repositoryRowsSql.replace("order by family.public_id, metadata.observed_at", "")}
     and family.public_id = $2
     order by metadata.observed_at`,
    [locale, publicId],
  );
  if (observations.rows.length === 0) return null;
  const latest = observations.rows.at(-1)!;
  const typeRows = await databasePool.query<{
    public_id: string;
    type: string;
  }>(
    `select public_id, type::text from entities
     where public_id = any($1::text[]) and public_visibility = true`,
    [
      [...generic.outgoingRelations, ...generic.backlinks].flatMap(
        (relation) => {
          const endpoint =
            relation.direction === "outgoing"
              ? relation.object
              : relation.subject;
          return endpoint.type === "entity" && endpoint.publicId !== publicId
            ? [endpoint.publicId]
            : [];
        },
      ),
    ],
  );
  const typeByPublicId = new Map(
    typeRows.rows.map(({ public_id, type }) => [public_id, type]),
  );
  const relatedEntities = [
    ...generic.outgoingRelations,
    ...generic.backlinks,
  ].flatMap((relation) => {
    const endpoint =
      relation.direction === "outgoing" ? relation.object : relation.subject;
    const type =
      endpoint.type === "entity" ? typeByPublicId.get(endpoint.publicId) : null;
    return type && endpoint.publicId !== publicId
      ? [
          {
            relationPublicId: relation.publicId,
            publicId: endpoint.publicId,
            name: endpoint.name,
            type,
            predicate: relation.predicate,
            direction: relation.direction,
            confidence: relation.confidence,
            firstVerifiedAt: relation.firstVerifiedAt,
            lastVerifiedAt: relation.lastVerifiedAt,
            evidence: relation.evidence,
          },
        ]
      : [];
  });
  const releaseById = new Map<
    number,
    NonNullable<PublicRepositoryListItem["latestRelease"]>
  >();
  for (const observation of observations.rows) {
    for (const release of observation.releases) {
      if (release) releaseById.set(release.githubReleaseId, release);
    }
  }
  const dataCutoff = new Date(
    Math.max(
      Date.parse(generic.lastVerifiedAt),
      ...observations.rows.map(({ projection_cutoff }) =>
        projection_cutoff.getTime(),
      ),
      ...relatedEntities.map(({ lastVerifiedAt }) =>
        Date.parse(lastVerifiedAt),
      ),
    ),
  ).toISOString();
  return publicRepositoryDetailSchema.parse({
    publicId: generic.publicId,
    name: generic.localization.name,
    summary: generic.localization.summary,
    githubRepositoryId: Number(latest.github_repository_id),
    ownerLogin: latest.owner_login,
    repositoryName: latest.repository_name,
    fullName: latest.full_name,
    officialUrl: latest.url,
    description: latest.description,
    topics: latest.topics,
    languages: latest.languages,
    license: licenseFor(latest),
    lifecycleState: latest.lifecycle_state,
    fork: latest.fork,
    mirrorUrl: latest.mirror_url,
    template: latest.template,
    parentRepository: latest.parent_repository,
    sourceRepository: latest.source_repository,
    templateRepository: latest.template_repository,
    repositoryCreatedAt: latest.repository_created_at.toISOString(),
    repositoryUpdatedAt: latest.repository_updated_at.toISOString(),
    pushedAt: latest.pushed_at?.toISOString() ?? null,
    dataCutoff,
    observations: observations.rows.map(metricsFor),
    releases: [...releaseById.values()].sort(
      (left, right) => releaseTime(right) - releaseTime(left),
    ),
    relatedEntities,
  } satisfies PublicRepositoryDetail);
};
