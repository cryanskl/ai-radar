import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { database } from "@/db/client";
import { selectRepresentativeSource } from "@/events/representative-source";
import {
  correctionChanges,
  correctionEvidence,
  corrections,
  editorialCases,
  entities,
  entityAliases,
  entityLocalizedContents,
  entityMergeAliasMoves,
  entityMergeRelationMoves,
  entityMerges,
  entityMergeVersionMoves,
  entityVersions,
  events,
  eventSources,
  localizedContents,
  ownerOperationAudits,
  relationEvidence,
  relations,
  rightsDecisions,
  sourceItems,
  sources,
  tombstones,
} from "@/db/schema";
import type {
  CorrectionCreateRequest,
  EditorialCaseReviewRequest,
  EditorialCaseTransitionRequest,
  EntityCorrectionCreateRequest,
  EntityMergeRequest,
  EventCorrectionCreateRequest,
  RightsDecisionCreateRequest,
} from "./contracts";
import {
  refreshEntitySearchIndex,
  refreshEventSearchIndex,
} from "@/search/indexer";

const publicRights = [
  "open",
  "attribution_required",
  "source_license",
  "metadata_only",
  "link_only",
] as const;

type Change = {
  field: string;
  previousValue: string;
  correctedValue: string;
};

type Transaction = Parameters<Parameters<typeof database.transaction>[0]>[0];

const actionEditorialCase = async (
  transaction: Transaction,
  input: CorrectionCreateRequest | RightsDecisionCreateRequest,
  targetIds: {
    targetEventId?: string;
    targetEntityId?: string;
    targetSourceItemId?: string;
  },
  kind: "correction" | "rights",
  decision: "corrected" | "withdrawn",
  previousRightsStatus: (typeof events.$inferSelect)["rightsStatus"],
) => {
  const decidedAt = new Date(input.effectiveAt);
  if ("receivedAt" in input.case) {
    const [editorialCase] = await transaction
      .insert(editorialCases)
      .values({
        publicId: input.case.publicId,
        kind,
        targetType: input.target.type,
        targetPublicId: input.target.publicId,
        ...targetIds,
        receivedAt: new Date(input.case.receivedAt),
        originalRequest: input.case.originalRequest,
        evidenceSummary: input.case.evidenceSummary,
        status: "actioned",
        decision,
        decidedAt,
        previousRightsStatus,
        actorRole: "owner",
        updatedAt: decidedAt,
      })
      .returning({
        id: editorialCases.id,
        publicId: editorialCases.publicId,
        previousRightsStatus: editorialCases.previousRightsStatus,
      });
    return editorialCase;
  }
  const [editorialCase] = await transaction
    .select()
    .from(editorialCases)
    .where(eq(editorialCases.publicId, input.case.publicId))
    .for("update");
  if (
    !editorialCase ||
    editorialCase.kind !== kind ||
    editorialCase.targetType !== input.target.type ||
    editorialCase.targetPublicId !== input.target.publicId ||
    editorialCase.status !== "reviewing" ||
    decidedAt < editorialCase.receivedAt
  ) {
    return null;
  }
  await transaction
    .update(editorialCases)
    .set({ status: "actioned", decision, decidedAt, updatedAt: decidedAt })
    .where(eq(editorialCases.id, editorialCase.id));
  return {
    id: editorialCase.id,
    publicId: editorialCase.publicId,
    previousRightsStatus: editorialCase.previousRightsStatus,
  };
};

const publicCorrectionDetails = async (
  correction: typeof corrections.$inferSelect,
) => {
  const [changes, evidence] = await Promise.all([
    database
      .select({
        field: correctionChanges.field,
        previousValue: correctionChanges.previousValue,
        correctedValue: correctionChanges.correctedValue,
      })
      .from(correctionChanges)
      .where(eq(correctionChanges.correctionId, correction.id))
      .orderBy(correctionChanges.field),
    database
      .select({
        sourceItemPublicId: sourceItems.publicId,
        originalTitle: sourceItems.originalTitle,
        originalUrl: sourceItems.originalUrl,
        rightsStatus: sourceItems.rightsStatus,
        attribution: sourceItems.attribution,
        licenseUrl: sourceItems.licenseUrl,
        rightsCheckedAt: sourceItems.rightsCheckedAt,
      })
      .from(correctionEvidence)
      .innerJoin(
        sourceItems,
        and(
          eq(sourceItems.id, correctionEvidence.sourceItemId),
          eq(sourceItems.publicVisibility, true),
          inArray(sourceItems.rightsStatus, [...publicRights]),
        ),
      )
      .innerJoin(
        sources,
        and(
          eq(sources.id, sourceItems.sourceId),
          inArray(sources.accessStatus, ["approved", "approved_limited"]),
        ),
      )
      .where(eq(correctionEvidence.correctionId, correction.id))
      .orderBy(sourceItems.publicId),
  ]);
  const [{ count: evidenceCount }] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(correctionEvidence)
    .where(eq(correctionEvidence.correctionId, correction.id));
  if (evidence.length !== evidenceCount) return null;
  return {
    publicId: correction.publicId,
    targetType: correction.targetType,
    targetPublicId: correction.targetPublicId,
    casePublicId: (
      await database
        .select({ publicId: editorialCases.publicId })
        .from(editorialCases)
        .where(eq(editorialCases.id, correction.caseId))
    )[0].publicId,
    reasonCode: correction.reasonCode,
    changes,
    evidence: evidence.map(({ rightsCheckedAt, ...item }) => ({
      ...item,
      rightsCheckedAt: rightsCheckedAt.toISOString(),
    })),
    effectiveAt: correction.effectiveAt.toISOString(),
    lastVerifiedAt: correction.effectiveAt.toISOString(),
    replacementVersion: correction.replacementVersion,
  };
};

export const getPublicCorrection = async (publicId: string) => {
  const [correction] = await database
    .select()
    .from(corrections)
    .where(eq(corrections.publicId, publicId));
  if (!correction) return null;
  const [target] =
    correction.targetType === "event"
      ? await database
          .select({
            publicVisibility: events.publicVisibility,
            rightsStatus: events.rightsStatus,
          })
          .from(events)
          .where(eq(events.id, correction.targetEventId!))
      : await database
          .select({
            publicVisibility: entities.publicVisibility,
            rightsStatus: entities.rightsStatus,
          })
          .from(entities)
          .where(eq(entities.id, correction.targetEntityId!));
  if (
    !target.publicVisibility ||
    !publicRights.includes(target.rightsStatus as (typeof publicRights)[number])
  ) {
    return {
      publicId: correction.publicId,
      targetType: correction.targetType,
      targetPublicId: correction.targetPublicId,
      casePublicId: (
        await database
          .select({ publicId: editorialCases.publicId })
          .from(editorialCases)
          .where(eq(editorialCases.id, correction.caseId))
      )[0].publicId,
      reasonCode: correction.reasonCode,
      status: "redacted_due_to_rights" as const,
      effectiveAt: correction.effectiveAt.toISOString(),
      lastVerifiedAt: correction.effectiveAt.toISOString(),
      replacementVersion: correction.replacementVersion,
    };
  }
  const details = await publicCorrectionDetails(correction);
  return (
    details ?? {
      publicId: correction.publicId,
      targetType: correction.targetType,
      targetPublicId: correction.targetPublicId,
      casePublicId: (
        await database
          .select({ publicId: editorialCases.publicId })
          .from(editorialCases)
          .where(eq(editorialCases.id, correction.caseId))
      )[0].publicId,
      reasonCode: correction.reasonCode,
      status: "redacted_due_to_rights" as const,
      effectiveAt: correction.effectiveAt.toISOString(),
      lastVerifiedAt: correction.effectiveAt.toISOString(),
      replacementVersion: correction.replacementVersion,
    }
  );
};

