import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { database, databasePool } from "@/db/client";
import {
  benchmarkRuns,
  entities,
  entityVersions,
  events,
  featuredSelectionEvidence,
  featuredSelectionLocalizedContents,
  featuredSelections,
  githubSourceItemMetadata,
  guideProfiles,
  guideVersionProfiles,
  modelVersionProfiles,
  ownerOperationAudits,
  paperIdentities,
  paperRevisionProfiles,
  priceRecords,
  productObservations,
  productProfiles,
  promptProfiles,
  rankingDefinitionLocalizedContents,
  rankingDefinitions,
  rankingDefinitionVersions,
  rankingObservationEvidence,
  rankingObservations,
  repositoryIdentities,
  repositoryObservations,
  skillProfiles,
  skillVersionProfiles,
  sourceItems,
} from "@/db/schema";
import {
  type FeaturedSelectionCreateRequest,
  type RankingDefinitionCreateRequest,
  type RankingDetailRequest,
  type RankingListRequest,
  type RankingObservationCreateRequest,
  publicRankingDetailSchema,
  publicRankingListSchema,
  rankingMethodSchema,
} from "./contracts";

const publicRights = [
  "open",
  "attribution_required",
  "source_license",
  "metadata_only",
  "link_only",
] as const;

type Transaction = Parameters<Parameters<typeof database.transaction>[0]>[0];
type PublicTarget = {
  eventId: string | null;
  entityId: string | null;
};

const resolvePublicTarget = async (
  transaction: Transaction,
  target: { type: string; publicId: string },
): Promise<PublicTarget | null> => {
  if (target.type === "event") {
    const [event] = await transaction
      .select({ id: events.id })
      .from(events)
      .where(
        and(
          eq(events.publicId, target.publicId),
          inArray(events.publicationState, ["published", "corrected"]),
          inArray(events.rightsStatus, [...publicRights]),
          eq(events.publicVisibility, true),
        ),
      );
    return event ? { eventId: event.id, entityId: null } : null;
  }
  const [entity] = await transaction
    .select({ id: entities.id, type: entities.type })
    .from(entities)
    .where(
      and(
        eq(entities.publicId, target.publicId),
        eq(entities.lifecycleStatus, "active"),
        inArray(entities.rightsStatus, [...publicRights]),
        eq(entities.publicVisibility, true),
      ),
    );
  return entity?.type === target.type
    ? { eventId: null, entityId: entity.id }
    : null;
};

const resolvePublicEvidence = async (
  transaction: Transaction,
  publicIds: string[],
) => {
  const uniquePublicIds = [...new Set(publicIds)];
  if (uniquePublicIds.length === 0) return null;
  const sources = await transaction
    .select({
      id: sourceItems.id,
      publicId: sourceItems.publicId,
      sourceId: sourceItems.sourceId,
      rightsStatus: sourceItems.rightsStatus,
    })
    .from(sourceItems)
    .where(
      and(
        inArray(sourceItems.publicId, uniquePublicIds),
        eq(sourceItems.publicVisibility, true),
      ),
    );
  return sources.length === uniquePublicIds.length &&
    sources.every(({ rightsStatus }) =>
      publicRights.includes(rightsStatus as (typeof publicRights)[number]),
    )
    ? new Map(
        sources.map(({ publicId, id, sourceId }) => [
          publicId,
          { id, sourceId },
        ]),
      )
    : null;
};

