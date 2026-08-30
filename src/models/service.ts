import { and, eq, inArray } from "drizzle-orm";
import { database, databasePool } from "@/db/client";
import {
  benchmarkRuns,
  entities,
  entityVersions,
  modelVersionProfiles,
  ownerOperationAudits,
  priceRecords,
  sourceItems,
} from "@/db/schema";
import { getPublicEntity } from "@/entities/service";
import {
  publicModelDetailSchema,
  publicModelListSchema,
  publicModelVersionDetailSchema,
  type ModelListRequest,
  type ModelVersionProfileCreateRequest,
  type PublicModelDetail,
} from "./contracts";

export const createModelVersionProfile = async (
  input: ModelVersionProfileCreateRequest,
) =>
  database.transaction(async (transaction) => {
    const [version] = await transaction
      .select({
        id: entityVersions.id,
        familyId: entities.id,
        familyType: entities.type,
        familyPublicVisibility: entities.publicVisibility,
        versionPublicVisibility: entityVersions.publicVisibility,
      })
      .from(entityVersions)
      .innerJoin(entities, eq(entities.id, entityVersions.entityId))
      .where(
        and(
          eq(entityVersions.publicId, input.versionPublicId),
          eq(entities.publicId, input.familyPublicId),
        ),
      )
      .for("update");
    if (
      !version ||
      version.familyType !== "model" ||
      !version.familyPublicVisibility ||
      !version.versionPublicVisibility
    ) {
      return { status: "invalid_reference" as const };
    }

    const referencedEntityPublicIds = [
      ...new Set([
        input.providerPublicId,
        ...input.benchmarkRuns.flatMap(
          ({ benchmarkPublicId, evaluatorPublicId }) => [
            benchmarkPublicId,
            evaluatorPublicId,
          ],
        ),
      ]),
    ];
    const referencedEntities = await transaction
      .select({
        id: entities.id,
        publicId: entities.publicId,
        type: entities.type,
        publicVisibility: entities.publicVisibility,
        lifecycleStatus: entities.lifecycleStatus,
      })
      .from(entities)
      .where(inArray(entities.publicId, referencedEntityPublicIds))
      .orderBy(entities.id)
      .for("update");
    const entityByPublicId = new Map(
      referencedEntities.map((entity) => [entity.publicId, entity]),
    );
    const provider = entityByPublicId.get(input.providerPublicId);
    if (
      !provider ||
      provider.type !== "organization" ||
      provider.lifecycleStatus !== "active" ||
      !provider.publicVisibility ||
      input.benchmarkRuns.some(({ benchmarkPublicId, evaluatorPublicId }) => {
        const benchmark = entityByPublicId.get(benchmarkPublicId);
        const evaluator = entityByPublicId.get(evaluatorPublicId);
        return (
          !benchmark ||
          benchmark.type !== "benchmark" ||
          benchmark.lifecycleStatus !== "active" ||
          !benchmark.publicVisibility ||
          !evaluator ||
          evaluator.type !== "organization" ||
          evaluator.lifecycleStatus !== "active" ||
          !evaluator.publicVisibility
        );
      })
    ) {
      return { status: "invalid_reference" as const };
    }

    const evidencePublicIds = [
      ...new Set([
        ...input.priceRecords.map(
          ({ sourceItemPublicId }) => sourceItemPublicId,
        ),
        ...input.benchmarkRuns.map(
          ({ evidenceSourceItemPublicId }) => evidenceSourceItemPublicId,
        ),
      ]),
    ];
    const evidence =
      evidencePublicIds.length === 0
        ? []
        : await transaction
            .select({
              id: sourceItems.id,
              publicId: sourceItems.publicId,
              publicVisibility: sourceItems.publicVisibility,
            })
            .from(sourceItems)
            .where(inArray(sourceItems.publicId, evidencePublicIds))
            .orderBy(sourceItems.id)
            .for("update");
    if (
      evidence.length !== evidencePublicIds.length ||
      evidence.some(({ publicVisibility }) => !publicVisibility)
    ) {
      return { status: "invalid_reference" as const };
    }
    const evidenceByPublicId = new Map(
      evidence.map((item) => [item.publicId, item.id]),
    );

    await transaction.insert(modelVersionProfiles).values({
      entityVersionId: version.id,
      providerEntityId: provider.id,
      lifecycleStatus: input.lifecycleStatus,
      inputModalities: input.inputModalities,
      outputModalities: input.outputModalities,
      contextWindowTokens: input.contextWindowTokens,
      accessMethods: input.accessMethods,
      regions: input.regions,
      publicVisibility: true,
    });
    if (input.priceRecords.length > 0) {
      await transaction.insert(priceRecords).values(
        input.priceRecords.map((price) => ({
          publicId: price.publicId,
          entityVersionId: version.id,
          category: price.category,
          amount: price.amount,
          currency: price.currency,
          unit: price.unit,
          region: price.region,
          taxPolicy: price.taxPolicy,
          validFrom: new Date(price.validFrom),
          validTo: price.validTo ? new Date(price.validTo) : null,
          sourceItemId: evidenceByPublicId.get(price.sourceItemPublicId)!,
          lastVerifiedAt: new Date(price.lastVerifiedAt),
          publicVisibility: true,
        })),
      );
    }
    if (input.benchmarkRuns.length > 0) {
      await transaction.insert(benchmarkRuns).values(
        input.benchmarkRuns.map((run) => ({
          publicId: run.publicId,
          entityVersionId: version.id,
          benchmarkEntityId: entityByPublicId.get(run.benchmarkPublicId)!.id,
          benchmarkVersion: run.benchmarkVersion,
          task: run.task,
          score: run.score,
          unit: run.unit,
          higherIsBetter: run.higherIsBetter,
          settings: run.settings,
          evaluatorEntityId: entityByPublicId.get(run.evaluatorPublicId)!.id,
          provenance: run.provenance,
          runAt: new Date(run.runAt),
          evidenceSourceItemId: evidenceByPublicId.get(
            run.evidenceSourceItemPublicId,
          )!,
          reproducibility: run.reproducibility,
          confidence: run.confidence,
          lastVerifiedAt: new Date(run.lastVerifiedAt),
          publicVisibility: true,
        })),
      );
    }
    await transaction.insert(ownerOperationAudits).values({
      actorRole: "owner",
      action: "create_model_version_profile",
      targetType: "entity_version",
      targetPublicId: input.versionPublicId,
      publicVisibility: true,
    });

    return {
      status: "created" as const,
      familyPublicId: input.familyPublicId,
      versionPublicId: input.versionPublicId,
      publicVisibility: true,
      priceRecordPublicIds: input.priceRecords.map(({ publicId }) => publicId),
      benchmarkRunPublicIds: input.benchmarkRuns.map(
        ({ publicId }) => publicId,
      ),
    };
  });

