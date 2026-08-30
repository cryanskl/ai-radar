import { and, desc, eq, inArray } from "drizzle-orm";
import { database, databasePool } from "@/db/client";
import {
  entities,
  entityVersions,
  guideProfiles,
  guideStatusLocalizedContents,
  guideStatusObservations,
  guideVersionLocalizedContents,
  guideVersionProfiles,
  ownerOperationAudits,
  sourceItems,
} from "@/db/schema";
import { getPublicEntity } from "@/entities/service";
import { refreshEntitySearchIndex } from "@/search/indexer";
import {
  type GuideListRequest,
  type GuideProfileCreateRequest,
  type GuideStatusAppendRequest,
  publicGuideDetailSchema,
  publicGuideListItemSchema,
  publicGuideListSchema,
} from "./contracts";

const publicRights = [
  "open",
  "attribution_required",
  "source_license",
  "metadata_only",
  "link_only",
] as const;

export const createGuideProfile = async (input: GuideProfileCreateRequest) =>
  database.transaction(async (transaction) => {
    const [guide] = await transaction
      .select({
        id: entities.id,
        type: entities.type,
        lifecycleStatus: entities.lifecycleStatus,
        publicVisibility: entities.publicVisibility,
        lastVerifiedAt: entities.lastVerifiedAt,
      })
      .from(entities)
      .where(eq(entities.publicId, input.guidePublicId))
      .for("update");
    if (
      !guide ||
      guide.type !== "guide" ||
      guide.lifecycleStatus !== "active" ||
      !guide.publicVisibility
    ) {
      return { status: "invalid_reference" as const };
    }

    const requestedSourcePublicIds = [
      ...new Set([
        input.sourceItemPublicId,
        input.version.sourceItemPublicId,
        input.version.statusObservation.sourceItemPublicId,
      ]),
    ];
    const sources = await transaction
      .select({
        id: sourceItems.id,
        publicId: sourceItems.publicId,
        rightsStatus: sourceItems.rightsStatus,
      })
      .from(sourceItems)
      .where(
        and(
          inArray(sourceItems.publicId, requestedSourcePublicIds),
          eq(sourceItems.publicVisibility, true),
        ),
      );
    if (
      sources.length !== requestedSourcePublicIds.length ||
      sources.some(
        ({ rightsStatus }) => !publicRights.includes(rightsStatus as never),
      )
    ) {
      return { status: "invalid_reference" as const };
    }
    const sourceByPublicId = new Map(
      sources.map(({ id, publicId }) => [publicId, id]),
    );

    const [version] = await transaction
      .select({ id: entityVersions.id })
      .from(entityVersions)
      .where(
        and(
          eq(entityVersions.publicId, input.version.entityVersionPublicId),
          eq(entityVersions.entityId, guide.id),
          eq(entityVersions.publicVisibility, true),
        ),
      );
    if (!version) return { status: "invalid_reference" as const };

    const [profile] = await transaction
      .insert(guideProfiles)
      .values({
        entityId: guide.id,
        sourceItemId: sourceByPublicId.get(input.sourceItemPublicId)!,
        authorName: input.author.name,
        authorUrl: input.author.url,
        provenance: input.provenance,
        category: input.category,
        rightsStatus: input.rightsStatus,
        licenseName: input.license?.name ?? null,
        licenseUrl: input.license?.url ?? null,
        contentMode: input.contentMode,
        publicVisibility: true,
      })
      .returning({ id: guideProfiles.id });
    const [versionProfile] = await transaction
      .insert(guideVersionProfiles)
      .values({
        guideProfileId: profile.id,
        entityVersionId: version.id,
        sourceItemId: sourceByPublicId.get(input.version.sourceItemPublicId)!,
        publishedAt: new Date(input.version.publishedAt),
        reviewedAt: new Date(input.version.reviewedAt),
        steps: input.contentMode === "full_guide" ? input.version.steps : [],
        publicVisibility: true,
      })
      .returning({ id: guideVersionProfiles.id });
    const localizedContents =
      input.contentMode === "full_guide"
        ? input.version.localizations.map((localization) => ({
            guideVersionProfileId: versionProfile.id,
            locale: localization.locale,
            prerequisites: localization.prerequisites,
            stepInstructions: localization.steps,
            expectedOutcome: localization.expectedOutcome,
            limitations: localization.limitations,
            authorship: localization.authorship,
            reviewStatus: localization.reviewStatus,
            publicVisibility: true,
          }))
        : input.version.localizations.map((localization) => ({
            guideVersionProfileId: versionProfile.id,
            locale: localization.locale,
            prerequisites: [],
            stepInstructions: [],
            expectedOutcome: null,
            limitations: [],
            authorship: localization.authorship,
            reviewStatus: localization.reviewStatus,
            publicVisibility: true,
          }));
    await transaction
      .insert(guideVersionLocalizedContents)
      .values(localizedContents);
    const [observation] = await transaction
      .insert(guideStatusObservations)
      .values({
        publicId: input.version.statusObservation.publicId,
        guideVersionProfileId: versionProfile.id,
        sourceItemId: sourceByPublicId.get(
          input.version.statusObservation.sourceItemPublicId,
        )!,
        status: input.version.statusObservation.status,
        observedAt: new Date(input.version.statusObservation.observedAt),
        publicVisibility: true,
      })
      .returning({ id: guideStatusObservations.id });
    if (input.version.statusObservation.localizations.length > 0) {
      await transaction.insert(guideStatusLocalizedContents).values(
        input.version.statusObservation.localizations.map((localization) => ({
          guideStatusObservationId: observation.id,
          locale: localization.locale,
          staleReason: localization.staleReason,
          authorship: localization.authorship,
          reviewStatus: localization.reviewStatus,
          publicVisibility: true,
        })),
      );
    }

    const lastVerifiedAt = new Date(
      Math.max(
        guide.lastVerifiedAt.getTime(),
        Date.parse(input.version.reviewedAt),
        Date.parse(input.version.statusObservation.observedAt),
      ),
    );
    await transaction
      .update(entities)
      .set({ lastVerifiedAt })
      .where(eq(entities.id, guide.id));
    await refreshEntitySearchIndex(transaction, guide.id);
    await transaction.insert(ownerOperationAudits).values({
      actorRole: "owner",
      action: "create_guide_profile",
      targetType: "entity",
      targetPublicId: input.guidePublicId,
      publicVisibility: true,
    });
    return {
      status: "created" as const,
      guidePublicId: input.guidePublicId,
      versionPublicId: input.version.entityVersionPublicId,
      publicVisibility: true as const,
    };
  });