export const getPublicCorrectionsForEvent = async (eventPublicId: string) => {
  const records = await database
    .select({ correction: corrections })
    .from(corrections)
    .innerJoin(events, eq(events.id, corrections.targetEventId))
    .where(eq(events.publicId, eventPublicId))
    .orderBy(corrections.effectiveAt, corrections.publicId);
  const publicCorrections = await Promise.all(
    records.map(({ correction }) => publicCorrectionDetails(correction)),
  );
  return publicCorrections.filter((correction) => correction !== null);
};

export const getPublicCorrectionsForEntity = async (entityId: string) => {
  const records = await database
    .select()
    .from(corrections)
    .where(eq(corrections.targetEntityId, entityId))
    .orderBy(corrections.effectiveAt, corrections.publicId);
  const publicCorrections = await Promise.all(
    records.map(publicCorrectionDetails),
  );
  return publicCorrections.filter((correction) => correction !== null);
};

export const getPublicRightsDecisionsForEvent = async (
  eventPublicId: string,
) => {
  const records = await database
    .select({
      publicId: rightsDecisions.publicId,
      casePublicId: editorialCases.publicId,
      targetType: rightsDecisions.targetType,
      targetPublicId: rightsDecisions.targetPublicId,
      fromStatus: rightsDecisions.fromStatus,
      toStatus: rightsDecisions.toStatus,
      reasonCode: rightsDecisions.publicReasonCode,
      effectiveAt: rightsDecisions.effectiveAt,
    })
    .from(rightsDecisions)
    .innerJoin(editorialCases, eq(editorialCases.id, rightsDecisions.caseId))
    .leftJoin(
      eventSources,
      eq(eventSources.sourceItemId, rightsDecisions.targetSourceItemId),
    )
    .innerJoin(
      events,
      or(
        eq(events.id, rightsDecisions.targetEventId),
        eq(events.id, eventSources.eventId),
      ),
    )
    .where(eq(events.publicId, eventPublicId))
    .orderBy(rightsDecisions.effectiveAt, rightsDecisions.publicId);
  return records.map((record) => ({
    ...record,
    toStatus: "withdrawn" as const,
    effectiveAt: record.effectiveAt.toISOString(),
  }));
};

const insertCorrection = async (
  transaction: Transaction,
  input: CorrectionCreateRequest,
  targetIds: { targetEventId?: string; targetEntityId?: string },
  changes: Change[],
  evidence: Array<{ id: string }>,
  caseId: string,
) => {
  const [correction] = await transaction
    .insert(corrections)
    .values({
      publicId: input.publicId,
      caseId,
      targetType: input.target.type,
      targetPublicId: input.target.publicId,
      ...targetIds,
      reasonCode: input.reasonCode,
      effectiveAt: new Date(input.effectiveAt),
      replacementVersion: input.replacementVersion,
      internalNote: input.internalNote,
      actorRole: "owner",
    })
    .returning({ id: corrections.id });
  await transaction
    .insert(correctionChanges)
    .values(
      changes.map((change) => ({ correctionId: correction.id, ...change })),
    );
  await transaction.insert(correctionEvidence).values(
    evidence.map(({ id }) => ({
      correctionId: correction.id,
      sourceItemId: id,
    })),
  );
};

