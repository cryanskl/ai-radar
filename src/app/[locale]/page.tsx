import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { localeSchema } from "@/events/contracts";
import { displayTimestamp } from "@/events/presentation";
import { getHomepageData, type HomepageView } from "@/homepage/service";
import styles from "./homepage.module.css";

const copy = {
  en: {
    primaryNavigation: "Primary navigation",
    utilityNavigation: "Utility navigation",
    search: "Search",
    ask: "Ask AI Radar",
    placeholder: "Search models, papers, repos, products…",
    brief: "Today’s Brief",
    briefSummary:
      "The latest verified changes across the global AI ecosystem, consolidated into source-first Events.",
    cutoff: "Data cutoff",
    readBrief: "Read the 5-minute brief",
    topStories: "Top Stories",
    whyFeatured: "Why featured",
    sources: "sources",
    source: "source",
    eventStream: "The Radar",
    latest: "Latest",
    trending: "Trending",
    featured: "Featured",
    primarySource: "Primary source",
    noEvents: "No published Events yet.",
    models: "Models / Benchmark Updates",
    papers: "Trending Papers",
    repositories: "GitHub New & Rising",
    products: "Product Updates",
    promptsSkills: "Prompts & Skills",
    guides: "Guides",
    topics: "Topics",
    stayCurrent: "Stay current",
    open: "Open Source & Open Data",
    trust: "Trust Center",
    empty: "No public records match this view yet.",
    viewAll: "View all",
    lastVerified: "Last verified",
    method: "Method",
    evidence: "Insufficient evidence",
    status: "Status",
    entities: "Entities",
    relation: "relation",
    relations: "relations",
    rank: "Rank",
    metric: "Metric",
    window: "Window",
    observed: "Observed",
    editorialEvidence: "Editorial evidence",
  },
  zh: {
    primaryNavigation: "主导航",
    utilityNavigation: "工具导航",
    search: "搜索",
    ask: "询问 AI Radar",
    placeholder: "搜索模型、论文、仓库、产品……",
    brief: "今日简报",
    briefSummary: "汇总全球 AI 生态中最新且已核验的变化，并保留原始来源。",
    cutoff: "数据截止时间",
    readBrief: "阅读 5 分钟简报",
    topStories: "焦点事件",
    whyFeatured: "精选理由",
    sources: "个来源",
    source: "个来源",
    eventStream: "AI 雷达",
    latest: "最新",
    trending: "趋势",
    featured: "精选",
    primarySource: "主要来源",
    noEvents: "暂时没有已发布的事件。",
    models: "模型与基准更新",
    papers: "论文趋势",
    repositories: "GitHub 新秀与上升",
    products: "产品更新",
    promptsSkills: "提示词与技能",
    guides: "指南",
    topics: "主题",
    stayCurrent: "保持更新",
    open: "开源与开放数据",
    trust: "信任中心",
    empty: "此视图暂时没有匹配的公开记录。",
    viewAll: "查看全部",
    lastVerified: "最后核验",
    method: "方法",
    evidence: "证据不足",
    status: "状态",
    entities: "关联实体",
    relation: "条关系",
    relations: "条关系",
    rank: "名次",
    metric: "指标",
    window: "窗口",
    observed: "观察时间",
    editorialEvidence: "编辑证据",
  },
} as const;

const domains = [
  ["radar", "Radar", "动态"],
  ["models", "Models", "模型"],
  ["papers", "Papers", "论文"],
  ["products", "Products", "产品"],
  ["github", "GitHub", "开源"],
  ["prompts", "Prompts", "提示词"],
  ["skills", "Skills", "技能"],
  ["guides", "Guides", "指南"],
] as const;

const featuredHref = (locale: "en" | "zh", type: string, publicId: string) =>
  type === "event"
    ? `/${locale}/radar/events/${publicId}`
    : `/${locale}/${type === "repository" ? "github" : `${type}s`}/${publicId}`;

const homepageViewSchema = z.enum(["latest", "trending", "featured"]);

const methodWindow = (
  method: Awaited<
    ReturnType<typeof getHomepageData>
  >["rankingDetails"][number]["definition"]["method"],
) => {
  if (method.kind === "latest") return method.timeField;
  if (method.kind === "trending") return `${method.windowHours}h`;
  if (method.kind === "benchmark")
    return `${method.benchmarkPublicId} · ${method.benchmarkVersion}`;
  return `${method.qualityBenchmarkPublicId} · ${method.qualityBenchmarkVersion}`;
};