type FamilyRow = {
  id: string;
  public_id: string;
  name: string;
  summary: string;
  official_url: string;
  last_verified_at: Date;
  projection_cutoff: Date;
};

type VersionRow = {
  id: string;
  public_id: string;
  version_label: string;
  released_at: Date | null;
  lifecycle_status: PublicModelDetail["versions"][number]["lifecycleStatus"];
  input_modalities:
    PublicModelDetail["versions"][number]["inputModalities"] | null;
  output_modalities:
    PublicModelDetail["versions"][number]["outputModalities"] | null;
  context_window_tokens: number | null;
  access_methods: PublicModelDetail["versions"][number]["accessMethods"] | null;
  regions: string[] | null;
  provider_public_id: string | null;
  provider_name: string | null;
  projection_cutoff: Date;
};

type PriceRow = {
  entity_version_id: string;
  public_id: string;
  category: PublicModelDetail["versions"][number]["prices"][number]["category"];
  amount: string;
  currency: string;
  unit: PublicModelDetail["versions"][number]["prices"][number]["unit"];
  region: string;
  tax_policy: PublicModelDetail["versions"][number]["prices"][number]["taxPolicy"];
  valid_from: Date;
  valid_to: Date | null;
  source_item_public_id: string;
  source_title: string;
  source_url: string;
  last_verified_at: Date;
  projection_cutoff: Date;
};

