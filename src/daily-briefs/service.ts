import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { database } from "@/db/client";
import {
  dailyBriefItems,
  dailyBriefs,
  emailDeliveries,
  emailDeliveryEvents,
  emailSubscriptions,
  events,
  eventSources,
  localizedContents,
  ownerOperationAudits,
  sourceItems,
  sources,
} from "@/db/schema";
import type {
  DailyBriefCreateRequest,
  PublishedDailyBriefContract,
} from "./contracts";
import type {
  EmailMessage,
  EmailProvider,
  EmailProviderEvent,
} from "./email-provider";
import {
  renderDailyBriefEmail,
  renderSubscriptionConfirmationEmail,
} from "./rendering";
import { createEmailToken, verifyEmailToken } from "./tokens";

type Locale = "en" | "zh";
type EmailRuntime = { origin: string; tokenSecret: string };
type Transaction = Parameters<Parameters<typeof database.transaction>[0]>[0];
type BriefProjection = Omit<PublishedDailyBriefContract, "publishedAt"> & {
  state: "draft" | "published";
  publishedAt: string | null;
};

const publicRights = [
  "open",
  "attribution_required",
  "source_license",
  "metadata_only",
  "link_only",
] as const;

const selectBriefRows = async (
  publicId: string,
  visibility: "any" | "published",
) =>
  database
    .select({
      id: dailyBriefs.id,
      publicId: dailyBriefs.publicId,
      editionPublicId: dailyBriefs.editionPublicId,
      locale: dailyBriefs.locale,
      briefDate: dailyBriefs.briefDate,
      version: dailyBriefs.version,
      dataCutoff: dailyBriefs.dataCutoff,
      state: dailyBriefs.state,
      publishedAt: dailyBriefs.publishedAt,
      title: dailyBriefs.title,
      overview: dailyBriefs.overview,
      coverageNote: dailyBriefs.coverageNote,
      whatToWatch: dailyBriefs.whatToWatch,
      position: dailyBriefItems.position,
      section: dailyBriefItems.section,
      commentary: dailyBriefItems.commentary,
      eventPublicId: dailyBriefItems.eventPublicId,
      eventTitle: dailyBriefItems.eventTitle,
      eventSummary: dailyBriefItems.eventSummary,
      eventOccurredAt: dailyBriefItems.eventOccurredAt,
      eventHref: dailyBriefItems.eventHref,
      sourceTitle: dailyBriefItems.sourceTitle,
      sourceUrl: dailyBriefItems.sourceUrl,
    })
    .from(dailyBriefs)
    .innerJoin(dailyBriefItems, eq(dailyBriefItems.briefId, dailyBriefs.id))
    .where(
      and(
        eq(dailyBriefs.publicId, publicId),
        visibility === "published"
          ? eq(dailyBriefs.state, "published")
          : undefined,
      ),
    )
    .orderBy(dailyBriefItems.position);

const mapBriefRows = (
  rows: Awaited<ReturnType<typeof selectBriefRows>>,
): BriefProjection | null => {
  const first = rows[0];
  if (!first) return null;
  return {
    publicId: first.publicId,
    editionPublicId: first.editionPublicId,
    locale: first.locale,
    briefDate: first.briefDate,
    version: first.version,
    dataCutoff: first.dataCutoff.toISOString(),
    state: first.state,
    publishedAt: first.publishedAt?.toISOString() ?? null,
    title: first.title,
    overview: first.overview,
    coverageNote: first.coverageNote,
    whatToWatch: first.whatToWatch,
    correctionUrl: "https://github.com/cryanskl/ai-radar/issues/new",
    items: rows.map((row) => ({
      position: row.position,
      section: row.section,
      commentary: row.commentary,
      event: {
        publicId: row.eventPublicId,
        title: row.eventTitle,
        summary: row.eventSummary,
        occurredAt: row.eventOccurredAt.toISOString(),
        href: row.eventHref,
        source:
          row.sourceTitle && row.sourceUrl
            ? { title: row.sourceTitle, url: row.sourceUrl }
            : null,
      },
    })),
  };
};

export const getDailyBriefPreview = async (publicId: string) =>
  mapBriefRows(await selectBriefRows(publicId, "any"));

