import Link from "next/link";
import { notFound } from "next/navigation";
import { guideListRequestSchema } from "@/guides/contracts";
import { guidePresentation } from "@/guides/presentation";
import { listPublicGuides } from "@/guides/service";

const copy = {
  en: {
    title: "Guides",
    intro:
      "Repeatable AI workflows with explicit provenance, review dates and freshness.",
    category: "Category",
    provenance: "Provenance",
    status: "Freshness",
    apply: "Apply filters",
    reviewed: "Last reviewed",
    empty: "No current Guides match these filters.",
  },
  zh: {
    title: "技巧指南",
    intro: "可重复的 AI 工作流，并明确显示来源、审核时间与新鲜度。",
    category: "分类",
    provenance: "来源类型",
    status: "新鲜度",
    apply: "应用筛选",
    reviewed: "最后审核",
    empty: "没有符合这些条件的当前指南。",
  },
} as const;

export default async function GuidesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  if (locale !== "en" && locale !== "zh") notFound();
  const query = await searchParams;
  const value = (name: string) => {
    const candidate = query[name];
    return typeof candidate === "string" ? candidate : undefined;
  };
  const filters = guideListRequestSchema.safeParse({
    locale,
    category: query.category,
    provenance: query.provenance,
    status: query.status,
  });
  if (!filters.success) notFound();
  const result = await listPublicGuides(filters.data);
  const text = copy[locale];
  const labels = guidePresentation[locale];
  return (
    <main>
      <h1>{text.title}</h1>
      <p>{text.intro}</p>
      <form method="get">
        <label>
          {text.category}{" "}
          <input name="category" defaultValue={value("category")} />
        </label>
        <label>
          {text.provenance}{" "}
          <select name="provenance" defaultValue={value("provenance") ?? ""}>
            <option value="">—</option>
            <option value="ai_radar_original">
              {labels.provenance.ai_radar_original}
            </option>
            <option value="authorized_submission">
              {labels.provenance.authorized_submission}
            </option>
            <option value="external_guidance">
              {labels.provenance.external_guidance}
            </option>
          </select>
        </label>
        <label>
          {text.status}{" "}
          <select name="status" defaultValue={value("status") ?? "current"}>
            <option value="current">{labels.status.current}</option>
            <option value="stale">{labels.status.stale}</option>
          </select>
        </label>
        <button type="submit">{text.apply}</button>
      </form>
      {result.items.length === 0 ? <p>{text.empty}</p> : null}
      {result.items.map((guide) => (
        <article key={guide.publicId}>
          <h2>
            <Link href={`/${locale}/guides/${guide.publicId}`}>
              {guide.name}
            </Link>
          </h2>
          <p>{guide.summary}</p>
          <p>
            {guide.author.name} · {labels.provenance[guide.provenance]} ·{" "}
            {guide.version} · {labels.status[guide.currentStatus.status]}
          </p>
          <p>
            {text.reviewed}: <time>{guide.reviewedAt}</time>
          </p>
        </article>
      ))}
    </main>
  );
}