export const createCorrection = async (input: CorrectionCreateRequest) =>
  database.transaction(async (transaction) => {
    if (input.target.type === "event") {
      const eventInput = input as EventCorrectionCreateRequest;
      const [event] = await transaction
        .select()
        .from(events)
        .where(eq(events.publicId, input.target.publicId))
        .for("update");
      if (!event) return { status: "not_found" as const };
      const resolvingReview =
        event.publicationState === "updating" &&
        event.rightsStatus === "internal_only" &&
        !event.publicVisibility;
      if (
        !resolvingReview &&
        (event.publicationState !== "published" || !event.publicVisibility)
      ) {
        return { status: "not_correctable" as const };
      }
      if (new Date(input.effectiveAt) < event.lastVerifiedAt) {
        return { status: "not_correctable" as const };
      }
      const linkedEvidence = await transaction
        .select({ id: sourceItems.id })
        .from(eventSources)
        .innerJoin(sourceItems, eq(sourceItems.id, eventSources.sourceItemId))
        .where(
          and(
            eq(eventSources.eventId, event.id),
            inArray(sourceItems.publicId, input.evidenceSourceItemPublicIds),
            eq(sourceItems.publicVisibility, true),
          ),
        )
        .orderBy(sourceItems.id)
        .for("update", { of: sourceItems });
      if (linkedEvidence.length !== input.evidenceSourceItemPublicIds.length) {
        return { status: "not_correctable" as const };
      }

      const requestedLocalizations = eventInput.changes.localizations ?? [];
      const currentLocalizations =
        requestedLocalizations.length === 0
          ? []
          : await transaction
              .select({
                locale: localizedContents.locale,
                title: localizedContents.title,
                summary: localizedContents.summary,
              })
              .from(localizedContents)
              .where(
                and(
                  eq(localizedContents.eventId, event.id),
                  inArray(
                    localizedContents.locale,
                    requestedLocalizations.map(({ locale }) => locale),
                  ),
                ),
              );
      if (currentLocalizations.length !== requestedLocalizations.length) {
        return { status: "not_correctable" as const };
      }
      const localizationByLocale = new Map(
        currentLocalizations.map((localization) => [
          localization.locale,
          localization,
        ]),
      );
      const changes: Change[] = [];
      if (
        eventInput.changes.occurredAt &&
        eventInput.changes.occurredAtPrecision
      ) {
        const correctedOccurredAt = new Date(eventInput.changes.occurredAt);
        changes.push(
          {
            field: "event.occurredAt",
            previousValue: event.occurredAt.toISOString(),
            correctedValue: correctedOccurredAt.toISOString(),
          },
          {
            field: "event.occurredAtPrecision",
            previousValue: event.occurredAtPrecision,
            correctedValue: eventInput.changes.occurredAtPrecision,
          },
        );
      }
      for (const localization of requestedLocalizations) {
        const current = localizationByLocale.get(localization.locale)!;
        changes.push(
          {
            field: `localization.${localization.locale}.title`,
            previousValue: current.title,
            correctedValue: localization.title,
          },
          {
            field: `localization.${localization.locale}.summary`,
            previousValue: current.summary,
            correctedValue: localization.summary,
          },
        );
      }
      const effectiveChanges = changes.filter(
        ({ previousValue, correctedValue }) => previousValue !== correctedValue,
      );
      if (effectiveChanges.length === 0) {
        return { status: "not_correctable" as const };
      }
      const editorialCase = await actionEditorialCase(
        transaction,
        input,
        { targetEventId: event.id },
        "correction",
        "corrected",
        event.rightsStatus,
      );
      if (!editorialCase) return { status: "not_correctable" as const };
      if (
        eventInput.changes.occurredAt &&
        eventInput.changes.occurredAtPrecision
      ) {
        await transaction
          .update(events)
          .set({
            occurredAt: new Date(eventInput.changes.occurredAt),
            occurredAtPrecision: eventInput.changes.occurredAtPrecision,
          })
          .where(eq(events.id, event.id));
      }
      for (const localization of requestedLocalizations) {
        await transaction
          .update(localizedContents)
          .set({
            title: localization.title,
            summary: localization.summary,
            updatedAt: new Date(input.effectiveAt),
          })
          .where(
            and(
              eq(localizedContents.eventId, event.id),
              eq(localizedContents.locale, localization.locale),
            ),
          );
      }
      await transaction
        .update(events)
        .set({
          factStatus: "corrected",
          publicationState: "published",
          publicVisibility: true,
          rightsStatus: editorialCase.previousRightsStatus,
          lastVerifiedAt: new Date(input.effectiveAt),
          updatedAt: new Date(input.effectiveAt),
        })
        .where(eq(events.id, event.id));
      await insertCorrection(
        transaction,
        eventInput,
        { targetEventId: event.id },
        effectiveChanges,
        linkedEvidence,
        editorialCase.id,
      );
      if (resolvingReview) {
        await transaction
          .update(localizedContents)
          .set({
            publicVisibility: true,
            updatedAt: new Date(input.effectiveAt),
          })
          .where(eq(localizedContents.eventId, event.id));
        await transaction
          .update(tombstones)
          .set({ clearedAt: new Date(input.effectiveAt) })
          .where(
            and(
              eq(tombstones.objectType, "event"),
              eq(tombstones.objectPublicId, event.publicId),
              eq(tombstones.status, "reviewing"),
              isNull(tombstones.clearedAt),
            ),
          );
      }
      await transaction.insert(ownerOperationAudits).values({
        actorRole: "owner",
        action: "correct_event",
        targetType: "event",
        targetPublicId: event.publicId,
        publicVisibility: true,
        createdAt: new Date(input.effectiveAt),
      });
      await refreshEventSearchIndex(transaction, event.id);
      return {
        status: "corrected" as const,
        publicId: input.publicId,
        casePublicId: editorialCase.publicId,
        targetPublicId: event.publicId,
        changedFields: effectiveChanges.map(({ field }) => field),
      };
    }

    const entityInput = input as EntityCorrectionCreateRequest;
    const [entity] = await transaction
      .select()
      .from(entities)
      .where(eq(entities.publicId, input.target.publicId))
      .for("update");
    if (!entity) return { status: "not_found" as const };
    const resolvingReview =
      entity.lifecycleStatus === "active" &&
      entity.rightsStatus === "internal_only" &&
      !entity.publicVisibility;
    if (
      !resolvingReview &&
      (entity.lifecycleStatus !== "active" || !entity.publicVisibility)
    ) {
      return { status: "not_correctable" as const };
    }
    if (new Date(input.effectiveAt) < entity.lastVerifiedAt) {
      return { status: "not_correctable" as const };
    }
    const evidence = await transaction
      .select({ id: sourceItems.id })
      .from(sourceItems)
      .where(
        and(
          inArray(sourceItems.publicId, input.evidenceSourceItemPublicIds),
          eq(sourceItems.publicVisibility, true),
        ),
      )
      .orderBy(sourceItems.id)
      .for("update");
    if (evidence.length !== input.evidenceSourceItemPublicIds.length) {
      return { status: "not_correctable" as const };
    }
    const requestedLocalizations = entityInput.changes.localizations ?? [];
    const currentLocalizations =
      requestedLocalizations.length === 0
        ? []
        : await transaction
            .select({
              locale: entityLocalizedContents.locale,
              name: entityLocalizedContents.name,
              summary: entityLocalizedContents.summary,
            })
            .from(entityLocalizedContents)
            .where(
              and(
                eq(entityLocalizedContents.entityId, entity.id),
                inArray(
                  entityLocalizedContents.locale,
                  requestedLocalizations.map(({ locale }) => locale),
                ),
              ),
            );
    if (currentLocalizations.length !== requestedLocalizations.length) {
      return { status: "not_correctable" as const };
    }
    const localizationByLocale = new Map(
      currentLocalizations.map((localization) => [
        localization.locale,
        localization,
      ]),
    );
    const changes: Change[] = [];
    if (entityInput.changes.officialName !== undefined) {
      changes.push({
        field: "entity.officialName",
        previousValue: entity.officialName,
        correctedValue: entityInput.changes.officialName,
      });
    }
    if (entityInput.changes.officialUrl !== undefined) {
      changes.push({
        field: "entity.officialUrl",
        previousValue: entity.officialUrl,
        correctedValue: entityInput.changes.officialUrl,
      });
    }
    changes.push({
      field: "entity.lastVerifiedAt",
      previousValue: entity.lastVerifiedAt.toISOString(),
      correctedValue: new Date(
        entityInput.changes.lastVerifiedAt,
      ).toISOString(),
    });
    for (const localization of requestedLocalizations) {
      const current = localizationByLocale.get(localization.locale)!;
      changes.push(
        {
          field: `localization.${localization.locale}.name`,
          previousValue: current.name,
          correctedValue: localization.name,
        },
        {
          field: `localization.${localization.locale}.summary`,
          previousValue: current.summary,
          correctedValue: localization.summary,
        },
      );
    }
    const effectiveChanges = changes.filter(
      ({ previousValue, correctedValue }) => previousValue !== correctedValue,
    );
    if (effectiveChanges.length === 0) {
      return { status: "not_correctable" as const };
    }
    const editorialCase = await actionEditorialCase(
      transaction,
      input,
      { targetEntityId: entity.id },
      "correction",
      "corrected",
      entity.rightsStatus,
    );
    if (!editorialCase) return { status: "not_correctable" as const };
    for (const localization of requestedLocalizations) {
      await transaction
        .update(entityLocalizedContents)
        .set({
          name: localization.name,
          summary: localization.summary,
          updatedAt: new Date(input.effectiveAt),
        })
        .where(
          and(
            eq(entityLocalizedContents.entityId, entity.id),
            eq(entityLocalizedContents.locale, localization.locale),
          ),
        );
    }
    await transaction
      .update(entities)
      .set({
        officialName: entityInput.changes.officialName ?? entity.officialName,
        officialUrl: entityInput.changes.officialUrl ?? entity.officialUrl,
        publicVisibility: true,
        rightsStatus: editorialCase.previousRightsStatus,
        lastVerifiedAt: new Date(entityInput.changes.lastVerifiedAt),
        updatedAt: new Date(input.effectiveAt),
      })
      .where(eq(entities.id, entity.id));
    await insertCorrection(
      transaction,
      entityInput,
      { targetEntityId: entity.id },
      effectiveChanges,
      evidence,
      editorialCase.id,
    );
    if (resolvingReview) {
      await transaction
        .update(entityLocalizedContents)
        .set({ publicVisibility: true, updatedAt: new Date(input.effectiveAt) })
        .where(eq(entityLocalizedContents.entityId, entity.id));
      await transaction
        .update(tombstones)
        .set({ clearedAt: new Date(input.effectiveAt) })
        .where(
          and(
            eq(tombstones.objectType, "entity"),
            eq(tombstones.objectPublicId, entity.publicId),
            eq(tombstones.status, "reviewing"),
            isNull(tombstones.clearedAt),
          ),
        );
    }
    await transaction.insert(ownerOperationAudits).values({
      actorRole: "owner",
      action: "correct_entity",
      targetType: "entity",
      targetPublicId: entity.publicId,
      publicVisibility: true,
      createdAt: new Date(input.effectiveAt),
    });
    await refreshEntitySearchIndex(transaction, entity.id);
    return {
      status: "corrected" as const,
      publicId: input.publicId,
      casePublicId: editorialCase.publicId,
      targetPublicId: entity.publicId,
      changedFields: effectiveChanges.map(({ field }) => field),
    };
  });

