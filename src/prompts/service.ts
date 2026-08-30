import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { PoolClient } from "pg";
import { database, databasePool } from "@/db/client";
import {
  entities,
  entityVersions,
  ownerOperationAudits,
  promptCompatibilities,
  promptLocalizedContents,
  promptProfiles,
  promptValidationLocalizedContents,
  promptValidationObservations,
  relationEvidence,
  relations,
  sourceItems,
} from "@/db/schema";
import { getPublicEntity } from "@/entities/service";
import { refreshEntitySearchIndex } from "@/search/indexer";
import {
  type PromptListRequest,
  type PromptProfileCreateRequest,
  type PromptValidationAppendRequest,
  type PublicPromptListItem,
  promptListCursorSchema,
  publicPromptDetailSchema,
  publicPromptListItemSchema,
  publicPromptListSchema,
} from "./contracts";

const publicRights = [
  "open",
  "attribution_required",
  "source_license",
  "metadata_only",
  "link_only",
] as const;

export const createPromptProfile = async (input: PromptProfileCreateRequest) =>
  database.transaction(async (transaction) => {
    const [prompt] = await transaction
      .select({
        id: entities.id,
        type: entities.type,
        lifecycleStatus: entities.lifecycleStatus,
        publicVisibility: entities.publicVisibility,
        lastVerifiedAt: entities.lastVerifiedAt,
      })
      .from(entities)
      .where(eq(entities.publicId, input.promptPublicId))
      .for("update");
    if (
      !prompt ||
      prompt.type !== "prompt" ||
      prompt.lifecycleStatus !== "active" ||
      !prompt.publicVisibility
    ) {
      return { status: "invalid_reference" as const };
    }

    const sourcePublicIds = [
      ...new Set([
        input.sourceItemPublicId,
        ...input.compatibilities.map(
          ({ validation }) => validation.sourceItemPublicId,
        ),
      ]),
    ];
    const evidence = await transaction
      .select({
        id: sourceItems.id,
        publicId: sourceItems.publicId,
        rightsStatus: sourceItems.rightsStatus,
      })
      .from(sourceItems)
      .where(
        and(
          inArray(sourceItems.publicId, sourcePublicIds),
          eq(sourceItems.publicVisibility, true),
        ),
      );
    if (
      evidence.length !== sourcePublicIds.length ||
      evidence.some(
        ({ rightsStatus }) => !publicRights.includes(rightsStatus as never),
      )
    ) {
      return { status: "invalid_reference" as const };
    }
    const sourceByPublicId = new Map(
      evidence.map(({ id, publicId }) => [publicId, id]),
    );
    const profileSource = evidence.find(
      ({ publicId }) => publicId === input.sourceItemPublicId,
    )!;
    if (
      input.fullText !== null &&
      !["open", "attribution_required", "source_license"].includes(
        profileSource.rightsStatus,
      )
    ) {
      return { status: "invalid_reference" as const };
    }

    const targetPublicIds = [
      ...new Set(
        input.compatibilities.map(
          ({ targetEntityPublicId }) => targetEntityPublicId,
        ),
      ),
    ];
    const targets = await transaction
      .select({
        id: entities.id,
        publicId: entities.publicId,
        type: entities.type,
        publicVisibility: entities.publicVisibility,
        lifecycleStatus: entities.lifecycleStatus,
      })
      .from(entities)
      .where(inArray(entities.publicId, targetPublicIds));
    if (
      targets.length !== targetPublicIds.length ||
      targets.some(
        ({ lifecycleStatus, publicVisibility, type }) =>
          !publicVisibility ||
          lifecycleStatus !== "active" ||
          !["model", "product"].includes(type),
      )
    ) {
      return { status: "invalid_reference" as const };
    }
    const targetByPublicId = new Map(
      targets.map(({ id, publicId, type }) => [publicId, { id, type }]),
    );

    const requestedVersionPublicIds = [
      ...new Set(
        input.compatibilities.flatMap(({ targetVersionPublicId }) =>
          targetVersionPublicId ? [targetVersionPublicId] : [],
        ),
      ),
    ];
    const versions =
      requestedVersionPublicIds.length === 0
        ? []
        : await transaction
            .select({
              id: entityVersions.id,
              publicId: entityVersions.publicId,
              entityId: entityVersions.entityId,
            })
            .from(entityVersions)
            .where(inArray(entityVersions.publicId, requestedVersionPublicIds));
    const versionByPublicId = new Map(
      versions.map(({ entityId, id, publicId }) => [
        publicId,
        { id, entityId },
      ]),
    );
    if (
      requestedVersionPublicIds.length !== versions.length ||
      input.compatibilities.some(
        ({ targetEntityPublicId, targetVersionPublicId }) => {
          if (!targetVersionPublicId) return false;
          return (
            versionByPublicId.get(targetVersionPublicId)?.entityId !==
            targetByPublicId.get(targetEntityPublicId)?.id
          );
        },
      )
    ) {
      return { status: "invalid_reference" as const };
    }

    const evidencedTargets = await transaction
      .select({ targetEntityId: relations.objectEntityId })
      .from(relations)
      .innerJoin(
        relationEvidence,
        eq(relationEvidence.relationId, relations.id),
      )
      .innerJoin(sourceItems, eq(sourceItems.id, relationEvidence.sourceItemId))
      .where(
        and(
          eq(relations.subjectEntityId, prompt.id),
          eq(relations.predicate, "WORKS_WITH"),
          eq(relations.reviewStatus, "reviewed"),
          eq(relations.publicVisibility, true),
          eq(sourceItems.publicVisibility, true),
        ),
      );
    const evidencedTargetIds = new Set(
      evidencedTargets.map(({ targetEntityId }) => targetEntityId),
    );
    if (
      input.compatibilities.some(
        ({ targetEntityPublicId }) =>
          !evidencedTargetIds.has(
            targetByPublicId.get(targetEntityPublicId)!.id,
          ),
      )
    ) {
      return { status: "invalid_reference" as const };
    }

    const [profile] = await transaction
      .insert(promptProfiles)
      .values({
        entityId: prompt.id,
        sourceItemId: sourceByPublicId.get(input.sourceItemPublicId)!,
        authorName: input.author.name,
        authorUrl: input.author.url,
        provenance: input.provenance,
        task: input.task,
        inputTypes: input.inputTypes,
        rightsStatus: input.rightsStatus,
        licenseName: input.license?.name ?? null,
        licenseUrl: input.license?.url ?? null,
        fullText: input.fullText,
        publicVisibility: true,
      })
      .returning({ id: promptProfiles.id });
    await transaction.insert(promptLocalizedContents).values(
      input.localizations.map((localization) => ({
        promptProfileId: profile.id,
        locale: localization.locale,
        purpose: localization.purpose,
        variables: localization.variables,
        inputExample: localization.inputExample,
        expectedOutputExample: localization.expectedOutputExample,
        knownLimitations: localization.knownLimitations,
        authorship: localization.authorship,
        reviewStatus: localization.reviewStatus,
        publicVisibility: true,
      })),
    );
    for (const compatibility of input.compatibilities) {
      const target = targetByPublicId.get(compatibility.targetEntityPublicId)!;
      const [insertedCompatibility] = await transaction
        .insert(promptCompatibilities)
        .values({
          publicId: compatibility.publicId,
          promptProfileId: profile.id,
          targetEntityId: target.id,
          targetVersionId: compatibility.targetVersionPublicId
            ? versionByPublicId.get(compatibility.targetVersionPublicId)!.id
            : null,
          verifiedVersion: compatibility.verifiedVersion,
          publicVisibility: true,
        })
        .returning({ id: promptCompatibilities.id });
      const [observation] = await transaction
        .insert(promptValidationObservations)
        .values({
          publicId: compatibility.validation.publicId,
          compatibilityId: insertedCompatibility.id,
          sourceItemId: sourceByPublicId.get(
            compatibility.validation.sourceItemPublicId,
          )!,
          status: compatibility.validation.status,
          validatedAt: new Date(compatibility.validation.validatedAt),
          observedAt: new Date(compatibility.validation.observedAt),
          publicVisibility: true,
        })
        .returning({ id: promptValidationObservations.id });
      if (compatibility.validation.localizations.length > 0) {
        await transaction.insert(promptValidationLocalizedContents).values(
          compatibility.validation.localizations.map((localization) => ({
            validationObservationId: observation.id,
            locale: localization.locale,
            staleReason: localization.staleReason,
            authorship: localization.authorship,
            reviewStatus: localization.reviewStatus,
            publicVisibility: true,
          })),
        );
      }
    }
    const lastVerifiedAt = new Date(
      Math.max(
        prompt.lastVerifiedAt.getTime(),
        ...input.compatibilities.map(({ validation }) =>
          Date.parse(validation.observedAt),
        ),
      ),
    );
    await transaction
      .update(entities)
      .set({ lastVerifiedAt })
      .where(eq(entities.id, prompt.id));
    await refreshEntitySearchIndex(transaction, prompt.id);
    await transaction.insert(ownerOperationAudits).values({
      actorRole: "owner",
      action: "create_prompt_profile",
      targetType: "entity",
      targetPublicId: input.promptPublicId,
      publicVisibility: true,
    });
    return {
      status: "created" as const,
      promptPublicId: input.promptPublicId,
      publicVisibility: true,
      compatibilityPublicIds: input.compatibilities.map(
        ({ publicId }) => publicId,
      ),
    };
  });

