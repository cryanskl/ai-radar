import { and, desc, eq, inArray } from "drizzle-orm";
import { database } from "@/db/client";
import {
  eventPublicationAudits,
  eventSources,
  events,
  localizedContents,
  sourceItems,
  sources,
} from "@/db/schema";
import { publicRightsStatusSchema, type EventDraftRequest } from "./contracts";

const approvedSourceAccessStatuses = new Set(["approved", "approved_limited"]);

const fulfillsRightsRequirements = (
  rightsStatus: EventDraftRequest["sourceItem"]["rightsStatus"],
  licenseUrl: string | null,
) =>
  publicRightsStatusSchema.safeParse(rightsStatus).success &&
  (rightsStatus !== "open" && rightsStatus !== "source_license"
    ? true
    : licenseUrl !== null);

const initialPublicationState = (input: EventDraftRequest) => {
  if (input.event.factStatus === "withdrawn") return "withdrawn" as const;

  const ready =
    publicRightsStatusSchema.safeParse(input.event.rightsStatus).success &&
    fulfillsRightsRequirements(
      input.sourceItem.rightsStatus,
      input.sourceItem.licenseUrl,
    ) &&
    approvedSourceAccessStatuses.has(input.source.accessStatus) &&
    input.localizations.every(
      ({ reviewStatus }) => reviewStatus === "reviewed",
    );
  return ready ? ("ready" as const) : ("verifying" as const);
};

export const createEventDraft = async (input: EventDraftRequest) => {
  const publicationState = initialPublicationState(input);
  return database.transaction(async (transaction) => {
    const [source] = await transaction
      .insert(sources)
      .values({
        ...input.source,
        policyLastReviewedAt: new Date(input.source.policyLastReviewedAt),
      })
      .returning({ id: sources.id });
    const [sourceItem] = await transaction
      .insert(sourceItems)
      .values({
        ...input.sourceItem,
        sourceId: source.id,
        publishedAt: new Date(input.sourceItem.publishedAt),
        discoveredAt: new Date(input.sourceItem.discoveredAt),
        rightsCheckedAt: new Date(input.sourceItem.rightsCheckedAt),
      })
      .returning({ id: sourceItems.id });
    const [event] = await transaction
      .insert(events)
      .values({
        ...input.event,
        publicationState,
        occurredAt: new Date(input.event.occurredAt),
        discoveredAt: new Date(input.sourceItem.discoveredAt),
        lastVerifiedAt: new Date(input.event.lastVerifiedAt),
      })
      .returning({ id: events.id, publicId: events.publicId });

    await transaction.insert(eventSources).values({
      eventId: event.id,
      sourceItemId: sourceItem.id,
      isPrimary: true,
    });
    await transaction.insert(localizedContents).values(
      input.localizations.map((localization) => ({
        ...localization,
        eventId: event.id,
      })),
    );

    return {
      publicId: event.publicId,
      publicationState,
      locales: input.localizations.map(({ locale }) => locale),
    };
  });
};

export const getEventDraft = async (publicId: string) => {
  const rows = await database
    .select({
      publicId: events.publicId,
      eventType: events.eventType,
      factStatus: events.factStatus,
      publicationState: events.publicationState,
      occurredAt: events.occurredAt,
      occurredAtPrecision: events.occurredAtPrecision,
      lastVerifiedAt: events.lastVerifiedAt,
      rightsStatus: events.rightsStatus,
      locale: localizedContents.locale,
      title: localizedContents.title,
      summary: localizedContents.summary,
      authorship: localizedContents.authorship,
      reviewStatus: localizedContents.reviewStatus,
      sourceName: sources.name,
      sourceTier: sources.tier,
      originalTitle: sourceItems.originalTitle,
      originalUrl: sourceItems.originalUrl,
      sourcePublishedAt: sourceItems.publishedAt,
      sourcePublishedAtPrecision: sourceItems.publishedAtPrecision,
      discoveredAt: sourceItems.discoveredAt,
      sourceRightsStatus: sourceItems.rightsStatus,
    })
    .from(events)
    .innerJoin(eventSources, eq(eventSources.eventId, events.id))
    .innerJoin(sourceItems, eq(sourceItems.id, eventSources.sourceItemId))
    .innerJoin(sources, eq(sources.id, sourceItems.sourceId))
    .innerJoin(localizedContents, eq(localizedContents.eventId, events.id))
    .where(eq(events.publicId, publicId));

  if (rows.length === 0) return null;
  const [event] = rows;
  return {
    publicId: event.publicId,
    eventType: event.eventType,
    factStatus: event.factStatus,
    publicationState: event.publicationState,
    occurredAt: event.occurredAt.toISOString(),
    occurredAtPrecision: event.occurredAtPrecision,
    lastVerifiedAt: event.lastVerifiedAt.toISOString(),
    rightsStatus: event.rightsStatus,
    source: {
      name: event.sourceName,
      tier: event.sourceTier,
      originalTitle: event.originalTitle,
      originalUrl: event.originalUrl,
      publishedAt: event.sourcePublishedAt.toISOString(),
      publishedAtPrecision: event.sourcePublishedAtPrecision,
      discoveredAt: event.discoveredAt.toISOString(),
      rightsStatus: event.sourceRightsStatus,
    },
    localizations: rows.map((row) => ({
      locale: row.locale,
      title: row.title,
      summary: row.summary,
      authorship: row.authorship,
      reviewStatus: row.reviewStatus,
    })),
  };
};