export const appendGuideStatusObservation = async (
  input: GuideStatusAppendRequest,
) =>
  database.transaction(async (transaction) => {
    const [guide] = await transaction
      .select({ id: entities.id, lastVerifiedAt: entities.lastVerifiedAt })
      .from(entities)
      .where(eq(entities.publicId, input.guidePublicId))
      .for("update");
    if (!guide) return { status: "invalid_reference" as const };
    const [versionProfile] = await transaction
      .select({ id: guideVersionProfiles.id })
      .from(guideVersionProfiles)
      .innerJoin(
        guideProfiles,
        eq(guideProfiles.id, guideVersionProfiles.guideProfileId),
      )
      .innerJoin(
        entityVersions,
        eq(entityVersions.id, guideVersionProfiles.entityVersionId),
      )
      .where(
        and(
          eq(guideProfiles.entityId, guide.id),
          eq(guideProfiles.publicVisibility, true),
          eq(guideVersionProfiles.publicVisibility, true),
          eq(entityVersions.publicVisibility, true),
        ),
      )
      .orderBy(desc(entityVersions.releasedAt), desc(entityVersions.publicId))
      .limit(1);
    const [source] = await transaction
      .select({ id: sourceItems.id, rightsStatus: sourceItems.rightsStatus })
      .from(sourceItems)
      .where(
        and(
          eq(sourceItems.publicId, input.observation.sourceItemPublicId),
          eq(sourceItems.publicVisibility, true),
        ),
      );
    if (
      !versionProfile ||
      !source ||
      !publicRights.includes(source.rightsStatus as never)
    ) {
      return { status: "invalid_reference" as const };
    }
    const [latestObservation] = await transaction
      .select({ observedAt: guideStatusObservations.observedAt })
      .from(guideStatusObservations)
      .where(
        and(
          eq(guideStatusObservations.guideVersionProfileId, versionProfile.id),
          eq(guideStatusObservations.publicVisibility, true),
        ),
      )
      .orderBy(
        desc(guideStatusObservations.observedAt),
        desc(guideStatusObservations.publicId),
      )
      .limit(1);
    if (
      latestObservation &&
      Date.parse(input.observation.observedAt) <=
        latestObservation.observedAt.getTime()
    ) {
      return { status: "invalid_reference" as const };
    }
    const [observation] = await transaction
      .insert(guideStatusObservations)
      .values({
        publicId: input.observation.publicId,
        guideVersionProfileId: versionProfile.id,
        sourceItemId: source.id,
        status: input.observation.status,
        observedAt: new Date(input.observation.observedAt),
        publicVisibility: true,
      })
      .returning({ id: guideStatusObservations.id });
    if (input.observation.localizations.length > 0) {
      await transaction.insert(guideStatusLocalizedContents).values(
        input.observation.localizations.map((localization) => ({
          guideStatusObservationId: observation.id,
          locale: localization.locale,
          staleReason: localization.staleReason,
          authorship: localization.authorship,
          reviewStatus: localization.reviewStatus,
          publicVisibility: true,
        })),
      );
    }
    await transaction
      .update(entities)
      .set({
        lastVerifiedAt: new Date(
          Math.max(
            guide.lastVerifiedAt.getTime(),
            Date.parse(input.observation.observedAt),
          ),
        ),
      })
      .where(eq(entities.id, guide.id));
    await refreshEntitySearchIndex(transaction, guide.id);
    await transaction.insert(ownerOperationAudits).values({
      actorRole: "owner",
      action: "append_guide_status_observation",
      targetType: "entity",
      targetPublicId: input.guidePublicId,
      publicVisibility: true,
    });
    return {
      status: input.observation.status,
      guidePublicId: input.guidePublicId,
      observationPublicId: input.observation.publicId,
    };
  });

