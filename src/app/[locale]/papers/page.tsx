import Link from "next/link";
import { notFound } from "next/navigation";
import { localeSchema } from "@/events/contracts";
import { paperListRequestSchema } from "@/papers/contracts";
import { listPublicPapers } from "@/papers/service";

const copy = {
  en: {
    heading: "Papers",
    latest: "Latest",
    trending: "Trending",
    featured: "Featured",
    no_matches: "No Papers match these filters.",
    insufficient_evidence:
      "Trending is unavailable until sufficient attention evidence exists.",
    no_editorial_selections: "No Papers have been selected by editors yet.",
    filters: "Paper filters",
    topic: "Topic",
    author: "Author",
    institution: "Institution",
    publishedFrom: "Published from (ISO 8601)",
    publishedTo: "Published to (ISO 8601)",
    hasCode: "Code availability",
    anyCode: "Any",
    withCode: "With code",
    withoutCode: "Without code",
    relatedModel: "Related Model public ID",
    apply: "Apply filters",
    next: "Next page",
    dataCutoff: "Data cutoff",
  },
  zh: {
    heading: "论文",
    latest: "最新",
    trending: "趋势",
    featured: "精选",
    no_matches: "没有论文符合这些筛选条件。",
    insufficient_evidence: "关注证据充足后才会启用趋势论文。",
    no_editorial_selections: "编辑暂未选择精选论文。",
    filters: "论文筛选",
    topic: "主题",
    author: "作者",
    institution: "机构",
    publishedFrom: "起始发布日期（ISO 8601）",
    publishedTo: "结束发布日期（ISO 8601）",
    hasCode: "代码可用性",
    anyCode: "不限",
    withCode: "有代码",
    withoutCode: "无代码",
    relatedModel: "关联模型 Public ID",
    apply: "应用筛选",
    next: "下一页",
    dataCutoff: "数据截止时间",
  },
} as const;

export const dynamic = "force-dynamic";

export default async function PapersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const locale = localeSchema.safeParse((await params).locale);
  if (!locale.success) notFound();
  const resolvedSearchParams = await searchParams;
  const parsed = paperListRequestSchema.safeParse({
    ...Object.fromEntries(
      Object.entries(resolvedSearchParams).filter(([, value]) => value !== ""),
    ),
    locale: locale.data,
  });
  if (!parsed.success) notFound();
  const result = await listPublicPapers(parsed.data);
  if (result.status === "invalid_cursor") notFound();
  const papers = result.response;
  const labels = copy[locale.data];
  const nextParameters = new URLSearchParams();
  for (const [key, value] of Object.entries(resolvedSearchParams)) {
    if (value) nextParameters.set(key, value);
  }
  if (papers.nextCursor) nextParameters.set("cursor", papers.nextCursor);
  return (
    <main lang={locale.data}>
      <h1>{labels.heading}</h1>
      <nav aria-label={labels.heading}>
        {(["latest", "trending", "featured"] as const).map((view) => (
          <Link key={view} href={`/${locale.data}/papers?view=${view}`}>
            {labels[view]}
          </Link>
        ))}
      </nav>
      <form method="get">
        <fieldset>
          <legend>{labels.filters}</legend>
          <input type="hidden" name="view" value={parsed.data.view} />
          <label>
            {labels.topic}
            <input name="topic" defaultValue={parsed.data.topic} />
          </label>
          <label>
            {labels.author}
            <input name="author" defaultValue={parsed.data.author} />
          </label>
          <label>
            {labels.institution}
            <input name="institution" defaultValue={parsed.data.institution} />
          </label>
          <label>
            {labels.publishedFrom}
            <input
              name="publishedFrom"
              defaultValue={parsed.data.publishedFrom}
            />
          </label>
          <label>
            {labels.publishedTo}
            <input name="publishedTo" defaultValue={parsed.data.publishedTo} />
          </label>
          <label>
            {labels.hasCode}
            <select name="hasCode" defaultValue={parsed.data.hasCode ?? ""}>
              <option value="">{labels.anyCode}</option>
              <option value="true">{labels.withCode}</option>
              <option value="false">{labels.withoutCode}</option>
            </select>
          </label>
          <label>
            {labels.relatedModel}
            <input
              name="relatedModelPublicId"
              defaultValue={parsed.data.relatedModelPublicId}
            />
          </label>
          <button type="submit">{labels.apply}</button>
        </fieldset>
      </form>
      <p>{papers.methodology.limitation}</p>
      {papers.emptyState ? <p>{labels[papers.emptyState]}</p> : null}
      <ol>
        {papers.items.map((paper) => (
          <li key={paper.publicId}>
            <h2>
              <Link href={`/${locale.data}/papers/${paper.publicId}`}>
                {paper.name}
              </Link>
            </h2>
            <p>{paper.summary}</p>
            <p>
              {paper.latestRevision.arxivVersion} ·{" "}
              <time dateTime={paper.latestRevision.releasedAt}>
                {paper.latestRevision.releasedAt}
              </time>
            </p>
          </li>
        ))}
      </ol>
      {papers.dataCutoff ? (
        <p>
          {labels.dataCutoff}:{" "}
          <time dateTime={papers.dataCutoff}>{papers.dataCutoff}</time>
        </p>
      ) : null}
      {papers.nextCursor ? (
        <Link href={`/${locale.data}/papers?${nextParameters.toString()}`}>
          {labels.next}
        </Link>
      ) : null}
    </main>
  );
}
