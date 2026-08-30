import Link from "next/link";
import { notFound } from "next/navigation";
import { localeSchema } from "@/events/contracts";
import { getPublicModel } from "@/models/service";

const copy = {
  en: {
    provider: "Provider",
    versions: "Versions",
    context: "Context window",
    access: "Access",
    regions: "Regions",
    input: "Input modalities",
    output: "Output modalities",
    prices: "Prices",
    benchmarks: "Benchmark Runs",
    evidence: "Evidence",
    dataCutoff: "Data cutoff",
    verified: "Last verified",
    runAt: "Run date",
    related: "Related Entities",
    timeline: "Timeline",
    empty: "None published",
    evidenceState: {
      available: "Evidence available",
      insufficient_evidence: "Insufficient evidence",
    },
    price: {
      input_tokens: "Input Token",
      output_tokens: "Output Token",
      cached_input_tokens: "Cached Input Token",
      cached_output_tokens: "Cached Output Token",
      batch_input_tokens: "Batch Input Token",
      batch_output_tokens: "Batch Output Token",
      image: "Image",
      audio: "Audio",
      video: "Video",
    },
    provenance: {
      independent_reproduced: "Independent reproduced",
      independent_reported: "Independent reported",
      vendor_reported: "Vendor reported",
      community_observation: "Community observation",
    },
  },
  zh: {
    provider: "提供商",
    versions: "版本",
    context: "上下文窗口",
    access: "访问方式",
    regions: "可用地区",
    input: "输入模态",
    output: "输出模态",
    prices: "价格记录",
    benchmarks: "评测记录",
    evidence: "证据",
    dataCutoff: "数据截止时间",
    verified: "最后核验",
    runAt: "运行日期",
    related: "相关实体",
    timeline: "时间线",
    empty: "暂无公开记录",
    evidenceState: {
      available: "证据可用",
      insufficient_evidence: "证据不足",
    },
    price: {
      input_tokens: "输入 Token",
      output_tokens: "输出 Token",
      cached_input_tokens: "缓存输入 Token",
      cached_output_tokens: "缓存输出 Token",
      batch_input_tokens: "批处理输入 Token",
      batch_output_tokens: "批处理输出 Token",
      image: "图像",
      audio: "音频",
      video: "视频",
    },
    provenance: {
      independent_reproduced: "独立复现",
      independent_reported: "独立报告",
      vendor_reported: "厂商自报",
      community_observation: "社区观察",
    },
  },
} as const;

export const dynamic = "force-dynamic";

export default async function ModelPage({
  params,
}: {
  params: Promise<{ locale: string; publicId: string }>;
}) {
  const resolved = await params;
  const locale = localeSchema.safeParse(resolved.locale);
  if (!locale.success) notFound();
  const model = await getPublicModel(resolved.publicId, locale.data);
  if (!model) notFound();
  const labels = copy[locale.data];
  return (
    <main lang={locale.data}>
      <h1>{model.name}</h1>
      <p>{model.summary}</p>
      <p>
        <a href={model.officialUrl}>{model.name}</a>
      </p>
      <p>
        {labels.provider}: {model.provider?.name ?? labels.empty}
      </p>
      <p>
        {labels.dataCutoff}:{" "}
        <time dateTime={model.dataCutoff}>{model.dataCutoff}</time>
      </p>
      <h2>{labels.versions}</h2>
      {model.versions.map((version) => (
        <section key={version.publicId}>
          <h3>
            <Link
              href={`/${locale.data}/models/${model.publicId}/versions/${version.publicId}`}
            >
              {version.versionLabel}
            </Link>
          </h3>
          <p>{labels.evidenceState[version.evidenceState]}</p>
          {version.contextWindowTokens ? (
            <dl>
              <dt>{labels.context}</dt>
              <dd>{version.contextWindowTokens}</dd>
              <dt>{labels.input}</dt>
              <dd>{version.inputModalities.join(", ")}</dd>
              <dt>{labels.output}</dt>
              <dd>{version.outputModalities.join(", ")}</dd>
              <dt>{labels.access}</dt>
              <dd>{version.accessMethods.join(", ")}</dd>
              <dt>{labels.regions}</dt>
              <dd>{version.regions.join(", ")}</dd>
            </dl>
          ) : null}
          <h4>{labels.prices}</h4>
          {version.prices.length === 0 ? <p>{labels.empty}</p> : null}
          {version.prices.map((price) => (
            <article key={price.publicId}>
              <h5>{labels.price[price.category]}</h5>
              <p>
                {price.amount} {price.currency} · {price.unit} · {price.region}
              </p>
              <p>
                <time dateTime={price.validFrom}>{price.validFrom}</time> —{" "}
                {price.validTo ? (
                  <time dateTime={price.validTo}>{price.validTo}</time>
                ) : (
                  "∞"
                )}
              </p>
              <p>
                {labels.verified}:{" "}
                <time dateTime={price.lastVerifiedAt}>
                  {price.lastVerifiedAt}
                </time>
              </p>
              <a href={price.source.url}>
                {labels.evidence}: {price.source.title}
              </a>
            </article>
          ))}
          <h4>{labels.benchmarks}</h4>
          {version.benchmarkRuns.length === 0 ? <p>{labels.empty}</p> : null}
          {version.benchmarkRuns.map((run) => (
            <article key={run.publicId}>
              <h5>
                {run.benchmark.name} {run.benchmark.version}
              </h5>
              <p>{labels.provenance[run.provenance]}</p>
              <p>
                {run.task}: {run.score} {run.unit} · {run.evaluator.name}
              </p>
              <pre>{JSON.stringify(run.settings, null, 2)}</pre>
              <p>
                {labels.runAt}: <time dateTime={run.runAt}>{run.runAt}</time>
              </p>
              <p>
                {labels.verified}:{" "}
                <time dateTime={run.lastVerifiedAt}>{run.lastVerifiedAt}</time>
              </p>
              <a href={run.evidence.url}>
                {labels.evidence}: {run.evidence.title}
              </a>
            </article>
          ))}
        </section>
      ))}
      <h2>{labels.related}</h2>
      <ul>
        {model.relatedEntities.map((related) => (
          <li key={`${related.relation}:${related.publicId}`}>
            <Link href={`/${locale.data}/entities/${related.publicId}`}>
              {related.name}
            </Link>{" "}
            · {related.relation}
          </li>
        ))}
      </ul>
      <h2>{labels.timeline}</h2>
      <ol>
        {model.timeline.map((event) => (
          <li key={event.eventPublicId}>
            <Link href={`/${locale.data}/radar/events/${event.eventPublicId}`}>
              {event.title}
            </Link>{" "}
            <time dateTime={event.occurredAt}>{event.occurredAt}</time>
          </li>
        ))}
      </ol>
    </main>
  );
}
