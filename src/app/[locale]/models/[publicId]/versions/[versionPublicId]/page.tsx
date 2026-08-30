import Link from "next/link";
import { notFound } from "next/navigation";
import { localeSchema } from "@/events/contracts";
import { getPublicModelVersion } from "@/models/service";

const copy = {
  en: {
    family: "family",
    provider: "Provider",
    lifecycle: "Lifecycle",
    releasedAt: "Released",
    dataCutoff: "Data cutoff",
    evidence: {
      available: "Evidence available",
      insufficient_evidence: "Insufficient evidence",
    },
    predecessor: "Previous version",
    successor: "Next version",
    configuration: "Configuration",
    context: "Context window",
    input: "Input modalities",
    output: "Output modalities",
    access: "Access methods",
    regions: "Regions",
    prices: "Prices",
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
    taxPolicy: "Tax policy",
    validFrom: "Valid from",
    validTo: "Valid to",
    verified: "Last verified",
    source: "Source",
    benchmarks: "Benchmark Runs",
    task: "Task",
    direction: "Score direction",
    higher: "higher is better",
    lower: "lower is better",
    settings: "Settings",
    evaluator: "Evaluator",
    provenanceLabel: "Provenance",
    provenance: {
      independent_reproduced: "Independent reproduced",
      independent_reported: "Independent reported",
      vendor_reported: "Vendor reported",
      community_observation: "Community observation",
    },
    runAt: "Run date",
    reproducibility: "Reproducibility",
    confidence: "Confidence",
    related: "Related Entities",
    timeline: "Timeline",
    empty: "None published",
  },
  zh: {
    family: "模型家族",
    provider: "提供商",
    lifecycle: "生命周期",
    releasedAt: "发布日期",
    dataCutoff: "数据截止时间",
    evidence: {
      available: "证据可用",
      insufficient_evidence: "证据不足",
    },
    predecessor: "上一版本",
    successor: "下一版本",
    configuration: "配置",
    context: "上下文窗口",
    input: "输入模态",
    output: "输出模态",
    access: "访问方式",
    regions: "可用地区",
    prices: "价格记录",
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
    taxPolicy: "税费口径",
    validFrom: "生效时间",
    validTo: "结束时间",
    verified: "最后核验",
    source: "来源",
    benchmarks: "评测记录",
    task: "任务",
    direction: "评分方向",
    higher: "越高越好",
    lower: "越低越好",
    settings: "运行设置",
    evaluator: "评测主体",
    provenanceLabel: "来源分层",
    provenance: {
      independent_reproduced: "独立复现",
      independent_reported: "独立报告",
      vendor_reported: "厂商自报",
      community_observation: "社区观察",
    },
    runAt: "运行日期",
    reproducibility: "可复现程度",
    confidence: "置信度",
    related: "相关实体",
    timeline: "时间线",
    empty: "暂无公开记录",
  },
} as const;

export const dynamic = "force-dynamic";