type GuideRow = {
  entity_id: string;
  public_id: string;
  name: string;
  summary: string;
  official_url: string;
  last_verified_at: Date;
  author_name: string;
  author_url: string | null;
  provenance: GuideProfileCreateRequest["provenance"];
  category: string;
  rights_status: GuideProfileCreateRequest["rightsStatus"];
  license_name: string | null;
  license_url: string | null;
  content_mode: GuideProfileCreateRequest["contentMode"];
  version_label: string;
  published_at: Date;
  reviewed_at: Date;
  steps: Array<{
    id: string;
    kind: "settings" | "price" | "interface" | "durable";
    verifiedAt: string | null;
  }>;
  prerequisites: string[];
  step_instructions: Array<{ id: string; instruction: string }>;
  expected_outcome: string | null;
  limitations: string[];
  localization_locale: "en" | "zh";
  localization_authorship:
    "human_authored" | "ai_translated" | "official_translation";
  localization_updated_at: Date;
  source_item_public_id: string;
  source_title: string;
  source_url: string;
  source_attribution: string;
  version_source_item_public_id: string;
  version_source_title: string;
  version_source_url: string;
  version_source_attribution: string;
  status_public_id: string;
  guide_status: "current" | "stale";
  status_observed_at: Date;
  stale_reason: string | null;
  status_source_item_public_id: string;
  status_source_title: string;
  status_source_url: string;
  status_source_attribution: string;
};