export const appendPromptValidationObservation = async (
  input: PromptValidationAppendRequest,
) =>
  database.transaction(async (transaction) => {
    const [compatibility] = await transaction
      .select({
        id: promptCompatibilities.id,
        promptEntityId: entities.id,
        promptPublicId: entities.publicId,
        lastVerifiedAt: entities.lastVerifiedAt,
      })
      .from(promptCompatibilities)
      .innerJoin(
        promptProfiles,
        eq(promptProfiles.id, promptCompatibilities.promptProfileId),
      )
      .innerJoin(entities, eq(entities.id, promptProfiles.entityId))
      .where(eq(promptCompatibilities.publicId, input.compatibilityPublicId))
      .for("update");
    const [source] = await transaction
      .select({
        id: sourceItems.id,
        rightsStatus: sourceItems.rightsStatus,
        publicVisibility: sourceItems.publicVisibility,
      })
      .from(sourceItems)
      .where(eq(sourceItems.publicId, input.observation.sourceItemPublicId));
    if (
      !compatibility ||
      !source?.publicVisibility ||
      !publicRights.includes(source.rightsStatus as never)
    ) {
      return { status: "invalid_reference" as const };
    }
    const [observation] = await transaction
      .insert(promptValidationObservations)
      .values({
        publicId: input.observation.publicId,
        compatibilityId: compatibility.id,
        sourceItemId: source.id,
        status: input.observation.status,
        validatedAt: new Date(input.observation.validatedAt),
        observedAt: new Date(input.observation.observedAt),
        publicVisibility: true,
      })
      .returning({ id: promptValidationObservations.id });
    if (input.observation.localizations.length > 0) {
      await transaction.insert(promptValidationLocalizedContents).values(
        input.observation.localizations.map((localization) => ({
          validationObservationId: observation.id,
          locale: localization.locale,
          staleReason: localization.staleReason,
          authorship: localization.authorship,
          reviewStatus: localization.reviewStatus,
          publicVisibility: true,
        })),
      );
    }
    const observedAt = new Date(input.observation.observedAt);
    await transaction
      .update(entities)
      .set({
        lastVerifiedAt:
          observedAt > compatibility.lastVerifiedAt
            ? observedAt
            : compatibility.lastVerifiedAt,
      })
      .where(eq(entities.id, compatibility.promptEntityId));
    await refreshEntitySearchIndex(transaction, compatibility.promptEntityId);
    await transaction.insert(ownerOperationAudits).values({
      actorRole: "owner",
      action: "append_prompt_validation_observation",
      targetType: "entity",
      targetPublicId: compatibility.promptPublicId,
      publicVisibility: true,
    });
    return {
      status: "created" as const,
      compatibilityPublicId: input.compatibilityPublicId,
      observationPublicId: input.observation.publicId,
      validationStatus: input.observation.status,
    };
  });