export const mergeEntities = async (input: EntityMergeRequest) =>
  database.transaction(async (transaction) => {
    const references = await transaction
      .select({ id: entities.id })
      .from(entities)
      .where(
        inArray(entities.publicId, [
          input.sourceEntityPublicId,
          input.targetEntityPublicId,
        ]),
      );
    if (references.length !== 2) return { status: "not_found" as const };
    const locked = await transaction
      .select()
      .from(entities)
      .where(
        inArray(
          entities.id,
          references.map(({ id }) => id),
        ),
      )
      .orderBy(entities.id)
      .for("update");
    const source = locked.find(
      ({ publicId }) => publicId === input.sourceEntityPublicId,
    );
    const target = locked.find(
      ({ publicId }) => publicId === input.targetEntityPublicId,
    );
    if (!source || !target) return { status: "not_found" as const };
    if (
      source.lifecycleStatus !== "active" ||
      target.lifecycleStatus !== "active" ||
      !source.publicVisibility ||
      !target.publicVisibility ||
      source.type !== target.type
    ) {
      return { status: "not_mergeable" as const };
    }
    const effectiveAt = new Date(input.effectiveAt);
    if (
      effectiveAt < source.lastVerifiedAt ||
      effectiveAt < target.lastVerifiedAt
    ) {
      return { status: "not_mergeable" as const };
    }

    const sourceAliases = await transaction
      .select()
      .from(entityAliases)
      .where(eq(entityAliases.entityId, source.id));
    const targetAliases = await transaction
      .select()
      .from(entityAliases)
      .where(eq(entityAliases.entityId, target.id));
    const sourceVersions = await transaction
      .select()
      .from(entityVersions)
      .where(eq(entityVersions.entityId, source.id));
    const targetVersions = await transaction
      .select()
      .from(entityVersions)
      .where(eq(entityVersions.entityId, target.id));
    const targetAliasKeys = new Set(
      targetAliases.map(
        ({ locale, normalizedValue }) => `${locale}:${normalizedValue}`,
      ),
    );
    const targetVersionLabels = new Set(
      targetVersions.map(({ versionLabel }) => versionLabel),
    );
    if (
      sourceAliases.some(({ locale, normalizedValue }) =>
        targetAliasKeys.has(`${locale}:${normalizedValue}`),
      ) ||
      sourceVersions.some(({ versionLabel }) =>
        targetVersionLabels.has(versionLabel),
      )
    ) {
      return { status: "not_mergeable" as const };
    }

    const [merge] = await transaction
      .insert(entityMerges)
      .values({
        sourceEntityId: source.id,
        targetEntityId: target.id,
        publicReasonCode: input.publicReasonCode,
        internalNote: input.internalNote,
        effectiveAt,
        actorRole: "owner",
      })
      .returning({ id: entityMerges.id });
    if (sourceAliases.length > 0) {
      await transaction.insert(entityMergeAliasMoves).values(
        sourceAliases.map(({ id }) => ({
          entityMergeId: merge.id,
          aliasId: id,
        })),
      );
      await transaction
        .update(entityAliases)
        .set({ entityId: target.id })
        .where(eq(entityAliases.entityId, source.id));
    }
    if (sourceVersions.length > 0) {
      await transaction.insert(entityMergeVersionMoves).values(
        sourceVersions.map(({ id }) => ({
          entityMergeId: merge.id,
          versionId: id,
        })),
      );
      await transaction
        .update(entityVersions)
        .set({ entityId: target.id })
        .where(eq(entityVersions.entityId, source.id));
    }
    const relationRows = await transaction
      .select({
        id: relations.id,
        subjectEntityId: relations.subjectEntityId,
        objectEntityId: relations.objectEntityId,
      })
      .from(relations)
      .where(
        or(
          eq(relations.subjectEntityId, source.id),
          eq(relations.objectEntityId, source.id),
        ),
      );
    const relationMoves = relationRows.flatMap((relation) => [
      ...(relation.subjectEntityId === source.id
        ? [{ relationId: relation.id, role: "subject" as const }]
        : []),
      ...(relation.objectEntityId === source.id
        ? [{ relationId: relation.id, role: "object" as const }]
        : []),
    ]);
    if (relationMoves.length > 0) {
      await transaction
        .insert(entityMergeRelationMoves)
        .values(
          relationMoves.map((move) => ({ entityMergeId: merge.id, ...move })),
        );
      await transaction
        .update(relations)
        .set({ subjectEntityId: target.id })
        .where(eq(relations.subjectEntityId, source.id));
      await transaction
        .update(relations)
        .set({ objectEntityId: target.id })
        .where(eq(relations.objectEntityId, source.id));
    }
    await transaction
      .update(corrections)
      .set({ targetEntityId: target.id })
      .where(eq(corrections.targetEntityId, source.id));
    await transaction
      .update(entities)
      .set({
        lifecycleStatus: "merged",
        publicVisibility: false,
        updatedAt: effectiveAt,
      })
      .where(eq(entities.id, source.id));
    await transaction
      .update(entityLocalizedContents)
      .set({ publicVisibility: false, updatedAt: effectiveAt })
      .where(eq(entityLocalizedContents.entityId, source.id));
    await transaction.insert(tombstones).values({
      objectPublicId: source.publicId,
      objectType: "entity",
      status: "merged_into",
      publicReasonCode: "duplicate_identity",
      replacementPublicId: target.publicId,
      effectiveAt,
      entityMergeId: merge.id,
    });
    await transaction.insert(ownerOperationAudits).values({
      actorRole: "owner",
      action: "merge_entity",
      targetType: "entity",
      targetPublicId: source.publicId,
      publicVisibility: false,
      createdAt: effectiveAt,
    });
    await refreshEntitySearchIndex(transaction, source.id);
    await refreshEntitySearchIndex(transaction, target.id);
    return {
      status: "merged" as const,
      sourceEntityPublicId: source.publicId,
      targetEntityPublicId: target.publicId,
    };
  });

