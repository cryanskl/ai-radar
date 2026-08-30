import { databasePool } from "@/db/client";
import { getPublicEvent, listPublicEvents } from "@/events/service";
import { guideListRequestSchema } from "@/guides/contracts";
import { listPublicGuides } from "@/guides/service";
import { modelListRequestSchema } from "@/models/contracts";
import { listPublicModels } from "@/models/service";
import { paperListRequestSchema } from "@/papers/contracts";
import { listPublicPapers } from "@/papers/service";
import { productListRequestSchema } from "@/products/contracts";
import { listPublicProducts } from "@/products/service";
import { promptListRequestSchema } from "@/prompts/contracts";
import { listPublicPrompts } from "@/prompts/service";
import { getPublicRanking, listPublicRankings } from "@/rankings/service";
import { repositoryListRequestSchema } from "@/repositories/contracts";
import { listPublicRepositories } from "@/repositories/service";
import { skillListRequestSchema } from "@/skills/contracts";
import { listPublicSkills } from "@/skills/service";

type Locale = "en" | "zh";
export type HomepageView = "latest" | "trending" | "featured";
type SuccessfulResult<Result> = Extract<Result, { status: "ok" }>;

const listPublicTopics = async (locale: Locale) => {
  const result = await databasePool.query<{
    public_id: string;
    name: string;
    summary: string;
    last_verified_at: Date;
  }>(
    `select topic.public_id, localization.name, localization.summary,
       topic.last_verified_at
     from entities topic
     join entity_localized_contents localization
       on localization.entity_id = topic.id
       and localization.locale = $1::content_locale
       and localization.review_status = 'reviewed'
       and localization.public_visibility = true
     where topic.type = 'topic' and topic.lifecycle_status = 'active'
       and topic.public_visibility = true
       and topic.rights_status in (
         'open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'
       )
     order by topic.last_verified_at desc, topic.public_id
     limit 12`,
    [locale],
  );
  return result.rows.map((topic) => ({
    publicId: topic.public_id,
    name: topic.name,
    summary: topic.summary,
    lastVerifiedAt: topic.last_verified_at.toISOString(),
  }));
};

const listEntityStats = async (publicIds: string[]) => {
  if (publicIds.length === 0)
    return new Map<string, { lastVerifiedAt: string; relationCount: number }>();
  const result = await databasePool.query<{
    public_id: string;
    last_verified_at: Date;
    relation_count: number;
  }>(
    `select entity.public_id, entity.last_verified_at,
       (
         select count(distinct relation.id)::integer
         from relations relation
         join relation_evidence evidence on evidence.relation_id = relation.id
         join source_items source_item on source_item.id = evidence.source_item_id
           and source_item.public_visibility = true
         where relation.review_status = 'reviewed'
           and relation.public_visibility = true
           and (relation.subject_entity_id = entity.id or relation.object_entity_id = entity.id)
       ) as relation_count
     from entities entity
     where entity.public_id = any($1::text[])
       and entity.lifecycle_status = 'active'
       and entity.public_visibility = true`,
    [publicIds],
  );
  return new Map(
    result.rows.map((row) => [
      row.public_id,
      {
        lastVerifiedAt: row.last_verified_at.toISOString(),
        relationCount: row.relation_count,
      },
    ]),
  );
};

