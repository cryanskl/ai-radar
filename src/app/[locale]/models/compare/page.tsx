import Link from "next/link";
import { notFound } from "next/navigation";
import { localeSchema } from "@/events/contracts";
import { modelRecommendationQuerySchema } from "@/models/contracts";
import { recommendPublicModels } from "@/models/service";

const copy = {
  en: {
    heading: "Model configuration fit",
    intro:
      "Compare exact Model Versions only under the same selected evidence conditions.",
    form: "Selected constraints",
    submit: "Compare and recommend",
    invalid: "The selected constraints are incomplete or invalid.",
    status: {
      available: "Recommendation available",
      not_comparable: "Not comparable",
      insufficient_evidence: "Insufficient evidence",
    },
    outcome: {
      fit: "Fits the selected constraints",
      not_fit: "Does not fit the selected constraints",
      not_comparable: "Not comparable",
      insufficient_evidence: "Insufficient evidence",
    },
    rank: "Rank",
    fit: "Why it fits",
    nonFit: "Why it does not fit",
    price: "Current",
    priceSuffix: "price",
    priceDetails: "Price evidence",
    priceRegion: "Price region",
    taxPolicy: "Tax policy",
    validFrom: "Valid from",
    validTo: "Valid to",
    noExpiry: "No published expiry",
    lastVerifiedAt: "Last verified",
    quality: "Quality evidence",
    latency: "Latency evidence",
    dataCutoff: "Data Cutoff",
    methodology: "Methodology",
    eligibility: "Eligibility",
    limitations: "Limitations",
    labels: {
      locale: "Language",
      task: "Task",
      benchmarkPublicId: "Quality benchmark ID",
      benchmarkVersion: "Quality benchmark version",
      scoreUnit: "Quality score unit",
      qualityThreshold: "Quality threshold",
      qualityDirection: "Quality direction",
      priceCategory: "Price category",
      priceUnit: "Price unit",
      currency: "Currency",
      region: "Region",
      maximumUnitPrice: "Maximum unit price",
      deployment: "Deployment",
      requireOpenWeights: "Require open weights",
      maximumLatencyMs: "Maximum latency (ms)",
      latencyBenchmarkPublicId: "Latency benchmark ID",
      latencyBenchmarkVersion: "Latency benchmark version",
      versions: "Exact version IDs (comma separated, up to four)",
      versionPublicIds: "Exact version IDs",
    },
  },
  zh: {
    heading: "模型配置匹配",
    intro: "只在相同的已选证据条件下比较精确模型版本。",
    form: "所选约束",
    submit: "比较并推荐",
    invalid: "所选约束不完整或无效。",
    status: {
      available: "推荐可用",
      not_comparable: "条件不可比",
      insufficient_evidence: "证据不足",
    },
    outcome: {
      fit: "符合所选约束",
      not_fit: "不符合所选约束",
      not_comparable: "条件不可比",
      insufficient_evidence: "证据不足",
    },
    rank: "名次",
    fit: "适合原因",
    nonFit: "不适合原因",
    price: "当前",
    priceSuffix: "价格",
    priceDetails: "价格证据",
    priceRegion: "价格地区",
    taxPolicy: "税费口径",
    validFrom: "生效时间",
    validTo: "失效时间",
    noExpiry: "未公布失效时间",
    lastVerifiedAt: "最后核验时间",
    quality: "质量证据",
    latency: "时延证据",
    dataCutoff: "数据截止时间",
    methodology: "方法",
    eligibility: "资格条件",
    limitations: "限制",
    labels: {
      locale: "语言",
      task: "任务",
      benchmarkPublicId: "质量评测 ID",
      benchmarkVersion: "质量评测版本",
      scoreUnit: "质量分数单位",
      qualityThreshold: "质量门槛",
      qualityDirection: "质量方向",
      priceCategory: "价格类别",
      priceUnit: "价格单位",
      currency: "币种",
      region: "地区",
      maximumUnitPrice: "最高单位价格",
      deployment: "部署方式",
      requireOpenWeights: "要求开放权重",
      maximumLatencyMs: "最高时延（毫秒）",
      latencyBenchmarkPublicId: "时延评测 ID",
      latencyBenchmarkVersion: "时延评测版本",
      versions: "精确版本 ID（逗号分隔，最多四个）",
      versionPublicIds: "精确版本 ID",
    },
  },
} as const;