export const getPublishedDailyBrief = async (
  publicId: string,
  locale?: Locale,
) => {
  const projection = mapBriefRows(await selectBriefRows(publicId, "published"));
  if (!projection || (locale && projection.locale !== locale)) return null;
  if (!projection.publishedAt) {
    throw new Error("published_daily_brief_time_missing");
  }
  const { state, ...brief } = projection;
  void state;
  return { ...brief, publishedAt: projection.publishedAt };
};

export const getLatestPublishedDailyBrief = async (locale: Locale) => {
  const [latest] = await database
    .select({ publicId: dailyBriefs.publicId })
    .from(dailyBriefs)
    .where(
      and(eq(dailyBriefs.locale, locale), eq(dailyBriefs.state, "published")),
    )
    .orderBy(desc(dailyBriefs.briefDate), desc(dailyBriefs.publishedAt))
    .limit(1);
  return latest ? getPublishedDailyBrief(latest.publicId, locale) : null;
};

export const createDailyBrief = async (input: DailyBriefCreateRequest) => {
  const referencedEvents = await database
    .select({
      id: events.id,
      sourceItemId: sourceItems.id,
      publicId: events.publicId,
      lastVerifiedAt: events.lastVerifiedAt,
      occurredAt: events.occurredAt,
      title: localizedContents.title,
      summary: localizedContents.summary,
      sourceTitle: sourceItems.originalTitle,
      sourceUrl: sourceItems.originalUrl,
    })
    .from(events)
    .innerJoin(localizedContents, eq(localizedContents.eventId, events.id))
    .innerJoin(eventSources, eq(eventSources.eventId, events.id))
    .innerJoin(sourceItems, eq(sourceItems.id, eventSources.sourceItemId))
    .innerJoin(sources, eq(sources.id, sourceItems.sourceId))
    .where(
      and(
        inArray(
          events.publicId,
          input.items.map(({ eventPublicId }) => eventPublicId),
        ),
        eq(events.publicationState, "published"),
        eq(events.publicVisibility, true),
        inArray(events.rightsStatus, publicRights),
        eq(localizedContents.locale, input.locale),
        eq(localizedContents.reviewStatus, "reviewed"),
        eq(localizedContents.publicVisibility, true),
        eq(sourceItems.publicVisibility, true),
        inArray(sourceItems.rightsStatus, publicRights),
        inArray(sources.accessStatus, ["approved", "approved_limited"]),
      ),
    )
    .orderBy(desc(eventSources.isPrimary), sourceItems.publicId);

  const eventByPublicId = new Map<string, (typeof referencedEvents)[number]>();
  for (const event of referencedEvents) {
    if (!eventByPublicId.has(event.publicId)) {
      eventByPublicId.set(event.publicId, event);
    }
  }
  if (eventByPublicId.size !== input.items.length) {
    return { status: "invalid_reference" as const };
  }
  const dataCutoff = new Date(input.dataCutoff);
  if (
    [...eventByPublicId.values()].some(
      ({ lastVerifiedAt }) => lastVerifiedAt > dataCutoff,
    )
  ) {
    return { status: "event_after_data_cutoff" as const };
  }

  return database.transaction(async (transaction) => {
    const [brief] = await transaction
      .insert(dailyBriefs)
      .values({
        publicId: input.publicId,
        editionPublicId: input.editionPublicId,
        locale: input.locale,
        briefDate: input.briefDate,
        version: input.version,
        dataCutoff,
        title: input.title,
        overview: input.overview,
        coverageNote: input.coverageNote,
        whatToWatch: input.whatToWatch,
        authorship: input.authorship,
        reviewStatus: input.reviewStatus,
      })
      .returning({ id: dailyBriefs.id });
    await transaction.insert(dailyBriefItems).values(
      input.items.map((item) => {
        const event = eventByPublicId.get(item.eventPublicId);
        if (!event) throw new Error("validated_daily_brief_event_missing");
        return {
          briefId: brief.id,
          eventId: event.id,
          sourceItemId: event.sourceItemId,
          position: item.position,
          section: item.section,
          commentary: item.commentary,
          eventPublicId: event.publicId,
          eventTitle: event.title,
          eventSummary: event.summary,
          eventOccurredAt: event.occurredAt,
          eventHref: `/${input.locale}/radar/events/${event.publicId}`,
          sourceTitle: event.sourceTitle,
          sourceUrl: event.sourceUrl,
        };
      }),
    );
    await transaction.insert(ownerOperationAudits).values({
      actorRole: "owner",
      action: "create_daily_brief",
      targetType: "daily_brief",
      targetPublicId: input.publicId,
      publicVisibility: false,
    });
    return {
      status: "created" as const,
      publicId: input.publicId,
      editionPublicId: input.editionPublicId,
      state: "draft" as const,
      locale: input.locale,
      briefDate: input.briefDate,
      version: input.version,
      dataCutoff: input.dataCutoff,
      reviewStatus: input.reviewStatus,
      itemCount: input.items.length,
    };
  });
};

