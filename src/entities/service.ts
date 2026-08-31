import { and, eq, inArray, or } from "drizzle-orm";
import { database } from "@/db/client";
import {
  entities,
  entityAliases,
  entityLocalizedContents,
  entityVersions,
  eventSources,
  events,
  localizedContents,
  ownerOperationAudits,
  relationEvidence,
  relations,
  sourceItems,
  sources,
} from "@/db/schema";
import { publicRightsStatusSchema } from "@/events/contracts";
import type { EntityCreateRequest, RelationCreateRequest } from "./contracts";
import { getPublicCorrectionsForEntity } from "@/operations/service";
import { refreshEntitySearchIndex } from "@/search/indexer";

const publicRights = [
  "open",
  "attribution_required",
  "source_license",
  "metadata_only",
  "link_only",
] as const;

export const normalizeEntityAlias = (value: string) =>
  value.normalize("NFKC").trim().toLocaleLowerCase();

export const createEntity = async (input: EntityCreateRequest) => {
  const publicVisibility =
    publicRightsStatusSchema.safeParse(input.entity.rightsStatus).success &&
    input.localizations.every(
      ({ reviewStatus }) => reviewStatus === "reviewed",
    );
  const lastVerifiedAt = new Date(input.entity.lastVerifiedAt);

  return database.transaction(async (transaction) => {
    const [entity] = await transaction
      .insert(entities)
      .values({
        ...input.entity,
        lastVerifiedAt,
        publicVisibility,
      })
      .returning({ id: entities.id, publicId: entities.publicId });

    await transaction.insert(entityLocalizedContents).values(
      input.localizations.map((localization) => ({
        ...localization,
        entityId: entity.id,
        publicVisibility,
      })),
    );
    if (input.aliases.length > 0) {
      await transaction.insert(entityAliases).values(
        input.aliases.map((entityAlias) => ({
          ...entityAlias,
          entityId: entity.id,
          normalizedValue: normalizeEntityAlias(entityAlias.value),
          reviewedAt: lastVerifiedAt,
          publicVisibility,
        })),
      );
    }
    if (input.versions.length > 0) {
      await transaction.insert(entityVersions).values(
        input.versions.map((version) => ({
          ...version,
          entityId: entity.id,
          releasedAt: version.releasedAt ? new Date(version.releasedAt) : null,
          lastVerifiedAt,
          publicVisibility,
        })),
      );
    }
    await transaction.insert(ownerOperationAudits).values({
      actorRole: "owner",
      action: "create_entity",
      targetType: "entity",
      targetPublicId: entity.publicId,
      publicVisibility,
    });
    await refreshEntitySearchIndex(transaction, entity.id);

    return {
      publicId: entity.publicId,
      type: input.entity.type,
      publicVisibility,
      locales: input.localizations.map(({ locale }) => locale),
      aliasPublicIds: input.aliases.map(({ publicId }) => publicId),
      versionPublicIds: input.versions.map(({ publicId }) => publicId),
    };
  });
};

const allowedEntityPredicates: Record<
  RelationCreateRequest["relation"]["predicate"],
  {
    subjects: EntityCreateRequest["entity"]["type"][];
    objects: EntityCreateRequest["entity"]["type"][];
  }
> = {
  INTRODUCES: { subjects: ["paper"], objects: ["model"] },
  IMPLEMENTS: {
    subjects: ["repository"],
    objects: ["paper", "model"],
  },
  USES: { subjects: ["product"], objects: ["model"] },
  EVALUATES: { subjects: ["benchmark"], objects: ["model"] },
  WORKS_WITH: { subjects: ["prompt"], objects: ["model", "product"] },
  SUPPORTS: { subjects: ["skill"], objects: ["product"] },
  EXPLAINS: {
    subjects: ["guide"],
    objects: [
      "model",
      "paper",
      "product",
      "repository",
      "prompt",
      "skill",
      "guide",
      "organization",
      "person",
      "benchmark",
      "topic",
    ],
  },
  ANNOUNCES: { subjects: [], objects: [] },
  UPDATES: { subjects: [], objects: [] },
  CHANGES_PRICE_OF: { subjects: [], objects: [] },
  DEPRECATES: { subjects: [], objects: [] },
  DEVELOPS: {
    subjects: ["organization"],
    objects: ["model", "product"],
  },
  AFFILIATED_WITH: { subjects: ["person"], objects: ["organization"] },
  TAGGED_WITH: {
    subjects: [
      "model",
      "paper",
      "product",
      "repository",
      "prompt",
      "skill",
      "guide",
      "organization",
      "person",
      "benchmark",
    ],
    objects: ["topic"],
  },
};

