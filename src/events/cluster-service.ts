import { and, eq, inArray, ne } from "drizzle-orm";
import { database } from "@/db/client";
import {
  entities,
  corrections,
  eventClusterAudits,
  eventMergeCorrectionMoves,
  eventMergeRelationMoves,
  eventMerges,
  eventMergeSourceMoves,
  eventSources,
  events,
  localizedContents,
  relations,
  sourceItems,
  sources,
  tombstones,
} from "@/db/schema";
import { getPublicTombstone } from "@/operations/service";
import { refreshEventSearchIndex } from "@/search/indexer";
import { assessEventCandidate } from "./clustering";
import type { EventMergeRequest, EventSplitRequest } from "./contracts";
import { selectRepresentativeSource } from "./representative-source";

type SourceLink = {
  eventId: string;
  sourceItemId: string;
  sourceItemPublicId: string;
  sourcePublicId: string;
  sourceTier: "S" | "A" | "B" | "C";
  publishedAt: Date;
  isOriginalSource: boolean;
  publicVisibility: boolean;
};

const loadEventMaterials = async (eventIds: string[]) => {
  const [sourceRows, entityRows, localizationRows] = await Promise.all([
    database
      .select({
        eventId: eventSources.eventId,
        sourceItemId: sourceItems.id,
        sourceItemPublicId: sourceItems.publicId,
        sourcePublicId: sources.publicId,
        sourceTier: sources.tier,
        publishedAt: sourceItems.publishedAt,
        isOriginalSource: sourceItems.isOriginalSource,
        externalId: sourceItems.externalId,
        externalIdVerifiedAt: sourceItems.externalIdVerifiedAt,
        canonicalUrl: sourceItems.canonicalUrl,
        publicVisibility: sourceItems.publicVisibility,
      })
      .from(eventSources)
      .innerJoin(sourceItems, eq(sourceItems.id, eventSources.sourceItemId))
      .innerJoin(sources, eq(sources.id, sourceItems.sourceId))
      .where(
        and(
          inArray(eventSources.eventId, eventIds),
          eq(sourceItems.publicVisibility, true),
        ),
      ),
    database
      .select({
        eventId: relations.subjectEventId,
        entityPublicId: entities.publicId,
        relationPublicId: relations.publicId,
      })
      .from(relations)
      .innerJoin(entities, eq(entities.id, relations.objectEntityId))
      .where(
        and(
          inArray(relations.subjectEventId, eventIds),
          eq(relations.reviewStatus, "reviewed"),
          eq(relations.publicVisibility, true),
          eq(entities.publicVisibility, true),
        ),
      ),
    database
      .select({
        eventId: localizedContents.eventId,
        locale: localizedContents.locale,
      })
      .from(localizedContents)
      .where(
        and(
          inArray(localizedContents.eventId, eventIds),
          eq(localizedContents.publicVisibility, true),
        ),
      ),
  ]);
  const sourcesByEventId = new Map<string, typeof sourceRows>();
  for (const row of sourceRows) {
    const grouped = sourcesByEventId.get(row.eventId) ?? [];
    grouped.push(row);
    sourcesByEventId.set(row.eventId, grouped);
  }
  const entitiesByEventId = new Map<string, typeof entityRows>();
  for (const row of entityRows) {
    if (!row.eventId) continue;
    const grouped = entitiesByEventId.get(row.eventId) ?? [];
    grouped.push(row);
    entitiesByEventId.set(row.eventId, grouped);
  }
  const localesByEventId = new Map<string, Array<"en" | "zh">>();
  for (const row of localizationRows) {
    const grouped = localesByEventId.get(row.eventId) ?? [];
    grouped.push(row.locale);
    localesByEventId.set(row.eventId, grouped);
  }
  return { sourcesByEventId, entitiesByEventId, localesByEventId };
};

