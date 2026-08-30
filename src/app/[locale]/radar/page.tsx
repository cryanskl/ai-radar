import Link from "next/link";
import { notFound } from "next/navigation";
import { localeSchema } from "@/events/contracts";
import { displayTimestamp } from "@/events/presentation";
import { listPublicEvents } from "@/events/service";

const copy = {
  en: {
    heading: "AI Radar",
    summary: "Verified AI changes, consolidated into sourced events.",
    source: "Primary source",
    sources: "sources",
  },
  zh: {
    heading: "AI 雷达",
    summary: "将已核验的全球 AI 变化整理为有来源的事件。",
    source: "主要来源",
    sources: "个来源",
  },
} as const;

export const dynamic = "force-dynamic";

export default async function RadarPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const parsedLocale = localeSchema.safeParse((await params).locale);
  if (!parsedLocale.success) notFound();
  const locale = parsedLocale.data;
  const labels = copy[locale];
  const events = await listPublicEvents(locale);

  return (
    <main lang={locale}>
      <h1>{labels.heading}</h1>
      <p>{labels.summary}</p>
      {events.map((event) => (
        <article key={event.publicId}>
          <p>
            <time dateTime={event.occurredAt}>
              {displayTimestamp(event.occurredAt, event.occurredAtPrecision)}
            </time>{" "}
            · {event.eventType}
          </p>
          <h2>
            <Link href={`/${locale}/radar/events/${event.publicId}`}>
              {event.localization.title}
            </Link>
          </h2>
          <p>{event.localization.summary}</p>
          <p>
            {labels.source}: {event.sources[0].name} · {event.sources.length}{" "}
            {labels.sources}
          </p>
        </article>
      ))}
    </main>
  );
}