export const restrictEditorialCaseForReview = async (
  input: EditorialCaseReviewRequest,
) =>
  database.transaction(async (transaction) => {
    const restrictedAt = new Date(input.case.receivedAt);
    if (input.target.type === "event") {
      const [event] = await transaction
        .select()
        .from(events)
        .where(eq(events.publicId, input.target.publicId))
        .for("update");
      if (!event) return { status: "not_found" as const };
      if (event.publicationState !== "published" || !event.publicVisibility) {
        return { status: "not_correctable" as const };
      }
      await transaction.insert(editorialCases).values({
        publicId: input.case.publicId,
        kind: input.kind,
        targetType: "event",
        targetPublicId: event.publicId,
        targetEventId: event.id,
        receivedAt: restrictedAt,
        originalRequest: input.case.originalRequest,
        evidenceSummary: input.case.evidenceSummary,
        status: "reviewing",
        previousRightsStatus: event.rightsStatus,
        actorRole: "owner",
        updatedAt: restrictedAt,
      });
      await transaction
        .update(events)
        .set({
          publicationState: "updating",
          rightsStatus: "internal_only",
          publicVisibility: false,
          updatedAt: restrictedAt,
        })
        .where(eq(events.id, event.id));
      await transaction
        .update(localizedContents)
        .set({ publicVisibility: false, updatedAt: restrictedAt })
        .where(eq(localizedContents.eventId, event.id));
      await transaction.insert(tombstones).values({
        objectPublicId: event.publicId,
        objectType: "event",
        status: "reviewing",
        publicReasonCode: "high_risk_review",
        effectiveAt: restrictedAt,
        caseReferencePublicId: input.case.publicId,
      });
      await transaction.insert(ownerOperationAudits).values({
        actorRole: "owner",
        action: "restrict_event_for_review",
        targetType: "event",
        targetPublicId: event.publicId,
        publicVisibility: false,
        createdAt: restrictedAt,
      });
      await refreshEventSearchIndex(transaction, event.id);
      return {
        status: "reviewing" as const,
        casePublicId: input.case.publicId,
        targetType: "event" as const,
        targetPublicId: event.publicId,
        restrictedAt: restrictedAt.toISOString(),
      };
    }

    const [entity] = await transaction
      .select()
      .from(entities)
      .where(eq(entities.publicId, input.target.publicId))
      .for("update");
    if (!entity) return { status: "not_found" as const };
    if (entity.lifecycleStatus !== "active" || !entity.publicVisibility) {
      return { status: "not_correctable" as const };
    }
    await transaction.insert(editorialCases).values({
      publicId: input.case.publicId,
      kind: input.kind,
      targetType: "entity",
      targetPublicId: entity.publicId,
      targetEntityId: entity.id,
      receivedAt: restrictedAt,
      originalRequest: input.case.originalRequest,
      evidenceSummary: input.case.evidenceSummary,
      status: "reviewing",
      previousRightsStatus: entity.rightsStatus,
      actorRole: "owner",
      updatedAt: restrictedAt,
    });
    await transaction
      .update(entities)
      .set({
        rightsStatus: "internal_only",
        publicVisibility: false,
        updatedAt: restrictedAt,
      })
      .where(eq(entities.id, entity.id));
    await transaction
      .update(entityLocalizedContents)
      .set({ publicVisibility: false, updatedAt: restrictedAt })
      .where(eq(entityLocalizedContents.entityId, entity.id));
    await transaction.insert(tombstones).values({
      objectPublicId: entity.publicId,
      objectType: "entity",
      status: "reviewing",
      publicReasonCode: "high_risk_review",
      effectiveAt: restrictedAt,
      caseReferencePublicId: input.case.publicId,
    });
    await transaction.insert(ownerOperationAudits).values({
      actorRole: "owner",
      action: "restrict_entity_for_review",
      targetType: "entity",
      targetPublicId: entity.publicId,
      publicVisibility: false,
      createdAt: restrictedAt,
    });
    await refreshEntitySearchIndex(transaction, entity.id);
    return {
      status: "reviewing" as const,
      casePublicId: input.case.publicId,
      targetType: "entity" as const,
      targetPublicId: entity.publicId,
      restrictedAt: restrictedAt.toISOString(),
    };
  });

