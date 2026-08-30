import Link from "next/link";
import { notFound } from "next/navigation";
import { localeSchema } from "@/events/contracts";
import { getPublicPrompt } from "@/prompts/service";

const copy = {
  en: {
    author: "Author",
    provenance: "Provenance",
    rights: "Rights status",
    license: "License",
    purpose: "Purpose",
    variables: "Variables",
    input: "Input example",
    output: "Expected output example",
    limitations: "Known limitations",
    fullText: "Full Prompt text",
    withheld: "Prompt text is not licensed for redistribution",
    compatibility: "Verified compatibility",
    current: "Current",
    stale: "Stale",
    unvalidated: "Unvalidated",
    source: "Original source",
    attribution: "Required attribution",
    relations: "Evidenced relations",
    verified: "Last verified",
  },
  zh: {
    author: "作者",
    provenance: "来源类型",
    rights: "权利状态",
    license: "许可",
    purpose: "使用目标",
    variables: "变量",
    input: "输入示例",
    output: "预期输出示例",
    limitations: "已知限制",
    fullText: "Prompt 全文",
    withheld: "正文未获再分发授权",
    compatibility: "已核验兼容性",
    current: "当前",
    stale: "已过期",
    unvalidated: "未验证",
    source: "原始来源",
    attribution: "署名要求",
    relations: "有证据的关系",
    verified: "最后核验",
  },
} as const;

const rightsCopy = {
  en: {
    open: "Open",
    attribution_required: "Attribution required",
    source_license: "Source license",
    metadata_only: "Metadata only",
    link_only: "Original link only",
  },
  zh: {
    open: "开放",
    attribution_required: "需要署名",
    source_license: "遵循来源许可",
    metadata_only: "仅元数据",
    link_only: "仅原链接",
  },
} as const;

export const dynamic = "force-dynamic";

export default async function PromptPage({
  params,
}: {
  params: Promise<{ locale: string; publicId: string }>;
}) {
  const resolved = await params;
  const locale = localeSchema.safeParse(resolved.locale);
  if (!locale.success) notFound();
  const prompt = await getPublicPrompt(resolved.publicId, locale.data);
  if (!prompt) notFound();
  const labels = copy[locale.data];
  return (
    <main lang={locale.data}>
      <h1>{prompt.name}</h1>
      <p>{prompt.summary}</p>
      <dl>
        <dt>{labels.author}</dt>
        <dd>
          {prompt.author.url ? (
            <a href={prompt.author.url}>{prompt.author.name}</a>
          ) : (
            prompt.author.name
          )}
        </dd>
        <dt>{labels.provenance}</dt>
        <dd>{prompt.provenance}</dd>
        <dt>{labels.rights}</dt>
        <dd>{rightsCopy[locale.data][prompt.rightsStatus]}</dd>
        <dt>{labels.license}</dt>
        <dd>
          {prompt.license ? (
            <a href={prompt.license.url}>{prompt.license.name}</a>
          ) : (
            "—"
          )}
        </dd>
        <dt>{labels.purpose}</dt>
        <dd>{prompt.purpose}</dd>
        <dt>{labels.input}</dt>
        <dd>{prompt.inputExample}</dd>
        <dt>{labels.output}</dt>
        <dd>{prompt.expectedOutputExample}</dd>
      </dl>
      <h2>{labels.variables}</h2>
      {prompt.variables.length === 0 ? <p>—</p> : null}
      <ul>
        {prompt.variables.map((variable) => (
          <li key={variable.name}>
            {variable.name} — {variable.description}
          </li>
        ))}
      </ul>
      <h2>{labels.fullText}</h2>
      {prompt.fullText ? (
        <pre>{prompt.fullText}</pre>
      ) : (
        <p>{labels.withheld}</p>
      )}
      <h2>{labels.compatibility}</h2>
      <ul>
        {prompt.compatibilities.map((compatibility) => (
          <li key={compatibility.publicId}>
            <Link
              href={`/${locale.data}/entities/${compatibility.target.publicId}`}
            >
              {compatibility.target.name}
            </Link>{" "}
            {compatibility.target.version} ·{" "}
            {labels[compatibility.currentValidation.status]}
            {compatibility.currentValidation.staleReason
              ? ` — ${compatibility.currentValidation.staleReason}`
              : null}
          </li>
        ))}
      </ul>
      <h2>{labels.limitations}</h2>
      <ul>
        {prompt.knownLimitations.map((limitation) => (
          <li key={limitation}>{limitation}</li>
        ))}
      </ul>
      <h2>{labels.relations}</h2>
      <ul>
        {prompt.relations.map((relation) => (
          <li key={relation.publicId}>
            <Link href={`/${locale.data}/entities/${relation.target.publicId}`}>
              {relation.target.name}
            </Link>{" "}
            · {relation.predicate}
          </li>
        ))}
      </ul>
      <p>
        <a href={prompt.originalSource.url}>{labels.source}</a>
      </p>
      <p>
        {labels.attribution}: {prompt.originalSource.attribution}
      </p>
      <p>
        {labels.verified}: {prompt.lastVerifiedAt}
      </p>
    </main>
  );
}