type CompatibilityRow = {
  public_id: string;
  target_public_id: string;
  target_type: "model" | "product";
  target_name: string;
  version_public_id: string | null;
  verified_version: string;
  validation_public_id: string;
  validation_status: "current" | "stale" | "unvalidated";
  validated_at: Date;
  observed_at: Date;
  stale_reason: string | null;
  validation_source_public_id: string;
};

const compatibilitySql = `
  select compatibility.public_id, target.public_id as target_public_id,
    target.type::text as target_type, target_localization.name as target_name,
    version.public_id as version_public_id,
    compatibility.verified_version,
    current_validation.public_id as validation_public_id,
    current_validation.status::text as validation_status,
    current_validation.validated_at, current_validation.observed_at,
    current_validation.stale_reason,
    current_validation.source_public_id as validation_source_public_id
  from prompt_compatibilities compatibility
  join entities target on target.id = compatibility.target_entity_id
    and target.type in ('model', 'product')
    and target.lifecycle_status = 'active' and target.public_visibility = true
  join entity_localized_contents target_localization
    on target_localization.entity_id = target.id
    and target_localization.locale = $2::content_locale
    and target_localization.review_status = 'reviewed'
    and target_localization.public_visibility = true
  left join entity_versions version on version.id = compatibility.target_version_id
    and version.public_visibility = true
  join lateral (
    select latest.public_id, latest.status, latest.validated_at,
      latest.observed_at, validation_localization.stale_reason,
      source_item.public_id as source_public_id
    from lateral (
      select observation.id, observation.public_id, observation.source_item_id,
        observation.status, observation.validated_at, observation.observed_at
      from prompt_validation_observations observation
      where observation.compatibility_id = compatibility.id
        and observation.public_visibility = true
      order by observation.observed_at desc, observation.public_id desc
      limit 1
    ) latest
    join source_items source_item on source_item.id = latest.source_item_id
      and source_item.public_visibility = true
      and source_item.rights_status in (
        'open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'
      )
    left join prompt_validation_localized_contents validation_localization
      on validation_localization.validation_observation_id = latest.id
      and validation_localization.locale = $2::content_locale
      and validation_localization.review_status = 'reviewed'
      and validation_localization.public_visibility = true
    where latest.status <> 'stale' or validation_localization.id is not null
  ) current_validation on true
  where compatibility.prompt_profile_id = $1
    and compatibility.public_visibility = true
    and exists (
      select 1 from relations relation
      join relation_evidence evidence on evidence.relation_id = relation.id
      join source_items relation_source on relation_source.id = evidence.source_item_id
        and relation_source.public_visibility = true
        and relation_source.rights_status in (
          'open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'
        )
      where relation.subject_entity_id = $3
        and relation.object_entity_id = target.id
        and relation.predicate = 'WORKS_WITH'
        and relation.review_status = 'reviewed'
        and relation.public_visibility = true
    )
  order by target.type, target.public_id, compatibility.public_id`;