const resolveLatestCandidateTime = async (
  transaction: Transaction,
  targetType: RankingDefinitionCreateRequest["targetType"],
  target: PublicTarget,
) => {
  if (target.eventId) {
    const [event] = await transaction
      .select({ candidateTime: events.occurredAt })
      .from(events)
      .where(eq(events.id, target.eventId));
    return event?.candidateTime ?? null;
  }
  if (!target.entityId) return null;

  if (targetType === "model") {
    const [version] = await transaction
      .select({ candidateTime: entityVersions.releasedAt })
      .from(entityVersions)
      .innerJoin(
        modelVersionProfiles,
        eq(modelVersionProfiles.entityVersionId, entityVersions.id),
      )
      .where(
        and(
          eq(entityVersions.entityId, target.entityId),
          eq(entityVersions.publicVisibility, true),
          eq(modelVersionProfiles.publicVisibility, true),
        ),
      )
      .orderBy(desc(entityVersions.releasedAt))
      .limit(1);
    return version?.candidateTime ?? null;
  }

  if (targetType === "paper") {
    const [revision] = await transaction
      .select({ candidateTime: entityVersions.releasedAt })
      .from(paperIdentities)
      .innerJoin(
        paperRevisionProfiles,
        eq(paperRevisionProfiles.paperIdentityId, paperIdentities.id),
      )
      .innerJoin(
        entityVersions,
        eq(entityVersions.id, paperRevisionProfiles.entityVersionId),
      )
      .where(
        and(
          eq(paperIdentities.entityId, target.entityId),
          eq(paperRevisionProfiles.publicVisibility, true),
          eq(entityVersions.publicVisibility, true),
        ),
      )
      .orderBy(desc(entityVersions.releasedAt))
      .limit(1);
    return revision?.candidateTime ?? null;
  }

  if (targetType === "product") {
    const [observation] = await transaction
      .select({ candidateTime: productObservations.effectiveAt })
      .from(productProfiles)
      .innerJoin(
        productObservations,
        eq(productObservations.productProfileId, productProfiles.id),
      )
      .where(
        and(
          eq(productProfiles.entityId, target.entityId),
          eq(productProfiles.publicVisibility, true),
          eq(productObservations.publicVisibility, true),
        ),
      )
      .orderBy(desc(productObservations.effectiveAt))
      .limit(1);
    return observation?.candidateTime ?? null;
  }

  if (targetType === "repository") {
    const [repository] = await transaction
      .select({ candidateTime: githubSourceItemMetadata.repositoryCreatedAt })
      .from(repositoryIdentities)
      .innerJoin(
        repositoryObservations,
        eq(
          repositoryObservations.repositoryIdentityId,
          repositoryIdentities.id,
        ),
      )
      .innerJoin(
        githubSourceItemMetadata,
        eq(
          githubSourceItemMetadata.sourceItemId,
          repositoryObservations.metadataSourceItemId,
        ),
      )
      .where(
        and(
          eq(repositoryIdentities.entityId, target.entityId),
          eq(repositoryObservations.publicVisibility, true),
        ),
      )
      .orderBy(desc(githubSourceItemMetadata.observedAt))
      .limit(1);
    return repository?.candidateTime ?? null;
  }

  if (targetType === "prompt") {
    const [prompt] = await transaction
      .select({ candidateTime: sourceItems.publishedAt })
      .from(promptProfiles)
      .innerJoin(sourceItems, eq(sourceItems.id, promptProfiles.sourceItemId))
      .where(
        and(
          eq(promptProfiles.entityId, target.entityId),
          eq(promptProfiles.publicVisibility, true),
          eq(sourceItems.publicVisibility, true),
          inArray(sourceItems.rightsStatus, [...publicRights]),
        ),
      )
      .limit(1);
    return prompt?.candidateTime ?? null;
  }

  if (targetType === "skill") {
    const [version] = await transaction
      .select({ candidateTime: entityVersions.releasedAt })
      .from(skillProfiles)
      .innerJoin(
        skillVersionProfiles,
        eq(skillVersionProfiles.skillProfileId, skillProfiles.id),
      )
      .innerJoin(
        entityVersions,
        eq(entityVersions.id, skillVersionProfiles.entityVersionId),
      )
      .where(
        and(
          eq(skillProfiles.entityId, target.entityId),
          eq(skillProfiles.publicVisibility, true),
          eq(skillVersionProfiles.publicVisibility, true),
          eq(entityVersions.publicVisibility, true),
        ),
      )
      .orderBy(desc(entityVersions.releasedAt))
      .limit(1);
    return version?.candidateTime ?? null;
  }

  const [guide] = await transaction
    .select({ candidateTime: guideVersionProfiles.publishedAt })
    .from(guideProfiles)
    .innerJoin(
      guideVersionProfiles,
      eq(guideVersionProfiles.guideProfileId, guideProfiles.id),
    )
    .where(
      and(
        eq(guideProfiles.entityId, target.entityId),
        eq(guideProfiles.publicVisibility, true),
        eq(guideVersionProfiles.publicVisibility, true),
      ),
    )
    .orderBy(desc(guideVersionProfiles.publishedAt))
    .limit(1);
  return guide?.candidateTime ?? null;
};

const resolveModelComparison = async (
  transaction: Transaction,
  entityId: string,
  versionPublicId: string,
  comparison: NonNullable<
    RankingObservationCreateRequest["observation"]["comparison"]
  >,
  method: Extract<
    ReturnType<typeof rankingMethodSchema.parse>,
    { kind: "benchmark" | "value" }
  >,
  dataCutoff: Date,
) => {
  const benchmarkPublicId =
    method.kind === "benchmark"
      ? method.benchmarkPublicId
      : method.qualityBenchmarkPublicId;
  const benchmarkVersion =
    method.kind === "benchmark"
      ? method.benchmarkVersion
      : method.qualityBenchmarkVersion;
  const scoreUnit =
    method.kind === "benchmark" ? method.scoreUnit : method.qualityScoreUnit;
  const higherIsBetter =
    method.kind === "benchmark"
      ? method.direction === "higher_is_better"
      : method.qualityDirection === "at_least";
  const [run] = await transaction
    .select({
      runId: benchmarkRuns.id,
      versionId: entityVersions.id,
      score: benchmarkRuns.score,
      confidence: benchmarkRuns.confidence,
      evidenceSourceItemId: benchmarkRuns.evidenceSourceItemId,
    })
    .from(entityVersions)
    .innerJoin(
      modelVersionProfiles,
      eq(modelVersionProfiles.entityVersionId, entityVersions.id),
    )
    .innerJoin(
      benchmarkRuns,
      eq(benchmarkRuns.entityVersionId, entityVersions.id),
    )
    .innerJoin(entities, eq(entities.id, benchmarkRuns.benchmarkEntityId))
    .where(
      and(
        eq(entityVersions.entityId, entityId),
        eq(entityVersions.publicId, versionPublicId),
        eq(entityVersions.publicVisibility, true),
        eq(modelVersionProfiles.publicVisibility, true),
        eq(benchmarkRuns.publicId, comparison.benchmarkRunPublicId),
        eq(benchmarkRuns.benchmarkVersion, benchmarkVersion),
        eq(benchmarkRuns.task, method.scenario),
        eq(benchmarkRuns.unit, scoreUnit),
        eq(benchmarkRuns.higherIsBetter, higherIsBetter),
        eq(benchmarkRuns.publicVisibility, true),
        sql`${benchmarkRuns.runAt} <= ${dataCutoff}`,
        sql`${benchmarkRuns.lastVerifiedAt} <= ${dataCutoff}`,
        eq(entities.publicId, benchmarkPublicId),
        eq(entities.type, "benchmark"),
        eq(entities.lifecycleStatus, "active"),
        eq(entities.publicVisibility, true),
        inArray(entities.rightsStatus, [...publicRights]),
      ),
    );
  if (!run) return null;

  const quality = Number(run.score);
  if (
    method.kind === "value" &&
    ((method.qualityDirection === "at_least" &&
      quality < method.qualityThreshold) ||
      (method.qualityDirection === "at_most" &&
        quality > method.qualityThreshold))
  ) {
    return null;
  }

  let score = quality;
  let priceRecordId: string | null = null;
  const evidenceSourceItemIds = [run.evidenceSourceItemId];
  if (method.kind === "value") {
    if (comparison.kind !== "value") return null;
    const [price] = await transaction
      .select({
        id: priceRecords.id,
        amount: priceRecords.amount,
        sourceItemId: priceRecords.sourceItemId,
      })
      .from(priceRecords)
      .where(
        and(
          eq(priceRecords.publicId, comparison.priceRecordPublicId),
          eq(priceRecords.entityVersionId, run.versionId),
          eq(priceRecords.category, method.priceCategory),
          eq(priceRecords.unit, method.priceUnit),
          eq(priceRecords.currency, method.currency),
          eq(priceRecords.region, method.region),
          eq(priceRecords.publicVisibility, true),
          sql`${priceRecords.validFrom} <= ${dataCutoff}`,
          sql`(${priceRecords.validTo} is null or ${priceRecords.validTo} >= ${dataCutoff})`,
          sql`${priceRecords.lastVerifiedAt} <= ${dataCutoff}`,
        ),
      );
    if (!price) return null;
    score = Number(price.amount);
    priceRecordId = price.id;
    evidenceSourceItemIds.push(price.sourceItemId);
  } else if (comparison.kind !== "benchmark") {
    return null;
  }

  const evidenceItems = await transaction
    .select({ publicId: sourceItems.publicId })
    .from(sourceItems)
    .where(
      and(
        inArray(sourceItems.id, evidenceSourceItemIds),
        eq(sourceItems.publicVisibility, true),
        inArray(sourceItems.rightsStatus, [...publicRights]),
      ),
    );
  if (evidenceItems.length !== new Set(evidenceSourceItemIds).size) return null;
  return {
    versionId: run.versionId,
    benchmarkRunId: run.runId,
    priceRecordId,
    score,
    confidence:
      run.confidence >= 80
        ? ("high" as const)
        : run.confidence >= 60
          ? ("medium" as const)
          : ("low" as const),
    evidencePublicIds: evidenceItems.map(({ publicId }) => publicId),
  };
};