const eventPredicateByType = {
  announces: "ANNOUNCES",
  updates: "UPDATES",
  changes_price_of: "CHANGES_PRICE_OF",
  deprecates: "DEPRECATES",
} as const;

export const createRelation = async (input: RelationCreateRequest) =>
  database.transaction(async (transaction) => {
    const [objectReference] = await transaction
      .select({ id: entities.id })
      .from(entities)
      .where(eq(entities.publicId, input.relation.objectEntityPublicId));
    if (!objectReference) return { status: "not_found" as const };

    let subjectEntityReference: { id: string } | undefined;
    let subjectEventReference: { id: string } | undefined;
    if (input.relation.subject.type === "entity") {
      [subjectEntityReference] = await transaction
        .select({ id: entities.id })
        .from(entities)
        .where(eq(entities.publicId, input.relation.subject.publicId));
      if (!subjectEntityReference) return { status: "not_found" as const };
    } else {
      [subjectEventReference] = await transaction
        .select({ id: events.id })
        .from(events)
        .where(eq(events.publicId, input.relation.subject.publicId));
      if (!subjectEventReference) return { status: "not_found" as const };
    }

    const entityEndpointIds = [
      ...new Set([
        objectReference.id,
        ...(subjectEntityReference ? [subjectEntityReference.id] : []),
      ]),
    ].sort((left, right) => left.localeCompare(right));
    const lockedEntities = await transaction
      .select({
        id: entities.id,
        type: entities.type,
        lifecycleStatus: entities.lifecycleStatus,
        publicVisibility: entities.publicVisibility,
      })
      .from(entities)
      .where(inArray(entities.id, entityEndpointIds))
      .orderBy(entities.id)
      .for("update");
    const object = lockedEntities.find(({ id }) => id === objectReference.id);
    const subjectEntity = subjectEntityReference
      ? lockedEntities.find(({ id }) => id === subjectEntityReference.id)
      : undefined;
    if (
      !object ||
      object.lifecycleStatus !== "active" ||
      !object.publicVisibility ||
      (subjectEntityReference &&
        (!subjectEntity ||
          subjectEntity.lifecycleStatus !== "active" ||
          !subjectEntity.publicVisibility))
    ) {
      return { status: "invalid_relation" as const };
    }

    const [subjectEvent] = subjectEventReference
      ? await transaction
          .select({
            id: events.id,
            eventType: events.eventType,
            publicationState: events.publicationState,
            publicVisibility: events.publicVisibility,
          })
          .from(events)
          .where(eq(events.id, subjectEventReference.id))
          .for("update")
      : [undefined];
    if (
      subjectEventReference &&
      (!subjectEvent ||
        subjectEvent.publicationState !== "published" ||
        !subjectEvent.publicVisibility)
    ) {
      return { status: "invalid_relation" as const };
    }

    if (subjectEntity) {
      const vocabulary = allowedEntityPredicates[input.relation.predicate];
      if (
        !vocabulary.subjects.includes(subjectEntity.type) ||
        !vocabulary.objects.includes(object.type)
      ) {
        return { status: "invalid_relation" as const };
      }
    } else {
      if (
        !subjectEvent ||
        eventPredicateByType[subjectEvent.eventType] !==
          input.relation.predicate
      ) {
        return { status: "invalid_relation" as const };
      }
    }

    const evidence = subjectEvent
      ? await transaction
          .select({ id: sourceItems.id, publicId: sourceItems.publicId })
          .from(sourceItems)
          .innerJoin(
            eventSources,
            and(
              eq(eventSources.sourceItemId, sourceItems.id),
              eq(eventSources.eventId, subjectEvent.id),
            ),
          )
          .where(
            and(
              inArray(sourceItems.publicId, input.evidenceSourceItemPublicIds),
              eq(sourceItems.publicVisibility, true),
            ),
          )
          .orderBy(sourceItems.id)
          .for("update", { of: sourceItems })
      : await transaction
          .select({ id: sourceItems.id, publicId: sourceItems.publicId })
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
      return { status: "invalid_relation" as const };
    }

    const publicVisibility =
      input.relation.reviewStatus === "reviewed" &&
      publicRightsStatusSchema.safeParse(input.relation.rightsStatus).success &&
      object.publicVisibility &&
      (subjectEntity?.publicVisibility ??
        subjectEvent?.publicVisibility ??
        false);
    const [relation] = await transaction
      .insert(relations)
      .values({
        publicId: input.relation.publicId,
        subjectEntityId: subjectEntity?.id,
        subjectEventId: subjectEvent?.id,
        predicate: input.relation.predicate,
        objectEntityId: object.id,
        validFrom: input.relation.validFrom
          ? new Date(input.relation.validFrom)
          : null,
        validTo: input.relation.validTo
          ? new Date(input.relation.validTo)
          : null,
        firstVerifiedAt: new Date(input.relation.firstVerifiedAt),
        lastVerifiedAt: new Date(input.relation.lastVerifiedAt),
        confidence: input.relation.confidence,
        reviewStatus: input.relation.reviewStatus,
        creationMethod: input.relation.creationMethod,
        rightsStatus: input.relation.rightsStatus,
        publicVisibility,
      })
      .returning({ id: relations.id, publicId: relations.publicId });
    await transaction.insert(relationEvidence).values(
      evidence.map(({ id }) => ({
        relationId: relation.id,
        sourceItemId: id,
      })),
    );
    await transaction.insert(ownerOperationAudits).values({
      actorRole: "owner",
      action: "create_relation",
      targetType: "relation",
      targetPublicId: relation.publicId,
      publicVisibility,
    });

    return {
      status: "created" as const,
      publicId: relation.publicId,
      publicVisibility,
      evidenceSourceItemPublicIds: evidence.map(({ publicId }) => publicId),
    };
  });

