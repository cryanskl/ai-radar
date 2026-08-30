import Link from "next/link";
import { notFound } from "next/navigation";
import { localeSchema } from "@/events/contracts";
import { promptListRequestSchema } from "@/prompts/contracts";
import { listPublicPrompts } from "@/prompts/service";

const copy = {
  en: {
    heading: "Prompts",
    filters: "Prompt filters",
    task: "Task",
    model: "Model",
    tool: "Tool",
    rights: "Rights status",
    validation: "Validation",
    author: "Author",
    compatibility: "Verified compatibility",
    verified: "Last verified",
    apply: "Apply filters",
    empty: "No public Prompt records match these filters.",
    next: "Next page",
  },
  zh: {
    heading: "提示词",
    filters: "Prompt 筛选",
    task: "任务",
    model: "模型",
    tool: "工具",
    rights: "权利状态",
    validation: "验证状态",
    author: "作者",
    compatibility: "已核验兼容性",
    verified: "最后核验",
    apply: "应用筛选",
    empty: "没有符合筛选条件的公开 Prompt 记录。",
    next: "下一页",
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

const validationCopy = {
  en: { current: "Current", stale: "Stale", unvalidated: "Unvalidated" },
  zh: { current: "当前", stale: "已过期", unvalidated: "未验证" },
} as const;

export const dynamic = "force-dynamic";

export default async function PromptsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const locale = localeSchema.safeParse((await params).locale);
  if (!locale.success) notFound();
  const raw = await searchParams;
  const parsed = promptListRequestSchema.safeParse({
    ...Object.fromEntries(
      Object.entries(raw).filter(([, value]) => value !== ""),
    ),
    locale: locale.data,
  });
  if (!parsed.success) notFound();
  const result = await listPublicPrompts(parsed.data);
  if (result.status === "invalid_cursor") notFound();
  const prompts = result.response;
  const labels = copy[locale.data];
  return (
    <main lang={locale.data}>
      <h1>{labels.heading}</h1>
      <form method="get">
        <fieldset>
          <legend>{labels.filters}</legend>
          {(["task", "model", "tool"] as const).map((field) => (
            <label key={field}>
              {labels[field]}
              <input name={field} defaultValue={parsed.data[field]} />
            </label>
          ))}
          <label>
            {labels.rights}
            <select
              name="rightsStatus"
              defaultValue={parsed.data.rightsStatus ?? ""}
            >
              <option value="">—</option>
              {[
                "open",
                "attribution_required",
                "source_license",
                "metadata_only",
                "link_only",
              ].map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label>
            {labels.validation}
            <select
              name="validation"
              defaultValue={parsed.data.validation ?? ""}
            >
              <option value="">—</option>
              {(["current", "stale", "unvalidated"] as const).map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">{labels.apply}</button>
        </fieldset>
      </form>
      <p>{prompts.methodology.limitation}</p>
      {prompts.items.length === 0 ? <p>{labels.empty}</p> : null}
      <ol>
        {prompts.items.map((prompt) => (
          <li key={prompt.publicId}>
            <h2>
              <Link href={`/${locale.data}/prompts/${prompt.publicId}`}>
                {prompt.name}
              </Link>
            </h2>
            <p>{prompt.summary}</p>
            <dl>
              <dt>{labels.task}</dt>
              <dd>{prompt.task}</dd>
              <dt>{labels.author}</dt>
              <dd>{prompt.author.name}</dd>
              <dt>{labels.rights}</dt>
              <dd>{rightsCopy[locale.data][prompt.rightsStatus]}</dd>
              <dt>{labels.compatibility}</dt>
              <dd>
                {prompt.compatibilities
                  .map(
                    ({ currentValidation, target }) =>
                      `${target.name} ${target.version} (${validationCopy[locale.data][currentValidation.status]})`,
                  )
                  .join(", ")}
              </dd>
              <dt>{labels.verified}</dt>
              <dd>{prompt.lastVerifiedAt}</dd>
            </dl>
          </li>
        ))}
      </ol>
      {prompts.nextCursor ? (
        <Link
          href={`/${locale.data}/prompts?${new URLSearchParams({
            ...Object.fromEntries(
              Object.entries(raw).filter(
                ([key, value]) => key !== "cursor" && value,
              ) as Array<[string, string]>,
            ),
            cursor: prompts.nextCursor,
          }).toString()}`}
        >
          {labels.next}
        </Link>
      ) : null}
    </main>
  );
}