const mapCompatibility = (row: CompatibilityRow) => ({
  publicId: row.public_id,
  target: {
    publicId: row.target_public_id,
    type: row.target_type,
    name: row.target_name,
    versionPublicId: row.version_public_id,
    version: row.verified_version,
  },
  currentValidation: {
    publicId: row.validation_public_id,
    status: row.validation_status,
    validatedAt: row.validated_at.toISOString(),
    observedAt: row.observed_at.toISOString(),
    staleReason: row.stale_reason,
    sourceItemPublicId: row.validation_source_public_id,
  },
});

export const getPublicPrompt = async (
  publicId: string,
  locale: "en" | "zh",
) => {
  const result = await databasePool.query<{
    id: string;
    profile_id: string;
    public_id: string;
    name: string;
    summary: string;
    official_url: string;
    author_name: string;
    author_url: string | null;
    provenance: PromptProfileCreateRequest["provenance"];
    task: string;
    input_types: string[];
    rights_status: PromptProfileCreateRequest["rightsStatus"];
    license_name: string | null;
    license_url: string | null;
    full_text: string | null;
    purpose: string;
    variables: unknown;
    input_example: string;
    expected_output_example: string;
    known_limitations: string[];
    localization_authorship:
      "human_authored" | "ai_translated" | "official_translation";
    localization_updated_at: Date;
    source_item_public_id: string;
    source_title: string;
    source_url: string;
    source_attribution: string;
    last_verified_at: Date;
  }>(
    `select prompt.id, profile.id as profile_id, prompt.public_id,
       localization.name, localization.summary, prompt.official_url,
       profile.author_name, profile.author_url, profile.provenance::text,
       profile.task, profile.input_types, profile.rights_status::text,
       profile.license_name, profile.license_url, profile.full_text,
       prompt_localization.purpose, prompt_localization.variables,
       prompt_localization.input_example,
       prompt_localization.expected_output_example,
       prompt_localization.known_limitations,
       prompt_localization.authorship::text as localization_authorship,
       prompt_localization.updated_at as localization_updated_at,
       source_item.public_id as source_item_public_id,
       source_item.original_title as source_title,
       source_item.original_url as source_url,
       source_item.attribution as source_attribution,
       prompt.last_verified_at
     from entities prompt
     join prompt_profiles profile on profile.entity_id = prompt.id
       and profile.public_visibility = true
       and profile.rights_status in (
         'open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'
       )
     join source_items source_item on source_item.id = profile.source_item_id
       and source_item.public_visibility = true
       and source_item.rights_status in (
         'open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'
       )
     join entity_localized_contents localization
       on localization.entity_id = prompt.id
       and localization.locale = $2::content_locale
       and localization.review_status = 'reviewed'
       and localization.public_visibility = true
     join prompt_localized_contents prompt_localization
       on prompt_localization.prompt_profile_id = profile.id
       and prompt_localization.locale = $2::content_locale
       and prompt_localization.review_status = 'reviewed'
       and prompt_localization.public_visibility = true
     where prompt.public_id = $1 and prompt.type = 'prompt'
       and prompt.lifecycle_status = 'active' and prompt.public_visibility = true`,
    [publicId, locale],
  );
  const prompt = result.rows[0];
  if (!prompt) return null;
  const compatibilityResult = await databasePool.query<CompatibilityRow>(
    compatibilitySql,
    [prompt.profile_id, locale, prompt.id],
  );
  if (compatibilityResult.rows.length === 0) return null;
  const generic = await getPublicEntity(publicId, locale);
  if (!generic || generic.type !== "prompt") return null;
  const targetIds = new Set(
    compatibilityResult.rows.map(({ target_public_id }) => target_public_id),
  );
  const targetTypeByPublicId = new Map(
    compatibilityResult.rows.map(({ target_public_id, target_type }) => [
      target_public_id,
      target_type,
    ]),
  );
  const relations = generic.outgoingRelations
    .filter(
      (relation) =>
        relation.predicate === "WORKS_WITH" &&
        targetIds.has(relation.object.publicId),
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
      evidenceSourceItemPublicIds: relation.evidence.map(
        ({ sourceItemPublicId }) => sourceItemPublicId,
      ),
    }));
  if (relations.length === 0) return null;
  const compatibilities = compatibilityResult.rows.map(mapCompatibility);
  const rightsStatus = prompt.rights_status as
    | "open"
    | "attribution_required"
    | "source_license"
    | "metadata_only"
    | "link_only";
  const contentMode = prompt.full_text
    ? "full_text"
    : rightsStatus === "link_only"
      ? "link_only"
      : "metadata_only";
  return publicPromptDetailSchema.parse({
    publicId: prompt.public_id,
    name: prompt.name,
    summary: prompt.summary,
    officialUrl: prompt.official_url,
    task: prompt.task,
    inputTypes: prompt.input_types,
    author: { name: prompt.author_name, url: prompt.author_url },
    provenance: prompt.provenance,
    rightsStatus,
    contentMode,
    lastVerifiedAt: prompt.last_verified_at.toISOString(),
    license:
      prompt.license_name && prompt.license_url
        ? { name: prompt.license_name, url: prompt.license_url }
        : null,
    fullText: prompt.full_text,
    purpose: prompt.purpose,
    variables: prompt.variables,
    inputExample: prompt.input_example,
    expectedOutputExample: prompt.expected_output_example,
    knownLimitations: prompt.known_limitations,
    localization: {
      locale,
      authorship: prompt.localization_authorship,
      reviewStatus: "reviewed",
      lastLocalizedAt: prompt.localization_updated_at.toISOString(),
    },
    originalSource: {
      sourceItemPublicId: prompt.source_item_public_id,
      title: prompt.source_title,
      url: prompt.source_url,
      attribution: prompt.source_attribution,
    },
    compatibilities,
    relations,
  });
};

