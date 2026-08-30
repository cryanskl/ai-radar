import Link from "next/link";
import { notFound } from "next/navigation";
import { rankingDetailRequestSchema } from "@/rankings/contracts";
import { getPublicRanking } from "@/rankings/service";

const copy = {
  en: {
    back: "Rankings",
    question: "Question",
    eligibility: "Eligibility",
    window: "Method",
    limitations: "Limitations",
    cutoff: "Data Cutoff",
    observations: "Observations",
    rank: "Rank",
    score: "Score",
    confidence: "Confidence",
    benchmarkRun: "Benchmark Run",
    evaluator: "Evaluator",
    settings: "Settings",
    provenance: "Provenance",
    reproducibility: "Reproducibility",
    verified: "Last Verified",
    priceRecord: "Price Record",
    validity: "Validity",
    taxPolicy: "Tax Policy",
    costBasis: "Cost Basis",
    exchangeRate: "Exchange Rate",
    selfDeployment: "Self-deployment Assumptions",
    notApplicable: "Not applicable",
    evidence: "Evidence",
    insufficient: "Insufficient Evidence",
  },
  zh: {
    back: "榜单",
    question: "问题",
    eligibility: "资格",
    window: "方法",
    limitations: "限制",
    cutoff: "数据截止时间",
    observations: "观察记录",
    rank: "名次",
    score: "分数",
    confidence: "置信度",
    benchmarkRun: "评测记录",
    evaluator: "评测方",
    settings: "评测设置",
    provenance: "来源分层",
    reproducibility: "可复现性",
    verified: "最近核验",
    priceRecord: "价格记录",
    validity: "有效期",
    taxPolicy: "税费政策",
    costBasis: "成本口径",
    exchangeRate: "汇率处理",
    selfDeployment: "自部署假设",
    notApplicable: "不适用",
    evidence: "证据",
    insufficient: "证据不足",
  },
} as const;

export default async function RankingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; publicId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, publicId } = await params;
  if (locale !== "en" && locale !== "zh") notFound();
  const query = await searchParams;
  const parsed = rankingDetailRequestSchema.safeParse({
    locale,
    methodologyVersion: query.methodologyVersion,
  });
  if (!parsed.success) notFound();
  const ranking = await getPublicRanking(publicId, parsed.data);
  if (!ranking) notFound();
  const text = copy[locale];
  return (
    <main>
      <p>
        <Link href={`/${locale}/rankings`}>{text.back}</Link>
      </p>
      <h1>{ranking.definition.title}</h1>
      <p>
        {ranking.definition.kind} · {ranking.definition.targetType} · v
        {ranking.definition.methodologyVersion}
      </p>
      <p>
        {text.question}: {ranking.definition.question}
      </p>
      <p>
        {text.eligibility}: {ranking.definition.eligibilitySummary}
      </p>
      <p>
        {text.window}: {JSON.stringify(ranking.definition.method)}
      </p>
      <p>
        {text.cutoff}: {ranking.definition.dataCutoff ?? text.insufficient}
      </p>
      <section>
        <h2>{text.limitations}</h2>
        <ul>
          {ranking.definition.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
      </section>
      <section>
        <h2>{text.observations}</h2>
        {ranking.observations.length === 0 ? <p>{text.insufficient}</p> : null}
        {ranking.observations.map((observation) => (
          <article key={observation.publicId}>
            <h3>
              {observation.target.name}
              {observation.target.versionLabel
                ? ` · ${observation.target.versionLabel}`
                : null}
            </h3>
            <p>
              {text.rank}: {observation.rank ?? text.insufficient} ·{" "}
              {text.score}: {observation.score ?? text.insufficient} ·{" "}
              {text.confidence}: {observation.confidence}
            </p>
            <p>
              {text.cutoff}: {observation.dataCutoff}
            </p>
            {observation.comparison ? (
              <section>
                <p>
                  {text.benchmarkRun}:{" "}
                  {observation.comparison.benchmarkRunPublicId}
                  {" · "}
                  {observation.comparison.benchmarkRun.runAt}
                </p>
                <p>
                  {text.evaluator}:{" "}
                  {observation.comparison.benchmarkRun.evaluator.name}
                  {" · "}
                  {text.provenance}:{" "}
                  {observation.comparison.benchmarkRun.provenance}
                  {" · "}
                  {text.reproducibility}:{" "}
                  {observation.comparison.benchmarkRun.reproducibility}
                </p>
                <p>
                  {text.settings}:{" "}
                  {JSON.stringify(observation.comparison.benchmarkRun.settings)}
                  {" · "}
                  {text.verified}:{" "}
                  {observation.comparison.benchmarkRun.lastVerifiedAt}
                </p>
                {observation.comparison.priceRecord ? (
                  <>
                    <p>
                      {text.priceRecord}:{" "}
                      {observation.comparison.priceRecordPublicId}
                      {" · "}
                      {observation.comparison.priceRecord.amount}{" "}
                      {observation.comparison.priceRecord.currency} /{" "}
                      {observation.comparison.priceRecord.unit}
                      {" · "}
                      {observation.comparison.priceRecord.region}
                    </p>
                    <p>
                      {text.validity}:{" "}
                      {observation.comparison.priceRecord.validFrom}
                      {" — "}
                      {observation.comparison.priceRecord.validTo ?? "∞"}
                      {" · "}
                      {text.taxPolicy}:{" "}
                      {observation.comparison.priceRecord.taxPolicy}
                    </p>
                    <p>
                      {text.costBasis}:{" "}
                      {observation.comparison.priceRecord.costBasis}
                      {" · "}
                      {text.exchangeRate}:{" "}
                      {observation.comparison.priceRecord.exchangeRatePolicy}
                      {" · "}
                      {text.selfDeployment}:{" "}
                      {observation.comparison.priceRecord
                        .selfDeploymentAssumptions ?? text.notApplicable}
                    </p>
                  </>
                ) : null}
              </section>
            ) : null}
            <p>
              {text.evidence}:{" "}
              {observation.evidence.map((evidence, index) => (
                <span key={evidence.sourceItemPublicId}>
                  {index > 0 ? ", " : null}
                  <a href={evidence.url}>{evidence.title}</a>
                </span>
              ))}
            </p>
          </article>
        ))}
      </section>
    </main>
  );
}
