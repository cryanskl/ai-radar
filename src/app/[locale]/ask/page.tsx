import Link from "next/link";
import { notFound } from "next/navigation";
import { askRequestSchema } from "@/ask/contracts";
import { answerPublicQuestion } from "@/ask/service";
import { localeSchema } from "@/events/contracts";

const copy = {
  en: {
    heading: "Ask AI Radar",
    intro:
      "Ask a cited question over AI Radar's public dataset. No web search, private data, or tool execution is used.",
    question: "Question",
    placeholder: "What public evidence does AI Radar have about…?",
    submit: "Ask",
    search: "Search",
    ask: "Ask AI Radar",
    invalid: "The question must contain 1–200 characters.",
    status: "Status",
    reason: "Reason",
    generatedAt: "Generated",
    dataCutoff: "Data Cutoff",
    dataVersion: "Data Version",
    evidencePack: "Evidence pack",
    records: "records",
    claims: "Claims and citations",
    source: "Original source",
    statuses: {
      answered: "Answered",
      conflict: "Conflicting evidence",
      not_comparable: "Not comparable",
      abstained: "Abstained",
    },
  },
  zh: {
    heading: "问 AI Radar",
    intro:
      "基于 AI Radar 公开数据集提出带引用的问题；不会使用临时网页搜索、私有数据或工具执行。",
    question: "问题",
    placeholder: "AI Radar 有哪些公开证据可以说明……？",
    submit: "提问",
    search: "搜索",
    ask: "问 AI Radar",
    invalid: "问题长度必须为 1–200 个字符。",
    status: "状态",
    reason: "原因",
    generatedAt: "生成时间",
    dataCutoff: "数据截止时间",
    dataVersion: "数据版本",
    evidencePack: "证据包",
    records: "条记录",
    claims: "结论与引用",
    source: "原始来源",
    statuses: {
      answered: "已回答",
      conflict: "证据冲突",
      not_comparable: "不可比较",
      abstained: "拒绝回答",
    },
  },
} as const;

export const dynamic = "force-dynamic";

export default async function AskPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const parsedLocale = localeSchema.safeParse((await params).locale);
  if (!parsedLocale.success) notFound();
  const locale = parsedLocale.data;
  const labels = copy[locale];
  const parameters = await searchParams;
  const parsed = parameters.q
    ? askRequestSchema.safeParse({ question: parameters.q, locale })
    : null;
  const response = parsed?.success
    ? await answerPublicQuestion(parsed.data)
    : null;

  return (
    <main lang={locale}>
      <nav aria-label={locale === "en" ? "Query mode" : "查询模式"}>
        <Link href={`/${locale}/search`}>{labels.search}</Link>{" "}
        <span aria-current="page">{labels.ask}</span>
      </nav>
      <h1>{labels.heading}</h1>
      <p>{labels.intro}</p>
      <form action={`/${locale}/ask`} method="get">
        <label>
          {labels.question}
          <input
            name="q"
            defaultValue={parameters.q ?? ""}
            placeholder={labels.placeholder}
            maxLength={200}
            required
          />
        </label>
        <button type="submit">{labels.submit}</button>
      </form>

      {parsed && !parsed.success ? <p>{labels.invalid}</p> : null}
      {response ? (
        <article>
          <h2>{labels.status}</h2>
          <p>{labels.statuses[response.status]}</p>
          <p>{response.answer}</p>
          <dl>
            <dt>{labels.reason}</dt>
            <dd>{response.reason}</dd>
            <dt>{labels.generatedAt}</dt>
            <dd>{response.generatedAt}</dd>
            <dt>{labels.dataCutoff}</dt>
            <dd>{response.dataCutoff}</dd>
            <dt>{labels.dataVersion}</dt>
            <dd>{response.dataVersion}</dd>
            <dt>{labels.evidencePack}</dt>
            <dd>
              {response.evidencePack.count}/{response.evidencePack.limit}{" "}
              {labels.records}
            </dd>
          </dl>
          {response.claims.length > 0 ? (
            <section>
              <h2>{labels.claims}</h2>
              <ol>
                {response.claims.map((claim) => (
                  <li key={claim.publicId}>
                    <p>{claim.text}</p>
                    <ul>
                      {claim.citations.map((citation) => (
                        <li key={citation.citationId}>
                          <Link href={citation.recordUrl}>
                            {citation.title}
                          </Link>{" "}
                          · {citation.lastVerifiedAt}
                          {citation.source ? (
                            <>
                              {" "}
                              · {labels.source}:{" "}
                              <a href={citation.source.url}>
                                {citation.source.title}
                              </a>
                            </>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </article>
      ) : null}
    </main>
  );
}