const guideSelection = `
  guide.id as entity_id, guide.public_id, entity_localization.name,
  entity_localization.summary, guide.official_url, guide.last_verified_at,
  profile.author_name, profile.author_url, profile.provenance::text,
  profile.category, profile.rights_status::text, profile.license_name,
  profile.license_url, profile.content_mode::text,
  version.version_label, version_profile.published_at,
  version_profile.reviewed_at, version_profile.steps,
  version_localization.prerequisites,
  version_localization.step_instructions,
  version_localization.expected_outcome, version_localization.limitations,
  version_localization.locale::text as localization_locale,
  version_localization.authorship::text as localization_authorship,
  version_localization.updated_at as localization_updated_at,
  profile_source.public_id as source_item_public_id,
  profile_source.original_title as source_title,
  profile_source.original_url as source_url,
  profile_source.attribution as source_attribution,
  version_source.public_id as version_source_item_public_id,
  version_source.original_title as version_source_title,
  version_source.original_url as version_source_url,
  version_source.attribution as version_source_attribution,
  current_status.public_id as status_public_id,
  current_status.status::text as guide_status,
  current_status.observed_at as status_observed_at,
  current_status.stale_reason,
  current_status.source_public_id as status_source_item_public_id,
  current_status.source_title as status_source_title,
  current_status.source_url as status_source_url,
  current_status.source_attribution as status_source_attribution
  from entities guide
  join guide_profiles profile on profile.entity_id = guide.id
    and profile.public_visibility = true
    and profile.rights_status in (
      'open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'
    )
  join source_items profile_source on profile_source.id = profile.source_item_id
    and profile_source.public_visibility = true
    and profile_source.rights_status in (
      'open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'
    )
  join guide_version_profiles version_profile
    on version_profile.guide_profile_id = profile.id
    and version_profile.public_visibility = true
  join entity_versions version on version.id = version_profile.entity_version_id
    and version.public_visibility = true
  join source_items version_source on version_source.id = version_profile.source_item_id
    and version_source.public_visibility = true
    and version_source.rights_status in (
      'open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'
    )
  join guide_version_localized_contents version_localization
    on version_localization.guide_version_profile_id = version_profile.id
    and version_localization.locale = $1::content_locale
    and version_localization.review_status = 'reviewed'
    and version_localization.public_visibility = true
  join entity_localized_contents entity_localization
    on entity_localization.entity_id = guide.id
    and entity_localization.locale = $1::content_locale
    and entity_localization.review_status = 'reviewed'
    and entity_localization.public_visibility = true
  join lateral (
    select latest.public_id, latest.status,
      latest.observed_at, status_localization.stale_reason,
      status_source.public_id as source_public_id,
      status_source.original_title as source_title,
      status_source.original_url as source_url,
      status_source.attribution as source_attribution
    from (
      select observation.id, observation.public_id, observation.status,
        observation.observed_at, observation.source_item_id
      from guide_status_observations observation
      where observation.guide_version_profile_id = version_profile.id
        and observation.public_visibility = true
      order by observation.observed_at desc, observation.public_id desc
      limit 1
    ) latest
    join source_items status_source on status_source.id = latest.source_item_id
      and status_source.public_visibility = true
      and status_source.rights_status in (
        'open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'
      )
    left join guide_status_localized_contents status_localization
      on status_localization.guide_status_observation_id = latest.id
      and status_localization.locale = $1::content_locale
      and status_localization.review_status = 'reviewed'
      and status_localization.public_visibility = true
    where latest.status <> 'stale' or status_localization.id is not null
  ) current_status on true`;

const sourceFrom = (row: GuideRow, prefix: "" | "version_" | "status_") => ({
  sourceItemPublicId: row[`${prefix}source_item_public_id`],
  title: row[`${prefix}source_title`],
  url: row[`${prefix}source_url`],
  attribution: row[`${prefix}source_attribution`],
});

const statusFrom = (row: GuideRow) => ({
  publicId: row.status_public_id,
  status: row.guide_status,
  observedAt: row.status_observed_at.toISOString(),
  staleReason: row.stale_reason,
  source: sourceFrom(row, "status_"),
});

const listItemFrom = (row: GuideRow) =>
  publicGuideListItemSchema.parse({
    publicId: row.public_id,
    name: row.name,
    summary: row.summary,
    author: { name: row.author_name, url: row.author_url },
    provenance: row.provenance,
    category: row.category,
    rightsStatus: row.rights_status,
    contentMode: row.content_mode,
    version: row.version_label,
    reviewedAt: row.reviewed_at.toISOString(),
    lastVerifiedAt: row.last_verified_at.toISOString(),
    currentStatus: statusFrom(row),
  });

export const listPublicGuides = async (input: GuideListRequest) => {
  const result = await databasePool.query<GuideRow>(
    `select ${guideSelection}
     where guide.type = 'guide' and guide.lifecycle_status = 'active'
       and guide.public_visibility = true
       and ($2::text is null or profile.category = $2)
       and ($3::text is null or profile.provenance::text = $3)
       and current_status.status::text = coalesce($4, 'current')
       and ($5::text is null or profile.rights_status::text = $5)
       and exists (
         select 1 from relations relation
         join relation_evidence evidence on evidence.relation_id = relation.id
         join source_items relation_source
           on relation_source.id = evidence.source_item_id
           and relation_source.public_visibility = true
           and relation_source.rights_status in (
             'open', 'attribution_required', 'source_license',
             'metadata_only', 'link_only'
           )
         left join entities target on target.id = relation.object_entity_id
         left join events subject_event on subject_event.id = relation.subject_event_id
         where relation.review_status = 'reviewed'
           and relation.public_visibility = true
           and (
             (relation.subject_entity_id = guide.id
               and relation.predicate = 'EXPLAINS'
               and target.type in ('model', 'product', 'repository', 'prompt', 'skill')
               and target.lifecycle_status = 'active'
               and target.public_visibility = true)
             or
             (relation.object_entity_id = guide.id
               and relation.subject_event_id is not null
               and subject_event.publication_state in ('published', 'corrected')
               and subject_event.public_visibility = true)
           )
       )
     order by guide.last_verified_at desc, guide.public_id`,
    [
      input.locale,
      input.category ?? null,
      input.provenance ?? null,
      input.status ?? null,
      input.rightsStatus ?? null,
    ],
  );
  const items = result.rows.map(listItemFrom);
  return publicGuideListSchema.parse({
    locale: input.locale,
    items,
    dataCutoff: items[0]?.lastVerifiedAt ?? null,
  });
};