export const createRankingDefinitionVersion = async (
  input: RankingDefinitionCreateRequest,
) =>
  database.transaction(async (transaction) => {
    const [existing] = await transaction
      .select({
        id: rankingDefinitions.id,
        kind: rankingDefinitions.kind,
        targetType: rankingDefinitions.targetType,
      })
      .from(rankingDefinitions)
      .where(eq(rankingDefinitions.publicId, input.definitionPublicId))
      .for("update");
    if (
      existing &&
      (existing.kind !== input.method.kind ||
        existing.targetType !== input.targetType)
    ) {
      return { status: "invalid_method" as const };
    }
    const definition =
      existing ??
      (
        await transaction
          .insert(rankingDefinitions)
          .values({
            publicId: input.definitionPublicId,
            targetType: input.targetType,
            kind: input.method.kind,
            publicVisibility: true,
          })
          .returning({ id: rankingDefinitions.id })
      )[0];
    const [latestVersion] = await transaction
      .select({ effectiveAt: rankingDefinitionVersions.effectiveAt })
      .from(rankingDefinitionVersions)
      .where(eq(rankingDefinitionVersions.definitionId, definition.id))
      .orderBy(desc(rankingDefinitionVersions.effectiveAt))
      .limit(1);
    if (
      latestVersion &&
      Date.parse(input.effectiveAt) <= latestVersion.effectiveAt.getTime()
    ) {
      return { status: "invalid_method" as const };
    }
    const [version] = await transaction
      .insert(rankingDefinitionVersions)
      .values({
        definitionId: definition.id,
        methodologyVersion: input.methodologyVersion,
        effectiveAt: new Date(input.effectiveAt),
        eligibility: input.eligibility,
        dimensions: input.dimensions,
        method: input.method,
        publicVisibility: true,
      })
      .returning({ id: rankingDefinitionVersions.id });
    await transaction.insert(rankingDefinitionLocalizedContents).values(
      input.localizations.map((localization) => ({
        rankingDefinitionVersionId: version.id,
        locale: localization.locale,
        title: localization.title,
        question: localization.question,
        eligibilitySummary: localization.eligibilitySummary,
        limitations: localization.limitations,
        authorship: localization.authorship,
        reviewStatus: localization.reviewStatus,
        publicVisibility: true,
      })),
    );
    await transaction.insert(ownerOperationAudits).values({
      actorRole: "owner",
      action: existing
        ? "create_ranking_definition_version"
        : "create_ranking_definition",
      targetType: "ranking_definition",
      targetPublicId: input.definitionPublicId,
      publicVisibility: true,
    });
    return {
      status: existing
        ? ("created_version" as const)
        : ("created_definition" as const),
      definitionPublicId: input.definitionPublicId,
      methodologyVersion: input.methodologyVersion,
    };
  });

const trendingScore = (
  input: RankingObservationCreateRequest["observation"],
  method: Extract<
    ReturnType<typeof rankingMethodSchema.parse>,
    { kind: "trending" }
  >,
  evidence: Map<string, { id: string; sourceId: string }>,
) => {
  const cutoff = Date.parse(input.dataCutoff);
  const eligibleSignals = input.signals.filter(({ origin, observedAt }) => {
    const ageHours = (cutoff - Date.parse(observedAt)) / (60 * 60 * 1000);
    return (
      origin === "independent_publication" &&
      ageHours >= 0 &&
      ageHours <= method.windowHours
    );
  });
  const sourceCount = new Set(
    eligibleSignals.map(
      ({ sourceItemPublicId }) => evidence.get(sourceItemPublicId)!.sourceId,
    ),
  ).size;
  if (
    eligibleSignals.length < method.minimumSignals ||
    sourceCount < method.minimumSources
  ) {
    return null;
  }
  const contributionsBySource = new Map<string, number[]>();
  for (const signal of eligibleSignals) {
    const ageHours =
      (cutoff - Date.parse(signal.observedAt)) / (60 * 60 * 1000);
    const freshness = Math.pow(0.5, ageHours / method.freshnessHalfLifeHours);
    const sourceId = evidence.get(signal.sourceItemPublicId)!.sourceId;
    const contributions = contributionsBySource.get(sourceId) ?? [];
    contributions.push(
      (0.6 * signal.normalizedPercentile + 0.4 * signal.velocity) * freshness,
    );
    contributionsBySource.set(sourceId, contributions);
  }
  const contribution = [...contributionsBySource.values()].reduce(
    (total, sourceContributions) =>
      total +
      sourceContributions.reduce((sum, value) => sum + value, 0) /
        sourceContributions.length,
    0,
  );
  const confidence = { high: 1, medium: 0.8, low: 0.6 }[input.confidence];
  const breadth = Math.min(sourceCount / method.breadthSaturationSources, 1);
  return Number(
    ((contribution / sourceCount) * confidence * breadth).toFixed(8),
  );
};