export const retrieveEventCandidates = async (publicId: string) => {
  const [event] = await database
    .select({
      id: events.id,
      publicId: events.publicId,
      eventType: events.eventType,
      occurredAt: events.occurredAt,
    })
    .from(events)
    .where(eq(events.publicId, publicId));
  if (!event) return null;
  const candidates = await database
    .select({
      id: events.id,
      publicId: events.publicId,
      eventType: events.eventType,
      occurredAt: events.occurredAt,
    })
    .from(events)
    .where(
      and(ne(events.id, event.id), eq(events.publicationState, "published")),
    );
  const eventIds = [event.id, ...candidates.map(({ id }) => id)];
  const { sourcesByEventId, entitiesByEventId, localesByEventId } =
    await loadEventMaterials(eventIds);
  const sourceItemsFor = (eventId: string) =>
    (sourcesByEventId.get(eventId) ?? []).map((sourceItem) => ({
      externalId: sourceItem.externalId,
      externalIdVerified: sourceItem.externalIdVerifiedAt !== null,
      canonicalUrl: sourceItem.canonicalUrl,
    }));
  const entityPublicIdsFor = (eventId: string) =>
    (entitiesByEventId.get(eventId) ?? []).map(
      ({ entityPublicId }) => entityPublicId,
    );
  const targetSources = sourcesByEventId.get(event.id) ?? [];
  const targetSourcePublicIds = new Set(
    targetSources.map(({ sourcePublicId }) => sourcePublicId),
  );

  return {
    eventPublicId: event.publicId,
    candidates: candidates
      .flatMap((candidate) => {
        const candidateSources = sourcesByEventId.get(candidate.id) ?? [];
        if (
          candidateSources.every(({ sourcePublicId }) =>
            targetSourcePublicIds.has(sourcePublicId),
          )
        ) {
          return [];
        }
        const assessment = assessEventCandidate({
          eventType: event.eventType,
          occurredAt: event.occurredAt.toISOString(),
          sourceItems: sourceItemsFor(event.id),
          entityPublicIds: entityPublicIdsFor(event.id),
          candidateEventType: candidate.eventType,
          candidateOccurredAt: candidate.occurredAt.toISOString(),
          candidateSourceItems: sourceItemsFor(candidate.id),
          candidateEntityPublicIds: entityPublicIdsFor(candidate.id),
        });
        if (!assessment) return [];
        const representative = selectRepresentativeSource([
          ...targetSources,
          ...candidateSources,
        ]);
        return [
          {
            eventPublicId: candidate.publicId,
            ...assessment,
            mergePreview: {
              sourceItemPublicIdsToMove: candidateSources
                .map(({ sourceItemPublicId }) => sourceItemPublicId)
                .sort(),
              relationPublicIdsToMove: (
                entitiesByEventId.get(candidate.id) ?? []
              )
                .map(({ relationPublicId }) => relationPublicId)
                .sort(),
              localizedContentLocalesPreserved: [
                ...(localesByEventId.get(candidate.id) ?? []),
              ].sort(),
              representativeSourceItemPublicId:
                representative.sourceItemPublicId,
              tombstone: {
                publicId: candidate.publicId,
                status: "merged_into" as const,
                targetEventPublicId: event.publicId,
              },
            },
          },
        ];
      })
      .sort(
        (left, right) =>
          right.confidence - left.confidence ||
          left.eventPublicId.localeCompare(right.eventPublicId),
      )
      .slice(0, 20),
  };
};