const sendPendingDelivery = async (
  deliveryId: string,
  message: Omit<EmailMessage, "idempotencyKey" | "deliveryPublicId">,
  provider: EmailProvider,
) =>
  database.transaction(async (transaction) => {
    const [delivery] = await transaction
      .select({
        id: emailDeliveries.id,
        publicId: emailDeliveries.publicId,
        idempotencyKey: emailDeliveries.idempotencyKey,
        provider: emailDeliveries.provider,
        status: emailDeliveries.status,
      })
      .from(emailDeliveries)
      .where(eq(emailDeliveries.id, deliveryId))
      .for("update");
    if (!delivery) throw new Error("email_delivery_missing");
    if (delivery.provider !== provider.name) {
      throw new Error("email_delivery_provider_changed");
    }
    if (delivery.status !== "pending") return delivery.status;

    let sent: Awaited<ReturnType<EmailProvider["send"]>>;
    try {
      sent = await provider.send({
        ...message,
        idempotencyKey: delivery.idempotencyKey,
        deliveryPublicId: delivery.publicId,
      });
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      await transaction
        .update(emailDeliveries)
        .set({
          status: "failed",
          failureReason: error.message,
          updatedAt: new Date(),
        })
        .where(eq(emailDeliveries.id, delivery.id));
      return "failed" as const;
    }

    const acceptedAt = new Date();
    await transaction
      .update(emailDeliveries)
      .set({
        providerMessageId: sent.messageId,
        status: "accepted",
        acceptedAt,
        updatedAt: acceptedAt,
      })
      .where(eq(emailDeliveries.id, delivery.id));
    return "accepted" as const;
  });

const createEditionDeliveries = async (
  transaction: Transaction,
  briefs: Array<{ id: string; locale: Locale }>,
  providerName: EmailProvider["name"],
) => {
  for (const brief of briefs) {
    const subscribers = await transaction
      .select({ id: emailSubscriptions.id })
      .from(emailSubscriptions)
      .where(
        and(
          eq(emailSubscriptions.locale, brief.locale),
          eq(emailSubscriptions.state, "confirmed"),
        ),
      );
    if (subscribers.length > 0) {
      await transaction.insert(emailDeliveries).values(
        subscribers.map((subscriber) => ({
          publicId: `email-delivery-${randomUUID()}`,
          kind: "daily_brief" as const,
          briefId: brief.id,
          subscriptionId: subscriber.id,
          provider: providerName,
          idempotencyKey: `daily-brief:${brief.id}:${subscriber.id}`,
        })),
      );
    }
  }
};

