import Link from "next/link";
import { notFound } from "next/navigation";
import { localeSchema } from "@/events/contracts";
import { listPublicDataReleases } from "@/data-releases/service";

const policies = {
  en: [
    [
      "Editorial Policy",
      "Published facts require reviewed public evidence; editorial selection never changes ranking scores.",
    ],
    [
      "Source Policy",
      "Sources are tiered by provenance value. Every exported record keeps record-level Rights and attribution.",
    ],
    [
      "Translation Policy",
      "English and Chinese localizations disclose authorship and must be reviewed before publication.",
    ],
    [
      "Deduplication Policy",
      "One Event represents one underlying change. Merges preserve Tombstones and correction history.",
    ],
    [
      "Ranking Methodology",
      "Rankings disclose their question, eligibility, measurement window, evidence, confidence and limitations.",
    ],
    [
      "AI-generated Content Policy",
      "AI may assist translation and synthesis, but public claims remain bounded by reviewed evidence.",
    ],
    [
      "Dataset License",
      "AI Radar original database expression is released under CC BY 4.0; source-specific Rights and licenses remain controlling.",
    ],
    [
      "Commercial Disclosure",
      "Sponsorship, affiliate and owner relationships are disclosed and cannot buy ranking or Featured placement.",
    ],
    [
      "Corrections",
      "Corrections are append-only public records and ship with every Data Release at or before its cutoff.",
    ],
    [
      "Takedown",
      "Rights and privacy requests can hide unsafe expression while retaining a minimal public Tombstone and audit history.",
    ],
    [
      "Coverage",
      "Public Alpha Data Releases currently cover bilingual Events, Corrections and Tombstones with complete release-grade provenance.",
    ],
    [
      "Known Limitations",
      "Entity and domain profile exports remain API-only until they carry the same release-grade provenance guarantees.",
    ],
    [
      "Service and Data Status",
      "Service health and the current API data version are published separately from immutable Data Release versions.",
    ],
  ],
  zh: [
    ["编辑政策", "公开事实必须有已审查的公开证据；编辑精选不会改变排名分数。"],
    ["来源政策", "来源按溯源价值分级；每条导出记录保留记录级权利状态与署名。"],
    ["翻译政策", "中英文内容披露创作方式，并在公开前完成审查。"],
    [
      "去重政策",
      "一个 Event 对应一个真实变化；合并后保留 Tombstone 与更正历史。",
    ],
    ["排名方法", "榜单公开问题、入选条件、统计窗口、证据、置信度与限制。"],
    ["AI 内容政策", "AI 可以辅助翻译与整理，但公开结论必须受已审查证据约束。"],
    [
      "数据许可",
      "AI Radar 原创数据库表达采用 CC BY 4.0；来源记录自己的权利与许可优先适用。",
    ],
    [
      "商业关系披露",
      "赞助、联盟与 Owner 利益关系必须披露，不能购买排名或精选位置。",
    ],
    ["更正记录", "更正是追加式公开记录，并进入截止时间之前的每个数据发行版。"],
    [
      "下架流程",
      "权利与隐私请求可以隐藏不安全表达，同时保留最小 Tombstone 与审计历史。",
    ],
    [
      "覆盖范围",
      "Public Alpha 数据发行版当前覆盖具有完整发行级溯源的双语 Event、更正与 Tombstone。",
    ],
    [
      "已知限制",
      "Entity 与各内容域 Profile 在具备同等级发行溯源保证前，仅通过公开 API 提供。",
    ],
    [
      "服务与数据状态",
      "服务健康与当前 API 数据版本独立于不可变的数据发行版本公开。",
    ],
  ],
} as const;

export default async function TrustCenterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const parsed = localeSchema.safeParse((await params).locale);
  if (!parsed.success) notFound();
  const locale = parsed.data;
  const releases = await listPublicDataReleases({ limit: 20 });

  return (
    <main>
      <header>
        <Link href={`/${locale}`}>
          {locale === "en" ? "AI Radar home" : "AI Radar 首页"}
        </Link>
        <h1>{locale === "en" ? "Trust Center" : "信任中心"}</h1>
        <p>
          {locale === "en"
            ? "How AI Radar sources, reviews, translates, ranks, corrects and releases public data."
            : "AI Radar 如何获取、审查、翻译、排名、更正并发行公开数据。"}
        </p>
      </header>

      <section aria-labelledby="policies-heading">
        <h2 id="policies-heading">
          {locale === "en" ? "Public policies" : "公开政策"}
        </h2>
        {policies[locale].map(([title, description]) => (
          <article key={title}>
            <h2>{title}</h2>
            <p>{description}</p>
          </article>
        ))}
      </section>

      <section aria-labelledby="releases-heading">
        <h2 id="releases-heading">
          {locale === "en" ? "Open Data Releases" : "开放数据发行版"}
        </h2>
        {releases.items.length === 0 ? (
          <p>
            {locale === "en"
              ? "No Data Release has been published yet."
              : "尚未发布数据发行版。"}
          </p>
        ) : (
          releases.items.map((release) => (
            <article key={release.publicId}>
              <h3>{release.publicId}</h3>
              <p>
                {release.dataVersion} · {release.schemaVersion}
              </p>
              <p>
                SHA-256: <code>{release.checksumSha256}</code>
              </p>
              <a href={release.canonicalUrl}>
                {locale === "en"
                  ? "Canonical GitHub Release"
                  : "规范 GitHub Release"}
              </a>
              <ul>
                {release.files.map((file) => (
                  <li key={file.name}>
                    <a href={file.downloadUrl}>{file.name}</a>{" "}
                    <code>{file.checksumSha256}</code>
                  </li>
                ))}
              </ul>
              {release.mirror ? (
                <p>
                  {locale === "en"
                    ? "Checksum-verified domestic mirror"
                    : "已通过校验和验证的国内镜像"}
                  : <a href={release.mirror.url}>{release.mirror.provider}</a>
                </p>
              ) : (
                <p>
                  {locale === "en"
                    ? "Domestic mirror pending verification."
                    : "国内镜像等待校验。"}
                </p>
              )}
            </article>
          ))
        )}
      </section>

      <p>
        <Link href={`/${locale}/status`}>
          {locale === "en" ? "View service status" : "查看服务状态"}
        </Link>
      </p>
    </main>
  );
}
