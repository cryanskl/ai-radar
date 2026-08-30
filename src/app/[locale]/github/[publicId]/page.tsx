import Link from "next/link";
import { notFound } from "next/navigation";
import { localeSchema } from "@/events/contracts";
import { getPublicRepository } from "@/repositories/service";

const copy = {
  en: {
    official: "Official GitHub Repository",
    license: "License",
    detectedLicense:
      "A license was detected. Review its terms before reuse or commercial use.",
    missingLicense:
      "No license was detected. Do not assume copying or commercial use is permitted.",
    active: "Active",
    archived: "Archived",
    mirrored: "Mirrored",
    unavailable: "Unavailable",
    observations: "Observation history",
    releases: "Releases",
    related: "Related entities",
    evidence: "Evidence",
    confidence: "Confidence",
    cutoff: "Data cutoff",
    description: "Description",
    topics: "Topics",
    languages: "Languages",
    updated: "Repository updated",
    pushed: "Last push",
    provenance: "Repository provenance",
    original: "Original Repository",
    stars: "stars",
    forks: "forks",
  },
  zh: {
    official: "GitHub 官方仓库",
    license: "许可证",
    detectedLicense: "已检测到许可证；复用或商用前仍需审阅具体条款。",
    missingLicense: "未检测到许可证，不要假设可以复制或商用。",
    active: "活跃",
    archived: "已归档",
    mirrored: "镜像",
    unavailable: "不可用",
    observations: "观察历史",
    releases: "发布记录",
    related: "相关实体",
    evidence: "证据",
    confidence: "置信度",
    cutoff: "数据截止时间",
    description: "描述",
    topics: "主题",
    languages: "语言",
    updated: "仓库更新时间",
    pushed: "最后推送时间",
    provenance: "仓库来源",
    original: "原创仓库",
    stars: "Star",
    forks: "Fork",
  },
} as const;

export const dynamic = "force-dynamic";

export default async function GithubRepositoryPage({
  params,
}: {
  params: Promise<{ locale: string; publicId: string }>;
}) {
  const resolved = await params;
  const locale = localeSchema.safeParse(resolved.locale);
  if (!locale.success) notFound();
  const repository = await getPublicRepository(resolved.publicId, locale.data);
  if (!repository || !("observations" in repository)) notFound();
  const labels = copy[locale.data];
  return (
    <main lang={locale.data}>
      <h1>{repository.name}</h1>
      <p>{repository.summary}</p>
      <p>{labels[repository.lifecycleState]}</p>
      <p>
        {labels.description}: {repository.description ?? "—"}
      </p>
      <p>
        {labels.topics}: {repository.topics.join(", ") || "—"}
      </p>
      <p>
        {labels.languages}:{" "}
        {repository.languages.map(({ name }) => name).join(", ") || "—"}
      </p>
      <p>
        {labels.updated}:{" "}
        <time dateTime={repository.repositoryUpdatedAt}>
          {repository.repositoryUpdatedAt}
        </time>
      </p>
      <p>
        {labels.pushed}:{" "}
        {repository.pushedAt ? (
          <time dateTime={repository.pushedAt}>{repository.pushedAt}</time>
        ) : (
          "—"
        )}
      </p>
      <p>
        <a href={repository.officialUrl}>{labels.official}</a> ·{" "}
        {repository.fullName}
      </p>
      <p>
        {labels.license}: {repository.license.spdxId ?? labels.missingLicense}
      </p>
      <p>
        {repository.license.status === "missing"
          ? labels.missingLicense
          : labels.detectedLicense}
      </p>
      <h2>{labels.provenance}</h2>
      {[
        repository.parentRepository,
        repository.sourceRepository,
        repository.templateRepository,
      ].some(Boolean) ? (
        <ul>
          {[
            repository.parentRepository,
            repository.sourceRepository,
            repository.templateRepository,
          ].flatMap((reference) =>
            reference
              ? [
                  <li
                    key={`${reference.githubRepositoryId}:${reference.fullName}`}
                  >
                    <a href={reference.url}>{reference.fullName}</a>
                  </li>,
                ]
              : [],
          )}
        </ul>
      ) : (
        <p>{labels.original}</p>
      )}
      <h2>{labels.observations}</h2>
      <ol>
        {repository.observations.map((observation) => (
          <li key={observation.sourceItemPublicId}>
            <time dateTime={observation.observedAt}>
              {observation.observedAt}
            </time>
            {" · "}
            {observation.stars} {labels.stars} · {observation.forks}{" "}
            {labels.forks}
          </li>
        ))}
      </ol>
      <h2>{labels.releases}</h2>
      <ul>
        {repository.releases.map((release) => (
          <li key={release.githubReleaseId}>
            <a href={release.url}>{release.tagName}</a>
            {release.publishedAt ? (
              <time dateTime={release.publishedAt}>
                {" "}
                · {release.publishedAt}
              </time>
            ) : null}
          </li>
        ))}
      </ul>
      <h2>{labels.related}</h2>
      <ul>
        {repository.relatedEntities.map((related) => (
          <li key={related.relationPublicId}>
            <Link href={`/${locale.data}/entities/${related.publicId}`}>
              {related.name}
            </Link>
            {" · "}
            {related.predicate} · {labels.confidence}: {related.confidence}
            <ul>
              {related.evidence.map((evidence) => (
                <li key={evidence.sourceItemPublicId}>
                  {labels.evidence}:{" "}
                  <a href={evidence.originalUrl}>{evidence.originalTitle}</a>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <p>
        {labels.cutoff}:{" "}
        <time dateTime={repository.dataCutoff}>{repository.dataCutoff}</time>
      </p>
    </main>
  );
}