export const createRankingObservation = async (
  input: RankingObservationCreateRequest,
) =>
  database.transaction(async (transaction) => {
    const [definitionVersion] = await transaction
      .select({
        id: rankingDefinitionVersions.id,
        kind: rankingDefinitions.kind,
        targetType: rankingDefinitions.targetType,
        method: rankingDefinitionVersions.method,
      })
      .from(rankingDefinitionVersions)
      .innerJoin(
        rankingDefinitions,
        eq(rankingDefinitions.id, rankingDefinitionVersions.definitionId),
      )
      .where(
        and(
          eq(rankingDefinitions.publicId, input.definitionPublicId),
          eq(
            rankingDefinitionVersions.methodologyVersion,
            input.methodologyVersion,
          ),
          eq(rankingDefinitions.publicVisibility, true),
          eq(rankingDefinitionVersions.publicVisibility, true),
        ),
      );
    if (
      !definitionVersion ||
      definitionVersion.targetType !== input.observation.target.type
    ) {
      return { status: "invalid_reference" as const };
    }
    const method = rankingMethodSchema.parse(definitionVersion.method);
    const { observation } = input;
    const invalidShape =
      (method.kind === "latest" &&
        (observation.target.versionPublicId !== null ||
          observation.comparison !== null ||
          observation.signals.length !== 0)) ||
      (method.kind === "trending" &&
        (observation.target.versionPublicId !== null ||
          observation.comparison !== null ||
          observation.signals.some(
            ({ observedAt }) =>
              Date.parse(observation.dataCutoff) - Date.parse(observedAt) >
              method.windowHours * 60 * 60 * 1000,
          ))) ||
      (method.kind === "benchmark" &&
        (observation.target.versionPublicId === null ||
          observation.comparison?.kind !== "benchmark" ||
          observation.signals.length !== 0)) ||
      (method.kind === "value" &&
        (observation.target.versionPublicId === null ||
          observation.comparison?.kind !== "value" ||
          observation.signals.length !== 0));
    if (invalidShape) return { status: "invalid_method" as const };
    const target = await resolvePublicTarget(transaction, observation.target);
    if (!target) return { status: "invalid_reference" as const };
    const comparison =
      (method.kind === "benchmark" || method.kind === "value") &&
      target.entityId &&
      observation.target.versionPublicId &&
      observation.comparison
        ? await resolveModelComparison(
            transaction,
            target.entityId,
            observation.target.versionPublicId,
            observation.comparison,
            method,
            new Date(observation.dataCutoff),
          )
        : null;
    if (
      (method.kind === "benchmark" || method.kind === "value") &&
      !comparison
    ) {
      return { status: "invalid_method" as const };
    }
    const evidencePublicIds = [
      ...observation.evidenceSourceItemPublicIds,
      ...observation.signals.map(
        ({ sourceItemPublicId }) => sourceItemPublicId,
      ),
      ...(comparison?.evidencePublicIds ?? []),
    ];
    const evidence = await resolvePublicEvidence(
      transaction,
      evidencePublicIds,
    );
    if (!evidence) {
      return { status: "invalid_reference" as const };
    }
    const candidateTime =
      method.kind === "latest"
        ? await resolveLatestCandidateTime(
            transaction,
            definitionVersion.targetType,
            target,
          )
        : null;
    if (method.kind === "latest" && !candidateTime) {
      return { status: "invalid_reference" as const };
    }
    const score =
      method.kind === "trending"
        ? trendingScore(observation, method, evidence)
        : (comparison?.score ?? null);
    const status =
      method.kind === "trending" && score === null
        ? ("insufficient_evidence" as const)
        : ("active" as const);
    const [created] = await transaction
      .insert(rankingObservations)
      .values({
        publicId: observation.publicId,
        rankingDefinitionVersionId: definitionVersion.id,
        targetEventId: target.eventId,
        targetEntityId: target.entityId,
        targetEntityVersionId: comparison?.versionId ?? null,
        benchmarkRunId: comparison?.benchmarkRunId ?? null,
        priceRecordId: comparison?.priceRecordId ?? null,
        observedAt: new Date(observation.observedAt),
        dataCutoff: new Date(observation.dataCutoff),
        candidateTime,
        score: score?.toString() ?? null,
        rawMetrics: observation.rawMetrics,
        signals: observation.signals,
        confidence: comparison?.confidence ?? observation.confidence,
        status,
        publicVisibility: true,
      })
      .returning({ id: rankingObservations.id });
    await transaction.insert(rankingObservationEvidence).values(
      [...new Set([...evidence.values()].map(({ id }) => id))].map(
        (sourceItemId) => ({
          rankingObservationId: created.id,
          sourceItemId,
        }),
      ),
    );
    await transaction.insert(ownerOperationAudits).values({
      actorRole: "owner",
      action: "create_ranking_observation",
      targetType: "ranking_observation",
      targetPublicId: observation.publicId,
      publicVisibility: true,
    });
    return {
      status,
      observationPublicId: observation.publicId,
      score,
    };
  });