export const getPublicGuide = async (publicId: string, locale: "en" | "zh") => {
  const result = await databasePool.query<GuideRow>(
    `select ${guideSelection}
     where guide.public_id = $2 and guide.type = 'guide'
       and guide.lifecycle_status = 'active' and guide.public_visibility = true
     order by version_profile.published_at desc
     limit 1`,
    [locale, publicId],
  );
  const row = result.rows[0];
  if (!row) return null;
  const generic = await getPublicEntity(publicId, locale);
  if (!generic || generic.type !== "guide") return null;
  const outgoingTargetPublicIds = generic.outgoingRelations.map(
    (relation) => relation.object.publicId,
  );
  const targetTypes =
    outgoingTargetPublicIds.length === 0
      ? []
      : await database
          .select({ publicId: entities.publicId, type: entities.type })
          .from(entities)
          .where(
            and(
              inArray(entities.publicId, outgoingTargetPublicIds),
              eq(entities.lifecycleStatus, "active"),
              eq(entities.publicVisibility, true),
            ),
          );
  const targetTypeByPublicId = new Map(
    targetTypes.map(({ publicId: targetPublicId, type }) => [
      targetPublicId,
      type,
    ]),
  );
  const relatedRecords = [
    ...generic.outgoingRelations
      .filter(
        (relation) =>
          relation.predicate === "EXPLAINS" &&
          ["model", "product", "repository", "prompt", "skill"].includes(
            targetTypeByPublicId.get(relation.object.publicId) ?? "",
          ),
      )
      .map((relation) => ({
        publicId: relation.publicId,
        predicate: relation.predicate,
        direction: "outgoing" as const,
        target: {
          publicId: relation.object.publicId,
          type: targetTypeByPublicId.get(relation.object.publicId)!,
          name: relation.object.name,
        },
        evidence: relation.evidence.map(
          ({ sourceItemPublicId, originalTitle, originalUrl }) => ({
            sourceItemPublicId,
            title: originalTitle,
            url: originalUrl,
          }),
        ),
      })),
    ...generic.backlinks
      .filter((relation) => relation.subject.type === "event")
      .map((relation) => ({
        publicId: relation.publicId,
        predicate: relation.predicate,
        direction: "incoming" as const,
        target: {
          publicId: relation.subject.publicId,
          type: "event" as const,
          name: relation.subject.name,
        },
        evidence: relation.evidence.map(
          ({ sourceItemPublicId, originalTitle, originalUrl }) => ({
            sourceItemPublicId,
            title: originalTitle,
            url: originalUrl,
          }),
        ),
      })),
  ];
  if (relatedRecords.length === 0) return null;
  const instructionById = new Map(
    row.step_instructions.map(({ id, instruction }) => [id, instruction]),
  );
  const detail = {
    ...listItemFrom(row),
    officialUrl: row.official_url,
    publishedAt: row.published_at.toISOString(),
    license:
      row.license_name && row.license_url
        ? { name: row.license_name, url: row.license_url }
        : null,
    localization: {
      locale: row.localization_locale,
      authorship: row.localization_authorship,
      reviewStatus: "reviewed",
      lastLocalizedAt: row.localization_updated_at.toISOString(),
    },
    source: sourceFrom(row, ""),
    versionSource: sourceFrom(row, "version_"),
    relatedRecords,
  };
  return publicGuideDetailSchema.parse(
    row.content_mode === "full_guide"
      ? {
          ...detail,
          contentMode: "full_guide",
          prerequisites: row.prerequisites,
          steps: row.steps.map((step) => ({
            ...step,
            instruction: instructionById.get(step.id)!,
          })),
          expectedOutcome: row.expected_outcome,
          limitations: row.limitations,
        }
      : { ...detail, contentMode: "summary_link", license: null },
  );
};
