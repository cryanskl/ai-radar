import Link from "next/link";
import { notFound } from "next/navigation";
import { localeSchema } from "@/events/contracts";
import { modelListRequestSchema } from "@/models/contracts";
import { listPublicModels } from "@/models/service";

const copy = {
  en: {
    heading: "Models",
    compare: "Compare and configure",
    empty: "No public Model profiles match these filters.",
    latest: "Latest version",
    evidence: {
      available: "Evidence available",
      insufficient_evidence: "Insufficient evidence",
    },
  },
  zh: {
    heading: "模型",
    compare: "比较与配置推荐",
    empty: "没有符合筛选条件的公开模型档案。",
    latest: "最新版本",
    evidence: {
      available: "证据可用",
      insufficient_evidence: "证据不足",
    },
  },
} as const;

export const dynamic = "force-dynamic";

export default async function ModelsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const locale = localeSchema.safeParse((await params).locale);
  if (!locale.success) notFound();
  const parsed = modelListRequestSchema.safeParse({
    ...(await searchParams),
    locale: locale.data,
  });
  if (!parsed.success) notFound();
  const result = await listPublicModels(parsed.data);
  const labels = copy[locale.data];
  return (
    <main lang={locale.data}>
      <h1>{labels.heading}</h1>
      <p>
        <Link href={`/${locale.data}/models/compare`}>{labels.compare}</Link>
      </p>
      {result.items.length === 0 ? <p>{labels.empty}</p> : null}
      <ol>
        {result.items.map((model) => (
          <li key={model.publicId}>
            <h2>
              <Link href={`/${locale.data}/models/${model.publicId}`}>
                {model.name}
              </Link>
            </h2>
            <p>{model.summary}</p>
            {model.provider ? <p>{model.provider.name}</p> : null}
            {model.latestVersion ? (
              <p>
                {labels.latest}: {model.latestVersion.versionLabel} ·{" "}
                {labels.evidence[model.latestVersion.evidenceState]}
              </p>
            ) : (
              <p>{labels.evidence.insufficient_evidence}</p>
            )}
          </li>
        ))}
      </ol>
      {result.dataCutoff ? (
        <time dateTime={result.dataCutoff}>{result.dataCutoff}</time>
      ) : null}
    </main>
  );
}
