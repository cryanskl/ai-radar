import Link from "next/link";
import { notFound } from "next/navigation";
import { localeSchema } from "@/events/contracts";
import { repositoryListRequestSchema } from "@/repositories/contracts";
import { listPublicRepositories } from "@/repositories/service";

const copy = {
  en: {
    heading: "GitHub Repositories",
    new: "New",
    rising: "Rising",
    recently_released: "Recently Released",
    featured: "Featured",
    filters: "Repository filters",
    topic: "Topic",
    language: "Language",
    license: "License",
    lifecycle: "Lifecycle",
    any: "Any",
    detected: "Detected",
    missing: "Missing",
    active: "Active",
    archived: "Archived",
    mirrored: "Mirrored",
    unavailable: "Unavailable",
    apply: "Apply filters",
    dataCutoff: "Data cutoff",
    method: "Method",
    window: "Window",
    release: "Latest release",
    noRelease: "No public Release",
    next: "Next page",
    no_matches: "No Repositories match these filters.",
    insufficient_evidence:
      "Rising is unavailable until two observations span the seven-day window.",
    no_editorial_selections:
      "No GitHub Repositories have been selected by editors yet.",
    stars: "stars",
    forks: "forks",
  },
  zh: {
    heading: "GitHub 仓库",
    new: "最新",
    rising: "上升",
    recently_released: "最近发布",
    featured: "精选",
    filters: "仓库筛选",
    topic: "主题",
    language: "语言",
    license: "许可证",
    lifecycle: "生命周期",
    any: "不限",
    detected: "已检测",
    missing: "未检测",
    active: "活跃",
    archived: "已归档",
    mirrored: "镜像",
    unavailable: "不可用",
    apply: "应用筛选",
    dataCutoff: "数据截止时间",
    method: "方法",
    window: "窗口",
    release: "最新发布",
    noRelease: "暂无公开 Release",
    next: "下一页",
    no_matches: "没有仓库符合这些筛选条件。",
    insufficient_evidence: "至少有两个跨越七天窗口的观察点后才会启用上升榜。",
    no_editorial_selections: "编辑暂未选择精选 GitHub 仓库。",
    stars: "Star",
    forks: "Fork",
  },
} as const;

export const dynamic = "force-dynamic";

export default async function GithubPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const locale = localeSchema.safeParse((await params).locale);
  if (!locale.success) notFound();
  const resolvedSearchParams = await searchParams;
  const parsed = repositoryListRequestSchema.safeParse({
    ...Object.fromEntries(
      Object.entries(resolvedSearchParams).filter(([, value]) => value !== ""),
    ),
    locale: locale.data,
  });
  if (!parsed.success) notFound();
  const result = await listPublicRepositories(parsed.data);
  if (result.status === "invalid_cursor") notFound();
  const repositories = result.response;
  const labels = copy[locale.data];
  const nextParameters = new URLSearchParams();
  for (const [key, value] of Object.entries(resolvedSearchParams)) {
    if (value) nextParameters.set(key, value);
  }
  if (repositories.nextCursor) {
    nextParameters.set("cursor", repositories.nextCursor);
  }
  return (
    <main lang={locale.data}>
      <h1>{labels.heading}</h1>
      <nav aria-label={labels.heading}>
        {(["new", "rising", "recently_released", "featured"] as const).map(
          (view) => (
            <Link key={view} href={`/${locale.data}/github?view=${view}`}>
              {labels[view]}
            </Link>
          ),
        )}
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
            {labels.language}
            <input name="language" defaultValue={parsed.data.language} />
          </label>
          <label>
            {labels.license}
            <select name="license" defaultValue={parsed.data.license ?? ""}>
              <option value="">{labels.any}</option>
              <option value="detected">{labels.detected}</option>
              <option value="missing">{labels.missing}</option>
            </select>
          </label>
          <label>
            {labels.lifecycle}
            <select name="lifecycle" defaultValue={parsed.data.lifecycle ?? ""}>
              <option value="">{labels.any}</option>
              <option value="active">{labels.active}</option>
              <option value="archived">{labels.archived}</option>
              <option value="mirrored">{labels.mirrored}</option>
              <option value="unavailable">{labels.unavailable}</option>
            </select>
          </label>
          <button type="submit">{labels.apply}</button>
        </fieldset>
      </form>
      <p>{repositories.methodology.limitation}</p>
      <p>
        {labels.method}: {repositories.methodology.publicId} v
        {repositories.methodology.version}
        {repositories.methodology.windowDays
          ? ` · ${labels.window}: ${repositories.methodology.windowDays} days`
          : null}
      </p>
      {repositories.emptyState ? (
        <p>{labels[repositories.emptyState]}</p>
      ) : null}
      <ol>
        {repositories.items.map((repository) => (
          <li key={repository.publicId}>
            <h2>
              <Link href={`/${locale.data}/github/${repository.publicId}`}>
                {repository.name}
              </Link>
            </h2>
            <p>{repository.summary}</p>
            <p>
              {repository.fullName} · {repository.latestMetrics.stars}{" "}
              {labels.stars}
              {" · "}
              {repository.latestMetrics.forks} {labels.forks}
            </p>
            <p>
              {labels[repository.license.status]} ·{" "}
              {labels[repository.lifecycleState]}
            </p>
            <p>
              {labels.release}:{" "}
              {repository.latestRelease?.tagName ?? labels.noRelease}
            </p>
            {repository.rising ? (
              <p>
                +{repository.rising.starDelta} stars · +
                {repository.rising.forkDelta} forks · {labels.window}:{" "}
                <time dateTime={repository.rising.windowStart}>
                  {repository.rising.windowStart}
                </time>{" "}
                –{" "}
                <time dateTime={repository.rising.windowEnd}>
                  {repository.rising.windowEnd}
                </time>
              </p>
            ) : null}
          </li>
        ))}
      </ol>
      {repositories.dataCutoff ? (
        <p>
          {labels.dataCutoff}:{" "}
          <time dateTime={repositories.dataCutoff}>
            {repositories.dataCutoff}
          </time>
        </p>
      ) : null}
      {repositories.nextCursor ? (
        <Link href={`/${locale.data}/github?${nextParameters.toString()}`}>
          {labels.next}
        </Link>
      ) : null}
    </main>
  );
}