type PromptListRow = {
  public_id: string;
  name: string;
  summary: string;
  task: string;
  input_types: string[];
  author_name: string;
  author_url: string | null;
  provenance: PromptProfileCreateRequest["provenance"];
  rights_status:
    | "open"
    | "attribution_required"
    | "source_license"
    | "metadata_only"
    | "link_only";
  full_text: string | null;
  last_verified_at: Date;
  compatibilities: CompatibilityRow[];
};

const queryPromptList = async (
  client: PoolClient,
  input: PromptListRequest,
  limit: number,
) =>
  client.query<PromptListRow>(
    `with current_compatibilities as (
       select compatibility.prompt_profile_id, compatibility.public_id,
         target.public_id as target_public_id, target.type::text as target_type,
         target_localization.name as target_name,
         version.public_id as version_public_id, compatibility.verified_version,
         current_validation.public_id as validation_public_id,
         current_validation.status::text as validation_status,
         current_validation.validated_at, current_validation.observed_at,
         current_validation.stale_reason,
         current_validation.source_public_id as validation_source_public_id
       from prompt_compatibilities compatibility
       join entities target on target.id = compatibility.target_entity_id
         and target.type in ('model', 'product')
         and target.lifecycle_status = 'active' and target.public_visibility = true
       join entity_localized_contents target_localization
         on target_localization.entity_id = target.id
         and target_localization.locale = $1::content_locale
         and target_localization.review_status = 'reviewed'
         and target_localization.public_visibility = true
       left join entity_versions version on version.id = compatibility.target_version_id
         and version.public_visibility = true
       join lateral (
         select latest.public_id, latest.status, latest.validated_at,
           latest.observed_at, validation_localization.stale_reason,
           source_item.public_id as source_public_id
         from lateral (
           select observation.id, observation.public_id,
             observation.source_item_id, observation.status,
             observation.validated_at, observation.observed_at
           from prompt_validation_observations observation
           where observation.compatibility_id = compatibility.id
             and observation.public_visibility = true
           order by observation.observed_at desc, observation.public_id desc
           limit 1
         ) latest
         join source_items source_item on source_item.id = latest.source_item_id
           and source_item.public_visibility = true
           and source_item.rights_status in (
             'open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'
           )
         left join prompt_validation_localized_contents validation_localization
           on validation_localization.validation_observation_id = latest.id
           and validation_localization.locale = $1::content_locale
           and validation_localization.review_status = 'reviewed'
           and validation_localization.public_visibility = true
         where latest.status <> 'stale' or validation_localization.id is not null
       ) current_validation on true
       where compatibility.public_visibility = true
         and exists (
           select 1 from prompt_profiles relation_profile
           join relations relation on relation.subject_entity_id = relation_profile.entity_id
             and relation.object_entity_id = target.id
             and relation.predicate = 'WORKS_WITH'
             and relation.review_status = 'reviewed'
             and relation.public_visibility = true
           join relation_evidence evidence on evidence.relation_id = relation.id
           join source_items relation_source on relation_source.id = evidence.source_item_id
             and relation_source.public_visibility = true
             and relation_source.rights_status in (
               'open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'
             )
           where relation_profile.id = compatibility.prompt_profile_id
         )
     )
     select prompt.public_id, localization.name, localization.summary,
       profile.task, profile.input_types, profile.author_name, profile.author_url,
       profile.provenance::text, profile.rights_status::text, profile.full_text,
       prompt.last_verified_at,
       jsonb_agg(jsonb_build_object(
         'public_id', compatibility.public_id,
         'target_public_id', compatibility.target_public_id,
         'target_type', compatibility.target_type,
         'target_name', compatibility.target_name,
         'version_public_id', compatibility.version_public_id,
         'verified_version', compatibility.verified_version,
         'validation_public_id', compatibility.validation_public_id,
         'validation_status', compatibility.validation_status,
         'validated_at', compatibility.validated_at,
         'observed_at', compatibility.observed_at,
         'stale_reason', compatibility.stale_reason,
         'validation_source_public_id', compatibility.validation_source_public_id
       ) order by compatibility.target_type, compatibility.target_public_id)
         as compatibilities
     from entities prompt
     join prompt_profiles profile on profile.entity_id = prompt.id
       and profile.public_visibility = true
       and profile.rights_status in (
         'open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'
       )
     join source_items source_item on source_item.id = profile.source_item_id
       and source_item.public_visibility = true
       and source_item.rights_status in (
         'open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'
       )
     join entity_localized_contents localization on localization.entity_id = prompt.id
       and localization.locale = $1::content_locale
       and localization.review_status = 'reviewed'
       and localization.public_visibility = true
     join prompt_localized_contents prompt_localization
       on prompt_localization.prompt_profile_id = profile.id
       and prompt_localization.locale = $1::content_locale
       and prompt_localization.review_status = 'reviewed'
       and prompt_localization.public_visibility = true
     join current_compatibilities compatibility
       on compatibility.prompt_profile_id = profile.id
     where prompt.type = 'prompt' and prompt.lifecycle_status = 'active'
       and prompt.public_visibility = true
       and ($2::text is null or profile.task = $2)
       and ($3::text is null or exists (
         select 1 from current_compatibilities model_compatibility
         where model_compatibility.prompt_profile_id = profile.id
           and model_compatibility.target_type = 'model'
           and model_compatibility.target_public_id = $3
       ))
       and ($4::text is null or exists (
         select 1 from current_compatibilities tool_compatibility
         where tool_compatibility.prompt_profile_id = profile.id
           and tool_compatibility.target_type = 'product'
           and tool_compatibility.target_public_id = $4
       ))
       and ($5::text is null or profile.rights_status::text = $5)
       and ($6::text is null or exists (
         select 1 from current_compatibilities validation_compatibility
         where validation_compatibility.prompt_profile_id = profile.id
           and validation_compatibility.validation_status = $6
           and (
             ($3::text is null and $4::text is null)
             or validation_compatibility.target_public_id = $3
             or validation_compatibility.target_public_id = $4
           )
       ))
     group by prompt.id, localization.name, localization.summary, profile.id
     order by last_verified_at desc, prompt.public_id
     limit $7`,
    [
      input.locale,
      input.task ?? null,
      input.model ?? null,
      input.tool ?? null,
      input.rightsStatus ?? null,
      input.validation ?? null,
      limit,
    ],
  );