export const transitionEditorialCase = async (
  publicId: string,
  input: EditorialCaseTransitionRequest,
) =>
  database.transaction(async (transaction) => {
    const [reference] = await transaction
      .select()
      .from(editorialCases)
      .where(eq(editorialCases.publicId, publicId));
    if (!reference) return { status: "not_found" as const };

    if (reference.targetType === "event") {
      await transaction
        .select({ id: events.id })
        .from(events)
        .where(eq(events.id, reference.targetEventId!))
        .for("update");
    } else if (reference.targetType === "entity") {
      await transaction
        .select({ id: entities.id })
        .from(entities)
        .where(eq(entities.id, reference.targetEntityId!))
        .for("update");
    } else {
      const [eventLink] = await transaction
        .select({ eventId: eventSources.eventId })
        .from(eventSources)
        .where(eq(eventSources.sourceItemId, reference.targetSourceItemId!));
      await transaction
        .select({ id: events.id })
        .from(events)
        .where(eq(events.id, eventLink.eventId))
        .for("update");
      await transaction
        .select({ id: sourceItems.id })
        .from(sourceItems)
        .where(eq(sourceItems.id, reference.targetSourceItemId!))
        .for("update");
    }

    const [editorialCase] = await transaction
      .select()
      .from(editorialCases)
      .where(eq(editorialCases.id, reference.id))
      .for("update");
    const occurredAt = new Date(input.occurredAt);
    if (
      occurredAt < editorialCase.receivedAt ||
      occurredAt < editorialCase.updatedAt
    ) {
      return { status: "not_correctable" as const };
    }

    if (input.transition === "reject") {
      if (
        editorialCase.status !== "reviewing" ||
        !["event", "entity"].includes(editorialCase.targetType)
      ) {
        return { status: "not_correctable" as const };
      }
      if (editorialCase.targetType === "event") {
        await transaction
          .update(events)
          .set({
            publicationState: "published",
            rightsStatus: editorialCase.previousRightsStatus,
            publicVisibility: true,
            updatedAt: occurredAt,
          })
          .where(eq(events.id, editorialCase.targetEventId!));
        await transaction
          .update(localizedContents)
          .set({ publicVisibility: true, updatedAt: occurredAt })
          .where(eq(localizedContents.eventId, editorialCase.targetEventId!));
      } else {
        await transaction
          .update(entities)
          .set({
            rightsStatus: editorialCase.previousRightsStatus,
            publicVisibility: true,
            updatedAt: occurredAt,
          })
          .where(eq(entities.id, editorialCase.targetEntityId!));
        await transaction
          .update(entityLocalizedContents)
          .set({ publicVisibility: true, updatedAt: occurredAt })
          .where(
            eq(entityLocalizedContents.entityId, editorialCase.targetEntityId!),
          );
      }
      await transaction
        .update(tombstones)
        .set({ clearedAt: occurredAt })
        .where(
          and(
            eq(
              tombstones.objectType,
              editorialCase.targetType === "event" ? "event" : "entity",
            ),
            eq(tombstones.objectPublicId, editorialCase.targetPublicId),
            eq(tombstones.status, "reviewing"),
            isNull(tombstones.clearedAt),
          ),
        );
      await transaction
        .update(editorialCases)
        .set({
          status: "rejected",
          decision: "rejected",
          decidedAt: occurredAt,
          updatedAt: occurredAt,
        })
        .where(eq(editorialCases.id, editorialCase.id));
    } else if (input.transition === "appeal") {
      if (!["actioned", "rejected"].includes(editorialCase.status)) {
        return { status: "not_correctable" as const };
      }
      await transaction
        .update(editorialCases)
        .set({ status: "appealed", updatedAt: occurredAt })
        .where(eq(editorialCases.id, editorialCase.id));
    } else {
      if (
        !["actioned", "rejected", "appealed"].includes(editorialCase.status)
      ) {
        return { status: "not_correctable" as const };
      }
      await transaction
        .update(editorialCases)
        .set({ status: "closed", closedAt: occurredAt, updatedAt: occurredAt })
        .where(eq(editorialCases.id, editorialCase.id));
    }
    const status =
      input.transition === "reject"
        ? "rejected"
        : input.transition === "appeal"
          ? "appealed"
          : "closed";
    await transaction.insert(ownerOperationAudits).values({
      actorRole: "owner",
      action: `case_${status}`,
      targetType: editorialCase.targetType,
      targetPublicId: editorialCase.targetPublicId,
      publicVisibility:
        input.transition === "reject" || editorialCase.status !== "reviewing",
      createdAt: occurredAt,
    });
    if (input.transition === "reject") {
      if (editorialCase.targetType === "event") {
        await refreshEventSearchIndex(
          transaction,
          editorialCase.targetEventId!,
        );
      } else {
        await refreshEntitySearchIndex(
          transaction,
          editorialCase.targetEntityId!,
        );
      }
    }
    return {
      status,
      casePublicId: editorialCase.publicId,
      targetType: editorialCase.targetType,
      targetPublicId: editorialCase.targetPublicId,
      occurredAt: occurredAt.toISOString(),
    };
  });

