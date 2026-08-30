import Link from "next/link";
import { notFound } from "next/navigation";
import { skillPresentation } from "@/skills/presentation";
import { getPublicSkill } from "@/skills/service";

const copy = {
  en: {
    install: "Official installation instructions",
    permissions: "Permissions",
    dependencies: "Dependencies",
    externalApis: "External APIs",
    security: "Security review",
    rights: "Rights and license",
    versions: "Versions",
    supports: "Supports",
    apiKeys: "AI Radar never asks for or stores this Skill's API keys.",
    apiKeyRequired: "API key required",
    apiKeyNotRequired: "API key not required",
    author: "Version author",
    documentation: "Documentation",
    repository: "Repository",
    reviewed: "Reviewed",
    verified: "Last verified",
    source: "Version source",
    evidence: "Evidence",
  },
  zh: {
    install: "官方安装说明",
    permissions: "权限",
    dependencies: "依赖",
    externalApis: "外部 API",
    security: "安全审核",
    rights: "权利与许可",
    versions: "版本",
    supports: "支持",
    apiKeys: "AI Radar 不会索取或保存此 Skill 的 API Key。",
    apiKeyRequired: "需要 API Key",
    apiKeyNotRequired: "不需要 API Key",
    author: "版本作者",
    documentation: "文档",
    repository: "代码仓库",
    reviewed: "审核时间",
    verified: "最后核验",
    source: "版本来源",
    evidence: "证据",
  },
} as const;

export default async function SkillDetailPage({
  params,
}: {
  params: Promise<{ locale: string; publicId: string }>;
}) {
  const { locale, publicId } = await params;
  if (locale !== "en" && locale !== "zh") notFound();
  const skill = await getPublicSkill(publicId, locale);
  if (!skill) notFound();
  const text = copy[locale];
  const labels = skillPresentation[locale];
  return (
    <main>
      <p>
        <Link href={`/${locale}/skills`}>Skills</Link>
      </p>
      <h1>{skill.name}</h1>
      <p>{skill.summary}</p>
      <p>
        {skill.author.name} · {skill.task} ·{" "}
        {labels.rightsStatus[skill.rightsStatus]}
      </p>
      <p>{text.apiKeys}</p>
      <p>
        {text.verified}: <time>{skill.lastVerifiedAt}</time>
      </p>
      <p>
        <a
          href={skill.officialInstallationUrl}
          rel="noreferrer"
          target="_blank"
        >
          {text.install}
        </a>
      </p>
      <section>
        <h2>{text.rights}</h2>
        <a href={skill.source.url}>{skill.source.attribution}</a>
      </section>
      <section>
        <h2>{text.versions}</h2>
        {skill.versions.map((version) => (
          <article key={version.versionPublicId}>
            <h3>{version.version}</h3>
            <p>
              {version.supportedPlatforms.join(", ")} ·{" "}
              {labels.maintenanceStatus[version.maintenanceStatus]} ·{" "}
              {labels.installationMethod[version.installationMethod]}
            </p>
            <p>
              {text.author}: {version.author.name}
            </p>
            <p>
              {text.documentation}:{" "}
              {labels.rightsStatus[version.documentation.rightsStatus]} ·{" "}
              <a href={version.documentation.license.url}>
                {version.documentation.license.name}
              </a>
            </p>
            <p>
              {text.repository}:{" "}
              {labels.rightsStatus[version.repository.rightsStatus]} ·{" "}
              <a href={version.repository.license.url}>
                {version.repository.license.name}
              </a>
            </p>
            <h4>{text.permissions}</h4>
            <ul>
              {version.permissions.map((permission) => (
                <li key={permission.name}>
                  {permission.name}: {permission.reason}
                </li>
              ))}
            </ul>
            <h4>{text.dependencies}</h4>
            <ul>
              {version.dependencies.map((dependency) => (
                <li key={dependency.name}>
                  {dependency.name} {dependency.versionConstraint}
                </li>
              ))}
            </ul>
            <h4>{text.externalApis}</h4>
            <ul>
              {version.externalApis.map((api) => (
                <li key={api.name}>
                  {api.name}: {api.purpose} ·{" "}
                  {api.apiKeyRequired
                    ? text.apiKeyRequired
                    : text.apiKeyNotRequired}
                </li>
              ))}
            </ul>
            <h4>{text.security}</h4>
            <p>{labels.securityReviewStatus[version.securityReview.status]}</p>
            <ul>
              {version.securityReview.checksPerformed.map((check) => (
                <li key={check.id}>
                  {check.id}: {check.description}
                </li>
              ))}
            </ul>
            <p>
              {text.reviewed}: {version.securityReview.reviewedAt}
            </p>
            <p>{version.securityReview.limitation}</p>
            <p>
              {text.source}:{" "}
              <a href={version.source.url}>{version.source.attribution}</a>
            </p>
          </article>
        ))}
      </section>
      <section>
        <h2>{text.supports}</h2>
        <ul>
          {skill.relations.map((relation) => (
            <li key={relation.publicId}>
              <Link href={`/${locale}/products/${relation.target.publicId}`}>
                {relation.target.name}
              </Link>
              <span> · {text.evidence}: </span>
              {relation.evidence.map((evidence, index) => (
                <span key={evidence.sourceItemPublicId}>
                  {index > 0 ? ", " : null}
                  <a href={evidence.url}>{evidence.title}</a>
                </span>
              ))}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