type BenchmarkRow = {
  entity_version_id: string;
  public_id: string;
  benchmark_public_id: string;
  benchmark_name: string;
  benchmark_version: string;
  task: string;
  score: string;
  unit: string;
  higher_is_better: boolean;
  settings: Record<string, string | number | boolean | null>;
  evaluator_public_id: string;
  evaluator_name: string;
  provenance: PublicModelDetail["versions"][number]["benchmarkRuns"][number]["provenance"];
  run_at: Date;
  evidence_source_item_public_id: string;
  evidence_title: string;
  evidence_url: string;
  reproducibility: PublicModelDetail["versions"][number]["benchmarkRuns"][number]["reproducibility"];
  confidence: number;
  last_verified_at: Date;
  projection_cutoff: Date;
};

export const getPublicModel = async (publicId: string, locale: "en" | "zh") => {
  const familyResult = await databasePool.query<FamilyRow>(
    `select family.id, family.public_id, localization.name,
      localization.summary, family.official_url, family.last_verified_at,
      greatest(
        family.last_verified_at,
        family.updated_at,
        localization.updated_at
      ) as projection_cutoff
     from entities family
     join entity_localized_contents localization
       on localization.entity_id = family.id
       and localization.locale = $2::content_locale
       and localization.review_status = 'reviewed'
       and localization.public_visibility = true
     where family.public_id = $1 and family.type = 'model'
       and family.lifecycle_status = 'active'
       and family.public_visibility = true`,
    [publicId, locale],
  );
  const family = familyResult.rows[0];
  if (!family) return null;

  const versionsResult = await databasePool.query<VersionRow>(
    `select version.id, version.public_id, version.version_label,
      version.released_at, profile.lifecycle_status::text,
      profile.input_modalities::text[], profile.output_modalities::text[],
      profile.context_window_tokens, profile.access_methods::text[],
      profile.regions, provider.public_id as provider_public_id,
      provider_localization.name as provider_name,
      greatest(
        version.last_verified_at,
        version.created_at,
        case
          when provider.public_id is not null
            and provider_localization.name is not null
          then greatest(
            profile.updated_at,
            provider.last_verified_at,
            provider.updated_at,
            provider_localization.updated_at
          )
        end
      ) as projection_cutoff
     from entity_versions version
     left join model_version_profiles profile
       on profile.entity_version_id = version.id
       and profile.public_visibility = true
     left join entities provider
       on provider.id = profile.provider_entity_id
       and provider.lifecycle_status = 'active'
       and provider.public_visibility = true
     left join entity_localized_contents provider_localization
       on provider_localization.entity_id = provider.id
       and provider_localization.locale = $2::content_locale
       and provider_localization.review_status = 'reviewed'
       and provider_localization.public_visibility = true
     where version.entity_id = $1::uuid and version.public_visibility = true
     order by version.released_at nulls last, version.public_id`,
    [family.id, locale],
  );
  const versionIds = versionsResult.rows.map(({ id }) => id);
  const pricesResult =
    versionIds.length === 0
      ? { rows: [] as PriceRow[] }
      : await databasePool.query<PriceRow>(
          `select price.entity_version_id, price.public_id,
            price.category::text, price.amount::text, price.currency,
            price.unit::text, price.region, price.tax_policy::text,
            price.valid_from, price.valid_to,
            source_item.public_id as source_item_public_id,
            source_item.original_title as source_title,
            source_item.canonical_url as source_url,
            price.last_verified_at,
            greatest(
              price.last_verified_at,
              price.created_at,
              source_item.rights_checked_at,
              source_item.updated_at
            ) as projection_cutoff
           from price_records price
           join source_items source_item
             on source_item.id = price.source_item_id
             and source_item.public_visibility = true
           where price.entity_version_id = any($1::uuid[])
             and price.public_visibility = true
           order by price.category::text, price.public_id`,
          [versionIds],
        );
  const benchmarksResult =
    versionIds.length === 0
      ? { rows: [] as BenchmarkRow[] }
      : await databasePool.query<BenchmarkRow>(
          `select run.entity_version_id, run.public_id,
            benchmark.public_id as benchmark_public_id,
            benchmark_localization.name as benchmark_name,
            run.benchmark_version, run.task, run.score::text, run.unit,
            run.higher_is_better, run.settings,
            evaluator.public_id as evaluator_public_id,
            evaluator_localization.name as evaluator_name,
            run.provenance::text, run.run_at,
            source_item.public_id as evidence_source_item_public_id,
            source_item.original_title as evidence_title,
            source_item.canonical_url as evidence_url,
            run.reproducibility::text, run.confidence,
            run.last_verified_at,
            greatest(
              run.last_verified_at,
              run.created_at,
              benchmark.last_verified_at,
              benchmark.updated_at,
              benchmark_localization.updated_at,
              evaluator.last_verified_at,
              evaluator.updated_at,
              evaluator_localization.updated_at,
              source_item.rights_checked_at,
              source_item.updated_at
            ) as projection_cutoff
           from benchmark_runs run
           join entities benchmark
             on benchmark.id = run.benchmark_entity_id
             and benchmark.type = 'benchmark'
             and benchmark.lifecycle_status = 'active'
             and benchmark.public_visibility = true
           join entity_localized_contents benchmark_localization
             on benchmark_localization.entity_id = benchmark.id
             and benchmark_localization.locale = $2::content_locale
             and benchmark_localization.review_status = 'reviewed'
             and benchmark_localization.public_visibility = true
           join entities evaluator
             on evaluator.id = run.evaluator_entity_id
             and evaluator.type = 'organization'
             and evaluator.lifecycle_status = 'active'
             and evaluator.public_visibility = true
           join entity_localized_contents evaluator_localization
             on evaluator_localization.entity_id = evaluator.id
             and evaluator_localization.locale = $2::content_locale
             and evaluator_localization.review_status = 'reviewed'
             and evaluator_localization.public_visibility = true
           join source_items source_item
             on source_item.id = run.evidence_source_item_id
             and source_item.public_visibility = true
           where run.entity_version_id = any($1::uuid[])
             and run.public_visibility = true
           order by run.provenance::text, run.public_id`,
          [versionIds, locale],
        );
  const genericEntity = await getPublicEntity(publicId, locale);
  if (!genericEntity) return null;
  const relatedEntityPublicIds = [
    ...new Set(
      [...genericEntity.outgoingRelations, ...genericEntity.backlinks].flatMap(
        (relation) =>
          [relation.subject, relation.object].flatMap((endpoint) =>
            endpoint.type === "entity" && endpoint.publicId !== publicId
              ? [endpoint.publicId]
              : [],
          ),
      ),
    ),
  ];
  const timelineEventPublicIds = genericEntity.timeline.map(
    ({ eventPublicId }) => eventPublicId,
  );
  const relatedProjectionResult = await databasePool.query<{
    projection_cutoff: Date | null;
  }>(
    `select max(fact.projection_cutoff) as projection_cutoff
     from (
       select greatest(
         entity.last_verified_at,
         entity.updated_at,
         localization.updated_at
       ) as projection_cutoff
       from entities entity
       join entity_localized_contents localization
         on localization.entity_id = entity.id
         and localization.locale = $3::content_locale
         and localization.review_status = 'reviewed'
         and localization.public_visibility = true
       where entity.public_id = any($1::text[])
         and entity.lifecycle_status = 'active'
         and entity.public_visibility = true
       union all
       select greatest(
         event.last_verified_at,
         event.updated_at,
         localization.updated_at
       ) as projection_cutoff
       from events event
       join localized_contents localization
         on localization.event_id = event.id
         and localization.locale = $3::content_locale
         and localization.review_status = 'reviewed'
         and localization.public_visibility = true
       where event.public_id = any($2::text[])
         and event.publication_state in ('published', 'corrected')
         and event.public_visibility = true
     ) fact`,
    [relatedEntityPublicIds, timelineEventPublicIds, locale],
  );
  const relatedProjectionCutoff =
    relatedProjectionResult.rows[0]?.projection_cutoff;
  const dataCutoff = new Date(
    Math.max(
      family.projection_cutoff.getTime(),
      ...versionsResult.rows.map(({ projection_cutoff }) =>
        projection_cutoff.getTime(),
      ),
      ...pricesResult.rows.map(({ projection_cutoff }) =>
        projection_cutoff.getTime(),
      ),
      ...benchmarksResult.rows.map(({ projection_cutoff }) =>
        projection_cutoff.getTime(),
      ),
      ...genericEntity.versions.map(({ lastVerifiedAt }) =>
        Date.parse(lastVerifiedAt),
      ),
      ...[...genericEntity.outgoingRelations, ...genericEntity.backlinks].map(
        ({ lastVerifiedAt }) => Date.parse(lastVerifiedAt),
      ),
      ...(relatedProjectionCutoff ? [relatedProjectionCutoff.getTime()] : []),
    ),
  );
  const pricesByVersion = new Map<string, PriceRow[]>();
  for (const price of pricesResult.rows) {
    const grouped = pricesByVersion.get(price.entity_version_id) ?? [];
    grouped.push(price);
    pricesByVersion.set(price.entity_version_id, grouped);
  }
  const benchmarksByVersion = new Map<string, BenchmarkRow[]>();
  for (const run of benchmarksResult.rows) {
    const grouped = benchmarksByVersion.get(run.entity_version_id) ?? [];
    grouped.push(run);
    benchmarksByVersion.set(run.entity_version_id, grouped);
  }
  const datedVersionPublicIds = versionsResult.rows
    .filter(({ released_at }) => released_at !== null)
    .map(({ public_id }) => public_id);
  const versions = versionsResult.rows.map((version) => {
    const hasPublicProfile = Boolean(
      version.provider_public_id && version.provider_name,
    );
    const prices = (
      hasPublicProfile ? (pricesByVersion.get(version.id) ?? []) : []
    ).map((price) => ({
      publicId: price.public_id,
      category: price.category,
      amount: price.amount,
      currency: price.currency,
      unit: price.unit,
      region: price.region,
      taxPolicy: price.tax_policy,
      validFrom: price.valid_from.toISOString(),
      validTo: price.valid_to?.toISOString() ?? null,
      lastVerifiedAt: price.last_verified_at.toISOString(),
      source: {
        sourceItemPublicId: price.source_item_public_id,
        title: price.source_title,
        url: price.source_url,
      },
    }));
    const benchmarkRuns = (
      hasPublicProfile ? (benchmarksByVersion.get(version.id) ?? []) : []
    ).map((run) => ({
      publicId: run.public_id,
      benchmark: {
        publicId: run.benchmark_public_id,
        name: run.benchmark_name,
        version: run.benchmark_version,
      },
      task: run.task,
      score: run.score,
      unit: run.unit,
      higherIsBetter: run.higher_is_better,
      settings: run.settings,
      evaluator: {
        publicId: run.evaluator_public_id,
        name: run.evaluator_name,
      },
      provenance: run.provenance,
      runAt: run.run_at.toISOString(),
      lastVerifiedAt: run.last_verified_at.toISOString(),
      evidence: {
        sourceItemPublicId: run.evidence_source_item_public_id,
        title: run.evidence_title,
        url: run.evidence_url,
      },
      reproducibility: run.reproducibility,
      confidence: run.confidence,
    }));
    const datedVersionIndex = datedVersionPublicIds.indexOf(version.public_id);
    const hasCurrentPrice = prices.some(
      (price) =>
        Date.parse(price.validFrom) <= dataCutoff.getTime() &&
        (price.validTo === null ||
          Date.parse(price.validTo) >= dataCutoff.getTime()),
    );
    return {
      publicId: version.public_id,
      versionLabel: version.version_label,
      releasedAt: version.released_at?.toISOString() ?? null,
      lifecycleStatus: hasPublicProfile ? version.lifecycle_status : null,
      inputModalities: hasPublicProfile ? (version.input_modalities ?? []) : [],
      outputModalities: hasPublicProfile
        ? (version.output_modalities ?? [])
        : [],
      contextWindowTokens: hasPublicProfile
        ? version.context_window_tokens
        : null,
      accessMethods: hasPublicProfile ? (version.access_methods ?? []) : [],
      regions: hasPublicProfile ? (version.regions ?? []) : [],
      provider:
        version.provider_public_id && version.provider_name
          ? {
              publicId: version.provider_public_id,
              name: version.provider_name,
            }
          : null,
      prices,
      benchmarkRuns,
      evidenceState:
        hasPublicProfile && hasCurrentPrice && benchmarkRuns.length > 0
          ? ("available" as const)
          : ("insufficient_evidence" as const),
      predecessorPublicId:
        datedVersionIndex < 0
          ? null
          : (datedVersionPublicIds[datedVersionIndex - 1] ?? null),
      successorPublicId:
        datedVersionIndex < 0
          ? null
          : (datedVersionPublicIds[datedVersionIndex + 1] ?? null),
    };
  });
  const relatedEntities = [
    ...genericEntity.outgoingRelations.map((relation) => ({
      endpoint: relation.object,
      relation: relation.predicate,
    })),
    ...genericEntity.backlinks.map((relation) => ({
      endpoint: relation.subject,
      relation: relation.predicate,
    })),
  ].flatMap(({ endpoint, relation }) =>
    endpoint.type === "entity" && endpoint.publicId !== publicId
      ? [{ publicId: endpoint.publicId, name: endpoint.name, relation }]
      : [],
  );

  return publicModelDetailSchema.parse({
    publicId: family.public_id,
    name: family.name,
    summary: family.summary,
    officialUrl: family.official_url,
    lifecycleStatus: "active",
    lastVerifiedAt: family.last_verified_at.toISOString(),
    dataCutoff: dataCutoff.toISOString(),
    provider:
      [...versions].reverse().find(({ provider }) => provider !== null)
        ?.provider ?? null,
    versions,
    relatedEntities,
    timeline: genericEntity.timeline.map(
      ({ eventPublicId, occurredAt, title }) => ({
        eventPublicId,
        occurredAt,
        title,
      }),
    ),
  });
};