export const mergeEvents = async (input: EventMergeRequest) =>
  database.transaction(async (transaction) => {
    const eventRows = await transaction
      .select({
        id: events.id,
        publicId: events.publicId,
        publicationState: events.publicationState,
        publicVisibility: events.publicVisibility,
      })
      .from(events)
      .where(
        inArray(events.publicId, [
          input.sourceEventPublicId,
          input.targetEventPublicId,
        ]),
      )
      .orderBy(events.id)
      .for("update");
    const source = eventRows.find(
      ({ publicId }) => publicId === input.sourceEventPublicId,
    );
    const target = eventRows.find(
      ({ publicId }) => publicId === input.targetEventPublicId,
    );
    if (!source || !target) return { status: "not_found" as const };
    if (
      source.publicationState !== "published" ||
      target.publicationState !== "published" ||
      !source.publicVisibility ||
      !target.publicVisibility
    ) {
      return { status: "not_mergeable" as const };
    }
    const links: SourceLink[] = await transaction
      .select({
        eventId: eventSources.eventId,
        sourceItemId: eventSources.sourceItemId,
        sourceItemPublicId: sourceItems.publicId,
        sourcePublicId: sources.publicId,
        sourceTier: sources.tier,
        publishedAt: sourceItems.publishedAt,
        isOriginalSource: sourceItems.isOriginalSource,
        publicVisibility: sourceItems.publicVisibility,
      })
      .from(eventSources)
      .innerJoin(sourceItems, eq(sourceItems.id, eventSources.sourceItemId))
      .innerJoin(sources, eq(sources.id, sourceItems.sourceId))
      .where(inArray(eventSources.eventId, [source.id, target.id]));
    const sourceLinks = links.filter(({ eventId }) => eventId === source.id);
    const publicLinks = links.filter(
      ({ publicVisibility }) => publicVisibility,
    );
    if (
      !publicLinks.some(({ eventId }) => eventId === source.id) ||
      !publicLinks.some(({ eventId }) => eventId === target.id)
    ) {
      return { status: "not_mergeable" as const };
    }
    const representative = selectRepresentativeSource(publicLinks);
    const [merge] = await transaction
      .insert(eventMerges)
      .values({
        sourceEventId: source.id,
        targetEventId: target.id,
        publicReasonCode: input.publicReasonCode,
      })
      .returning({ id: eventMerges.id });
    await transaction.insert(eventMergeSourceMoves).values(
      sourceLinks.map(({ sourceItemId }) => ({
        eventMergeId: merge.id,
        sourceItemId,
      })),
    );
    await transaction
      .update(eventSources)
      .set({ eventId: target.id, isPrimary: false })
      .where(eq(eventSources.eventId, source.id));
    await transaction
      .update(eventSources)
      .set({ isPrimary: false })
      .where(eq(eventSources.eventId, target.id));
    await transaction
      .update(eventSources)
      .set({ isPrimary: true })
      .where(
        and(
          eq(eventSources.eventId, target.id),
          eq(eventSources.sourceItemId, representative.sourceItemId),
        ),
      );
    const movedRelations = await transaction
      .select({ id: relations.id })
      .from(relations)
      .where(eq(relations.subjectEventId, source.id));
    if (movedRelations.length > 0) {
      await transaction.insert(eventMergeRelationMoves).values(
        movedRelations.map(({ id }) => ({
          eventMergeId: merge.id,
          relationId: id,
          originalEventId: source.id,
        })),
      );
      await transaction
        .update(relations)
        .set({ subjectEventId: target.id, updatedAt: new Date() })
        .where(eq(relations.subjectEventId, source.id));
    }
    const movedCorrections = await transaction
      .select({ id: corrections.id })
      .from(corrections)
      .where(eq(corrections.targetEventId, source.id));
    if (movedCorrections.length > 0) {
      await transaction.insert(eventMergeCorrectionMoves).values(
        movedCorrections.map(({ id }) => ({
          eventMergeId: merge.id,
          correctionId: id,
        })),
      );
      await transaction
        .update(corrections)
        .set({ targetEventId: target.id })
        .where(eq(corrections.targetEventId, source.id));
    }
    const mergedAt = new Date();
    await transaction
      .update(events)
      .set({
        publicationState: "merged",
        publicVisibility: false,
        updatedAt: mergedAt,
      })
      .where(eq(events.id, source.id));
    await transaction
      .update(localizedContents)
      .set({ publicVisibility: false, updatedAt: mergedAt })
      .where(eq(localizedContents.eventId, source.id));
    await transaction.insert(tombstones).values({
      objectPublicId: source.publicId,
      objectType: "event",
      status: "merged_into",
      publicReasonCode: "duplicate_coverage",
      replacementPublicId: target.publicId,
      effectiveAt: mergedAt,
      eventMergeId: merge.id,
    });
    await transaction.insert(eventClusterAudits).values({
      action: "merge",
      actorRole: "owner",
      sourceEventId: source.id,
      targetEventId: target.id,
      internalNote: input.internalNote,
      createdAt: mergedAt,
    });
    await refreshEventSearchIndex(transaction, source.id);
    await refreshEventSearchIndex(transaction, target.id);
    return {
      status: "merged" as const,
      sourceEventPublicId: source.publicId,
      targetEventPublicId: target.publicId,
      sourceCount: new Set(
        publicLinks.map(({ sourcePublicId }) => sourcePublicId),
      ).size,
    };
  });