const validateEditionForPublication = async (
  transaction: Transaction,
  briefs: Array<{
    id: string;
    locale: Locale;
    briefDate: string;
    version: string;
    dataCutoff: Date;
    reviewStatus: "draft" | "reviewed";
  }>,
) => {
  if (
    briefs.length !== 2 ||
    new Set(briefs.map(({ locale }) => locale)).size !== 2 ||
    briefs.some(({ reviewStatus }) => reviewStatus !== "reviewed") ||
    briefs[0].briefDate !== briefs[1].briefDate ||
    briefs[0].version !== briefs[1].version ||
    briefs[0].dataCutoff.getTime() !== briefs[1].dataCutoff.getTime()
  ) {
    return false;
  }

  const items = await transaction
    .select({
      briefId: dailyBriefItems.briefId,
      eventId: dailyBriefItems.eventId,
      position: dailyBriefItems.position,
      section: dailyBriefItems.section,
    })
    .from(dailyBriefItems)
    .where(
      inArray(
        dailyBriefItems.briefId,
        briefs.map(({ id }) => id),
      ),
    )
    .orderBy(dailyBriefItems.briefId, dailyBriefItems.position);
  const signature = (briefId: string) =>
    items
      .filter((item) => item.briefId === briefId)
      .map(
        ({ eventId, position, section }) => `${position}:${section}:${eventId}`,
      );
  if (signature(briefs[0].id).join("|") !== signature(briefs[1].id).join("|")) {
    return false;
  }

  const eligible = await transaction
    .select({
      briefId: dailyBriefItems.briefId,
      eventId: dailyBriefItems.eventId,
    })
    .from(dailyBriefItems)
    .innerJoin(dailyBriefs, eq(dailyBriefs.id, dailyBriefItems.briefId))
    .innerJoin(events, eq(events.id, dailyBriefItems.eventId))
    .innerJoin(localizedContents, eq(localizedContents.eventId, events.id))
    .innerJoin(
      eventSources,
      and(
        eq(eventSources.eventId, events.id),
        eq(eventSources.sourceItemId, dailyBriefItems.sourceItemId),
      ),
    )
    .innerJoin(sourceItems, eq(sourceItems.id, dailyBriefItems.sourceItemId))
    .innerJoin(sources, eq(sources.id, sourceItems.sourceId))
    .where(
      and(
        inArray(
          dailyBriefItems.briefId,
          briefs.map(({ id }) => id),
        ),
        eq(events.publicationState, "published"),
        eq(events.publicVisibility, true),
        inArray(events.rightsStatus, publicRights),
        eq(localizedContents.locale, dailyBriefs.locale),
        eq(localizedContents.reviewStatus, "reviewed"),
        eq(localizedContents.publicVisibility, true),
        eq(sourceItems.publicVisibility, true),
        inArray(sourceItems.rightsStatus, publicRights),
        inArray(sources.accessStatus, ["approved", "approved_limited"]),
      ),
    );
  const eligibleKeys = new Set(
    eligible.map(({ briefId, eventId }) => `${briefId}:${eventId}`),
  );
  return items.every(({ briefId, eventId }) =>
    eligibleKeys.has(`${briefId}:${eventId}`),
  );
};

const sendPendingEditionDeliveries = async (
  editionPublicId: string,
  provider: EmailProvider,
  runtime: EmailRuntime,
) => {
  const tasks = await database
    .select({
      deliveryId: emailDeliveries.id,
      briefPublicId: dailyBriefs.publicId,
      subscriptionId: emailSubscriptions.id,
      email: emailSubscriptions.email,
    })
    .from(emailDeliveries)
    .innerJoin(dailyBriefs, eq(dailyBriefs.id, emailDeliveries.briefId))
    .innerJoin(
      emailSubscriptions,
      eq(emailSubscriptions.id, emailDeliveries.subscriptionId),
    )
    .where(
      and(
        eq(dailyBriefs.editionPublicId, editionPublicId),
        eq(emailDeliveries.status, "pending"),
      ),
    );
  let accepted = 0;
  let failed = 0;
  for (const task of tasks) {
    const brief = await getPublishedDailyBrief(task.briefPublicId);
    if (!brief) throw new Error("published_daily_brief_missing");
    const unsubscribeToken = createEmailToken(
      { purpose: "unsubscribe", subscriptionId: task.subscriptionId },
      runtime.tokenSecret,
    );
    const briefUrl = `${runtime.origin}/${brief.locale}/briefs/${brief.publicId}`;
    const content = renderDailyBriefEmail(brief, {
      briefUrl,
      unsubscribeUrl: `${runtime.origin}/${brief.locale}/email/unsubscribe#token=${encodeURIComponent(unsubscribeToken)}`,
    });
    const status = await sendPendingDelivery(
      task.deliveryId,
      { ...content, to: task.email, briefPublicId: brief.publicId },
      provider,
    );
    if (status === "accepted") accepted += 1;
    if (status === "failed") failed += 1;
  }
  return { accepted, failed };
};

