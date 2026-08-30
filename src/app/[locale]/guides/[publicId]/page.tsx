import Link from "next/link";
import { notFound } from "next/navigation";
import { guidePresentation } from "@/guides/presentation";
import { getPublicGuide } from "@/guides/service";

const copy = {
  en: {
    back: "Guides",
    prerequisites: "Prerequisites",
    steps: "Steps",
    expected: "Expected outcome",
    limitations: "Limitations",
    related: "Related records",
    evidence: "Evidence",
    reviewed: "Reviewed",
    published: "Published",
    license: "License",
    rights: "Rights",
    status: "Freshness",
    verified: "Verified",
    source: "Original source",
    stale: "This Guide is stale",
  },
  zh: {
    back: "技巧指南",
    prerequisites: "前置条件",
    steps: "步骤",
    expected: "预期结果",
    limitations: "限制",
    related: "相关记录",
    evidence: "证据",
    reviewed: "审核时间",
    published: "发布时间",
    license: "许可证",
    rights: "权利状态",
    status: "新鲜度",
    verified: "核验时间",
    source: "原始来源",
    stale: "此指南已过期",
  },
} as const;

const routeByType = {
  model: "models",
  product: "products",
  repository: "github",
  prompt: "prompts",
  skill: "skills",
  event: "radar/events",
} as const;

export default async function GuideDetailPage({
  params,
}: {
  params: Promise<{ locale: string; publicId: string }>;
}) {
  const { locale, publicId } = await params;
  if (locale !== "en" && locale !== "zh") notFound();
  const guide = await getPublicGuide(publicId, locale);
  if (!guide) notFound();
  const text = copy[locale];
  const labels = guidePresentation[locale];
  return (
    <main>
      <p>
        <Link href={`/${locale}/guides`}>{text.back}</Link>
      </p>
      <h1>{guide.name}</h1>
      <p>{guide.summary}</p>
      <p>
        {guide.author.name} · {guide.version} ·{" "}
        {labels.provenance[guide.provenance]}
      </p>
      <p>
        {text.reviewed}: <time>{guide.reviewedAt}</time>
      </p>
      <p>
        {text.published}: <time>{guide.publishedAt}</time> · {text.status}:{" "}
        {labels.status[guide.currentStatus.status]}
      </p>
      <p>
        {text.rights}: {labels.rightsStatus[guide.rightsStatus]} ·{" "}
        {text.license}:{" "}
        {guide.license ? (
          <a href={guide.license.url}>{guide.license.name}</a>
        ) : (
          "—"
        )}
      </p>
      {guide.currentStatus.status === "stale" ? (
        <aside>
          <strong>{text.stale}</strong>
          <p>{guide.currentStatus.staleReason}</p>
        </aside>
      ) : null}
      <p>
        <a href={guide.source.url}>{text.source}</a>
      </p>
      {guide.contentMode === "full_guide" ? (
        <>
          <section>
            <h2>{text.prerequisites}</h2>
            <ul>
              {guide.prerequisites.map((prerequisite) => (
                <li key={prerequisite}>{prerequisite}</li>
              ))}
            </ul>
          </section>
          <section>
            <h2>{text.steps}</h2>
            <ol>
              {guide.steps.map((step) => (
                <li key={step.id}>
                  <p>{step.instruction}</p>
                  {step.verifiedAt ? (
                    <p>
                      {text.verified} <time>{step.verifiedAt}</time>
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>
          <section>
            <h2>{text.expected}</h2>
            <p>{guide.expectedOutcome}</p>
          </section>
          <section>
            <h2>{text.limitations}</h2>
            <ul>
              {guide.limitations.map((limitation) => (
                <li key={limitation}>{limitation}</li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
      <section>
        <h2>{text.related}</h2>
        <ul>
          {guide.relatedRecords.map((relation) => (
            <li key={relation.publicId}>
              <Link
                href={`/${locale}/${routeByType[relation.target.type as keyof typeof routeByType]}/${relation.target.publicId}`}
              >
                {relation.target.name}
              </Link>
              <span> · {text.evidence}: </span>
              {relation.evidence.map((evidence, index) => (
                <span key={evidence.sourceItemPublicId}>
                  {index > 0 ? ", " : null}
                  <a href={evidence.url}>{evidence.title}</a>
                </span>
              ))}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
