import Link from "next/link";
import { notFound } from "next/navigation";
import { skillPresentation } from "@/skills/presentation";
import { listPublicSkills } from "@/skills/service";

const copy = {
  en: {
    title: "Skills",
    intro:
      "Discover versioned Skills by platform and permission. Review status covers only the checks listed for each version.",
    filter: "Filter Skills",
    platform: "Platform",
    permission: "Permission",
    task: "Task",
    installationMethod: "Installation method",
    license: "License",
    apply: "Apply filters",
    maintained: "Maintenance",
    security: "Security review",
    verified: "Last verified",
    empty: "No Skills match these filters.",
  },
  zh: {
    title: "Skills",
    intro: "按平台与权限发现版本化 Skill。审核状态仅覆盖每个版本列出的检查。",
    filter: "筛选 Skill",
    platform: "平台",
    permission: "权限",
    task: "任务",
    installationMethod: "安装方式",
    license: "许可证",
    apply: "应用筛选",
    maintained: "维护状态",
    security: "安全审核",
    verified: "最后核验",
    empty: "没有符合这些条件的 Skill。",
  },
} as const;

export default async function SkillsPage({
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
  const result = await listPublicSkills({
    locale,
    platform: value("platform"),
    permission: value("permission"),
    task: value("task"),
    installationMethod: value("installationMethod") as
      "manual" | "package_manager" | "marketplace" | "repository" | undefined,
    license: value("license"),
    rightsStatus: value("rightsStatus") as
      | "open"
      | "attribution_required"
      | "source_license"
      | "metadata_only"
      | "link_only"
      | undefined,
  });
  const text = copy[locale];
  const labels = skillPresentation[locale];
  return (
    <main>
      <h1>{text.title}</h1>
      <p>{text.intro}</p>
      <form method="get">
        <fieldset>
          <legend>{text.filter}</legend>
          <label>
            {text.platform}{" "}
            <input name="platform" defaultValue={value("platform")} />
          </label>
          <label>
            {text.permission}{" "}
            <input name="permission" defaultValue={value("permission")} />
          </label>
          <label>
            {text.task} <input name="task" defaultValue={value("task")} />
          </label>
          <label>
            {text.installationMethod}{" "}
            <select
              name="installationMethod"
              defaultValue={value("installationMethod") ?? ""}
            >
              <option value="">—</option>
              <option value="manual">{labels.installationMethod.manual}</option>
              <option value="package_manager">
                {labels.installationMethod.package_manager}
              </option>
              <option value="marketplace">
                {labels.installationMethod.marketplace}
              </option>
              <option value="repository">
                {labels.installationMethod.repository}
              </option>
            </select>
          </label>
          <label>
            {text.license}{" "}
            <input name="license" defaultValue={value("license")} />
          </label>
          <button type="submit">{text.apply}</button>
        </fieldset>
      </form>
      {result.items.length === 0 ? <p>{text.empty}</p> : null}
      {result.items.map((skill) => (
        <article key={skill.publicId}>
          <h2>
            <Link href={`/${locale}/skills/${skill.publicId}`}>
              {skill.name}
            </Link>
          </h2>
          <p>{skill.summary}</p>
          <p>
            {skill.currentVersion.version} ·{" "}
            {skill.currentVersion.supportedPlatforms.join(", ")} ·{" "}
            {labels.installationMethod[skill.currentVersion.installationMethod]}
          </p>
          <p>
            {text.maintained}:{" "}
            {labels.maintenanceStatus[skill.currentVersion.maintenanceStatus]} ·{" "}
            {text.security}:{" "}
            {
              labels.securityReviewStatus[
                skill.currentVersion.securityReview.status
              ]
            }
          </p>
          <p>{skill.currentVersion.securityReview.limitation}</p>
          <p>
            {text.verified}: <time>{skill.lastVerifiedAt}</time>
          </p>
        </article>
      ))}
    </main>
  );
}