export const createFeaturedSelection = async (
  input: FeaturedSelectionCreateRequest,
) =>
  database.transaction(async (transaction) => {
    const target = await resolvePublicTarget(transaction, input.target);
    const evidence = await resolvePublicEvidence(
      transaction,
      input.evidenceSourceItemPublicIds,
    );
    if (!target || !evidence) {
      return { status: "invalid_reference" as const };
    }
    const [selection] = await transaction
      .insert(featuredSelections)
      .values({
        publicId: input.publicId,
        targetType: input.target.type,
        targetEventId: target.eventId,
        targetEntityId: target.entityId,
        selectedAt: new Date(input.selectedAt),
        reviewDueAt: new Date(input.reviewDueAt),
        editorRole: input.editorRole,
        topic: input.topic,
        commercialRelationship: input.commercialRelationship,
        rankingInfluence: input.rankingInfluence,
        publicVisibility: true,
      })
      .returning({ id: featuredSelections.id });
    await transaction.insert(featuredSelectionLocalizedContents).values(
      input.localizations.map((localization) => ({
        featuredSelectionId: selection.id,
        locale: localization.locale,
        reason: localization.reason,
        audience: localization.audience,
        commercialDisclosure: localization.commercialDisclosure,
        authorship: localization.authorship,
        reviewStatus: localization.reviewStatus,
        publicVisibility: true,
      })),
    );
    await transaction.insert(featuredSelectionEvidence).values(
      [...evidence.values()].map(({ id: sourceItemId }) => ({
        featuredSelectionId: selection.id,
        sourceItemId,
      })),
    );
    await transaction.insert(ownerOperationAudits).values({
      actorRole: "owner",
      action: "create_featured_selection",
      targetType: "featured_selection",
      targetPublicId: input.publicId,
      publicVisibility: true,
    });
    return { status: "created" as const, publicId: input.publicId };
  });

type DefinitionRow = {
  public_id: string;
  target_type: RankingDefinitionCreateRequest["targetType"];
  kind: RankingDefinitionCreateRequest["method"]["kind"];
  methodology_version: string;
  effective_at: Date;
  eligibility: string[];
  dimensions: string[];
  method: unknown;
  title: string;
  question: string;
  eligibility_summary: string;
  limitations: string[];
};

type ObservationRow = {
  public_id: string;
  target_type: RankingDefinitionCreateRequest["targetType"];
  target_public_id: string;
  target_name: string;
  target_version_public_id: string | null;
  target_version_label: string | null;
  benchmark_run_public_id: string | null;
  price_record_public_id: string | null;
  benchmark_run_at: Date | null;
  benchmark_run_settings: Record<
    string,
    string | number | boolean | null
  > | null;
  benchmark_evaluator_public_id: string | null;
  benchmark_evaluator_name: string | null;
  benchmark_run_provenance:
    | "independent_reproduced"
    | "independent_reported"
    | "vendor_reported"
    | "community_observation"
    | null;
  benchmark_run_reproducibility:
    "reproduced" | "reproducible" | "reported_only" | null;
  benchmark_run_last_verified_at: Date | null;
  price_amount: string | null;
  price_category:
    | "input_tokens"
    | "output_tokens"
    | "cached_input_tokens"
    | "cached_output_tokens"
    | "batch_input_tokens"
    | "batch_output_tokens"
    | "image"
    | "audio"
    | "video"
    | null;
  price_currency: string | null;
  price_unit:
    "per_million_tokens" | "per_image" | "per_minute" | "per_second" | null;
  price_region: string | null;
  price_tax_policy: "inclusive" | "exclusive" | "unknown" | null;
  price_valid_from: Date | null;
  price_valid_to: Date | null;
  price_last_verified_at: Date | null;
  observed_at: Date;
  data_cutoff: Date;
  candidate_time: Date | null;
  score: string | null;
  raw_metrics: Record<string, unknown>;
  signals: RankingObservationCreateRequest["observation"]["signals"];
  confidence: "high" | "medium" | "low";
  status: "active" | "insufficient_evidence" | "stale" | "withdrawn";
  evidence: Array<{
    sourceItemPublicId: string;
    title: string;
    url: string;
    rightsStatus: string;
    attribution: string;
    licenseUrl: string | null;
    rightsCheckedAt: string;
  }>;
};

const readDefinitions = async (
  locale: "en" | "zh",
  filters: {
    targetType?: string;
    kind?: string;
    publicId?: string;
    afterPublicId?: string;
    limit: number;
  },
) =>
  databasePool.query<DefinitionRow>(
    `with current_definitions as (
       select distinct on (definition.id)
         definition.public_id, definition.target_type::text,
         definition.kind::text, version.methodology_version,
         version.effective_at, version.eligibility, version.dimensions,
         version.method, localization.title, localization.question,
         localization.eligibility_summary, localization.limitations
       from ranking_definitions definition
       join ranking_definition_versions version on version.definition_id = definition.id
         and version.public_visibility = true
         and version.effective_at <= clock_timestamp()
       join ranking_definition_localized_contents localization
         on localization.ranking_definition_version_id = version.id
         and localization.locale = $1::content_locale
         and localization.review_status = 'reviewed'
         and localization.public_visibility = true
       where definition.public_visibility = true
         and ($2::ranking_target_type is null or definition.target_type = $2)
         and ($3::ranking_kind is null or definition.kind = $3)
         and ($4::text is null or definition.public_id = $4)
         and ($5::text is null or definition.public_id > $5)
       order by definition.id, version.effective_at desc, version.methodology_version desc
     )
     select * from current_definitions
     order by public_id
     limit $6`,
    [
      locale,
      filters.targetType ?? null,
      filters.kind ?? null,
      filters.publicId ?? null,
      filters.afterPublicId ?? null,
      filters.limit,
    ],
  );