export const previewEventSplit = async (publicId: string) => {
  const [source] = await database
    .select({ id: events.id, publicId: events.publicId })
    .from(events)
    .where(eq(events.publicId, publicId));
  if (!source) return { status: "not_found" as const };
  const [merge] = await database
    .select({ id: eventMerges.id, targetEventId: eventMerges.targetEventId })
    .from(eventMerges)
    .where(
      and(
        eq(eventMerges.sourceEventId, source.id),
        eq(eventMerges.status, "active"),
      ),
    );
  if (!merge) return { status: "not_splittable" as const };
  const [target] = await database
    .select({ publicId: events.publicId })
    .from(events)
    .where(eq(events.id, merge.targetEventId));
  const [movedSources, targetLinks, relationMoves, locales] = await Promise.all(
    [
      database
        .select({
          sourceItemId: sourceItems.id,
          sourceItemPublicId: sourceItems.publicId,
          eventId: eventSources.eventId,
          sourcePublicId: sources.publicId,
          sourceTier: sources.tier,
          publishedAt: sourceItems.publishedAt,
          isOriginalSource: sourceItems.isOriginalSource,
          publicVisibility: sourceItems.publicVisibility,
        })
        .from(eventMergeSourceMoves)
        .innerJoin(
          sourceItems,
          eq(sourceItems.id, eventMergeSourceMoves.sourceItemId),
        )
        .innerJoin(sources, eq(sources.id, sourceItems.sourceId))
        .innerJoin(eventSources, eq(eventSources.sourceItemId, sourceItems.id))
        .where(eq(eventMergeSourceMoves.eventMergeId, merge.id)),
      database
        .select({
          sourceItemId: sourceItems.id,
          sourceItemPublicId: sourceItems.publicId,
          eventId: eventSources.eventId,
          sourcePublicId: sources.publicId,
          sourceTier: sources.tier,
          publishedAt: sourceItems.publishedAt,
          isOriginalSource: sourceItems.isOriginalSource,
          publicVisibility: sourceItems.publicVisibility,
        })
        .from(eventSources)
        .innerJoin(sourceItems, eq(sourceItems.id, eventSources.sourceItemId))
        .innerJoin(sources, eq(sources.id, sourceItems.sourceId))
        .where(eq(eventSources.eventId, merge.targetEventId)),
      database
        .select({ relationPublicId: relations.publicId })
        .from(eventMergeRelationMoves)
        .innerJoin(
          relations,
          eq(relations.id, eventMergeRelationMoves.relationId),
        )
        .where(eq(eventMergeRelationMoves.eventMergeId, merge.id)),
      database
        .select({ locale: localizedContents.locale })
        .from(localizedContents)
        .where(eq(localizedContents.eventId, source.id)),
    ],
  );
  const movedIds = new Set(
    movedSources.map(({ sourceItemId }) => sourceItemId),
  );
  const remainingTargetLinks = targetLinks.filter(
    ({ sourceItemId }) => !movedIds.has(sourceItemId),
  );
  const publicMovedSources = movedSources.filter(
    ({ publicVisibility }) => publicVisibility,
  );
  const publicRemainingTargetLinks = remainingTargetLinks.filter(
    ({ publicVisibility }) => publicVisibility,
  );
  if (
    publicMovedSources.length === 0 ||
    publicRemainingTargetLinks.length === 0
  ) {
    return { status: "not_splittable" as const };
  }
  return {
    status: "preview" as const,
    mergedEventPublicId: source.publicId,
    targetEventPublicId: target.publicId,
    sourceItemPublicIdsToRestore: movedSources
      .map(({ sourceItemPublicId }) => sourceItemPublicId)
      .sort(),
    relationPublicIdsToRestore: relationMoves
      .map(({ relationPublicId }) => relationPublicId)
      .sort(),
    localizedContentLocalesToRestore: locales
      .map(({ locale }) => locale)
      .sort(),
    restoredRepresentativeSourceItemPublicId:
      selectRepresentativeSource(publicMovedSources).sourceItemPublicId,
    targetRepresentativeSourceItemPublicId: selectRepresentativeSource(
      publicRemainingTargetLinks,
    ).sourceItemPublicId,
    tombstoneStatusAfterSplit: "removed" as const,
  };
};