const valueCopy: Record<"en" | "zh", Record<string, string>> = {
  en: {
    at_least: "At least",
    at_most: "At most",
    input_tokens: "Input tokens",
    output_tokens: "Output tokens",
    cached_input_tokens: "Cached input tokens",
    cached_output_tokens: "Cached output tokens",
    batch_input_tokens: "Batch input tokens",
    batch_output_tokens: "Batch output tokens",
    image: "Image",
    audio: "Audio",
    video: "Video",
    per_million_tokens: "per million tokens",
    per_image: "per image",
    per_minute: "per minute",
    per_second: "per second",
    hosted_api: "Hosted API",
    open_weights: "Open weights",
    self_hosted: "Self-hosted",
    true: "Yes",
    false: "No",
    inclusive: "Tax included",
    exclusive: "Tax excluded",
    unknown: "Tax treatment unknown",
  },
  zh: {
    at_least: "至少",
    at_most: "至多",
    input_tokens: "输入 Token",
    output_tokens: "输出 Token",
    cached_input_tokens: "缓存输入 Token",
    cached_output_tokens: "缓存输出 Token",
    batch_input_tokens: "批处理输入 Token",
    batch_output_tokens: "批处理输出 Token",
    image: "图像",
    audio: "音频",
    video: "视频",
    per_million_tokens: "每百万 Token",
    per_image: "每张图像",
    per_minute: "每分钟",
    per_second: "每秒",
    hosted_api: "托管 API",
    open_weights: "开放权重",
    self_hosted: "自部署",
    true: "是",
    false: "否",
    inclusive: "含税",
    exclusive: "未含税",
    unknown: "税费口径未知",
  },
};

export const dynamic = "force-dynamic";