export const publishEvent = async (publicId: string) =>
  database.transaction(async (transaction) => {
    const [event] = await transaction
      .select({
        id: events.id,
        factStatus: events.factStatus,
        publicationState: events.publicationState,
        rightsStatus: events.rightsStatus,
      })
      .from(events)
      .where(eq(events.publicId, publicId));
    if (!event) return { status: "not_found" as const };
    if (event.publicationState === "published") {
      return { status: "published" as const, publicId };
    }
    if (
      event.publicationState !== "ready" ||
      event.factStatus === "withdrawn"
    ) {
      return { status: "not_publishable" as const };
    }

    const localizations = await transaction
      .select({
        locale: localizedContents.locale,
        reviewStatus: localizedContents.reviewStatus,
      })
      .from(localizedContents)
      .where(eq(localizedContents.eventId, event.id));
    const linkedSourceItems = await transaction
      .select({
        id: sourceItems.id,
        rightsStatus: sourceItems.rightsStatus,
        licenseUrl: sourceItems.licenseUrl,
        attribution: sourceItems.attribution,
        sourceAccessStatus: sources.accessStatus,
      })
      .from(eventSources)
      .innerJoin(sourceItems, eq(sourceItems.id, eventSources.sourceItemId))
      .innerJoin(sources, eq(sources.id, sourceItems.sourceId))
      .where(eq(eventSources.eventId, event.id));
    const hasReviewedLocales =
      localizations.length === 2 &&
      new Set(localizations.map(({ locale }) => locale)).size === 2 &&
      localizations.every(({ reviewStatus }) => reviewStatus === "reviewed");
    const hasPublicRights =
      publicRightsStatusSchema.safeParse(event.rightsStatus).success &&
      linkedSourceItems.length > 0 &&
      linkedSourceItems.every(
        ({ attribution, licenseUrl, rightsStatus, sourceAccessStatus }) =>
          attribution.length > 0 &&
          fulfillsRightsRequirements(rightsStatus, licenseUrl) &&
          approvedSourceAccessStatuses.has(sourceAccessStatus),
      );
    if (!hasReviewedLocales || !hasPublicRights) {
      return { status: "not_publishable" as const };
    }

    const publishedAt = new Date();
    await transaction
      .update(events)
      .set({
        publicationState: "published",
        publicVisibility: true,
        firstPublishedAt: publishedAt,
        updatedAt: publishedAt,
      })
      .where(eq(events.id, event.id));
    await transaction
      .update(sourceItems)
      .set({ publicVisibility: true, updatedAt: publishedAt })
      .where(
        inArray(
          sourceItems.id,
          linkedSourceItems.map(({ id }) => id),
        ),
      );
    await transaction
      .update(localizedContents)
      .set({ publicVisibility: true, updatedAt: publishedAt })
      .where(eq(localizedContents.eventId, event.id));
    await transaction.insert(eventPublicationAudits).values({
      eventId: event.id,
      action: "publish",
      actorRole: "owner",
      fromState: event.publicationState,
      toState: "published",
      createdAt: publishedAt,
    });

    return { status: "published" as const, publicId };
  });