const mapPromptListRow = (row: PromptListRow): PublicPromptListItem =>
  publicPromptListItemSchema.parse({
    publicId: row.public_id,
    name: row.name,
    summary: row.summary,
    task: row.task,
    inputTypes: row.input_types,
    author: { name: row.author_name, url: row.author_url },
    provenance: row.provenance,
    rightsStatus: row.rights_status,
    contentMode: row.full_text
      ? "full_text"
      : row.rights_status === "link_only"
        ? "link_only"
        : "metadata_only",
    lastVerifiedAt: row.last_verified_at.toISOString(),
    compatibilities: row.compatibilities.map((compatibility) =>
      mapCompatibility({
        ...compatibility,
        validated_at: new Date(compatibility.validated_at),
        observed_at: new Date(compatibility.observed_at),
      }),
    ),
  });

const maximumSnapshotItems = 1000;
const limitation = {
  en: "Prompts are filtered by task and verified compatibility. AI Radar does not publish a universal best Prompt ranking.",
  zh: "Prompt 按任务与已核验兼容性筛选。AI Radar 不发布通用最佳 Prompt 总榜。",
} as const;
const requestKeyFor = (input: PromptListRequest) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        locale: input.locale,
        task: input.task ?? null,
        model: input.model ?? null,
        tool: input.tool ?? null,
        rightsStatus: input.rightsStatus ?? null,
        validation: input.validation ?? null,
      }),
    )
    .digest("hex");