export const applyRightsDecision = async (input: RightsDecisionCreateRequest) =>
  database.transaction(async (transaction) => {
    const effectiveAt = new Date(input.effectiveAt);
    if (input.target.type === "event") {
      const [event] = await transaction
        .select()
        .from(events)
        .where(eq(events.publicId, input.target.publicId))
        .for("update");
      if (!event) return { status: "not_found" as const };
      const resolvingReview =
        event.publicationState === "updating" &&
        event.rightsStatus === "internal_only" &&
        !event.publicVisibility;
      if (
        !resolvingReview &&
        (event.publicationState !== "published" || !event.publicVisibility)
      ) {
        return { status: "not_correctable" as const };
      }
      if (effectiveAt < event.lastVerifiedAt) {
        return { status: "not_correctable" as const };
      }
      const editorialCase = await actionEditorialCase(
        transaction,
        input,
        { targetEventId: event.id },
        "rights",
        "withdrawn",
        event.rightsStatus,
      );
      if (!editorialCase) return { status: "not_correctable" as const };
      if (resolvingReview) {
        await transaction
          .update(tombstones)
          .set({ clearedAt: effectiveAt })
          .where(
            and(
              eq(tombstones.objectType, "event"),
              eq(tombstones.objectPublicId, event.publicId),
              eq(tombstones.status, "reviewing"),
              isNull(tombstones.clearedAt),
            ),
          );
      }
      const [decision] = await transaction
        .insert(rightsDecisions)
        .values({
          publicId: input.publicId,
          caseId: editorialCase.id,
          targetType: "event",
          targetPublicId: event.publicId,
          targetEventId: event.id,
          fromStatus: editorialCase.previousRightsStatus,
          toStatus: "withdrawn",
          publicReasonCode: input.publicReasonCode,
          effectiveAt,
          internalNote: input.internalNote,
          actorRole: "owner",
        })
        .returning({ id: rightsDecisions.id });
      await transaction
        .update(events)
        .set({
          rightsStatus: "withdrawn",
          factStatus: "withdrawn",
          publicationState: "withdrawn",
          publicVisibility: false,
          lastVerifiedAt: effectiveAt,
          updatedAt: effectiveAt,
        })
        .where(eq(events.id, event.id));
      await transaction
        .update(localizedContents)
        .set({ publicVisibility: false, updatedAt: effectiveAt })
        .where(eq(localizedContents.eventId, event.id));
      await transaction
        .update(relations)
        .set({ publicVisibility: false, updatedAt: effectiveAt })
        .where(eq(relations.subjectEventId, event.id));
      await transaction.insert(tombstones).values({
        objectPublicId: event.publicId,
        objectType: "event",
        status: "withdrawn",
        publicReasonCode: "rights_withdrawal",
        effectiveAt,
        caseReferencePublicId: editorialCase.publicId,
        rightsDecisionId: decision.id,
      });
      await transaction.insert(ownerOperationAudits).values({
        actorRole: "owner",
        action: "withdraw_event",
        targetType: "event",
        targetPublicId: event.publicId,
        publicVisibility: false,
        createdAt: effectiveAt,
      });
      await refreshEventSearchIndex(transaction, event.id);
      return {
        status: "applied" as const,
        publicId: input.publicId,
        casePublicId: editorialCase.publicId,
        targetType: "event" as const,
        targetPublicId: event.publicId,
        fromStatus: editorialCase.previousRightsStatus,
        toStatus: "withdrawn" as const,
        reasonCode: input.publicReasonCode,
        effectiveAt: input.effectiveAt,
      };
    }

    if (input.target.type === "entity") {
      const [entity] = await transaction
        .select()
        .from(entities)
        .where(eq(entities.publicId, input.target.publicId))
        .for("update");
      if (!entity) return { status: "not_found" as const };
      const resolvingReview =
        entity.lifecycleStatus === "active" &&
        entity.rightsStatus === "internal_only" &&
        !entity.publicVisibility;
      if (
        !resolvingReview &&
        (entity.lifecycleStatus !== "active" || !entity.publicVisibility)
      ) {
        return { status: "not_correctable" as const };
      }
      if (effectiveAt < entity.lastVerifiedAt) {
        return { status: "not_correctable" as const };
      }
      const editorialCase = await actionEditorialCase(
        transaction,
        input,
        { targetEntityId: entity.id },
        "rights",
        "withdrawn",
        entity.rightsStatus,
      );
      if (!editorialCase) return { status: "not_correctable" as const };
      if (resolvingReview) {
        await transaction
          .update(tombstones)
          .set({ clearedAt: effectiveAt })
          .where(
            and(
              eq(tombstones.objectType, "entity"),
              eq(tombstones.objectPublicId, entity.publicId),
              eq(tombstones.status, "reviewing"),
              isNull(tombstones.clearedAt),
            ),
          );
      }
      const [decision] = await transaction
        .insert(rightsDecisions)
        .values({
          publicId: input.publicId,
          caseId: editorialCase.id,
          targetType: "entity",
          targetPublicId: entity.publicId,
          targetEntityId: entity.id,
          fromStatus: editorialCase.previousRightsStatus,
          toStatus: "withdrawn",
          publicReasonCode: input.publicReasonCode,
          effectiveAt,
          internalNote: input.internalNote,
          actorRole: "owner",
        })
        .returning({ id: rightsDecisions.id });
      await transaction
        .update(entities)
        .set({
          rightsStatus: "withdrawn",
          lifecycleStatus: "withdrawn",
          publicVisibility: false,
          lastVerifiedAt: effectiveAt,
          updatedAt: effectiveAt,
        })
        .where(eq(entities.id, entity.id));
      await transaction
        .update(entityLocalizedContents)
        .set({ publicVisibility: false, updatedAt: effectiveAt })
        .where(eq(entityLocalizedContents.entityId, entity.id));
      await transaction
        .update(entityAliases)
        .set({ publicVisibility: false })
        .where(eq(entityAliases.entityId, entity.id));
      await transaction
        .update(entityVersions)
        .set({ publicVisibility: false })
        .where(eq(entityVersions.entityId, entity.id));
      await transaction
        .update(relations)
        .set({ publicVisibility: false, updatedAt: effectiveAt })
        .where(
          or(
            eq(relations.subjectEntityId, entity.id),
            eq(relations.objectEntityId, entity.id),
          ),
        );
      await transaction.insert(tombstones).values({
        objectPublicId: entity.publicId,
        objectType: "entity",
        status: "withdrawn",
        publicReasonCode: "rights_withdrawal",
        effectiveAt,
        caseReferencePublicId: editorialCase.publicId,
        rightsDecisionId: decision.id,
      });
      await transaction.insert(ownerOperationAudits).values({
        actorRole: "owner",
        action: "withdraw_entity",
        targetType: "entity",
        targetPublicId: entity.publicId,
        publicVisibility: false,
        createdAt: effectiveAt,
      });
      await refreshEntitySearchIndex(transaction, entity.id);
      return {
        status: "applied" as const,
        publicId: input.publicId,
        casePublicId: editorialCase.publicId,
        targetType: "entity" as const,
        targetPublicId: entity.publicId,
        fromStatus: editorialCase.previousRightsStatus,
        toStatus: "withdrawn" as const,
        reasonCode: input.publicReasonCode,
        effectiveAt: input.effectiveAt,
      };
    }

    const [sourceReference] = await transaction
      .select({ id: sourceItems.id, eventId: eventSources.eventId })
      .from(sourceItems)
      .innerJoin(eventSources, eq(eventSources.sourceItemId, sourceItems.id))
      .where(eq(sourceItems.publicId, input.target.publicId));
    if (!sourceReference) return { status: "not_found" as const };
    const [event] = await transaction
      .select()
      .from(events)
      .where(eq(events.id, sourceReference.eventId))
      .for("update");
    const [lockedEventLink] = await transaction
      .select({ eventId: eventSources.eventId })
      .from(eventSources)
      .where(eq(eventSources.sourceItemId, sourceReference.id));
    if (!lockedEventLink || lockedEventLink.eventId !== event.id) {
      return { status: "not_correctable" as const };
    }
    if (event.publicationState !== "published" || !event.publicVisibility) {
      return { status: "not_correctable" as const };
    }
    const eventSourceIds = await transaction
      .select({ id: eventSources.sourceItemId })
      .from(eventSources)
      .where(eq(eventSources.eventId, event.id));
    const lockedSources = await transaction
      .select()
      .from(sourceItems)
      .where(
        inArray(
          sourceItems.id,
          eventSourceIds.map(({ id }) => id),
        ),
      )
      .orderBy(sourceItems.id)
      .for("update");
    const sourceItem = lockedSources.find(
      ({ id }) => id === sourceReference.id,
    );
    if (!sourceItem) return { status: "not_correctable" as const };
    if (
      !sourceItem.publicVisibility ||
      sourceItem.rightsStatus === "withdrawn"
    ) {
      return { status: "not_correctable" as const };
    }
    if (
      effectiveAt < sourceItem.rightsCheckedAt ||
      effectiveAt < event.lastVerifiedAt
    ) {
      return { status: "not_correctable" as const };
    }
    const affectedRelations = await transaction
      .select({ id: relationEvidence.relationId })
      .from(relationEvidence)
      .where(eq(relationEvidence.sourceItemId, sourceItem.id));
    const subjectRelations = await transaction
      .select({ id: relations.id })
      .from(relations)
      .where(eq(relations.subjectEventId, event.id));
    const affectedRelationIds = affectedRelations
      .map(({ id }) => id)
      .sort((left, right) => left.localeCompare(right));
    const relationLockIds = [
      ...new Set([
        ...affectedRelationIds,
        ...subjectRelations.map(({ id }) => id),
      ]),
    ].sort((left, right) => left.localeCompare(right));
    if (relationLockIds.length > 0) {
      await transaction
        .select({ id: relations.id })
        .from(relations)
        .where(inArray(relations.id, relationLockIds))
        .orderBy(relations.id)
        .for("update");
    }
    const editorialCase = await actionEditorialCase(
      transaction,
      input,
      { targetSourceItemId: sourceItem.id },
      "rights",
      "withdrawn",
      sourceItem.rightsStatus,
    );
    if (!editorialCase) return { status: "not_correctable" as const };
    const [decision] = await transaction
      .insert(rightsDecisions)
      .values({
        publicId: input.publicId,
        caseId: editorialCase.id,
        targetType: "source_item",
        targetPublicId: sourceItem.publicId,
        targetSourceItemId: sourceItem.id,
        fromStatus: sourceItem.rightsStatus,
        toStatus: "withdrawn",
        publicReasonCode: input.publicReasonCode,
        effectiveAt,
        internalNote: input.internalNote,
        actorRole: "owner",
      })
      .returning({ id: rightsDecisions.id });
    await transaction
      .update(sourceItems)
      .set({
        rightsStatus: "withdrawn",
        publicVisibility: false,
        rightsCheckedAt: effectiveAt,
        updatedAt: effectiveAt,
      })
      .where(eq(sourceItems.id, sourceItem.id));
    const remainingSources = await transaction
      .select({
        id: sourceItems.id,
        publicId: sourceItems.publicId,
        isOriginalSource: sourceItems.isOriginalSource,
        tier: sources.tier,
        publishedAt: sourceItems.publishedAt,
      })
      .from(eventSources)
      .innerJoin(sourceItems, eq(sourceItems.id, eventSources.sourceItemId))
      .innerJoin(sources, eq(sources.id, sourceItems.sourceId))
      .where(
        and(
          eq(eventSources.eventId, event.id),
          eq(sourceItems.publicVisibility, true),
        ),
      );
    if (remainingSources.length === 0) {
      await transaction
        .update(events)
        .set({
          factStatus: "withdrawn",
          publicationState: "withdrawn",
          publicVisibility: false,
          lastVerifiedAt: effectiveAt,
          updatedAt: effectiveAt,
        })
        .where(eq(events.id, event.id));
      await transaction
        .update(localizedContents)
        .set({ publicVisibility: false, updatedAt: effectiveAt })
        .where(eq(localizedContents.eventId, event.id));
      await transaction
        .update(relations)
        .set({ publicVisibility: false, updatedAt: effectiveAt })
        .where(eq(relations.subjectEventId, event.id));
      await transaction.insert(tombstones).values({
        objectPublicId: event.publicId,
        objectType: "event",
        status: "source_withdrawn",
        publicReasonCode: "source_withdrawal",
        effectiveAt,
        caseReferencePublicId: editorialCase.publicId,
        rightsDecisionId: decision.id,
      });
    } else {
      const representative = selectRepresentativeSource(
        remainingSources.map((source) => ({
          ...source,
          sourceItemId: source.id,
          sourceItemPublicId: source.publicId,
          sourceTier: source.tier,
        })),
      );
      await transaction
        .update(eventSources)
        .set({ isPrimary: false })
        .where(eq(eventSources.eventId, event.id));
      await transaction
        .update(eventSources)
        .set({ isPrimary: true })
        .where(
          and(
            eq(eventSources.eventId, event.id),
            eq(eventSources.sourceItemId, representative.sourceItemId),
          ),
        );
      await transaction
        .update(events)
        .set({
          lastVerifiedAt: effectiveAt,
          updatedAt: effectiveAt,
        })
        .where(eq(events.id, event.id));
    }
    for (const id of affectedRelationIds) {
      const remainingEvidence = await transaction
        .select({ id: sourceItems.id })
        .from(relationEvidence)
        .innerJoin(
          sourceItems,
          and(
            eq(sourceItems.id, relationEvidence.sourceItemId),
            eq(sourceItems.publicVisibility, true),
          ),
        )
        .where(eq(relationEvidence.relationId, id));
      if (remainingEvidence.length === 0) {
        await transaction
          .update(relations)
          .set({ publicVisibility: false, updatedAt: effectiveAt })
          .where(eq(relations.id, id));
      }
    }
    await transaction.insert(ownerOperationAudits).values({
      actorRole: "owner",
      action: "withdraw_source_item",
      targetType: "source_item",
      targetPublicId: sourceItem.publicId,
      publicVisibility: false,
      createdAt: effectiveAt,
    });
    await refreshEventSearchIndex(transaction, event.id);
    return {
      status: "applied" as const,
      publicId: input.publicId,
      casePublicId: editorialCase.publicId,
      targetType: "source_item" as const,
      targetPublicId: sourceItem.publicId,
      fromStatus: sourceItem.rightsStatus,
      toStatus: "withdrawn" as const,
      reasonCode: input.publicReasonCode,
      effectiveAt: input.effectiveAt,
    };
  });

