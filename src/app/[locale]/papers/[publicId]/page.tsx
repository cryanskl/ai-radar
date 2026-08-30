import Link from "next/link";
import { notFound } from "next/navigation";
import { localeSchema } from "@/events/contracts";
import { getPublicPaper } from "@/papers/service";

const copy = {
  en: {
    metadata: "arXiv descriptive metadata rights",
    fullText: "Full-text rights",
    noPdf: "Paper PDFs are not packaged",
    contributions: "Source-claimed contributions",
    limitations: "Source limitations",
    inference: "AI Radar inference",
    authors: "Authors and institutions",
    resources: "Implementation and dataset links",
    related: "Related entities",
    events: "Related events",
    released: "Released",
    verified: "Last verified",
    evidence: "Evidence",
    confidence: "Confidence",
    cutoff: "Data cutoff",
  },
  zh: {
    metadata: "arXiv 描述性元数据权利",
    fullText: "全文权利",
    noPdf: "不打包论文 PDF",
    contributions: "原文声称贡献",
    limitations: "原文限制",
    inference: "AI Radar 推断",
    authors: "作者与机构",
    resources: "实现与数据集链接",
    related: "相关实体",
    events: "相关事件",
    released: "发布时间",
    verified: "最后核验",
    evidence: "证据",
    confidence: "置信度",
    cutoff: "数据截止时间",
  },
} as const;

export const dynamic = "force-dynamic";

export default async function PaperPage({
  params,
}: {
  params: Promise<{ locale: string; publicId: string }>;
}) {
  const resolved = await params;
  const locale = localeSchema.safeParse(resolved.locale);
  if (!locale.success) notFound();
  const paper = await getPublicPaper(resolved.publicId, locale.data);
  if (!paper || !("revisions" in paper)) notFound();
  const labels = copy[locale.data];
  return (
    <main lang={locale.data}>
      <h1>{paper.name}</h1>
      <p>{paper.summary}</p>
      <p>
        {labels.metadata}: {paper.metadataRights.status} ·{" "}
        <a href={paper.metadataRights.licenseUrl}>
          {paper.metadataRights.licenseUrl}
        </a>
      </p>
      <p>{labels.noPdf}</p>
      {paper.revisions.map((revision) => (
        <article key={revision.versionPublicId}>
          <h2>
            {revision.arxivVersion} — {revision.title}
          </h2>
          <a href={revision.abstractUrl}>{paper.arxivId}</a>
          <p>
            {labels.fullText}: {revision.fullTextRightsStatus}
          </p>
          {revision.fullTextLicenseUrl ? (
            <a href={revision.fullTextLicenseUrl}>
              {revision.fullTextLicenseUrl}
            </a>
          ) : null}
          <p>
            {labels.released}:{" "}
            <time dateTime={revision.releasedAt}>{revision.releasedAt}</time>
          </p>
          <p>
            {labels.verified}:{" "}
            <time dateTime={revision.lastVerifiedAt}>
              {revision.lastVerifiedAt}
            </time>
          </p>
          <h3>{labels.authors}</h3>
          <ul>
            {revision.authors.map((author) => (
              <li key={author.name}>
                {author.name} · {author.institutions.join(", ")}
              </li>
            ))}
          </ul>
          <h3>{labels.contributions}</h3>
          <ul>
            {revision.guidance.claimedContributions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <h3>{labels.limitations}</h3>
          <ul>
            {revision.guidance.limitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <h3>{labels.inference}</h3>
          <ul>
            {revision.guidance.inference.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <h3>{labels.resources}</h3>
          <ul>
            {revision.resourceLinks.map((resource) => (
              <li key={resource.publicId}>
                <a href={resource.url}>{resource.label}</a> · {resource.kind}
                {" · "}
                {labels.evidence}: {resource.evidenceSourceItemPublicId}
              </li>
            ))}
          </ul>
        </article>
      ))}
      <h2>{labels.related}</h2>
      <ul>
        {paper.relatedEntities.map((related) => (
          <li key={`${related.predicate}:${related.publicId}`}>
            <Link href={`/${locale.data}/entities/${related.publicId}`}>
              {related.name}
            </Link>{" "}
            · {related.predicate}
            {" · "}
            {labels.confidence}: {related.confidence}
            {" · "}
            {labels.verified}:{" "}
            <time dateTime={related.lastVerifiedAt}>
              {related.lastVerifiedAt}
            </time>
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
      <h2>{labels.events}</h2>
      <ul>
        {paper.relatedEvents.map((event) => (
          <li key={event.eventPublicId}>
            <Link href={`/${locale.data}/radar/events/${event.eventPublicId}`}>
              {event.title}
            </Link>
            {" · "}
            {labels.confidence}: {event.confidence}
            {" · "}
            {labels.verified}:{" "}
            <time dateTime={event.lastVerifiedAt}>{event.lastVerifiedAt}</time>
            <ul>
              {event.evidence.map((evidence) => (
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
        <time dateTime={paper.dataCutoff}>{paper.dataCutoff}</time>
      </p>
    </main>
  );
}
