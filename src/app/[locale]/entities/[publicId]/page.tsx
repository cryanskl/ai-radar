import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { relationTypeSchema } from "@/entities/contracts";
import { getPublicEntity } from "@/entities/service";
import { localeSchema } from "@/events/contracts";
import { displayTimestamp } from "@/events/presentation";
import { getPublicTombstone } from "@/operations/service";

const copy = {
  en: {
    aliases: "Aliases",
    backlinks: "Backlinks",
    confidence: "confidence",
    evidence: "Evidence",
    filter: "Relation type",
    allRelations: "All",
    aliasKinds: {
      official: "official",
      localized: "localized",
      historical: "historical",
    },
    entityTypes: {
      model: "model",
      paper: "paper",
      product: "product",
      repository: "repository",
      prompt: "prompt",
      skill: "skill",
      guide: "guide",
      organization: "organization",
      person: "person",
      benchmark: "benchmark",
      topic: "topic",
    },
    graph: "One-hop graph",
    graphAria: (name: string) => `One-hop graph for ${name}`,
    graphLimited: "Graph limited to 20 nodes and 19 relations.",
    outgoing: "Outgoing relations",
    open: "open",
    active: "active",
    reviewed: "reviewed",
    unknownRelease: "release time unknown",
    timeline: "Event timeline",
    validity: "Validity",
    verified: "verified",
    versions: "Versions",
    corrections: "Corrections",
    correctionEvidence: "Evidence",
    replacementVersion: "Replacement version",
    merged: "Entity merged",
    mergedInto: "This stable Entity ID was merged into",
    withdrawn: "Entity withdrawn",
    reviewing: "Entity under review",
    reviewReason:
      "Public propagation is temporarily restricted during high-risk review.",
    withdrawalReason: "Rights withdrawal",
    caseReference: "Case reference",
    report: "Report / Suggest correction",
    tombstoneReasons: { duplicate_identity: "Duplicate identity" },
  },
  zh: {
    aliases: "别名",
    backlinks: "反向链接",
    confidence: "置信度",
    evidence: "证据",
    filter: "关系类型",
    allRelations: "全部",
    aliasKinds: {
      official: "正式名称",
      localized: "本地化名称",
      historical: "历史名称",
    },
    entityTypes: {
      model: "模型",
      paper: "论文",
      product: "产品",
      repository: "代码仓库",
      prompt: "提示词",
      skill: "技能",
      guide: "指南",
      organization: "组织",
      person: "人物",
      benchmark: "评测",
      topic: "主题",
    },
    graph: "一跳关系图",
    graphAria: (name: string) => `${name}的一跳关系图`,
    graphLimited: "关系图最多显示 20 个节点和 19 条关系。",
    outgoing: "出向关系",
    open: "开放",
    active: "活跃",
    reviewed: "已审核",
    unknownRelease: "发布时间未知",
    timeline: "事件时间线",
    validity: "有效期",
    verified: "最后核验",
    versions: "版本",
    corrections: "更正记录",
    correctionEvidence: "证据",
    replacementVersion: "替代版本",
    merged: "实体已合并",
    mergedInto: "此稳定实体 ID 已合并至",
    withdrawn: "实体已撤回",
    reviewing: "实体正在核验",
    reviewReason: "高风险核验期间已临时限制公开传播。",
    withdrawalReason: "权利撤回",
    caseReference: "案例编号",
    report: "报告问题 / 建议更正",
    tombstoneReasons: { duplicate_identity: "重复身份" },
  },
} as const;

type EntityPageParams = Promise<{ locale: string; publicId: string }>;
type EntityPageSearchParams = Promise<{ predicate?: string }>;

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: EntityPageParams;
}): Promise<Metadata> {
  const resolved = await params;
  const locale = localeSchema.safeParse(resolved.locale);
  if (!locale.success) return {};
  const entity = await getPublicEntity(resolved.publicId, locale.data);
  if (!entity) {
    const tombstone = await getPublicTombstone("entity", resolved.publicId);
    return tombstone ? { title: `${tombstone.publicId} | AI Radar` } : {};
  }
  return {
    title: `${entity.localization.name} | AI Radar`,
    description: entity.localization.summary,
    alternates: {
      canonical: `/${locale.data}/entities/${entity.publicId}`,
      languages: {
        en: `/en/entities/${entity.publicId}`,
        zh: `/zh/entities/${entity.publicId}`,
      },
    },
  };
}