export const splitMergedEvent = async (input: EventSplitRequest) =>
  database.transaction(async (transaction) => {
    const [sourceReference] = await transaction
      .select({ id: events.id, publicId: events.publicId })
      .from(events)
      .where(eq(events.publicId, input.mergedEventPublicId));
    if (!sourceReference) return { status: "not_found" as const };
    const [mergeReference] = await transaction
      .select({ id: eventMerges.id, targetEventId: eventMerges.targetEventId })
      .from(eventMerges)
      .where(
        and(
          eq(eventMerges.sourceEventId, sourceReference.id),
          eq(eventMerges.status, "active"),
        ),
      );
    if (!mergeReference) return { status: "not_splittable" as const };
    const lockedEvents = await transaction
      .select({
        id: events.id,
        publicId: events.publicId,
        publicationState: events.publicationState,
      })
      .from(events)
      .where(
        inArray(events.id, [sourceReference.id, mergeReference.targetEventId]),
      )
      .orderBy(events.id)
      .for("update");
    const source = lockedEvents.find(({ id }) => id === sourceReference.id)!;
    const target = lockedEvents.find(
      ({ id }) => id === mergeReference.targetEventId,
    )!;
    const [merge] = await transaction
      .select({ id: eventMerges.id })
      .from(eventMerges)
      .where(
        and(
          eq(eventMerges.id, mergeReference.id),
          eq(eventMerges.status, "active"),
        ),
      );
    if (
      !merge ||
      source.publicationState !== "merged" ||
      target.publicationState !== "published"
    ) {
      return { status: "not_splittable" as const };
    }
    const movedSources = await transaction
      .select({
        sourceItemId: eventMergeSourceMoves.sourceItemId,
        sourceItemPublicId: sourceItems.publicId,
        eventId: eventSources.eventId,
        sourcePublicId: sources.publicId,
        sourceTier: sources.tier,
        publishedAt: sourceItems.publishedAt,
        isOriginalSource: sourceItems.isOriginalSource,
        publicVisibility: sourceItems.publicVisibility,
      })
      .from(eventMergeSourceMoves)
      .innerJoin(
        sourceItems,
        eq(sourceItems.id, eventMergeSourceMoves.sourceItemId),
      )
      .innerJoin(sources, eq(sources.id, sourceItems.sourceId))
      .innerJoin(eventSources, eq(eventSources.sourceItemId, sourceItems.id))
      .where(eq(eventMergeSourceMoves.eventMergeId, merge.id));
    const targetLinks: SourceLink[] = await transaction
      .select({
        sourceItemId: sourceItems.id,
        sourceItemPublicId: sourceItems.publicId,
        eventId: eventSources.eventId,
        sourcePublicId: sources.publicId,
        sourceTier: sources.tier,
        publishedAt: sourceItems.publishedAt,
        isOriginalSource: sourceItems.isOriginalSource,
        publicVisibility: sourceItems.publicVisibility,
      })
      .from(eventSources)
      .innerJoin(sourceItems, eq(sourceItems.id, eventSources.sourceItemId))
      .innerJoin(sources, eq(sources.id, sourceItems.sourceId))
      .where(eq(eventSources.eventId, target.id));
    const movedSourceIds = new Set(
      movedSources.map(({ sourceItemId }) => sourceItemId),
    );
    const remainingTargetLinks = targetLinks.filter(
      ({ sourceItemId }) => !movedSourceIds.has(sourceItemId),
    );
    const publicMovedSources = movedSources.filter(
      ({ publicVisibility }) => publicVisibility,
    );
    const publicRemainingTargetLinks = remainingTargetLinks.filter(
      ({ publicVisibility }) => publicVisibility,
    );
    if (
      publicMovedSources.length === 0 ||
      publicRemainingTargetLinks.length === 0
    ) {
      return { status: "not_splittable" as const };
    }
    const restoredRepresentative =
      selectRepresentativeSource(publicMovedSources);
    const targetRepresentative = selectRepresentativeSource(
      publicRemainingTargetLinks,
    );
    await transaction
      .update(eventSources)
      .set({ eventId: source.id, isPrimary: false })
      .where(
        inArray(
          eventSources.sourceItemId,
          movedSources.map(({ sourceItemId }) => sourceItemId),
        ),
      );
    await transaction
      .update(eventSources)
      .set({ isPrimary: false })
      .where(inArray(eventSources.eventId, [source.id, target.id]));
    for (const { eventId, sourceItemId } of [
      { eventId: target.id, sourceItemId: targetRepresentative.sourceItemId },
      {
        eventId: source.id,
        sourceItemId: restoredRepresentative.sourceItemId,
      },
    ]) {
      await transaction
        .update(eventSources)
        .set({ isPrimary: true })
        .where(
          and(
            eq(eventSources.eventId, eventId),
            eq(eventSources.sourceItemId, sourceItemId),
          ),
        );
    }
    const relationMoves = await transaction
      .select({ relationId: eventMergeRelationMoves.relationId })
      .from(eventMergeRelationMoves)
      .where(eq(eventMergeRelationMoves.eventMergeId, merge.id));
    if (relationMoves.length > 0) {
      await transaction
        .update(relations)
        .set({ subjectEventId: source.id, updatedAt: new Date() })
        .where(
          inArray(
            relations.id,
            relationMoves.map(({ relationId }) => relationId),
          ),
        );
    }
    const correctionMoves = await transaction
      .select({ correctionId: eventMergeCorrectionMoves.correctionId })
      .from(eventMergeCorrectionMoves)
      .where(eq(eventMergeCorrectionMoves.eventMergeId, merge.id));
    if (correctionMoves.length > 0) {
      await transaction
        .update(corrections)
        .set({ targetEventId: source.id })
        .where(
          inArray(
            corrections.id,
            correctionMoves.map(({ correctionId }) => correctionId),
          ),
        );
    }
    const splitAt = new Date();
    await transaction
      .update(events)
      .set({
        publicationState: "published",
        publicVisibility: true,
        updatedAt: splitAt,
      })
      .where(eq(events.id, source.id));
    await transaction
      .update(localizedContents)
      .set({ publicVisibility: true, updatedAt: splitAt })
      .where(eq(localizedContents.eventId, source.id));
    await transaction
      .update(eventMerges)
      .set({ status: "split", splitAt })
      .where(eq(eventMerges.id, merge.id));
    await transaction
      .update(tombstones)
      .set({ clearedAt: splitAt })
      .where(eq(tombstones.eventMergeId, merge.id));
    await transaction.insert(eventClusterAudits).values({
      action: "split",
      actorRole: "owner",
      sourceEventId: source.id,
      targetEventId: target.id,
      internalNote: input.internalNote,
      createdAt: splitAt,
    });
    await refreshEventSearchIndex(transaction, source.id);
    await refreshEventSearchIndex(transaction, target.id);
    return {
      status: "split" as const,
      restoredEventPublicId: source.publicId,
      targetEventPublicId: target.publicId,
    };
  });

export const getEventTombstone = (publicId: string) =>
  getPublicTombstone("event", publicId);