export default async function ModelComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const parsedLocale = localeSchema.safeParse((await params).locale);
  if (!parsedLocale.success) notFound();
  const locale = parsedLocale.data;
  const parameters = await searchParams;
  const attempted = parameters.task !== undefined;
  const parsed = attempted
    ? modelRecommendationQuerySchema.safeParse({ ...parameters, locale })
    : null;
  const result = parsed?.success
    ? await recommendPublicModels(parsed.data)
    : null;
  const labels = copy[locale];
  const localizedValue = (value: unknown) => {
    if (Array.isArray(value)) return value.join(", ");
    const text = String(value);
    return valueCopy[locale][text] ?? text;
  };

  return (
    <main lang={locale}>
      <h1>{labels.heading}</h1>
      <p>{labels.intro}</p>
      <form action={`/${locale}/models/compare`} method="get">
        <fieldset>
          <legend>{labels.form}</legend>
          <label>
            {labels.labels.task}
            <input
              name="task"
              defaultValue={parameters.task ?? "coding"}
              required
            />
          </label>
          <label>
            {labels.labels.benchmarkPublicId}
            <input
              name="benchmarkPublicId"
              defaultValue={parameters.benchmarkPublicId}
              required
            />
          </label>
          <label>
            {labels.labels.benchmarkVersion}
            <input
              name="benchmarkVersion"
              defaultValue={parameters.benchmarkVersion ?? "1.0"}
              required
            />
          </label>
          <label>
            {labels.labels.scoreUnit}
            <input
              name="scoreUnit"
              defaultValue={parameters.scoreUnit ?? "percent"}
              required
            />
          </label>
          <label>
            {labels.labels.qualityThreshold}
            <input
              name="qualityThreshold"
              inputMode="decimal"
              defaultValue={parameters.qualityThreshold}
              required
            />
          </label>
          <label>
            {labels.labels.qualityDirection}
            <select
              name="qualityDirection"
              defaultValue={parameters.qualityDirection ?? "at_least"}
            >
              <option value="at_least">{valueCopy[locale].at_least}</option>
              <option value="at_most">{valueCopy[locale].at_most}</option>
            </select>
          </label>
          <label>
            {labels.labels.priceCategory}
            <select
              name="priceCategory"
              defaultValue={parameters.priceCategory ?? "output_tokens"}
            >
              {[
                "input_tokens",
                "output_tokens",
                "cached_input_tokens",
                "cached_output_tokens",
                "batch_input_tokens",
                "batch_output_tokens",
                "image",
                "audio",
                "video",
              ].map((value) => (
                <option key={value} value={value}>
                  {localizedValue(value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {labels.labels.priceUnit}
            <select
              name="priceUnit"
              defaultValue={parameters.priceUnit ?? "per_million_tokens"}
            >
              {[
                "per_million_tokens",
                "per_image",
                "per_minute",
                "per_second",
              ].map((value) => (
                <option key={value} value={value}>
                  {localizedValue(value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {labels.labels.currency}
            <input
              name="currency"
              defaultValue={parameters.currency ?? "USD"}
              required
            />
          </label>
          <label>
            {labels.labels.region}
            <input
              name="region"
              defaultValue={parameters.region ?? "global"}
              required
            />
          </label>
          <label>
            {labels.labels.maximumUnitPrice}
            <input
              name="maximumUnitPrice"
              inputMode="decimal"
              defaultValue={parameters.maximumUnitPrice}
              required
            />
          </label>
          <label>
            {labels.labels.deployment}
            <select
              name="deployment"
              defaultValue={parameters.deployment ?? "hosted_api"}
            >
              <option value="hosted_api">{valueCopy[locale].hosted_api}</option>
              <option value="open_weights">
                {valueCopy[locale].open_weights}
              </option>
              <option value="self_hosted">
                {valueCopy[locale].self_hosted}
              </option>
            </select>
          </label>
          <label>
            {labels.labels.requireOpenWeights}
            <select
              name="requireOpenWeights"
              defaultValue={parameters.requireOpenWeights ?? "false"}
            >
              <option value="false">{valueCopy[locale].false}</option>
              <option value="true">{valueCopy[locale].true}</option>
            </select>
          </label>
          <label>
            {labels.labels.maximumLatencyMs}
            <input
              name="maximumLatencyMs"
              inputMode="numeric"
              defaultValue={parameters.maximumLatencyMs}
            />
          </label>
          <label>
            {labels.labels.latencyBenchmarkPublicId}
            <input
              name="latencyBenchmarkPublicId"
              defaultValue={parameters.latencyBenchmarkPublicId}
            />
          </label>
          <label>
            {labels.labels.latencyBenchmarkVersion}
            <input
              name="latencyBenchmarkVersion"
              defaultValue={parameters.latencyBenchmarkVersion}
            />
          </label>
          <label>
            {labels.labels.versions}
            <input name="versions" defaultValue={parameters.versions} />
          </label>
          <button type="submit">{labels.submit}</button>
        </fieldset>
      </form>

      {attempted && !parsed?.success ? <p>{labels.invalid}</p> : null}
      {result ? (
        <section>
          <h2>{labels.status[result.status]}</h2>
          <dl>
            {Object.entries(result.constraints).map(([key, value]) => (
              <div key={key}>
                <dt>{labels.labels[key as keyof typeof labels.labels]}</dt>
                <dd>{localizedValue(value)}</dd>
              </div>
            ))}
          </dl>
          {result.dataCutoff ? (
            <p>
              {labels.dataCutoff}:{" "}
              <time dateTime={result.dataCutoff}>{result.dataCutoff}</time>
            </p>
          ) : (
            <p>{labels.dataCutoff}: —</p>
          )}
          <ol>
            {result.candidates.map((candidate) => (
              <li key={candidate.versionPublicId}>
                <h3>
                  <Link
                    href={`/${locale}/models/${candidate.familyPublicId}/versions/${candidate.versionPublicId}`}
                  >
                    {candidate.familyName} {candidate.versionLabel}
                  </Link>
                </h3>
                <p>{candidate.familySummary}</p>
                <p>{labels.outcome[candidate.outcome]}</p>
                {candidate.rank ? (
                  <p>
                    {labels.rank}: {candidate.rank}
                  </p>
                ) : null}
                {candidate.priceEvidence ? (
                  <section>
                    <h4>{labels.priceDetails}</h4>
                    <p>
                      {labels.price}{" "}
                      {localizedValue(candidate.priceEvidence.category)}{" "}
                      {labels.priceSuffix}: {candidate.priceEvidence.amount}{" "}
                      {candidate.priceEvidence.currency} /{" "}
                      {localizedValue(candidate.priceEvidence.unit)} ·{" "}
                      <a href={candidate.priceEvidence.source.url}>
                        {candidate.priceEvidence.source.title}
                      </a>
                    </p>
                    <dl>
                      <div>
                        <dt>{labels.priceRegion}</dt>
                        <dd>{candidate.priceEvidence.region}</dd>
                      </div>
                      <div>
                        <dt>{labels.taxPolicy}</dt>
                        <dd>
                          {localizedValue(candidate.priceEvidence.taxPolicy)}
                        </dd>
                      </div>
                      <div>
                        <dt>{labels.validFrom}</dt>
                        <dd>
                          <time dateTime={candidate.priceEvidence.validFrom}>
                            {candidate.priceEvidence.validFrom}
                          </time>
                        </dd>
                      </div>
                      <div>
                        <dt>{labels.validTo}</dt>
                        <dd>
                          {candidate.priceEvidence.validTo ? (
                            <time dateTime={candidate.priceEvidence.validTo}>
                              {candidate.priceEvidence.validTo}
                            </time>
                          ) : (
                            labels.noExpiry
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>{labels.lastVerifiedAt}</dt>
                        <dd>
                          <time
                            dateTime={candidate.priceEvidence.lastVerifiedAt}
                          >
                            {candidate.priceEvidence.lastVerifiedAt}
                          </time>
                        </dd>
                      </div>
                    </dl>
                  </section>
                ) : null}
                {candidate.qualityEvidence ? (
                  <p>
                    {labels.quality}: {candidate.qualityEvidence.benchmark.name}{" "}
                    {candidate.qualityEvidence.score}{" "}
                    {candidate.qualityEvidence.unit} ·{" "}
                    <a href={candidate.qualityEvidence.evidence.url}>
                      {candidate.qualityEvidence.evidence.title}
                    </a>
                  </p>
                ) : null}
                {candidate.latencyEvidence ? (
                  <p>
                    {labels.latency}: {candidate.latencyEvidence.score}{" "}
                    {candidate.latencyEvidence.unit} ·{" "}
                    <a href={candidate.latencyEvidence.evidence.url}>
                      {candidate.latencyEvidence.evidence.title}
                    </a>
                  </p>
                ) : null}
                {candidate.fitReasons.length > 0 ? (
                  <section>
                    <h4>{labels.fit}</h4>
                    <ul>
                      {candidate.fitReasons.map((reason) => (
                        <li key={reason.code}>{reason.message}</li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                {candidate.nonFitReasons.length > 0 ? (
                  <section>
                    <h4>{labels.nonFit}</h4>
                    <ul>
                      {candidate.nonFitReasons.map((reason) => (
                        <li key={reason.code}>{reason.message}</li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </li>
            ))}
          </ol>
          <section>
            <h2>
              {labels.methodology} {result.methodology.version}
            </h2>
            <p>{result.methodology.question}</p>
            <h3>{labels.eligibility}</h3>
            <ul>
              {result.methodology.eligibility.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <h3>{labels.limitations}</h3>
            <ul>
              {result.methodology.limitations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        </section>
      ) : null}
    </main>
  );
}
