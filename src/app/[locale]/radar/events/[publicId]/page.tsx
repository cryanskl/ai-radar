import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { localeSchema } from "@/events/contracts";
import { getEventTombstone } from "@/events/cluster-service";
import {
  authorshipLabels,
  displayTimestamp,
  reviewLabels,
  rightsLabels,
} from "@/events/presentation";
import { getPublicEvent } from "@/events/service";

const copy = {
  en: {
    occurred: "Occurred",
    discovered: "Discovered",
    verified: "Last verified",
    rights: "Rights",
    localization: "Localization",
    sources: "Sources",
    sourcePublished: "Source published",
    sourceTier: "Source tier",
    sourceRights: "Source rights",
    attribution: "Attribution",
    license: "License",
    entities: "Related entities",
    merged: "Event merged",
    mergedInto: "This stable Event ID was merged into",
    representative: "Representative source",
    sourceCount: (count: number) =>
      `${count} independent ${count === 1 ? "source" : "sources"}`,
    tombstoneReasons: { duplicate_coverage: "Duplicate coverage" },
  },
  zh: {
    occurred: "发生时间",
    discovered: "本站发现时间",
    verified: "最后核验时间",
    rights: "权利",
    localization: "本地化",
    sources: "来源",
    sourcePublished: "来源发布时间",
    sourceTier: "来源等级",
    sourceRights: "来源权利",
    attribution: "署名",
    license: "许可",
    entities: "关联实体",
    merged: "事件已合并",
    mergedInto: "此稳定事件 ID 已合并至",
    representative: "代表来源",
    sourceCount: (count: number) => `${count} 个独立来源`,
    tombstoneReasons: { duplicate_coverage: "重复报道" },
  },
} as const;

type EventPageParams = Promise<{ locale: string; publicId: string }>;

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: EventPageParams;
}): Promise<Metadata> {
  const resolved = await params;
  const parsedLocale = localeSchema.safeParse(resolved.locale);
  if (!parsedLocale.success) return {};
  const event = await getPublicEvent(resolved.publicId, parsedLocale.data);
  if (!event) {
    const tombstone = await getEventTombstone(resolved.publicId);
    if (!tombstone) return {};
    return { title: `${tombstone.publicId} | AI Radar` };
  }

  return {
    title: `${event.localization.title} | AI Radar`,
    description: event.localization.summary,
    alternates: {
      canonical: `/${parsedLocale.data}/radar/events/${event.publicId}`,
      languages: {
        en: `/en/radar/events/${event.publicId}`,
        zh: `/zh/radar/events/${event.publicId}`,
      },
    },
  };
}

export default async function EventDetailPage({
  params,
}: {
  params: EventPageParams;
}) {
  const resolved = await params;
  const parsedLocale = localeSchema.safeParse(resolved.locale);
  if (!parsedLocale.success) notFound();
  const locale = parsedLocale.data;
  const event = await getPublicEvent(resolved.publicId, locale);
  const labels = copy[locale];
  if (!event) {
    const tombstone = await getEventTombstone(resolved.publicId);
    if (!tombstone) notFound();
    return (
      <main lang={locale}>
        <h1>{labels.merged}</h1>
        <p>
          {labels.mergedInto}{" "}
          <a href={`/${locale}/radar/events/${tombstone.targetEventPublicId}`}>
            {tombstone.targetEventPublicId}
          </a>
        </p>
        <p>{labels.tombstoneReasons[tombstone.reasonCode]}</p>
        <time dateTime={tombstone.mergedAt}>{tombstone.mergedAt}</time>
      </main>
    );
  }
  const separator = locale === "zh" ? "：" : ": ";

  return (
    <main lang={locale}>
      <p>
        {event.eventType} · {event.factStatus}
      </p>
      <h1>{event.localization.title}</h1>
      <p>{event.localization.summary}</p>
      <section aria-label="Verification metadata">
        <p>
          {labels.occurred}
          {separator}
          <time dateTime={event.occurredAt}>
            {displayTimestamp(event.occurredAt, event.occurredAtPrecision)}
          </time>
        </p>
        <p>
          {labels.discovered}
          {separator}
          <time dateTime={event.discoveredAt}>{event.discoveredAt}</time>
        </p>
        <p>
          {labels.verified}
          {separator}
          <time dateTime={event.lastVerifiedAt}>{event.lastVerifiedAt}</time>
        </p>
        <p>
          {labels.rights}
          {separator}
          {rightsLabels[locale][event.rightsStatus]}
        </p>
        <p>
          {labels.localization}
          {separator}
          {authorshipLabels[locale][event.localization.authorship]} ·{" "}
          {reviewLabels[locale][event.localization.reviewStatus]}
        </p>
      </section>
      {event.entities.length > 0 ? (
        <section>
          <h2>{labels.entities}</h2>
          <ul>
            {event.entities.map((entity) => (
              <li key={entity.relationPublicId}>
                {entity.predicate} ·{" "}
                <a href={`/${locale}/entities/${entity.publicId}`}>
                  {entity.name}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section>
        <h2>{labels.sources}</h2>
        <p>
          {labels.sourceCount(
            new Set(event.sources.map(({ publicId }) => publicId)).size,
          )}
        </p>
        {event.sources.map((source) => (
          <article key={source.sourceItemPublicId}>
            <h3>{source.name}</h3>
            {source.isPrimary ? <p>{labels.representative}</p> : null}
            <p>
              {labels.sourceTier}
              {separator}
              {source.tier}
            </p>
            <p>
              {labels.sourcePublished}
              {separator}
              <time dateTime={source.publishedAt}>
                {displayTimestamp(
                  source.publishedAt,
                  source.publishedAtPrecision,
                )}
              </time>
            </p>
            <p>
              {labels.sourceRights}
              {separator}
              {rightsLabels[locale][source.rightsStatus]}
            </p>
            <p>
              {labels.attribution}
              {separator}
              {source.attribution}
            </p>
            {source.licenseUrl ? (
              <p>
                {labels.license}
                {separator}
                <a href={source.licenseUrl}>{source.licenseUrl}</a>
              </p>
            ) : null}
            <a href={source.originalUrl}>{source.originalTitle}</a>
          </article>
        ))}
      </section>
    </main>
  );
}
