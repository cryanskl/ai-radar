import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublishedDailyBrief } from "@/daily-briefs/service";

const copy = {
  en: {
    back: "AI Radar",
    cutoff: "Data cutoff",
    coverage: "Coverage",
    watch: "What to watch",
    correction: "Report / Suggest correction",
  },
  zh: {
    back: "AI 雷达",
    cutoff: "数据截止时间",
    coverage: "覆盖说明",
    watch: "接下来关注",
    correction: "报告问题 / 建议更正",
  },
} as const;

export default async function DailyBriefPage({
  params,
}: {
  params: Promise<{ locale: string; publicId: string }>;
}) {
  const { locale, publicId } = await params;
  if (locale !== "en" && locale !== "zh") notFound();
  const brief = await getPublishedDailyBrief(publicId, locale);
  if (!brief) notFound();
  const text = copy[locale];
  return (
    <main>
      <p>
        <Link href={`/${locale}`}>{text.back}</Link>
      </p>
      <article>
        <header>
          <p>
            <time>{brief.briefDate}</time> ·{" "}
            <span>Version {brief.version}</span>
          </p>
          <h1>{brief.title}</h1>
          <p>{brief.overview}</p>
          <p>
            {text.coverage}: {brief.coverageNote}
          </p>
          <p>
            {text.cutoff}: <time>{brief.dataCutoff}</time>
          </p>
        </header>
        <ol>
          {brief.items.map(({ commentary, event, position, section }) => (
            <li key={event.publicId} value={position}>
              <article>
                <p>{section.replaceAll("_", " ")}</p>
                <h2>
                  <Link href={event.href}>{event.title}</Link>
                </h2>
                <p>{commentary}</p>
                <p>{event.summary}</p>
                {event.source ? (
                  <p>
                    <a href={event.source.url}>{event.source.title}</a>
                  </p>
                ) : null}
              </article>
            </li>
          ))}
        </ol>
        <section>
          <h2>{text.watch}</h2>
          <p>{brief.whatToWatch}</p>
        </section>
        <p>
          <a href={brief.correctionUrl}>{text.correction}</a>
        </p>
      </article>
    </main>
  );
}
