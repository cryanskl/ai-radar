import Link from "next/link";
import { notFound } from "next/navigation";
import { localeSchema } from "@/events/contracts";
import { searchRequestSchema } from "@/search/contracts";
import { searchPublicRecords } from "@/search/service";

const copy = {
  en: {
    heading: "Search",
    ask: "Ask AI Radar",
    submit: "Search",
    query: "Search AI Radar",
    noResults: "No public records matched this query.",
    coverage:
      "AI Radar searches only indexed material that has passed public-rights review.",
    submitSource: "Submit a source",
    trendingUnavailable:
      "Trending is unavailable until sufficient verified attention signals exist.",
    truncated:
      "Showing the first 1,000 stable results. Narrow the query to search beyond this boundary.",
    invalid: "The Search query or filters are invalid.",
    from: "From date",
    to: "To date",
    topic: "Topic public ID",
    organization: "Organization public ID",
    next: "Next page",
    source: "Source",
    signals: "Signals",
    type: {
      all: "All",
      event: "Events",
      model: "Models",
      paper: "Papers",
      product: "Products",
      repository: "GitHub",
      prompt: "Prompts",
      skill: "Skills",
      guide: "Guides",
      organization: "Organizations",
      person: "People",
      benchmark: "Benchmarks",
      topic: "Topics",
    },
    signalFilter: {
      all: "Global signals",
      en: "English signals",
      zh: "Chinese signals",
    },
    sort: {
      relevance: "Relevance",
      latest: "Latest",
      trending: "Trending",
    },
    status: {
      public: "Public",
      merged_into: "Merged",
      withdrawn: "Withdrawn",
      source_withdrawn: "Source withdrawn",
      under_review: "Under review",
    },
    matchReason: {
      public_id: "Matched stable identifier",
      canonical_url: "Matched official URL",
      external_id: "Matched external identifier",
      official_name: "Matched official name",
      alias: "Matched alias",
      full_text: "Matched title or summary",
      trigram: "Matched similar name",
      snapshot_member: "Content changed since this result set was captured",
    },
    language: { en: "English", zh: "Chinese" },
  },
  zh: {
    heading: "搜索",
    ask: "问 AI Radar",
    submit: "搜索",
    query: "搜索 AI Radar",
    noResults: "没有匹配的公开记录。",
    coverage: "AI Radar 只搜索已收录并通过公开权利检查的资料。",
    submitSource: "提交来源",
    trendingUnavailable: "真实关注信号不足，暂时无法生成趋势排序。",
    truncated: "仅展示前 1,000 条稳定结果；请缩小搜索范围以继续检索。",
    invalid: "搜索词或筛选条件无效。",
    from: "开始日期",
    to: "结束日期",
    topic: "主题公开 ID",
    organization: "组织公开 ID",
    next: "下一页",
    source: "来源",
    signals: "信号语言",
    type: {
      all: "全部",
      event: "事件",
      model: "模型",
      paper: "论文",
      product: "产品",
      repository: "GitHub",
      prompt: "提示词",
      skill: "Skills",
      guide: "指南",
      organization: "组织",
      person: "人物",
      benchmark: "评测基准",
      topic: "主题",
    },
    signalFilter: {
      all: "全球信号",
      en: "英文信号",
      zh: "中文信号",
    },
    sort: {
      relevance: "相关性",
      latest: "最新",
      trending: "趋势",
    },
    status: {
      public: "公开",
      merged_into: "已合并",
      withdrawn: "已撤回",
      source_withdrawn: "部分来源已撤回",
      under_review: "审核中",
    },
    matchReason: {
      public_id: "命中稳定标识符",
      canonical_url: "命中官方链接",
      external_id: "命中外部标识符",
      official_name: "命中官方名称",
      alias: "命中别名",
      full_text: "命中标题或摘要",
      trigram: "命中相似名称",
      snapshot_member: "结果集创建后内容已更新",
    },
    language: { en: "英文", zh: "中文" },
  },
} as const;