export const publishDailyBrief = async (
  publicId: string,
  provider: EmailProvider,
  runtime: EmailRuntime,
) => {
  const publication = await database.transaction(async (transaction) => {
    const [requested] = await transaction
      .select({ editionPublicId: dailyBriefs.editionPublicId })
      .from(dailyBriefs)
      .where(eq(dailyBriefs.publicId, publicId));
    if (!requested) return { status: "not_found" as const };

    const briefs = await transaction
      .select({
        id: dailyBriefs.id,
        publicId: dailyBriefs.publicId,
        locale: dailyBriefs.locale,
        briefDate: dailyBriefs.briefDate,
        version: dailyBriefs.version,
        dataCutoff: dailyBriefs.dataCutoff,
        reviewStatus: dailyBriefs.reviewStatus,
        state: dailyBriefs.state,
      })
      .from(dailyBriefs)
      .where(eq(dailyBriefs.editionPublicId, requested.editionPublicId))
      .for("update");
    if (!(await validateEditionForPublication(transaction, briefs))) {
      return { status: "not_publishable" as const };
    }
    if (briefs.every(({ state }) => state === "published")) {
      return {
        status: "ready" as const,
        editionPublicId: requested.editionPublicId,
        publicIds: briefs.map(({ publicId }) => publicId),
      };
    }
    if (briefs.some(({ state }) => state !== "draft")) {
      return { status: "not_publishable" as const };
    }

    const publishedAt = new Date();
    const transitioned = await transaction
      .update(dailyBriefs)
      .set({ state: "published", publishedAt })
      .where(
        and(
          eq(dailyBriefs.editionPublicId, requested.editionPublicId),
          eq(dailyBriefs.state, "draft"),
        ),
      )
      .returning({ id: dailyBriefs.id });
    if (transitioned.length !== 2) {
      throw new Error("daily_brief_edition_transition_failed");
    }
    await createEditionDeliveries(transaction, briefs, provider.name);
    await transaction.insert(ownerOperationAudits).values(
      briefs.map((brief) => ({
        actorRole: "owner",
        action: "publish_daily_brief",
        targetType: "daily_brief",
        targetPublicId: brief.publicId,
        publicVisibility: true,
      })),
    );
    return {
      status: "ready" as const,
      editionPublicId: requested.editionPublicId,
      publicIds: briefs.map(({ publicId }) => publicId),
    };
  });
  if (publication.status !== "ready") return publication;

  const deliveries = await sendPendingEditionDeliveries(
    publication.editionPublicId,
    provider,
    runtime,
  );
  const briefs = await Promise.all(
    publication.publicIds.map((briefPublicId) =>
      getPublishedDailyBrief(briefPublicId),
    ),
  );
  if (briefs.some((brief) => !brief)) {
    throw new Error("published_daily_brief_missing");
  }
  return {
    status: "published" as const,
    editionPublicId: publication.editionPublicId,
    briefs: briefs
      .filter((brief): brief is PublishedDailyBriefContract => brief !== null)
      .sort((a, b) => a.locale.localeCompare(b.locale)),
    deliveries,
  };
};

export const subscribeToDailyBrief = async (
  input: { email: string; locale: Locale },
  provider: EmailProvider,
  runtime: EmailRuntime,
) => {
  const email = input.email.trim().toLowerCase();
  const now = new Date();
  const consentVersion = randomUUID();
  const pending = await database.transaction(async (transaction) => {
    const [existing] = await transaction
      .select({ id: emailSubscriptions.id, state: emailSubscriptions.state })
      .from(emailSubscriptions)
      .where(
        and(
          eq(emailSubscriptions.email, email),
          eq(emailSubscriptions.locale, input.locale),
        ),
      )
      .for("update");
    if (existing?.state === "confirmed") return null;
    const [subscription] = existing
      ? await transaction
          .update(emailSubscriptions)
          .set({
            state: "pending",
            consentVersion,
            consentedAt: now,
            confirmedAt: null,
            unsubscribedAt: null,
            updatedAt: now,
          })
          .where(eq(emailSubscriptions.id, existing.id))
          .returning({ id: emailSubscriptions.id })
      : await transaction
          .insert(emailSubscriptions)
          .values({
            email,
            locale: input.locale,
            consentVersion,
            consentedAt: now,
          })
          .returning({ id: emailSubscriptions.id });
    const [delivery] = await transaction
      .insert(emailDeliveries)
      .values({
        publicId: `email-delivery-${randomUUID()}`,
        kind: "confirmation",
        subscriptionId: subscription.id,
        provider: provider.name,
        idempotencyKey: `confirmation:${subscription.id}:${consentVersion}`,
      })
      .returning({ id: emailDeliveries.id });
    return { subscriptionId: subscription.id, deliveryId: delivery.id };
  });
  if (!pending) return { status: "confirmation_pending" as const };

  const confirmationToken = createEmailToken(
    {
      purpose: "confirm",
      subscriptionId: pending.subscriptionId,
      consentVersion,
    },
    runtime.tokenSecret,
  );
  const confirmationUrl = `${runtime.origin}/${input.locale}/email/confirm#token=${encodeURIComponent(confirmationToken)}`;
  await sendPendingDelivery(
    pending.deliveryId,
    {
      to: email,
      ...renderSubscriptionConfirmationEmail(input.locale, confirmationUrl),
      briefPublicId: null,
    },
    provider,
  );
  return { status: "confirmation_pending" as const };
};