const readDefinitionVersion = async (
  publicId: string,
  locale: "en" | "zh",
  methodologyVersion?: string,
) =>
  databasePool.query<DefinitionRow>(
    `select definition.public_id, definition.target_type::text,
       definition.kind::text, version.methodology_version,
       version.effective_at, version.eligibility, version.dimensions,
       version.method, localization.title, localization.question,
       localization.eligibility_summary, localization.limitations
     from ranking_definitions definition
     join ranking_definition_versions version on version.definition_id = definition.id
       and version.public_visibility = true
       and version.effective_at <= clock_timestamp()
     join ranking_definition_localized_contents localization
       on localization.ranking_definition_version_id = version.id
       and localization.locale = $2::content_locale
       and localization.review_status = 'reviewed'
       and localization.public_visibility = true
     where definition.public_id = $1 and definition.public_visibility = true
       and ($3::text is null or version.methodology_version = $3)
     order by version.effective_at desc, version.methodology_version desc
     limit 1`,
    [publicId, locale, methodologyVersion ?? null],
  );

const readObservations = async (
  definitionPublicId: string,
  methodologyVersion: string,
  locale: "en" | "zh",
) => {
  const result = await databasePool.query<ObservationRow>(
    `with current_observations as (
       select distinct on (
         coalesce(
           observation.target_event_id,
           observation.target_entity_version_id,
           observation.target_entity_id
         )
       ) observation.*
       from ranking_observations observation
       join ranking_definition_versions version
         on version.id = observation.ranking_definition_version_id
       join ranking_definitions definition on definition.id = version.definition_id
       where definition.public_id = $1
         and version.methodology_version = $2
         and observation.public_visibility = true
       order by coalesce(
           observation.target_event_id,
           observation.target_entity_version_id,
           observation.target_entity_id
         ),
         observation.observed_at desc, observation.public_id desc
     )
     select observation.public_id, definition.target_type::text,
       coalesce(target_event.public_id, target_entity.public_id) as target_public_id,
       coalesce(event_content.title, entity_content.name) as target_name,
       target_version.public_id as target_version_public_id,
       target_version.version_label as target_version_label,
       target_run.public_id as benchmark_run_public_id,
       target_price.public_id as price_record_public_id,
       target_run.run_at as benchmark_run_at,
       target_run.settings as benchmark_run_settings,
       target_evaluator.public_id as benchmark_evaluator_public_id,
       evaluator_content.name as benchmark_evaluator_name,
       target_run.provenance::text as benchmark_run_provenance,
       target_run.reproducibility::text as benchmark_run_reproducibility,
       target_run.last_verified_at as benchmark_run_last_verified_at,
       target_price.amount::text as price_amount,
       target_price.category::text as price_category,
       target_price.currency as price_currency,
       target_price.unit::text as price_unit,
       target_price.region as price_region,
       target_price.tax_policy::text as price_tax_policy,
       target_price.valid_from as price_valid_from,
       target_price.valid_to as price_valid_to,
       target_price.last_verified_at as price_last_verified_at,
       observation.observed_at, observation.data_cutoff,
       observation.candidate_time, observation.score::text,
       observation.raw_metrics, observation.signals, observation.confidence::text,
       observation.status::text,
       jsonb_agg(jsonb_build_object(
         'sourceItemPublicId', evidence_source.public_id,
         'title', evidence_source.original_title,
         'url', evidence_source.original_url,
         'rightsStatus', evidence_source.rights_status::text,
         'attribution', evidence_source.attribution,
         'licenseUrl', evidence_source.license_url,
         'rightsCheckedAt', to_char(evidence_source.rights_checked_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
       ) order by evidence_source.public_id) as evidence
     from current_observations observation
     join ranking_definition_versions version
       on version.id = observation.ranking_definition_version_id
     join ranking_definitions definition on definition.id = version.definition_id
     left join events target_event on target_event.id = observation.target_event_id
       and target_event.publication_state in ('published', 'corrected')
       and target_event.public_visibility = true
       and target_event.rights_status in (
         'open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'
       )
     left join localized_contents event_content on event_content.event_id = target_event.id
       and event_content.locale = $3::content_locale
       and event_content.review_status = 'reviewed'
       and event_content.public_visibility = true
     left join entities target_entity on target_entity.id = observation.target_entity_id
       and target_entity.type::text = definition.target_type::text
       and target_entity.lifecycle_status = 'active'
       and target_entity.public_visibility = true
       and target_entity.rights_status in (
         'open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'
       )
     left join entity_localized_contents entity_content
       on entity_content.entity_id = target_entity.id
       and entity_content.locale = $3::content_locale
       and entity_content.review_status = 'reviewed'
       and entity_content.public_visibility = true
     left join entity_versions target_version
       on target_version.id = observation.target_entity_version_id
       and target_version.entity_id = target_entity.id
       and target_version.public_visibility = true
     left join benchmark_runs target_run
       on target_run.id = observation.benchmark_run_id
       and target_run.entity_version_id = target_version.id
       and target_run.public_visibility = true
     left join entities target_benchmark
       on target_benchmark.id = target_run.benchmark_entity_id
       and target_benchmark.type = 'benchmark'
       and target_benchmark.lifecycle_status = 'active'
       and target_benchmark.public_visibility = true
       and target_benchmark.rights_status in (
         'open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'
       )
     left join entities target_evaluator
       on target_evaluator.id = target_run.evaluator_entity_id
       and target_evaluator.type = 'organization'
       and target_evaluator.lifecycle_status = 'active'
       and target_evaluator.public_visibility = true
       and target_evaluator.rights_status in (
         'open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'
       )
     left join entity_localized_contents evaluator_content
       on evaluator_content.entity_id = target_evaluator.id
       and evaluator_content.locale = $3::content_locale
       and evaluator_content.review_status = 'reviewed'
       and evaluator_content.public_visibility = true
     left join price_records target_price
       on target_price.id = observation.price_record_id
       and target_price.entity_version_id = target_version.id
       and target_price.public_visibility = true
     join ranking_observation_evidence observation_evidence
       on observation_evidence.ranking_observation_id = observation.id
     join source_items evidence_source
       on evidence_source.id = observation_evidence.source_item_id
       and evidence_source.public_visibility = true
       and evidence_source.rights_status in (
         'open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'
       )
     join sources evidence_parent_source
       on evidence_parent_source.id = evidence_source.source_id
      and evidence_parent_source.access_status in ('approved', 'approved_limited')
     where coalesce(target_event.public_id, target_entity.public_id) is not null
       and (
         observation.benchmark_run_id is null
         or (
           target_run.id is not null
           and target_benchmark.id is not null
           and target_evaluator.id is not null
           and evaluator_content.id is not null
         )
       )
       and (observation.price_record_id is null or target_price.id is not null)
     group by observation.id, observation.public_id, definition.target_type,
       target_event.public_id, target_entity.public_id, event_content.title,
       entity_content.name, target_version.public_id, target_version.version_label,
       target_run.public_id, target_price.public_id, target_run.run_at,
       target_run.settings, target_evaluator.public_id, evaluator_content.name,
       target_run.provenance, target_run.reproducibility,
       target_run.last_verified_at, target_price.amount, target_price.category,
       target_price.currency, target_price.unit, target_price.region,
       target_price.tax_policy, target_price.valid_from, target_price.valid_to,
       target_price.last_verified_at,
       observation.observed_at, observation.data_cutoff,
       observation.candidate_time, observation.score, observation.raw_metrics,
       observation.signals,
       observation.confidence, observation.status
     having count(evidence_source.id) = (
       select count(*) from ranking_observation_evidence all_evidence
       where all_evidence.ranking_observation_id = observation.id
     )`,
    [definitionPublicId, methodologyVersion, locale],
  );
  return result.rows;
};