export const getPublicTombstone = async (
  objectType: "event" | "entity",
  publicId: string,
) => {
  const [tombstone] = await database
    .select()
    .from(tombstones)
    .where(
      and(
        eq(tombstones.objectType, objectType),
        eq(tombstones.objectPublicId, publicId),
        isNull(tombstones.clearedAt),
      ),
    );
  if (!tombstone) return null;
  if (tombstone.status === "reviewing") {
    return {
      publicId: tombstone.objectPublicId,
      objectType,
      status: "reviewing" as const,
      reasonCode: "high_risk_review" as const,
      effectiveAt: tombstone.effectiveAt.toISOString(),
      caseReferencePublicId: tombstone.caseReferencePublicId!,
    };
  }
  if (tombstone.status === "source_withdrawn") {
    return {
      publicId: tombstone.objectPublicId,
      objectType: "event" as const,
      status: "source_withdrawn" as const,
      reasonCode: "source_withdrawal" as const,
      effectiveAt: tombstone.effectiveAt.toISOString(),
      caseReferencePublicId: tombstone.caseReferencePublicId!,
    };
  }
  if (tombstone.status === "withdrawn") {
    return {
      publicId: tombstone.objectPublicId,
      objectType,
      status: "withdrawn" as const,
      reasonCode: "rights_withdrawal" as const,
      effectiveAt: tombstone.effectiveAt.toISOString(),
      caseReferencePublicId: tombstone.caseReferencePublicId!,
    };
  }
  if (objectType === "event") {
    return {
      publicId: tombstone.objectPublicId,
      status: "merged_into" as const,
      targetEventPublicId: tombstone.replacementPublicId!,
      reasonCode: "duplicate_coverage" as const,
      mergedAt: tombstone.effectiveAt.toISOString(),
    };
  }
  return {
    publicId: tombstone.objectPublicId,
    objectType: "entity" as const,
    status: "merged_into" as const,
    targetEntityPublicId: tombstone.replacementPublicId!,
    reasonCode: "duplicate_identity" as const,
    effectiveAt: tombstone.effectiveAt.toISOString(),
  };
};