type PromptCursor = {
  version: 1;
  requestKey: string;
  dataCutoff: string;
  snapshotId: string;
  offset: number;
};
const encodeCursor = (cursor: PromptCursor) =>
  Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
const decodeCursor = (value: string): PromptCursor | null => {
  try {
    const decoded = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    const parsed = promptListCursorSchema.safeParse(decoded);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

const responseFor = (
  input: PromptListRequest,
  items: PublicPromptListItem[],
  dataCutoff: string | null,
  capturedCount: number,
  truncated: boolean,
  nextCursor: string | null,
) =>
  publicPromptListSchema.parse({
    locale: input.locale,
    methodology: {
      publicId: "prompt-task-fit",
      version: "1.0.0",
      kind: "filtered_discovery",
      limitation: limitation[input.locale],
    },
    items,
    dataCutoff,
    resultSet: {
      capturedCount,
      limit: maximumSnapshotItems,
      truncated,
    },
    nextCursor,
  });

const createSnapshotPage = async (
  input: PromptListRequest,
  requestKey: string,
) => {
  const client = await databasePool.connect();
  try {
    await client.query("begin isolation level repeatable read");
    const result = await queryPromptList(
      client,
      input,
      maximumSnapshotItems + 1,
    );
    const truncated = result.rows.length > maximumSnapshotItems;
    const items = result.rows
      .slice(0, maximumSnapshotItems)
      .map(mapPromptListRow);
    const snapshotId = randomUUID();
    const dataCutoff = items[0]?.lastVerifiedAt ?? null;
    if (items.length > 0) {
      await client.query(
        `insert into search_snapshots (
           id, request_key, ranking_state, data_cutoff, expires_at,
           total_count, truncated
         ) values ($1, $2, 'available', $3::timestamptz,
           clock_timestamp() + interval '24 hours', $4, $5)`,
        [snapshotId, requestKey, dataCutoff, items.length, truncated],
      );
      await client.query(
        `insert into search_snapshot_items (snapshot_id, position, payload)
         select $1, (ordinality - 1)::integer, value
         from jsonb_array_elements($2::jsonb) with ordinality`,
        [snapshotId, JSON.stringify(items)],
      );
    }
    await client.query("commit");
    return {
      status: "ok" as const,
      response: responseFor(
        input,
        items.slice(0, input.limit),
        dataCutoff,
        items.length,
        truncated,
        items.length > input.limit
          ? encodeCursor({
              version: 1,
              requestKey,
              dataCutoff: dataCutoff!,
              snapshotId,
              offset: input.limit,
            })
          : null,
      ),
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
};

const readSnapshotPage = async (
  input: PromptListRequest,
  requestKey: string,
  cursor: PromptCursor,
) => {
  const client = await databasePool.connect();
  try {
    await client.query("begin isolation level repeatable read read only");
    const snapshot = await client.query<{
      total_count: number;
      truncated: boolean;
    }>(
      `select total_count, truncated from search_snapshots
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
    const storedItems = page.rows.map(({ payload }) =>
      publicPromptListItemSchema.parse(payload),
    );
    const requestedCompatibilities = storedItems.flatMap((prompt) =>
      prompt.compatibilities.map((compatibility) => ({
        prompt_public_id: prompt.publicId,
        compatibility_public_id: compatibility.publicId,
        target_public_id: compatibility.target.publicId,
        target_type: compatibility.target.type,
        version_public_id: compatibility.target.versionPublicId,
        validation_public_id: compatibility.currentValidation.publicId,
      })),
    );
    const eligible = await client.query<{
      prompt_public_id: string;
      compatibility_public_id: string;
    }>(
      `with requested as (
         select * from jsonb_to_recordset($2::jsonb) as item(
           prompt_public_id text,
           compatibility_public_id text,
           target_public_id text,
           target_type text,
           version_public_id text,
           validation_public_id text
         )
       )
       select requested.prompt_public_id, requested.compatibility_public_id
       from requested
       join entities prompt on prompt.public_id = requested.prompt_public_id
         and prompt.type = 'prompt' and prompt.lifecycle_status = 'active'
         and prompt.public_visibility = true
       join prompt_profiles profile on profile.entity_id = prompt.id
         and profile.public_visibility = true
         and profile.rights_status in (
           'open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'
         )
       join source_items source_item on source_item.id = profile.source_item_id
         and source_item.public_visibility = true
         and source_item.rights_status in (
           'open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'
         )
       join prompt_localized_contents prompt_localization
         on prompt_localization.prompt_profile_id = profile.id
         and prompt_localization.locale = $1::content_locale
         and prompt_localization.review_status = 'reviewed'
         and prompt_localization.public_visibility = true
       join prompt_compatibilities compatibility
         on compatibility.prompt_profile_id = profile.id
         and compatibility.public_id = requested.compatibility_public_id
         and compatibility.public_visibility = true
       join entities target on target.id = compatibility.target_entity_id
         and target.public_id = requested.target_public_id
         and target.type::text = requested.target_type
         and target.type in ('model', 'product')
         and target.lifecycle_status = 'active'
         and target.public_visibility = true
       join entity_localized_contents target_localization
         on target_localization.entity_id = target.id
         and target_localization.locale = $1::content_locale
         and target_localization.review_status = 'reviewed'
         and target_localization.public_visibility = true
       left join entity_versions version on version.id = compatibility.target_version_id
       join lateral (
         select observation.id, observation.public_id,
           observation.source_item_id, observation.status
         from prompt_validation_observations observation
         where observation.compatibility_id = compatibility.id
           and observation.public_visibility = true
         order by observation.observed_at desc, observation.public_id desc
         limit 1
       ) latest_validation on latest_validation.public_id = requested.validation_public_id
       join source_items validation_source
         on validation_source.id = latest_validation.source_item_id
         and validation_source.public_visibility = true
         and validation_source.rights_status in (
           'open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'
         )
       left join prompt_validation_localized_contents validation_localization
         on validation_localization.validation_observation_id = latest_validation.id
         and validation_localization.locale = $1::content_locale
         and validation_localization.review_status = 'reviewed'
         and validation_localization.public_visibility = true
       where (
         (requested.version_public_id is null and compatibility.target_version_id is null)
         or (
           version.public_id = requested.version_public_id
           and version.public_visibility = true
         )
       )
         and (
           latest_validation.status <> 'stale'
           or validation_localization.id is not null
         )
         and exists (
           select 1 from relations relation
           join relation_evidence evidence on evidence.relation_id = relation.id
           join source_items relation_source on relation_source.id = evidence.source_item_id
             and relation_source.public_visibility = true
             and relation_source.rights_status in (
               'open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'
             )
           where relation.subject_entity_id = prompt.id
             and relation.object_entity_id = target.id
             and relation.predicate = 'WORKS_WITH'
             and relation.review_status = 'reviewed'
             and relation.public_visibility = true
         )`,
      [input.locale, JSON.stringify(requestedCompatibilities)],
    );
    const eligibleCompatibilityIdsByPrompt = new Map<string, Set<string>>();
    for (const row of eligible.rows) {
      const compatibilityIds =
        eligibleCompatibilityIdsByPrompt.get(row.prompt_public_id) ??
        new Set<string>();
      compatibilityIds.add(row.compatibility_public_id);
      eligibleCompatibilityIdsByPrompt.set(
        row.prompt_public_id,
        compatibilityIds,
      );
    }
    const items = storedItems.filter(
      (prompt) =>
        eligibleCompatibilityIdsByPrompt.get(prompt.publicId)?.size ===
        prompt.compatibilities.length,
    );
    const nextOffset = cursor.offset + storedItems.length;
    await client.query("commit");
    return {
      status: "ok" as const,
      response: responseFor(
        input,
        items,
        cursor.dataCutoff,
        metadata.total_count,
        metadata.truncated,
        nextOffset < metadata.total_count
          ? encodeCursor({ ...cursor, offset: nextOffset })
          : null,
      ),
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
};

export const listPublicPrompts = async (input: PromptListRequest) => {
  const requestKey = requestKeyFor(input);
  if (!input.cursor) return createSnapshotPage(input, requestKey);
  const cursor = decodeCursor(input.cursor);
  if (!cursor || cursor.requestKey !== requestKey) {
    return { status: "invalid_cursor" as const };
  }
  return readSnapshotPage(input, requestKey, cursor);
};