const publicDefinition = (
  row: DefinitionRow,
  observations: ObservationRow[],
) => ({
  publicId: row.public_id,
  targetType: row.target_type,
  kind: row.kind,
  methodologyVersion: row.methodology_version,
  effectiveAt: row.effective_at.toISOString(),
  title: row.title,
  question: row.question,
  eligibility: row.eligibility,
  eligibilitySummary: row.eligibility_summary,
  dimensions: row.dimensions,
  method: rankingMethodSchema.parse(row.method),
  limitations: row.limitations,
  rankingState: observations.some(({ status }) => status === "active")
    ? ("available" as const)
    : ("insufficient_evidence" as const),
  dataCutoff:
    observations
      .reduce<Date | null>(
        (latest, { data_cutoff }) =>
          !latest || data_cutoff > latest ? data_cutoff : latest,
        null,
      )
      ?.toISOString() ?? null,
});

const rankedObservations = (
  rows: ObservationRow[],
  method: ReturnType<typeof rankingMethodSchema.parse>,
) => {
  const sorted = [...rows].sort((left, right) => {
    if (left.status !== "active") return right.status === "active" ? 1 : 0;
    if (right.status !== "active") return -1;
    if (method.kind === "latest") {
      const confidenceWeight = { high: 3, medium: 2, low: 1 };
      return (
        (right.candidate_time?.getTime() ?? 0) -
          (left.candidate_time?.getTime() ?? 0) ||
        confidenceWeight[right.confidence] -
          confidenceWeight[left.confidence] ||
        left.target_public_id.localeCompare(right.target_public_id)
      );
    }
    const direction =
      method.kind === "value" ||
      (method.kind === "benchmark" && method.direction === "lower_is_better")
        ? 1
        : -1;
    return (
      direction * (Number(left.score) - Number(right.score)) ||
      (left.target_version_public_id ?? left.target_public_id).localeCompare(
        right.target_version_public_id ?? right.target_public_id,
      )
    );
  });
  let rank = 0;
  return sorted.map((row) => ({
    publicId: row.public_id,
    target: {
      type: row.target_type,
      publicId: row.target_public_id,
      name: row.target_name,
      versionPublicId: row.target_version_public_id,
      versionLabel: row.target_version_label,
    },
    observedAt: row.observed_at.toISOString(),
    dataCutoff: row.data_cutoff.toISOString(),
    candidateTime: row.candidate_time?.toISOString() ?? null,
    rank: row.status === "active" ? ++rank : null,
    score: row.score === null ? null : Number(row.score),
    comparison: row.benchmark_run_public_id
      ? {
          benchmarkRunPublicId: row.benchmark_run_public_id,
          priceRecordPublicId: row.price_record_public_id,
          benchmarkRun: {
            runAt: row.benchmark_run_at!.toISOString(),
            evaluator: {
              publicId: row.benchmark_evaluator_public_id!,
              name: row.benchmark_evaluator_name!,
            },
            settings: row.benchmark_run_settings!,
            provenance: row.benchmark_run_provenance!,
            reproducibility: row.benchmark_run_reproducibility!,
            lastVerifiedAt: row.benchmark_run_last_verified_at!.toISOString(),
          },
          priceRecord: row.price_record_public_id
            ? {
                amount: row.price_amount!,
                category: row.price_category!,
                currency: row.price_currency!,
                unit: row.price_unit!,
                region: row.price_region!,
                taxPolicy: row.price_tax_policy!,
                validFrom: row.price_valid_from!.toISOString(),
                validTo: row.price_valid_to?.toISOString() ?? null,
                lastVerifiedAt: row.price_last_verified_at!.toISOString(),
                costBasis:
                  method.kind === "value"
                    ? method.costBasis
                    : "hosted_api_list_price",
                exchangeRatePolicy:
                  method.kind === "value"
                    ? method.exchangeRatePolicy
                    : "no_conversion",
                selfDeploymentAssumptions:
                  method.kind === "value"
                    ? method.selfDeploymentAssumptions
                    : null,
              }
            : null,
        }
      : null,
    rawMetrics: row.raw_metrics,
    signals: row.signals,
    confidence: row.confidence,
    status: row.status,
    evidence: row.evidence,
  }));
};

