import Link from "next/link";
import { notFound } from "next/navigation";
import { rankingListRequestSchema } from "@/rankings/contracts";
import { listPublicRankings } from "@/rankings/service";

const copy = {
  en: {
    title: "Transparent Rankings",
    intro:
      "Latest, Trending and Featured answer different questions. Every natural ranking publishes its method, evidence and Data Cutoff; placement cannot be purchased.",
    definitions: "Ranking definitions",
    featured: "Featured editorial selections",
    method: "Method",
    question: "Question",
    cutoff: "Data Cutoff",
    evidence: "Insufficient Evidence",
    reason: "Why Featured",
    audience: "Audience",
    disclosure: "Commercial disclosure",
    selected: "Selected",
    review: "Review due",
  },
  zh: {
    title: "透明榜单",
    intro:
      "最新、趋势与精选回答不同问题。每个自然榜单公开方法、证据和数据截止时间，推荐位不可购买。",
    definitions: "榜单定义",
    featured: "编辑精选",
    method: "方法",
    question: "问题",
    cutoff: "数据截止时间",
    evidence: "证据不足",
    reason: "精选理由",
    audience: "适用人群",
    disclosure: "商业披露",
    selected: "选择时间",
    review: "复核时间",
  },
} as const;

export default async function RankingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  if (locale !== "en" && locale !== "zh") notFound();
  const query = await searchParams;
  const parsed = rankingListRequestSchema.safeParse({
    locale,
    targetType: query.targetType,
    kind: query.kind,
  });
  if (!parsed.success) notFound();
  const result = await listPublicRankings(parsed.data);
  const text = copy[locale];
  return (
    <main>
      <h1>{text.title}</h1>
      <p>{text.intro}</p>
      <section>
        <h2>{text.definitions}</h2>
        {result.definitions.map((definition) => (
          <article key={definition.publicId}>
            <h3>
              <Link href={`/${locale}/rankings/${definition.publicId}`}>
                {definition.title}
              </Link>
            </h3>
            <p>
              {text.method}: {definition.kind} · {definition.targetType} · v
              {definition.methodologyVersion}
            </p>
            <p>
              {text.question}: {definition.question}
            </p>
            <p>
              {text.cutoff}: {definition.dataCutoff ?? text.evidence}
            </p>
          </article>
        ))}
      </section>
      <section>
        <h2>{text.featured}</h2>
        {result.featured.map((selection) => (
          <article key={selection.publicId}>
            <h3>{selection.target.name}</h3>
            <p>
              {text.reason}: {selection.reason}
            </p>
            <p>
              {text.audience}: {selection.audience}
            </p>
            <p>
              {text.selected}: {selection.selectedAt} · {text.review}:{" "}
              {selection.reviewDueAt}
            </p>
            <p>
              {text.disclosure}: {selection.commercialDisclosure}
            </p>
          </article>
        ))}
      </section>
    </main>
  );
}