const publicRelationRows = (
  entityId: string,
  predicate?: RelationCreateRequest["relation"]["predicate"],
) =>
  database
    .select()
    .from(relations)
    .where(
      and(
        eq(relations.publicVisibility, true),
        eq(relations.reviewStatus, "reviewed"),
        inArray(relations.rightsStatus, [...publicRights]),
        or(
          eq(relations.subjectEntityId, entityId),
          eq(relations.objectEntityId, entityId),
        ),
        predicate ? eq(relations.predicate, predicate) : undefined,
      ),
    )
    .orderBy(relations.publicId);

export const getPublicEntity = async (
  publicId: string,
  locale: "en" | "zh",
  predicate?: RelationCreateRequest["relation"]["predicate"],
) => {
  const [entity] = await database
    .select({
      id: entities.id,
      publicId: entities.publicId,
      type: entities.type,
      officialName: entities.officialName,
      officialUrl: entities.officialUrl,
      lifecycleStatus: entities.lifecycleStatus,
      lastVerifiedAt: entities.lastVerifiedAt,
      rightsStatus: entities.rightsStatus,
      localizationLocale: entityLocalizedContents.locale,
      localizationName: entityLocalizedContents.name,
      localizationSummary: entityLocalizedContents.summary,
      localizationAuthorship: entityLocalizedContents.authorship,
      localizationReviewStatus: entityLocalizedContents.reviewStatus,
    })
    .from(entities)
    .innerJoin(
      entityLocalizedContents,
      eq(entityLocalizedContents.entityId, entities.id),
    )
    .where(
      and(
        eq(entities.publicId, publicId),
        eq(entities.lifecycleStatus, "active"),
        eq(entities.publicVisibility, true),
        inArray(entities.rightsStatus, [...publicRights]),
        eq(entityLocalizedContents.locale, locale),
        eq(entityLocalizedContents.reviewStatus, "reviewed"),
        eq(entityLocalizedContents.publicVisibility, true),
      ),
    );
  if (!entity) return null;

  const [aliases, versions, relationRows, correctionHistory] =
    await Promise.all([
      database
        .select({
          publicId: entityAliases.publicId,
          locale: entityAliases.locale,
          kind: entityAliases.kind,
          value: entityAliases.value,
        })
        .from(entityAliases)
        .where(
          and(
            eq(entityAliases.entityId, entity.id),
            eq(entityAliases.publicVisibility, true),
          ),
        )
        .orderBy(entityAliases.locale, entityAliases.kind, entityAliases.value),
      database
        .select({
          publicId: entityVersions.publicId,
          versionLabel: entityVersions.versionLabel,
          releasedAt: entityVersions.releasedAt,
          releasedAtPrecision: entityVersions.releasedAtPrecision,
          lastVerifiedAt: entityVersions.lastVerifiedAt,
        })
        .from(entityVersions)
        .where(
          and(
            eq(entityVersions.entityId, entity.id),
            eq(entityVersions.publicVisibility, true),
          ),
        )
        .orderBy(entityVersions.releasedAt, entityVersions.publicId),
      publicRelationRows(entity.id, predicate),
      getPublicCorrectionsForEntity(entity.id),
    ]);

  const entityIds = [
    ...new Set(
      relationRows.flatMap((relation) =>
        [relation.subjectEntityId, relation.objectEntityId].filter(
          (id): id is string => id !== null,
        ),
      ),
    ),
  ];
  const eventIds = [
    ...new Set(
      relationRows
        .map(({ subjectEventId }) => subjectEventId)
        .filter((id): id is string => id !== null),
    ),
  ];
  const relationIds = relationRows.map(({ id }) => id);
  const [entityNames, eventNames, evidenceRows] = await Promise.all([
    entityIds.length === 0
      ? []
      : database
          .select({
            id: entities.id,
            publicId: entities.publicId,
            name: entityLocalizedContents.name,
          })
          .from(entities)
          .innerJoin(
            entityLocalizedContents,
            and(
              eq(entityLocalizedContents.entityId, entities.id),
              eq(entityLocalizedContents.locale, locale),
              eq(entityLocalizedContents.publicVisibility, true),
            ),
          )
          .where(
            and(
              inArray(entities.id, entityIds),
              eq(entities.publicVisibility, true),
              inArray(entities.rightsStatus, [...publicRights]),
            ),
          ),
    eventIds.length === 0
      ? []
      : database
          .select({
            id: events.id,
            publicId: events.publicId,
            name: localizedContents.title,
            occurredAt: events.occurredAt,
            occurredAtPrecision: events.occurredAtPrecision,
          })
          .from(events)
          .innerJoin(
            localizedContents,
            and(
              eq(localizedContents.eventId, events.id),
              eq(localizedContents.locale, locale),
              eq(localizedContents.publicVisibility, true),
            ),
          )
          .where(
            and(
              inArray(events.id, eventIds),
              eq(events.publicVisibility, true),
              inArray(events.rightsStatus, [...publicRights]),
            ),
          ),
    relationIds.length === 0
      ? []
      : database
          .select({
            relationId: relationEvidence.relationId,
            sourceItemPublicId: sourceItems.publicId,
            originalTitle: sourceItems.originalTitle,
            originalUrl: sourceItems.originalUrl,
            rightsStatus: sourceItems.rightsStatus,
            attribution: sourceItems.attribution,
            licenseUrl: sourceItems.licenseUrl,
            rightsCheckedAt: sourceItems.rightsCheckedAt,
          })
          .from(relationEvidence)
          .innerJoin(
            sourceItems,
            and(
              eq(sourceItems.id, relationEvidence.sourceItemId),
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
          .where(inArray(relationEvidence.relationId, relationIds)),
  ]);
  const entityNameById = new Map(entityNames.map((row) => [row.id, row]));
  const eventNameById = new Map(eventNames.map((row) => [row.id, row]));
  const evidenceByRelationId = new Map<
    string,
    Array<(typeof evidenceRows)[number]>
  >();
  for (const evidence of evidenceRows) {
    const grouped = evidenceByRelationId.get(evidence.relationId) ?? [];
    grouped.push(evidence);
    evidenceByRelationId.set(evidence.relationId, grouped);
  }

  const mappedRelations = relationRows.flatMap((relation) => {
    const object = entityNameById.get(relation.objectEntityId);
    const subject = relation.subjectEntityId
      ? entityNameById.get(relation.subjectEntityId)
      : relation.subjectEventId
        ? eventNameById.get(relation.subjectEventId)
        : undefined;
    const evidence = (evidenceByRelationId.get(relation.id) ?? []).map(
      ({ rightsCheckedAt, ...item }) => ({
        ...item,
        rightsCheckedAt: rightsCheckedAt.toISOString(),
      }),
    );
    if (!object || !subject || evidence.length === 0) return [];
    return [
      {
        publicId: relation.publicId,
        predicate: relation.predicate,
        direction:
          relation.subjectEntityId === entity.id
            ? ("outgoing" as const)
            : ("incoming" as const),
        subject: {
          type: relation.subjectEventId
            ? ("event" as const)
            : ("entity" as const),
          publicId: subject.publicId,
          name: subject.name,
        },
        object: {
          type: "entity" as const,
          publicId: object.publicId,
          name: object.name,
        },
        validFrom: relation.validFrom?.toISOString() ?? null,
        validTo: relation.validTo?.toISOString() ?? null,
        firstVerifiedAt: relation.firstVerifiedAt.toISOString(),
        lastVerifiedAt: relation.lastVerifiedAt.toISOString(),
        confidence: relation.confidence,
        reviewStatus: "reviewed" as const,
        evidence: evidence.map(
          ({
            sourceItemPublicId,
            originalTitle,
            originalUrl,
            rightsStatus,
            attribution,
            licenseUrl,
            rightsCheckedAt,
          }) => ({
            sourceItemPublicId,
            originalTitle,
            originalUrl,
            rightsStatus: publicRightsStatusSchema.parse(rightsStatus),
            attribution,
            licenseUrl,
            rightsCheckedAt,
          }),
        ),
      },
    ];
  });
  const outgoingRelations = mappedRelations
    .filter(({ direction }) => direction === "outgoing")
    .sort((left, right) => left.publicId.localeCompare(right.publicId));
  const backlinks = mappedRelations
    .filter(({ direction }) => direction === "incoming")
    .sort((left, right) => {
      const leftRank = left.subject.type === "event" ? 0 : 1;
      const rightRank = right.subject.type === "event" ? 0 : 1;
      return (
        leftRank - rightRank ||
        left.subject.publicId.localeCompare(right.subject.publicId)
      );
    });
  const timeline = backlinks
    .flatMap((relation) => {
      if (relation.subject.type !== "event") return [];
      const event = eventNames.find(
        ({ publicId: eventPublicId }) =>
          eventPublicId === relation.subject.publicId,
      );
      if (!event) return [];
      return [
        {
          eventPublicId: event.publicId,
          occurredAt: event.occurredAt.toISOString(),
          occurredAtPrecision: event.occurredAtPrecision,
          relationPublicId: relation.publicId,
          predicate: relation.predicate,
          title: event.name,
        },
      ];
    })
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));

  const graphNodeId = (type: "entity" | "event", nodePublicId: string) =>
    `${type}:${nodePublicId}`;
  const graphNodes = new Map<
    string,
    {
      nodeId: string;
      type: "entity" | "event";
      publicId: string;
      label: string;
    }
  >([
    [
      graphNodeId("entity", entity.publicId),
      {
        nodeId: graphNodeId("entity", entity.publicId),
        type: "entity" as const,
        publicId: entity.publicId,
        label: entity.localizationName,
      },
    ],
  ]);
  const graphEdges: Array<{
    relationPublicId: string;
    fromNodeId: string;
    toNodeId: string;
    predicate: (typeof relationRows)[number]["predicate"];
  }> = [];
  let truncated = false;
  const prioritizedGraphRelations = [...mappedRelations].sort(
    (left, right) =>
      right.confidence - left.confidence ||
      right.lastVerifiedAt.localeCompare(left.lastVerifiedAt) ||
      left.publicId.localeCompare(right.publicId),
  );
  for (const relation of prioritizedGraphRelations) {
    if (graphEdges.length === 19) {
      truncated = true;
      continue;
    }
    const neighbor =
      relation.direction === "outgoing" ? relation.object : relation.subject;
    const neighborNodeId = graphNodeId(neighbor.type, neighbor.publicId);
    if (!graphNodes.has(neighborNodeId) && graphNodes.size === 20) {
      truncated = true;
      continue;
    }
    graphNodes.set(neighborNodeId, {
      nodeId: neighborNodeId,
      type: neighbor.type,
      publicId: neighbor.publicId,
      label: neighbor.name,
    });
    graphEdges.push({
      relationPublicId: relation.publicId,
      fromNodeId: graphNodeId(relation.subject.type, relation.subject.publicId),
      toNodeId: graphNodeId(relation.object.type, relation.object.publicId),
      predicate: relation.predicate,
    });
  }

  return {
    publicId: entity.publicId,
    type: entity.type,
    officialName: entity.officialName,
    officialUrl: entity.officialUrl,
    lifecycleStatus: "active" as const,
    lastVerifiedAt: entity.lastVerifiedAt.toISOString(),
    rightsStatus: entity.rightsStatus,
    localization: {
      locale: entity.localizationLocale,
      name: entity.localizationName,
      summary: entity.localizationSummary,
      authorship: entity.localizationAuthorship,
      reviewStatus: "reviewed" as const,
    },
    aliases,
    versions: versions.map((version) => ({
      ...version,
      releasedAt: version.releasedAt?.toISOString() ?? null,
      lastVerifiedAt: version.lastVerifiedAt.toISOString(),
    })),
    outgoingRelations,
    backlinks,
    timeline,
    graph: {
      nodes: [...graphNodes.values()],
      edges: graphEdges,
      truncated,
    },
    corrections: correctionHistory,
  };
};