export default async function ModelVersionPage({
  params,
}: {
  params: Promise<{
    locale: string;
    publicId: string;
    versionPublicId: string;
  }>;
}) {
  const resolved = await params;
  const locale = localeSchema.safeParse(resolved.locale);
  if (!locale.success) notFound();
  const version = await getPublicModelVersion(
    resolved.versionPublicId,
    locale.data,
  );
  if (!version || version.family.publicId !== resolved.publicId) notFound();
  const labels = copy[locale.data];
  return (
    <main lang={locale.data}>
      <h1>
        {version.family.name} {version.versionLabel}
      </h1>
      <p>
        <Link href={`/${locale.data}/models/${version.family.publicId}`}>
          {version.family.name} {labels.family}
        </Link>
      </p>
      <p>{version.family.summary}</p>
      <p>
        <a href={version.family.officialUrl}>{version.family.name}</a>
      </p>
      <p>{labels.evidence[version.evidenceState]}</p>
      <p>
        {labels.provider}: {version.provider?.name ?? labels.empty}
      </p>
      <p>
        {labels.lifecycle}: {version.lifecycleStatus ?? labels.empty}
      </p>
      <p>
        {labels.releasedAt}:{" "}
        {version.releasedAt ? (
          <time dateTime={version.releasedAt}>{version.releasedAt}</time>
        ) : (
          labels.empty
        )}
      </p>
      <p>
        {labels.dataCutoff}:{" "}
        <time dateTime={version.family.dataCutoff}>
          {version.family.dataCutoff}
        </time>
      </p>
      <h2>{labels.configuration}</h2>
      <dl>
        <dt>{labels.context}</dt>
        <dd>{version.contextWindowTokens ?? "—"}</dd>
        <dt>{labels.input}</dt>
        <dd>{version.inputModalities.join(", ") || "—"}</dd>
        <dt>{labels.output}</dt>
        <dd>{version.outputModalities.join(", ") || "—"}</dd>
        <dt>{labels.access}</dt>
        <dd>{version.accessMethods.join(", ") || "—"}</dd>
        <dt>{labels.regions}</dt>
        <dd>{version.regions.join(", ") || "—"}</dd>
      </dl>
      <p>
        {labels.predecessor}:{" "}
        {version.predecessorPublicId ? (
          <Link
            href={
              "/" +
              locale.data +
              "/models/" +
              version.family.publicId +
              "/versions/" +
              version.predecessorPublicId
            }
          >
            {version.predecessorPublicId}
          </Link>
        ) : (
          "—"
        )}
      </p>
      <p>
        {labels.successor}:{" "}
        {version.successorPublicId ? (
          <Link
            href={
              "/" +
              locale.data +
              "/models/" +
              version.family.publicId +
              "/versions/" +
              version.successorPublicId
            }
          >
            {version.successorPublicId}
          </Link>
        ) : (
          "—"
        )}
      </p>
      <h2>{labels.prices}</h2>
      {version.prices.length === 0 ? <p>{labels.empty}</p> : null}
      {version.prices.map((price) => (
        <article key={price.publicId}>
          <h3>{labels.price[price.category]}</h3>
          <p>
            {price.amount} {price.currency} · {price.unit} · {price.region}
          </p>
          <p>
            {labels.taxPolicy}: {price.taxPolicy}
          </p>
          <p>
            {labels.validFrom}:{" "}
            <time dateTime={price.validFrom}>{price.validFrom}</time>
          </p>
          <p>
            {labels.validTo}:{" "}
            {price.validTo ? (
              <time dateTime={price.validTo}>{price.validTo}</time>
            ) : (
              "∞"
            )}
          </p>
          <p>
            {labels.verified}:{" "}
            <time dateTime={price.lastVerifiedAt}>{price.lastVerifiedAt}</time>
          </p>
          <a href={price.source.url}>
            {labels.source}: {price.source.title}
          </a>
        </article>
      ))}
      <h2>{labels.benchmarks}</h2>
      {version.benchmarkRuns.length === 0 ? <p>{labels.empty}</p> : null}
      {version.benchmarkRuns.map((run) => (
        <article key={run.publicId}>
          <h3>
            {run.benchmark.name} {run.benchmark.version}
          </h3>
          <p>
            {labels.task}: {run.task}
          </p>
          <p>
            {run.score} {run.unit} · {labels.direction}:{" "}
            {run.higherIsBetter ? labels.higher : labels.lower}
          </p>
          <p>
            {labels.evaluator}: {run.evaluator.name}
          </p>
          <p>
            {labels.provenanceLabel}: {labels.provenance[run.provenance]}
          </p>
          <p>
            {labels.runAt}: <time dateTime={run.runAt}>{run.runAt}</time>
          </p>
          <p>
            {labels.reproducibility}: {run.reproducibility}
          </p>
          <p>
            {labels.confidence}: {run.confidence}
          </p>
          <p>
            {labels.verified}:{" "}
            <time dateTime={run.lastVerifiedAt}>{run.lastVerifiedAt}</time>
          </p>
          <h4>{labels.settings}</h4>
          <pre>{JSON.stringify(run.settings, null, 2)}</pre>
          <a href={run.evidence.url}>
            {labels.source}: {run.evidence.title}
          </a>
        </article>
      ))}
      <h2>{labels.related}</h2>
      <ul>
        {version.family.relatedEntities.map((related) => (
          <li key={related.relation + ":" + related.publicId}>
            <Link href={"/" + locale.data + "/entities/" + related.publicId}>
              {related.name}
            </Link>{" "}
            · {related.relation}
          </li>
        ))}
      </ul>
      <h2>{labels.timeline}</h2>
      <ol>
        {version.family.timeline.map((event) => (
          <li key={event.eventPublicId}>
            <Link
              href={"/" + locale.data + "/radar/events/" + event.eventPublicId}
            >
              {event.title}
            </Link>{" "}
            <time dateTime={event.occurredAt}>{event.occurredAt}</time>
          </li>
        ))}
      </ol>
    </main>
  );
}