export const getHomepageData = async (locale: Locale, view: HomepageView) => {
  const [
    models,
    papersResult,
    repositoriesResult,
    productsResult,
    promptsResult,
    skills,
    guides,
    rankings,
    topics,
    latestEvents,
  ] = await Promise.all([
    listPublicModels(modelListRequestSchema.parse({ locale })),
    listPublicPapers(
      paperListRequestSchema.parse({ locale, view: "trending", limit: 5 }),
    ),
    listPublicRepositories(
      repositoryListRequestSchema.parse({
        locale,
        view: "rising",
        limit: 5,
      }),
    ),
    listPublicProducts(productListRequestSchema.parse({ locale, limit: 4 })),
    listPublicPrompts(promptListRequestSchema.parse({ locale, limit: 4 })),
    listPublicSkills(skillListRequestSchema.parse({ locale })),
    listPublicGuides(guideListRequestSchema.parse({ locale })),
    listPublicRankings({ locale }),
    listPublicTopics(locale),
    listPublicEvents(locale, 5),
  ]);
  const papers = papersResult as SuccessfulResult<typeof papersResult>;
  const repositories = repositoriesResult as SuccessfulResult<
    typeof repositoriesResult
  >;
  const products = productsResult as SuccessfulResult<typeof productsResult>;
  const prompts = promptsResult as SuccessfulResult<typeof promptsResult>;

  const primaryDefinitions = rankings.definitions
    .filter(({ targetType }) => targetType === "model")
    .slice(0, 4);
  const trendingEventDefinition =
    view === "trending"
      ? rankings.definitions.find(
          ({ kind, targetType }) =>
            kind === "trending" && targetType === "event",
        )
      : undefined;
  const detailDefinitions = [
    ...primaryDefinitions,
    ...(trendingEventDefinition ? [trendingEventDefinition] : []),
  ].filter(
    (definition, index, definitions) =>
      definitions.findIndex(
        ({ publicId, methodologyVersion }) =>
          publicId === definition.publicId &&
          methodologyVersion === definition.methodologyVersion,
      ) === index,
  );
  const [rankingDetails, entityStats] = await Promise.all([
    Promise.all(
      detailDefinitions.map((definition) =>
        getPublicRanking(definition.publicId, {
          locale,
          methodologyVersion: definition.methodologyVersion,
        }),
      ),
    ).then((details) =>
      details.filter(
        (
          detail,
        ): detail is NonNullable<
          Awaited<ReturnType<typeof getPublicRanking>>
        > => detail !== null,
      ),
    ),
    listEntityStats([
      ...models.items.slice(0, 3).map(({ publicId }) => publicId),
      ...products.response.items.slice(0, 4).map(({ publicId }) => publicId),
    ]),
  ]);

  const streamTargetIds =
    view === "trending"
      ? rankingDetails
          .filter(
            ({ definition }) =>
              definition.kind === "trending" &&
              definition.targetType === "event",
          )
          .flatMap(({ observations }) =>
            observations
              .filter(({ status }) => status === "active")
              .map(({ target }) => target.publicId),
          )
      : view === "featured"
        ? rankings.featured
            .filter(({ target }) => target.type === "event")
            .slice(0, 5)
            .map(({ target }) => target.publicId)
        : [];
  const referencedEventIds = [
    ...rankings.featured
      .filter(({ target }) => target.type === "event")
      .slice(0, 2)
      .map(({ target }) => target.publicId),
    ...streamTargetIds,
  ].filter(
    (publicId, index, publicIds) => publicIds.indexOf(publicId) === index,
  );
  const referencedEvents = (
    await Promise.all(
      referencedEventIds.map((publicId) => getPublicEvent(publicId, locale)),
    )
  ).filter(
    (event): event is NonNullable<Awaited<ReturnType<typeof getPublicEvent>>> =>
      event !== null,
  );
  const eventByPublicId = new Map(
    [...latestEvents, ...referencedEvents].map((event) => [
      event.publicId,
      event,
    ]),
  );
  const streamEvents =
    view === "latest"
      ? latestEvents
      : streamTargetIds.flatMap((publicId) => {
          const event = eventByPublicId.get(publicId);
          return event ? [event] : [];
        });

  return {
    models,
    papers: papers.response,
    repositories: repositories.response,
    products: products.response,
    prompts: prompts.response,
    skills,
    guides,
    rankings,
    rankingDetails,
    topics,
    latestEvents,
    streamEvents,
    eventByPublicId,
    entityStats,
  };
};