const observationMetric = (
  observation: Awaited<
    ReturnType<typeof getHomepageData>
  >["rankingDetails"][number]["observations"][number],
) =>
  observation.score ??
  Object.entries(observation.rawMetrics)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" · ");

export const dynamic = "force-dynamic";

export default async function LocalizedHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parsedLocale = localeSchema.safeParse((await params).locale);
  if (!parsedLocale.success) notFound();
  const locale = parsedLocale.data;
  const query = await searchParams;
  const parsedView = homepageViewSchema.safeParse(query.view ?? "latest");
  if (!parsedView.success) notFound();
  const view: HomepageView = parsedView.data;
  const labels = copy[locale];
  const homepage = await getHomepageData(locale, view);
  const { rankings } = homepage;
  const { latestEvents, streamEvents, eventByPublicId } = homepage;
  const dataCutoff = latestEvents.reduce<string | null>(
    (latest, event) =>
      latest === null || event.discoveredAt > latest
        ? event.discoveredAt
        : latest,
    null,
  );
  const briefDate = dataCutoff ? new Date(dataCutoff) : new Date();
  const rankingRows = homepage.rankingDetails
    .filter(({ definition }) => definition.targetType === "model")
    .flatMap(({ definition, observations }) =>
      observations
        .filter(({ status }) => status === "active")
        .map((observation) => ({ definition, observation })),
    )
    .slice(0, 4);

  return (
    <div className={styles.page} lang={locale}>
      <header className={styles.header}>
        <Link className={styles.wordmark} href={`/${locale}`}>
          AI RADAR
        </Link>
        <nav
          className={styles.primaryNavigation}
          aria-label={labels.primaryNavigation}
        >
          {domains.map(([slug, en, zh]) => (
            <Link key={slug} href={`/${locale}/${slug}`}>
              {locale === "en" ? en : zh}
            </Link>
          ))}
        </nav>
        <nav
          className={styles.utilityNavigation}
          aria-label={labels.utilityNavigation}
        >
          <Link href={`/${locale}/rankings`}>
            {locale === "en" ? "Rankings" : "榜单"}
          </Link>
          <a href="#open-data">{locale === "en" ? "Open Data" : "开放数据"}</a>
          <Link href={`/${locale === "en" ? "zh" : "en"}`}>
            {locale === "en" ? "中文" : "EN"}
          </Link>
        </nav>
      </header>

      <main className={styles.main}>
        <search className={styles.search}>
          <div className={styles.searchModes}>
            <span aria-current="page">{labels.search}</span>
            <Link href={`/${locale}/search`}>{labels.ask}</Link>
          </div>
          <form action={`/${locale}/search`}>
            <label className={styles.visuallyHidden} htmlFor="home-search">
              {labels.search}
            </label>
            <input
              id="home-search"
              name="q"
              placeholder={labels.placeholder}
              type="search"
            />
            <button type="submit">{labels.search}</button>
          </form>
        </search>

        <section className={`${styles.section} ${styles.brief}`}>
          <div className={styles.sectionLead}>
            <h1>{labels.brief}</h1>
            <time dateTime={briefDate.toISOString().slice(0, 10)}>
              {new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                timeZone: "UTC",
              }).format(briefDate)}
            </time>
            <p className={styles.metadata}>
              {labels.cutoff}:{" "}
              {dataCutoff
                ? `${dataCutoff.replace("T", " ").slice(0, 16)} UTC`
                : "—"}
            </p>
          </div>
          <p className={styles.briefSummary}>{labels.briefSummary}</p>
          <div className={styles.briefLinks}>
            {latestEvents.slice(0, 3).map((event) => (
              <Link
                key={event.publicId}
                href={`/${locale}/radar/events/${event.publicId}`}
              >
                <time dateTime={event.occurredAt}>
                  {event.occurredAt.slice(11, 16)}
                </time>
                <span>{event.localization.title}</span>
              </Link>
            ))}
            <Link className={styles.actionLink} href={`/${locale}/radar`}>
              {labels.readBrief} <span aria-hidden="true">→</span>
            </Link>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionLead}>
            <h2>{labels.topStories}</h2>
          </div>
          <div className={styles.featuredList}>
            {rankings.featured.slice(0, 2).map((selection, index) => {
              const event = eventByPublicId.get(selection.target.publicId);
              return (
                <article
                  className={styles.featuredCard}
                  data-component="featured-card"
                  key={selection.publicId}
                >
                  <span className={styles.featuredIndex}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3>
                      <Link
                        href={featuredHref(
                          locale,
                          selection.target.type,
                          selection.target.publicId,
                        )}
                      >
                        {selection.target.name}
                      </Link>
                    </h3>
                    {event ? <p>{event.localization.summary}</p> : null}
                  </div>
                  <dl className={styles.featuredDetails}>
                    <div>
                      <dt>{labels.whyFeatured}</dt>
                      <dd>{selection.reason}</dd>
                    </div>
                    <div>
                      <dt>{labels.cutoff}</dt>
                      <dd>{selection.selectedAt}</dd>
                    </div>
                    <div>
                      <dt>{locale === "en" ? "Disclosure" : "商业披露"}</dt>
                      <dd>{selection.commercialDisclosure}</dd>
                    </div>
                    <div>
                      <dt>{locale === "en" ? "Editor" : "编辑角色"}</dt>
                      <dd>{selection.editorRole}</dd>
                    </div>
                    <div>
                      <dt>{labels.editorialEvidence}</dt>
                      <dd>
                        {selection.evidence.map((evidence, evidenceIndex) => (
                          <span key={evidence.sourceItemPublicId}>
                            {evidenceIndex > 0 ? ", " : null}
                            <a href={evidence.url}>{evidence.title}</a>
                          </span>
                        ))}
                      </dd>
                    </div>
                  </dl>
                </article>
              );
            })}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionLead}>
            <h2>{labels.eventStream}</h2>
            <nav
              aria-label={labels.eventStream}
              className={styles.viewNavigation}
            >
              <Link
                aria-current={view === "latest" ? "page" : undefined}
                href={`/${locale}?view=latest`}
              >
                {labels.latest}
              </Link>
              <Link
                aria-current={view === "trending" ? "page" : undefined}
                href={`/${locale}?view=trending`}
              >
                {labels.trending}
              </Link>
              <Link
                aria-current={view === "featured" ? "page" : undefined}
                href={`/${locale}?view=featured`}
              >
                {labels.featured}
              </Link>
            </nav>
          </div>
          <div className={styles.eventList}>
            {streamEvents.map((event) => (
              <article
                className={styles.eventRow}
                data-component="event-row"
                key={event.publicId}
              >
                <time dateTime={event.occurredAt}>
                  {displayTimestamp(
                    event.occurredAt,
                    event.occurredAtPrecision,
                  )}
                </time>
                <span className={styles.eventType}>{event.eventType}</span>
                <div>
                  <h3>
                    <Link href={`/${locale}/radar/events/${event.publicId}`}>
                      {event.localization.title}
                    </Link>
                  </h3>
                  <p>{event.localization.summary}</p>
                  <p className={styles.eventMetadata}>
                    <span>
                      {labels.status}: {event.factStatus} ·{" "}
                      {event.evidenceConfidence}
                    </span>
                    <span>
                      {labels.entities}:{" "}
                      {event.entities.length > 0
                        ? event.entities.map((entity, entityIndex) => (
                            <span key={entity.relationPublicId}>
                              {entityIndex > 0 ? ", " : null}
                              <Link
                                href={`/${locale}/entities/${entity.publicId}`}
                              >
                                {entity.name}
                              </Link>
                            </span>
                          ))
                        : labels.evidence}
                    </span>
                    <time dateTime={event.lastVerifiedAt}>
                      {labels.lastVerified}: {event.lastVerifiedAt}
                    </time>
                  </p>
                </div>
                <p className={styles.eventSource}>
                  <span>{labels.primarySource}</span>
                  {event.sources[0].name}
                  <small>
                    {event.sources.length}{" "}
                    {event.sources.length === 1
                      ? labels.source
                      : labels.sources}
                  </small>
                </p>
              </article>
            ))}
            {streamEvents.length === 0 ? (
              <p>{view === "trending" ? labels.evidence : labels.noEvents}</p>
            ) : null}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionLead}>
            <h2>{labels.models}</h2>
            <Link className={styles.actionLink} href={`/${locale}/rankings`}>
              {labels.viewAll} <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div className={styles.intelligenceList}>
            {rankingRows.map(({ definition, observation }) => (
              <article
                className={styles.rankingRow}
                data-component="ranking-row"
                key={observation.publicId}
              >
                <div>
                  <h3>
                    <span className={styles.rankingPosition}>
                      #{observation.rank ?? "—"}
                    </span>{" "}
                    <Link
                      href={`/${locale}/rankings/${definition.publicId}?methodologyVersion=${definition.methodologyVersion}`}
                    >
                      {observation.target.name}
                    </Link>
                  </h3>
                  <p>
                    {definition.title} · {definition.question}
                  </p>
                  <p className={styles.rankingEvidence}>
                    {observation.evidence.map((evidence, evidenceIndex) => (
                      <span key={evidence.sourceItemPublicId}>
                        {evidenceIndex > 0 ? ", " : null}
                        <a href={evidence.url}>{evidence.title}</a>
                      </span>
                    ))}
                  </p>
                </div>
                <dl>
                  <div>
                    <dt>{labels.method}</dt>
                    <dd>
                      {definition.kind} · v{definition.methodologyVersion}
                    </dd>
                  </div>
                  <div>
                    <dt>{labels.metric}</dt>
                    <dd>{observationMetric(observation)}</dd>
                  </div>
                  <div>
                    <dt>{labels.window}</dt>
                    <dd>{methodWindow(definition.method)}</dd>
                  </div>
                  <div>
                    <dt>{labels.cutoff}</dt>
                    <dd>{observation.dataCutoff}</dd>
                  </div>
                  <div>
                    <dt>{labels.observed}</dt>
                    <dd>{observation.observedAt}</dd>
                  </div>
                </dl>
              </article>
            ))}
            {homepage.models.items.slice(0, 3).map((model) => (
              <article
                className={styles.entityCard}
                data-component="entity-card"
                key={model.publicId}
              >
                <div>
                  <h3>
                    <Link href={`/${locale}/models/${model.publicId}`}>
                      {model.name}
                    </Link>
                  </h3>
                  <p>{model.summary}</p>
                </div>
                <p className={styles.metadata}>
                  {model.latestVersion
                    ? `${model.latestVersion.versionLabel} · ${model.latestVersion.evidenceState}`
                    : labels.evidence}
                  {homepage.entityStats.get(model.publicId) ? (
                    <>
                      <br />
                      {
                        homepage.entityStats.get(model.publicId)!.relationCount
                      }{" "}
                      {homepage.entityStats.get(model.publicId)!
                        .relationCount === 1
                        ? labels.relation
                        : labels.relations}
                      <br />
                      {labels.lastVerified}:{" "}
                      {homepage.entityStats.get(model.publicId)!.lastVerifiedAt}
                    </>
                  ) : null}
                </p>
              </article>
            ))}
            {rankingRows.length === 0 && homepage.models.items.length === 0 ? (
              <p>{labels.empty}</p>
            ) : null}
          </div>
        </section>

        <section className={styles.splitSection}>
          <div>
            <div className={styles.splitHeading}>
              <h2>{labels.papers}</h2>
              <Link href={`/${locale}/papers?view=trending`}>
                {labels.viewAll} →
              </Link>
            </div>
            <ol className={styles.numberedList}>
              {homepage.papers.items.slice(0, 5).map((paper) => (
                <li key={paper.publicId}>
                  <div>
                    <Link href={`/${locale}/papers/${paper.publicId}`}>
                      {paper.name}
                    </Link>
                    <p>{paper.summary}</p>
                  </div>
                  <time dateTime={paper.latestRevision.releasedAt}>
                    {paper.latestRevision.releasedAt.slice(0, 10)}
                  </time>
                </li>
              ))}
            </ol>
            {homepage.papers.items.length === 0 ? (
              <p className={styles.emptyState}>
                {homepage.papers.rankingState === "insufficient_evidence"
                  ? homepage.papers.methodology.limitation
                  : labels.empty}
              </p>
            ) : null}
          </div>
          <div>
            <div className={styles.splitHeading}>
              <h2>{labels.repositories}</h2>
              <Link href={`/${locale}/github?view=rising`}>
                {labels.viewAll} →
              </Link>
            </div>
            <ol className={styles.numberedList}>
              {homepage.repositories.items.slice(0, 5).map((repository) => (
                <li key={repository.publicId}>
                  <div>
                    <Link href={`/${locale}/github/${repository.publicId}`}>
                      {repository.fullName}
                    </Link>
                    <p>{repository.summary}</p>
                  </div>
                  <span className={styles.metadata}>
                    ★ {repository.latestMetrics.stars.toLocaleString()}
                  </span>
                </li>
              ))}
            </ol>
            {homepage.repositories.items.length === 0 ? (
              <p className={styles.emptyState}>
                {homepage.repositories.rankingState === "insufficient_evidence"
                  ? homepage.repositories.methodology.limitation
                  : labels.empty}
              </p>
            ) : null}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionLead}>
            <h2>{labels.products}</h2>
            <Link className={styles.actionLink} href={`/${locale}/products`}>
              {labels.viewAll} →
            </Link>
          </div>
          <div className={styles.intelligenceList}>
            {homepage.products.items.slice(0, 4).map((product) => {
              const stats = homepage.entityStats.get(product.publicId);
              return (
                <article
                  className={styles.entityCard}
                  data-component="entity-card"
                  key={product.publicId}
                >
                  <div>
                    <h3>
                      <Link href={`/${locale}/products/${product.publicId}`}>
                        {product.name}
                      </Link>
                    </h3>
                    <p>{product.summary}</p>
                  </div>
                  <p className={styles.metadata}>
                    {product.category} · {product.current.pricingMode} ·{" "}
                    {product.organization.name}
                    <br />
                    {labels.observed}: {product.current.observedAt}
                    {stats ? (
                      <>
                        <br />
                        {labels.lastVerified}: {stats.lastVerifiedAt}
                        <br />
                        {stats.relationCount}{" "}
                        {stats.relationCount === 1
                          ? labels.relation
                          : labels.relations}
                      </>
                    ) : null}
                    <br />
                    <a href={product.current.source.url}>
                      {product.current.source.title}
                    </a>
                    <br />
                    {locale === "en" ? "Disclosure" : "商业披露"}:{" "}
                    {product.current.commercialDisclosure ??
                      product.current.commercialRelationship}
                  </p>
                </article>
              );
            })}
            {homepage.products.items.length === 0 ? (
              <p>{labels.empty}</p>
            ) : null}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionLead}>
            <h2>{labels.promptsSkills}</h2>
          </div>
          <div className={styles.twinLists}>
            <div>
              <h3>
                <Link href={`/${locale}/prompts`}>
                  {locale === "en" ? "Prompts" : "提示词"} →
                </Link>
              </h3>
              {homepage.prompts.items.slice(0, 4).map((prompt) => (
                <article key={prompt.publicId}>
                  <Link href={`/${locale}/prompts/${prompt.publicId}`}>
                    {prompt.name}
                  </Link>
                  <span>
                    {prompt.task} · {prompt.rightsStatus}
                  </span>
                </article>
              ))}
              {homepage.prompts.items.length === 0 ? (
                <p className={styles.emptyState}>{labels.empty}</p>
              ) : null}
            </div>
            <div>
              <h3>
                <Link href={`/${locale}/skills`}>
                  {locale === "en" ? "Skills" : "技能"} →
                </Link>
              </h3>
              {homepage.skills.items.slice(0, 4).map((skill) => (
                <article key={skill.publicId}>
                  <Link href={`/${locale}/skills/${skill.publicId}`}>
                    {skill.name}
                  </Link>
                  <span>
                    {skill.currentVersion.supportedPlatforms.join(", ")} ·{" "}
                    {skill.currentVersion.permissions.length}{" "}
                    {locale === "en" ? "permissions" : "项权限"}
                  </span>
                </article>
              ))}
              {homepage.skills.items.length === 0 ? (
                <p className={styles.emptyState}>{labels.empty}</p>
              ) : null}
            </div>
          </div>
        </section>

        <section className={styles.splitSection}>
          <div>
            <div className={styles.splitHeading}>
              <h2>{labels.guides}</h2>
              <Link href={`/${locale}/guides`}>{labels.viewAll} →</Link>
            </div>
            <ol className={styles.guideList}>
              {homepage.guides.items.slice(0, 4).map((guide) => (
                <li key={guide.publicId}>
                  <Link href={`/${locale}/guides/${guide.publicId}`}>
                    {guide.name}
                  </Link>
                  <p>{guide.summary}</p>
                  <span className={styles.metadata}>
                    {guide.provenance} · {guide.version}
                  </span>
                </li>
              ))}
            </ol>
            {homepage.guides.items.length === 0 ? (
              <p className={styles.emptyState}>{labels.empty}</p>
            ) : null}
          </div>
          <div>
            <div className={styles.splitHeading}>
              <h2>{labels.topics}</h2>
            </div>
            <div className={styles.topicIndex}>
              {homepage.topics.map((topic) => (
                <Link
                  href={`/${locale}/search?q=${encodeURIComponent(topic.name)}`}
                  key={topic.publicId}
                >
                  <strong>{topic.name}</strong>
                  <span>{topic.summary}</span>
                  <time dateTime={topic.lastVerifiedAt}>
                    {topic.lastVerifiedAt.slice(0, 10)}
                  </time>
                </Link>
              ))}
              {homepage.topics.length === 0 ? <p>{labels.empty}</p> : null}
            </div>
          </div>
        </section>

        <nav
          aria-label={locale === "en" ? "Explore AI domains" : "探索 AI 领域"}
          className={styles.mobileExplore}
          id="explore"
        >
          <strong className={styles.exploreHeading}>
            {locale === "en" ? "Explore" : "探索"}
          </strong>
          {domains.map(([slug, en, zh]) => (
            <Link href={`/${locale}/${slug}`} key={slug}>
              <span>{locale === "en" ? en : zh}</span>
              <span aria-hidden="true">→</span>
            </Link>
          ))}
        </nav>

        <section className={styles.splitSection}>
          <div>
            <h2>{labels.stayCurrent}</h2>
            <div className={styles.deliveryOptions}>
              <article>
                <h3>RSS</h3>
                <p>
                  {locale === "en"
                    ? "Follow rights-cleared public Events in your reader."
                    : "在阅读器中关注通过权利检查的公开事件。"}
                </p>
              </article>
              <article>
                <h3>Email</h3>
                <p>
                  {locale === "en"
                    ? "Receive the curated bilingual Daily Brief."
                    : "接收经过策展的双语每日简报。"}
                </p>
              </article>
            </div>
          </div>
          <div id="open-data">
            <h2>{labels.open}</h2>
            <div className={styles.openLinks}>
              <a href="https://github.com/cryanskl/ai-radar">
                <strong>{locale === "en" ? "Source code" : "源代码"}</strong>
                <span>Apache-2.0 · GitHub</span>
              </a>
              <a href="https://github.com/cryanskl/ai-radar/blob/main/docs/05-sources-rights-and-open-data.md">
                <strong>
                  {locale === "en" ? "Open data policy" : "开放数据政策"}
                </strong>
                <span>
                  {locale === "en"
                    ? "Versioned records · record-level rights"
                    : "版本化记录 · 记录级权利"}
                </span>
              </a>
            </div>
          </div>
        </section>

        <section className={styles.trustSection}>
          <h2>{labels.trust}</h2>
          <nav aria-label={labels.trust}>
            {[
              [
                "Editorial Policy",
                "编辑政策",
                "docs/08-editorial-operations.md",
              ],
              [
                "Source Policy",
                "来源政策",
                "docs/05-sources-rights-and-open-data.md",
              ],
              [
                "Translation Policy",
                "翻译政策",
                "docs/03-content-and-knowledge-graph.md",
              ],
              [
                "Event Deduplication",
                "事件去重",
                "docs/adr/0001-event-first-information-model.md",
              ],
              [
                "Ranking Methodology",
                "排名方法",
                "docs/04-ranking-and-recommendation-methodology.md",
              ],
              [
                "Corrections & Takedowns",
                "更正与下架",
                "docs/05-sources-rights-and-open-data.md",
              ],
              ["Coverage", "覆盖范围", "docs/06-public-alpha-prd.md"],
            ].map(([en, zh, path]) => (
              <a
                href={`https://github.com/cryanskl/ai-radar/blob/main/${path}`}
                key={en}
              >
                {locale === "en" ? en : zh} <span aria-hidden="true">→</span>
              </a>
            ))}
            <Link href={`/${locale}/status`}>
              {locale === "en" ? "System Status" : "系统状态"}{" "}
              <span aria-hidden="true">→</span>
            </Link>
          </nav>
        </section>

        <footer className={styles.footer}>
          <strong>AI RADAR</strong>
          <span>
            {locale === "en"
              ? "The open, bilingual map of global AI"
              : "全球 AI 的开放双语地图"}
          </span>
        </footer>
      </main>

      <nav
        aria-label={locale === "en" ? "Mobile navigation" : "移动导航"}
        className={styles.mobileNavigation}
      >
        <Link aria-current="page" href={`/${locale}`}>
          {locale === "en" ? "Home" : "首页"}
        </Link>
        <Link href={`/${locale}/radar`}>
          {locale === "en" ? "Radar" : "动态"}
        </Link>
        <a href="#explore">{locale === "en" ? "Explore" : "探索"}</a>
        <Link href={`/${locale}/search`}>
          {locale === "en" ? "Search" : "搜索"}
        </Link>
        <Link href={`/${locale}/saved`}>
          {locale === "en" ? "Saved" : "收藏"}
        </Link>
      </nav>
    </div>
  );
}