const relationEndpointHref = (
  locale: "en" | "zh",
  endpoint: { type: "entity" | "event"; publicId: string },
) =>
  endpoint.type === "entity"
    ? `/${locale}/entities/${endpoint.publicId}`
    : `/${locale}/radar/events/${endpoint.publicId}`;

export default async function EntityPage({
  params,
  searchParams,
}: {
  params: EntityPageParams;
  searchParams: EntityPageSearchParams;
}) {
  const resolved = await params;
  const parsedLocale = localeSchema.safeParse(resolved.locale);
  if (!parsedLocale.success) notFound();
  const locale = parsedLocale.data;
  const requestedPredicate = (await searchParams).predicate;
  const predicate = requestedPredicate
    ? relationTypeSchema.safeParse(requestedPredicate)
    : undefined;
  if (predicate && !predicate.success) notFound();
  const entity = await getPublicEntity(
    resolved.publicId,
    locale,
    predicate?.data,
  );
  const labels = copy[locale];
  if (!entity) {
    const tombstone = await getPublicTombstone("entity", resolved.publicId);
    if (!tombstone) notFound();
    if (tombstone.status === "reviewing") {
      return (
        <main lang={locale}>
          <h1>{labels.reviewing}</h1>
          <p>{labels.reviewReason}</p>
          <p>
            {labels.caseReference}: {tombstone.caseReferencePublicId}
          </p>
          <time dateTime={tombstone.effectiveAt}>{tombstone.effectiveAt}</time>
        </main>
      );
    }
    if (tombstone.status === "withdrawn") {
      return (
        <main lang={locale}>
          <h1>{labels.withdrawn}</h1>
          <p>{labels.withdrawalReason}</p>
          <p>
            {labels.caseReference}: {tombstone.caseReferencePublicId}
          </p>
          <time dateTime={tombstone.effectiveAt}>{tombstone.effectiveAt}</time>
        </main>
      );
    }
    return (
      <main lang={locale}>
        <h1>{labels.merged}</h1>
        <p>
          {labels.mergedInto}{" "}
          <a href={`/${locale}/entities/${tombstone.targetEntityPublicId}`}>
            {tombstone.targetEntityPublicId}
          </a>
        </p>
        <p>{labels.tombstoneReasons.duplicate_identity}</p>
        <time dateTime={tombstone.effectiveAt}>{tombstone.effectiveAt}</time>
      </main>
    );
  }
  const graphNodePositions = new Map(
    entity.graph.nodes.map((node, index) => [
      node.nodeId,
      {
        x: index === 0 ? 160 : 440,
        y: index === 0 ? 50 : index * 50,
      },
    ]),
  );

  return (
    <main lang={locale}>
      <p>
        {labels.entityTypes[entity.type]} · {labels.active}
      </p>
      <h1>{entity.localization.name}</h1>
      <p>{entity.localization.summary}</p>
      <p>
        <a href={entity.officialUrl}>{entity.officialName}</a> ·{" "}
        {labels.verified}{" "}
        <time dateTime={entity.lastVerifiedAt}>{entity.lastVerifiedAt}</time>
      </p>
      <p>
        <a href="https://github.com/cryanskl/ai-radar/issues/new">
          {labels.report}
        </a>
      </p>

      {entity.corrections.length > 0 ? (
        <section>
          <h2>{labels.corrections}</h2>
          {entity.corrections.map((correction) => (
            <article key={correction.publicId}>
              <p>
                {correction.reasonCode} · {correction.publicId}
              </p>
              <time dateTime={correction.effectiveAt}>
                {correction.effectiveAt}
              </time>
              <ul>
                {correction.changes.map((change) => (
                  <li key={change.field}>{change.field}</li>
                ))}
              </ul>
              <p>
                {labels.replacementVersion}: {correction.replacementVersion}
              </p>
              {correction.evidence.length > 0 ? (
                <>
                  <p>{labels.correctionEvidence}</p>
                  <ul>
                    {correction.evidence.map((evidence) => (
                      <li key={evidence.sourceItemPublicId}>
                        <a href={evidence.originalUrl}>
                          {evidence.originalTitle}
                        </a>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </article>
          ))}
        </section>
      ) : null}

      <section>
        <h2>{labels.aliases}</h2>
        <ul>
          {entity.aliases.map((alias) => (
            <li key={alias.publicId}>
              {alias.value} · {alias.locale} · {labels.aliasKinds[alias.kind]}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{labels.versions}</h2>
        <ul>
          {entity.versions.map((version) => (
            <li key={version.publicId}>
              <strong>{version.versionLabel}</strong>
              {version.releasedAt && version.releasedAtPrecision
                ? ` · ${displayTimestamp(version.releasedAt, version.releasedAtPrecision)}`
                : ` · ${labels.unknownRelease}`}
              {` · ${version.publicId}`}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{labels.outgoing}</h2>
        <nav aria-label={labels.filter}>
          <Link href={`/${locale}/entities/${entity.publicId}`}>
            {labels.allRelations}
          </Link>{" "}
          {relationTypeSchema.options.map((relationType) => (
            <Link
              href={`/${locale}/entities/${entity.publicId}?predicate=${relationType}`}
              key={relationType}
            >
              {relationType}{" "}
            </Link>
          ))}
        </nav>
        {entity.outgoingRelations.map((relation) => (
          <article key={relation.publicId}>
            <p>
              {relation.predicate} ·{" "}
              <Link href={relationEndpointHref(locale, relation.object)}>
                {relation.object.name}
              </Link>
            </p>
            <p>
              {labels.confidence}: {relation.confidence} · {labels.reviewed}
            </p>
            <p>
              {labels.validity}: {relation.validFrom ?? labels.open} –{" "}
              {relation.validTo ?? labels.open}
            </p>
            <p>{labels.evidence}</p>
            <ul>
              {relation.evidence.map((evidence) => (
                <li key={evidence.sourceItemPublicId}>
                  <a href={evidence.originalUrl}>{evidence.originalTitle}</a>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <section>
        <h2>{labels.backlinks}</h2>
        {entity.backlinks.map((relation) => (
          <article key={relation.publicId}>
            <p>
              {relation.predicate} ·{" "}
              <Link href={relationEndpointHref(locale, relation.subject)}>
                {relation.subject.name}
              </Link>
            </p>
            <p>
              {labels.confidence}: {relation.confidence} · {labels.reviewed}
            </p>
            <p>
              {labels.validity}: {relation.validFrom ?? labels.open} –{" "}
              {relation.validTo ?? labels.open}
            </p>
            <p>{labels.evidence}</p>
            <ul>
              {relation.evidence.map((evidence) => (
                <li key={evidence.sourceItemPublicId}>
                  <a href={evidence.originalUrl}>{evidence.originalTitle}</a>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <section>
        <h2>{labels.timeline}</h2>
        <ol>
          {entity.timeline.map((item) => (
            <li key={item.relationPublicId}>
              <time dateTime={item.occurredAt}>
                {displayTimestamp(item.occurredAt, item.occurredAtPrecision)}
              </time>{" "}
              · {item.predicate} ·{" "}
              <Link href={`/${locale}/radar/events/${item.eventPublicId}`}>
                {item.title}
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2>{labels.graph}</h2>
        <svg
          aria-label={labels.graphAria(entity.localization.name)}
          height={Math.max(160, entity.graph.nodes.length * 56)}
          role="img"
          viewBox={`0 0 720 ${Math.max(160, entity.graph.nodes.length * 56)}`}
          width="100%"
        >
          <title>{labels.graphAria(entity.localization.name)}</title>
          <defs>
            <marker
              id="relation-arrow"
              markerHeight="8"
              markerWidth="8"
              orient="auto"
              refX="7"
              refY="4"
              viewBox="0 0 8 8"
            >
              <path d="M 0 0 L 8 4 L 0 8 z" fill="currentColor" />
            </marker>
          </defs>
          {entity.graph.edges.map((edge, index) => (
            <g key={edge.relationPublicId}>
              <line
                data-from-node-id={edge.fromNodeId}
                data-to-node-id={edge.toNodeId}
                markerEnd="url(#relation-arrow)"
                stroke="currentColor"
                x1={graphNodePositions.get(edge.fromNodeId)!.x}
                x2={graphNodePositions.get(edge.toNodeId)!.x}
                y1={graphNodePositions.get(edge.fromNodeId)!.y}
                y2={graphNodePositions.get(edge.toNodeId)!.y}
              />
              <text x="260" y={42 + index * 50}>
                {edge.predicate}
              </text>
            </g>
          ))}
          {entity.graph.nodes.map((node, index) => (
            <g key={node.nodeId}>
              <circle
                cx={index === 0 ? 160 : 440}
                cy={index === 0 ? 50 : index * 50}
                fill="white"
                r="8"
                stroke="currentColor"
              />
              <text
                x={index === 0 ? 20 : 460}
                y={index === 0 ? 55 : index * 50 + 5}
              >
                {node.label}
              </text>
            </g>
          ))}
        </svg>
        {entity.graph.truncated ? <p>{labels.graphLimited}</p> : null}
      </section>
    </main>
  );
}