type SearchPageParameters = Promise<{
  q?: string;
  type?: string;
  from?: string;
  to?: string;
  topic?: string;
  organization?: string;
  signalLanguage?: string;
  sort?: string;
  cursor?: string;
}>;

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: SearchPageParameters;
}) {
  const parsedLocale = localeSchema.safeParse((await params).locale);
  if (!parsedLocale.success) notFound();
  const locale = parsedLocale.data;
  const labels = copy[locale];
  const parameters = await searchParams;
  const from = parameters.from ? `${parameters.from}T00:00:00.000Z` : undefined;
  const to = parameters.to ? `${parameters.to}T23:59:59.999Z` : undefined;
  const parsed = parameters.q
    ? searchRequestSchema.safeParse({
        ...parameters,
        from,
        to,
        locale,
        type: parameters.type ?? "all",
        signalLanguage: parameters.signalLanguage ?? "all",
        sort: parameters.sort ?? "relevance",
        limit: 20,
      })
    : null;
  const result = parsed?.success
    ? await searchPublicRecords(parsed.data)
    : null;
  const response = result?.status === "ok" ? result.response : null;
  const nextParameters = new URLSearchParams();
  for (const [key, value] of Object.entries(parameters)) {
    if (value && key !== "cursor") nextParameters.set(key, value);
  }
  if (response?.nextCursor) nextParameters.set("cursor", response.nextCursor);

  return (
    <main>
      <nav aria-label={locale === "en" ? "Query mode" : "查询模式"}>
        <span aria-current="page">{labels.heading}</span>{" "}
        <Link href={`/${locale}/ask`}>{labels.ask}</Link>
      </nav>
      <h1>{labels.heading}</h1>
      <form action={`/${locale}/search`} method="get">
        <label>
          {labels.query}
          <input name="q" defaultValue={parameters.q ?? ""} required />
        </label>
        <select name="type" defaultValue={parameters.type ?? "all"}>
          {Object.entries(labels.type).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          name="signalLanguage"
          defaultValue={parameters.signalLanguage ?? "all"}
        >
          {Object.entries(labels.signalFilter).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select name="sort" defaultValue={parameters.sort ?? "relevance"}>
          {Object.entries(labels.sort).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <label>
          {labels.from}
          <input name="from" type="date" defaultValue={parameters.from} />
        </label>
        <label>
          {labels.to}
          <input name="to" type="date" defaultValue={parameters.to} />
        </label>
        <label>
          {labels.topic}
          <input name="topic" defaultValue={parameters.topic} />
        </label>
        <label>
          {labels.organization}
          <input name="organization" defaultValue={parameters.organization} />
        </label>
        <button type="submit">{labels.submit}</button>
      </form>

      {parsed && !parsed.success ? <p>{labels.invalid}</p> : null}
      {response && response.items.length === 0 ? (
        <section>
          <p>
            {response.rankingState === "insufficient_evidence"
              ? labels.trendingUnavailable
              : labels.noResults}
          </p>
          <p>{labels.coverage}</p>
          <p>
            <a href="https://github.com/cryanskl/ai-radar/issues/new?title=Source%20submission%3A%20">
              {labels.submitSource}
            </a>
          </p>
        </section>
      ) : null}
      {response?.resultSet.truncated ? <p>{labels.truncated}</p> : null}
      {response ? (
        <ol>
          {response.items.map((item) => {
            const href =
              item.kind === "event"
                ? `/${locale}/radar/events/${item.publicId}`
                : item.entityType === "model"
                  ? `/${locale}/models/${item.publicId}`
                  : item.entityType === "product"
                    ? `/${locale}/products/${item.publicId}`
                    : item.entityType === "prompt"
                      ? `/${locale}/prompts/${item.publicId}`
                      : item.entityType === "skill"
                        ? `/${locale}/skills/${item.publicId}`
                        : `/${locale}/entities/${item.publicId}`;
            const match = `${labels.matchReason[item.matchReason]} · ${labels.language[item.matchedLocale]}`;
            const crossLanguageAlias =
              item.matchReason === "alias" && item.matchedLocale !== locale
                ? locale === "en"
                  ? `Matched ${labels.language[item.matchedLocale]} alias`
                  : `命中${labels.language[item.matchedLocale]}别名`
                : null;
            return (
              <li key={`${item.kind}:${item.publicId}`}>
                <h2>
                  <Link href={href}>{item.name}</Link>
                </h2>
                <p>{item.summary}</p>
                <blockquote>{item.matchedText}</blockquote>
                <p>{crossLanguageAlias ?? match}</p>
                <p>
                  {item.kind === "event"
                    ? labels.type.event
                    : labels.type[item.entityType!]}{" "}
                  · {labels.status[item.status]} · {item.lastVerifiedAt}
                </p>
                {item.source ? (
                  <p>
                    {labels.source}:{" "}
                    <a href={item.source.url}>{item.source.name}</a>
                  </p>
                ) : null}
                <p>
                  {labels.signals}:{" "}
                  {item.signalLanguages
                    .map((signalLocale) => labels.language[signalLocale])
                    .join(", ") || "—"}
                </p>
              </li>
            );
          })}
        </ol>
      ) : null}
      {response?.nextCursor ? (
        <Link href={`/${locale}/search?${nextParameters.toString()}`}>
          {labels.next}
        </Link>
      ) : null}
    </main>
  );
}