export const resolvePublicEntityAlias = async (
  value: string,
  locale: "en" | "zh",
  type?: EntityCreateRequest["entity"]["type"],
) => {
  const matches = await database
    .select({
      publicId: entities.publicId,
      type: entities.type,
      aliasKind: entityAliases.kind,
    })
    .from(entityAliases)
    .innerJoin(entities, eq(entities.id, entityAliases.entityId))
    .where(
      and(
        eq(entityAliases.normalizedValue, normalizeEntityAlias(value)),
        eq(entityAliases.locale, locale),
        eq(entityAliases.publicVisibility, true),
        eq(entities.publicVisibility, true),
        eq(entities.lifecycleStatus, "active"),
        type ? eq(entities.type, type) : undefined,
      ),
    );
  if (matches.length === 0) return { status: "not_found" as const };
  if (matches.length > 1) return { status: "ambiguous" as const };
  return {
    status: "resolved" as const,
    publicId: matches[0].publicId,
    type: matches[0].type,
    matchedAlias: value,
    aliasKind: matches[0].aliasKind,
  };
};

export const getPublicEntityVersion = async (
  publicId: string,
  locale: "en" | "zh",
) => {
  const [version] = await database
    .select({
      publicId: entityVersions.publicId,
      entityPublicId: entities.publicId,
      entityName: entityLocalizedContents.name,
      versionLabel: entityVersions.versionLabel,
      releasedAt: entityVersions.releasedAt,
      releasedAtPrecision: entityVersions.releasedAtPrecision,
      lastVerifiedAt: entityVersions.lastVerifiedAt,
    })
    .from(entityVersions)
    .innerJoin(entities, eq(entities.id, entityVersions.entityId))
    .innerJoin(
      entityLocalizedContents,
      and(
        eq(entityLocalizedContents.entityId, entities.id),
        eq(entityLocalizedContents.locale, locale),
        eq(entityLocalizedContents.publicVisibility, true),
      ),
    )
    .where(
      and(
        eq(entityVersions.publicId, publicId),
        eq(entityVersions.publicVisibility, true),
        eq(entities.publicVisibility, true),
      ),
    );
  if (!version) return null;
  return {
    ...version,
    releasedAt: version.releasedAt?.toISOString() ?? null,
    lastVerifiedAt: version.lastVerifiedAt.toISOString(),
  };
};