export const confirmDailyBriefSubscription = async (
  token: string,
  tokenSecret: string,
) => {
  const payload = verifyEmailToken(token, "confirm", tokenSecret);
  if (!payload || payload.purpose !== "confirm") {
    return { status: "invalid_or_expired" as const };
  }
  return database.transaction(async (transaction) => {
    const [subscription] = await transaction
      .select({
        state: emailSubscriptions.state,
        consentVersion: emailSubscriptions.consentVersion,
      })
      .from(emailSubscriptions)
      .where(eq(emailSubscriptions.id, payload.subscriptionId))
      .for("update");
    if (
      !subscription ||
      subscription.consentVersion !== payload.consentVersion ||
      subscription.state === "unsubscribed"
    ) {
      return { status: "invalid_or_expired" as const };
    }
    if (subscription.state === "pending") {
      const confirmedAt = new Date();
      await transaction
        .update(emailSubscriptions)
        .set({ state: "confirmed", confirmedAt, updatedAt: confirmedAt })
        .where(eq(emailSubscriptions.id, payload.subscriptionId));
    }
    return { status: "confirmed" as const };
  });
};

export const unsubscribeFromDailyBrief = async (
  token: string,
  tokenSecret: string,
) => {
  const payload = verifyEmailToken(token, "unsubscribe", tokenSecret);
  if (payload?.purpose === "unsubscribe") {
    const unsubscribedAt = new Date();
    await database
      .update(emailSubscriptions)
      .set({ state: "unsubscribed", unsubscribedAt, updatedAt: unsubscribedAt })
      .where(eq(emailSubscriptions.id, payload.subscriptionId));
  }
  return { status: "unsubscribed" as const };
};

export const recordEmailProviderEvent = async (event: EmailProviderEvent) =>
  database.transaction(async (transaction) => {
    const [delivery] = await transaction
      .select({
        id: emailDeliveries.id,
        subscriptionId: emailDeliveries.subscriptionId,
      })
      .from(emailDeliveries)
      .where(eq(emailDeliveries.providerMessageId, event.messageId))
      .for("update");
    if (!delivery) return { status: "unknown_delivery" as const };
    await transaction
      .insert(emailDeliveryEvents)
      .values({
        providerEventId: event.providerEventId,
        deliveryId: delivery.id,
        type: event.type,
        occurredAt: new Date(event.occurredAt),
        failureReason: event.failureReason,
      })
      .onConflictDoNothing({ target: emailDeliveryEvents.providerEventId });
    const [latest] = await transaction
      .select({
        type: emailDeliveryEvents.type,
        occurredAt: emailDeliveryEvents.occurredAt,
        failureReason: emailDeliveryEvents.failureReason,
      })
      .from(emailDeliveryEvents)
      .where(eq(emailDeliveryEvents.deliveryId, delivery.id))
      .orderBy(
        desc(emailDeliveryEvents.occurredAt),
        desc(emailDeliveryEvents.providerEventId),
      )
      .limit(1);
    await transaction
      .update(emailDeliveries)
      .set({
        status: latest.type,
        failureReason: latest.failureReason,
        updatedAt: latest.occurredAt,
      })
      .where(eq(emailDeliveries.id, delivery.id));
    if (latest.type === "bounced") {
      await transaction
        .update(emailSubscriptions)
        .set({
          state: "unsubscribed",
          unsubscribedAt: latest.occurredAt,
          updatedAt: latest.occurredAt,
        })
        .where(eq(emailSubscriptions.id, delivery.subscriptionId));
    }
    return { status: "recorded" as const };
  });

export const listEmailDeliveries = async () => ({
  items: await database
    .select({
      publicId: emailDeliveries.publicId,
      kind: emailDeliveries.kind,
      briefPublicId: dailyBriefs.publicId,
      provider: emailDeliveries.provider,
      providerMessageId: emailDeliveries.providerMessageId,
      status: emailDeliveries.status,
      failureReason: emailDeliveries.failureReason,
      updatedAt: emailDeliveries.updatedAt,
    })
    .from(emailDeliveries)
    .leftJoin(dailyBriefs, eq(dailyBriefs.id, emailDeliveries.briefId))
    .orderBy(desc(emailDeliveries.createdAt))
    .then((rows) =>
      rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() })),
    ),
});