const readFeatured = async (
  locale: "en" | "zh",
  limit: number,
  targetType?: string,
) =>
  databasePool.query<{
    public_id: string;
    target_type: FeaturedSelectionCreateRequest["target"]["type"];
    target_public_id: string;
    target_name: string;
    selected_at: Date;
    review_due_at: Date;
    editor_role: string;
    topic: string;
    commercial_relationship: FeaturedSelectionCreateRequest["commercialRelationship"];
    ranking_influence: false;
    reason: string;
    audience: string;
    commercial_disclosure: string;
    evidence: Array<{
      sourceItemPublicId: string;
      title: string;
      url: string;
      rightsStatus: string;
      attribution: string;
      licenseUrl: string | null;
      rightsCheckedAt: string;
    }>;
  }>(
    `select selection.public_id, selection.target_type::text,
       coalesce(target_event.public_id, target_entity.public_id) as target_public_id,
       coalesce(event_content.title, entity_content.name) as target_name,
       selection.selected_at, selection.review_due_at, selection.editor_role,
       selection.topic, selection.commercial_relationship::text,
       selection.ranking_influence, localization.reason, localization.audience,
       localization.commercial_disclosure,
       jsonb_agg(jsonb_build_object(
         'sourceItemPublicId', evidence_source.public_id,
         'title', evidence_source.original_title,
         'url', evidence_source.original_url,
         'rightsStatus', evidence_source.rights_status::text,
         'attribution', evidence_source.attribution,
         'licenseUrl', evidence_source.license_url,
         'rightsCheckedAt', to_char(evidence_source.rights_checked_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
       ) order by evidence_source.public_id) as evidence
     from featured_selections selection
     join featured_selection_localized_contents localization
       on localization.featured_selection_id = selection.id
       and localization.locale = $1::content_locale
       and localization.review_status = 'reviewed'
       and localization.public_visibility = true
     left join events target_event on target_event.id = selection.target_event_id
       and target_event.publication_state in ('published', 'corrected')
       and target_event.public_visibility = true
       and target_event.rights_status in (
         'open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'
       )
     left join localized_contents event_content on event_content.event_id = target_event.id
       and event_content.locale = $1::content_locale
       and event_content.review_status = 'reviewed'
       and event_content.public_visibility = true
     left join entities target_entity on target_entity.id = selection.target_entity_id
       and target_entity.type::text = selection.target_type::text
       and target_entity.lifecycle_status = 'active'
       and target_entity.public_visibility = true
       and target_entity.rights_status in (
         'open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'
       )
     left join entity_localized_contents entity_content
       on entity_content.entity_id = target_entity.id
       and entity_content.locale = $1::content_locale
       and entity_content.review_status = 'reviewed'
       and entity_content.public_visibility = true
     join featured_selection_evidence selection_evidence
       on selection_evidence.featured_selection_id = selection.id
     join source_items evidence_source on evidence_source.id = selection_evidence.source_item_id
       and evidence_source.public_visibility = true
       and evidence_source.rights_status in (
         'open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'
       )
     join sources evidence_parent_source
       on evidence_parent_source.id = evidence_source.source_id
      and evidence_parent_source.access_status in ('approved', 'approved_limited')
     where selection.public_visibility = true
       and selection.review_due_at > clock_timestamp()
       and ($2::ranking_target_type is null or selection.target_type = $2)
       and coalesce(target_event.public_id, target_entity.public_id) is not null
     group by selection.id, selection.public_id, selection.target_type,
       target_event.public_id, target_entity.public_id, event_content.title,
       entity_content.name, localization.reason, localization.audience,
       localization.commercial_disclosure
     having count(evidence_source.id) = (
       select count(*) from featured_selection_evidence all_evidence
       where all_evidence.featured_selection_id = selection.id
     )
     order by selection.selected_at desc, selection.public_id
     limit $3`,
    [locale, targetType ?? null, limit],
  );

export const listPublicRankings = async (
  input: RankingListRequest,
  afterPublicId?: string,
) => {
  const definitions = await readDefinitions(input.locale, {
    ...input,
    afterPublicId,
  });
  const publicDefinitions = await Promise.all(
    definitions.rows.map(async (row) => {
      const observations = await readObservations(
        row.public_id,
        row.methodology_version,
        input.locale,
      );
      return publicDefinition(row, observations);
    }),
  );
  const featured = await readFeatured(
    input.locale,
    input.limit,
    input.targetType,
  );
  return publicRankingListSchema.parse({
    locale: input.locale,
    definitions: publicDefinitions,
    featured: featured.rows.map((row) => ({
      publicId: row.public_id,
      target: {
        type: row.target_type,
        publicId: row.target_public_id,
        name: row.target_name,
      },
      selectedAt: row.selected_at.toISOString(),
      reviewDueAt: row.review_due_at.toISOString(),
      editorRole: row.editor_role,
      topic: row.topic,
      reason: row.reason,
      audience: row.audience,
      commercialRelationship: row.commercial_relationship,
      commercialDisclosure: row.commercial_disclosure,
      rankingInfluence: row.ranking_influence,
      evidence: row.evidence,
    })),
  });
};

export const getPublicRanking = async (
  publicId: string,
  input: RankingDetailRequest,
) => {
  const definition = await readDefinitionVersion(
    publicId,
    input.locale,
    input.methodologyVersion,
  );
  const row = definition.rows[0];
  if (!row) return null;
  const observations = await readObservations(
    row.public_id,
    row.methodology_version,
    input.locale,
  );
  return publicRankingDetailSchema.parse({
    locale: input.locale,
    definition: publicDefinition(row, observations),
    observations: rankedObservations(
      observations,
      rankingMethodSchema.parse(row.method),
    ),
  });
};