export const listPublicModels = async (input: ModelListRequest) => {
  const result = await databasePool.query<{ public_id: string }>(
    `select family.public_id
     from entities family
     where family.type = 'model' and family.lifecycle_status = 'active'
       and family.public_visibility = true
       and (
         ($1::text is null and $2::text is null
           and $3::text is null and $4::text is null)
         or exists (
           select 1
           from entity_versions version
           join model_version_profiles profile
             on profile.entity_version_id = version.id
             and profile.public_visibility = true
           join entities provider
             on provider.id = profile.provider_entity_id
             and provider.lifecycle_status = 'active'
             and provider.public_visibility = true
           join entity_localized_contents provider_localization
             on provider_localization.entity_id = provider.id
             and provider_localization.locale = $5::content_locale
             and provider_localization.review_status = 'reviewed'
             and provider_localization.public_visibility = true
           where version.entity_id = family.id
             and version.public_visibility = true
             and ($1::text is null or provider.public_id = $1)
             and ($2::text is null
               or $2 = any(profile.input_modalities::text[])
               or $2 = any(profile.output_modalities::text[]))
             and ($3::text is null or $3 = any(profile.access_methods::text[]))
             and ($4::text is null or $4 = any(profile.regions))
         )
       )
     order by family.public_id`,
    [
      input.provider ?? null,
      input.modality ?? null,
      input.access ?? null,
      input.region ?? null,
      input.locale,
    ],
  );
  const details = (
    await Promise.all(
      result.rows.map(({ public_id }) =>
        getPublicModel(public_id, input.locale),
      ),
    )
  ).filter((detail): detail is PublicModelDetail => detail !== null);
  return publicModelListSchema.parse({
    locale: input.locale,
    items: details.map(({ publicId, name, summary, provider, versions }) => ({
      publicId,
      name,
      summary,
      provider,
      latestVersion:
        [...versions].reverse().find(({ releasedAt }) => releasedAt !== null) ??
        null,
    })),
    dataCutoff:
      details.length === 0
        ? null
        : new Date(
            Math.max(
              ...details.map(({ dataCutoff }) => Date.parse(dataCutoff)),
            ),
          ).toISOString(),
  });
};

export const getPublicModelVersion = async (
  versionPublicId: string,
  locale: "en" | "zh",
) => {
  const familyResult = await databasePool.query<{ public_id: string }>(
    `select family.public_id
     from entity_versions version
     join entities family on family.id = version.entity_id
     where version.public_id = $1 and version.public_visibility = true
       and family.type = 'model' and family.lifecycle_status = 'active'
       and family.public_visibility = true`,
    [versionPublicId],
  );
  const familyPublicId = familyResult.rows[0]?.public_id;
  if (!familyPublicId) return null;
  const family = await getPublicModel(familyPublicId, locale);
  if (!family) return null;
  const version = family.versions.find(
    ({ publicId }) => publicId === versionPublicId,
  );
  if (!version) return null;
  return publicModelVersionDetailSchema.parse({
    ...version,
    family: {
      publicId: family.publicId,
      name: family.name,
      summary: family.summary,
      officialUrl: family.officialUrl,
      provider: family.provider,
      dataCutoff: family.dataCutoff,
      relatedEntities: family.relatedEntities,
      timeline: family.timeline,
    },
  });
};