const selectPublicEventRows = (locale: "en" | "zh", publicId?: string) =>
  database
    .select({
      id: events.id,
      publicId: events.publicId,
      eventType: events.eventType,
      factStatus: events.factStatus,
      occurredAt: events.occurredAt,
      occurredAtPrecision: events.occurredAtPrecision,
      discoveredAt: events.discoveredAt,
      lastVerifiedAt: events.lastVerifiedAt,
      rightsStatus: events.rightsStatus,
      locale: localizedContents.locale,
      title: localizedContents.title,
      summary: localizedContents.summary,
      authorship: localizedContents.authorship,
      sourcePublicId: sources.publicId,
      sourceItemPublicId: sourceItems.publicId,
      sourceName: sources.name,
      sourceTier: sources.tier,
      originalTitle: sourceItems.originalTitle,
      originalUrl: sourceItems.originalUrl,
      sourcePublishedAt: sourceItems.publishedAt,
      sourcePublishedAtPrecision: sourceItems.publishedAtPrecision,
      sourceRightsStatus: sourceItems.rightsStatus,
      sourceAttribution: sourceItems.attribution,
      sourceLicenseUrl: sourceItems.licenseUrl,
    })
    .from(events)
    .innerJoin(localizedContents, eq(localizedContents.eventId, events.id))
    .innerJoin(eventSources, eq(eventSources.eventId, events.id))
    .innerJoin(sourceItems, eq(sourceItems.id, eventSources.sourceItemId))
    .innerJoin(sources, eq(sources.id, sourceItems.sourceId))
    .where(
      and(
        eq(events.publicationState, "published"),
        eq(events.publicVisibility, true),
        eq(localizedContents.locale, locale),
        eq(localizedContents.reviewStatus, "reviewed"),
        eq(localizedContents.publicVisibility, true),
        eq(sourceItems.publicVisibility, true),
        publicId ? eq(events.publicId, publicId) : undefined,
      ),
    )
    .orderBy(
      desc(events.occurredAt),
      desc(eventSources.isPrimary),
      events.publicId,
    );

const mapPublicEvents = (
  rows: Awaited<ReturnType<typeof selectPublicEventRows>>,
) => {
  const mapped = new Map<
    string,
    {
      publicId: string;
      eventType: (typeof rows)[number]["eventType"];
      factStatus: (typeof rows)[number]["factStatus"];
      publicationState: "published";
      occurredAt: string;
      occurredAtPrecision: (typeof rows)[number]["occurredAtPrecision"];
      discoveredAt: string;
      lastVerifiedAt: string;
      rightsStatus: (typeof rows)[number]["rightsStatus"];
      localization: {
        locale: (typeof rows)[number]["locale"];
        title: string;
        summary: string;
        authorship: (typeof rows)[number]["authorship"];
        reviewStatus: "reviewed";
      };
      sources: Array<{
        publicId: string;
        sourceItemPublicId: string;
        name: string;
        tier: (typeof rows)[number]["sourceTier"];
        originalTitle: string;
        originalUrl: string;
        publishedAt: string;
        publishedAtPrecision: (typeof rows)[number]["sourcePublishedAtPrecision"];
        rightsStatus: (typeof rows)[number]["sourceRightsStatus"];
        attribution: string;
        licenseUrl: string | null;
      }>;
    }
  >();

  for (const row of rows) {
    let event = mapped.get(row.id);
    if (!event) {
      event = {
        publicId: row.publicId,
        eventType: row.eventType,
        factStatus: row.factStatus,
        publicationState: "published",
        occurredAt: row.occurredAt.toISOString(),
        occurredAtPrecision: row.occurredAtPrecision,
        discoveredAt: row.discoveredAt.toISOString(),
        lastVerifiedAt: row.lastVerifiedAt.toISOString(),
        rightsStatus: row.rightsStatus,
        localization: {
          locale: row.locale,
          title: row.title,
          summary: row.summary,
          authorship: row.authorship,
          reviewStatus: "reviewed",
        },
        sources: [],
      };
      mapped.set(row.id, event);
    }
    event.sources.push({
      publicId: row.sourcePublicId,
      sourceItemPublicId: row.sourceItemPublicId,
      name: row.sourceName,
      tier: row.sourceTier,
      originalTitle: row.originalTitle,
      originalUrl: row.originalUrl,
      publishedAt: row.sourcePublishedAt.toISOString(),
      publishedAtPrecision: row.sourcePublishedAtPrecision,
      rightsStatus: row.sourceRightsStatus,
      attribution: row.sourceAttribution,
      licenseUrl: row.sourceLicenseUrl,
    });
  }

  return [...mapped.values()];
};

export const listPublicEvents = async (locale: "en" | "zh") =>
  mapPublicEvents(await selectPublicEventRows(locale));

export const getPublicEvent = async (publicId: string, locale: "en" | "zh") =>
  mapPublicEvents(await selectPublicEventRows(locale, publicId))[0] ?? null;
