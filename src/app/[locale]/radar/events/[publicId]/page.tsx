import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { localeSchema } from "@/events/contracts";
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
  if (!event) return {};

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
  if (!event) notFound();
  const labels = copy[locale];
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
        {event.sources.map((source) => (
          <article key={source.sourceItemPublicId}>
            <h3>{source.name}</h3>
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
