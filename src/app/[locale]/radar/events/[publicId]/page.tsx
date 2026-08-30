import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { localeSchema } from "@/events/contracts";
import {
  authorshipLabels,
  displayTimestamp,
  reviewLabels,
  rightsLabels,
} from "@/events/presentation";
import { getPublicEvent } from "@/events/service";
import { getPublicTombstone } from "@/operations/service";

const copy = {
  en: {
    occurred: "Occurred",
    discovered: "Discovered",
    verified: "Last verified",
    rights: "Rights",
    localization: "Localization",
    sources: "Sources",
    sourcePublished: "Source published",
    sourceTier: "Source tier",
    sourceRights: "Source rights",
    attribution: "Attribution",
    license: "License",
    entities: "Related entities",
    merged: "Event merged",
    withdrawn: "Event withdrawn",
    sourceWithdrawn: "Event sources withdrawn",
    sourceWithdrawalReason:
      "No public Source Item remains for this stable Event ID.",
    reviewing: "Event under review",
    reviewReason:
      "Public propagation is temporarily restricted during high-risk review.",
    mergedInto: "This stable Event ID was merged into",
    withdrawalReason: "Rights withdrawal",
    caseReference: "Case reference",
    corrections: "Corrections",
    rightsDecisions: "Rights decisions",
    correctionEvidence: "Evidence",
    replacementVersion: "Replacement version",
    rightsDecisionReasons: {
      source_withdrawal: "Source withdrawal",
      rights_withdrawal: "Rights withdrawal",
    },
    report: "Report / Suggest correction",
    representative: "Representative source",
    sourceCount: (count: number) =>
      `${count} independent ${count === 1 ? "source" : "sources"}`,
    sourceStatus: {
      active: "Sources active",
      source_withdrawn: "Source withdrawn",
    },
    evidenceConfidence: {
      high: "High confidence",
      medium: "Medium confidence",
      low: "Low confidence",
    },
    tombstoneReasons: { duplicate_coverage: "Duplicate coverage" },
  },
  zh: {
    occurred: "发生时间",
    discovered: "本站发现时间",
    verified: "最后核验时间",
    rights: "权利",
    localization: "本地化",
    sources: "来源",
    sourcePublished: "来源发布时间",
    sourceTier: "来源等级",
    sourceRights: "来源权利",
    attribution: "署名",
    license: "许可",
    entities: "关联实体",
    merged: "事件已合并",
    withdrawn: "事件已撤回",
    sourceWithdrawn: "事件来源已撤回",
    sourceWithdrawalReason: "此稳定事件 ID 已没有可公开的来源记录。",
    reviewing: "事件正在核验",
    reviewReason: "高风险核验期间已临时限制公开传播。",
    mergedInto: "此稳定事件 ID 已合并至",
    withdrawalReason: "权利撤回",
    caseReference: "案例编号",
    corrections: "更正记录",
    rightsDecisions: "权利决定",
    correctionEvidence: "证据",
    replacementVersion: "替代版本",
    rightsDecisionReasons: {
      source_withdrawal: "来源撤回",
      rights_withdrawal: "权利撤回",
    },
    report: "报告问题 / 建议更正",
    representative: "代表来源",
    sourceCount: (count: number) => `${count} 个独立来源`,
    sourceStatus: { active: "来源有效", source_withdrawn: "来源已撤回" },
    evidenceConfidence: {
      high: "高置信度",
      medium: "中置信度",
      low: "低置信度",
    },
    tombstoneReasons: { duplicate_coverage: "重复报道" },
  },
} as const;

type EventPageParams = Promise<{ locale: string; publicId: string }>;

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: EventPageParams;
}): Promise<Metadata> {
  const resolved = await params;
  const parsedLocale = localeSchema.safeParse(resolved.locale);
  if (!parsedLocale.success) return {};
  const event = await getPublicEvent(resolved.publicId, parsedLocale.data);
  if (!event) {
    const tombstone = await getPublicTombstone("event", resolved.publicId);
    if (!tombstone) return {};
    return { title: `${tombstone.publicId} | AI Radar` };
  }

  return {
    title: `${event.localization.title} | AI Radar`,
    description: event.localization.summary,
    alternates: {
      canonical: `/${parsedLocale.data}/radar/events/${event.publicId}`,
      languages: {
        en: `/en/radar/events/${event.publicId}`,
        zh: `/zh/radar/events/${event.publicId}`,
      },
    },
  };
}

export default async function EventDetailPage({
  params,
}: {
  params: EventPageParams;
}) {
  const resolved = await params;
  const parsedLocale = localeSchema.safeParse(resolved.locale);
  if (!parsedLocale.success) notFound();
  const locale = parsedLocale.data;
  const event = await getPublicEvent(resolved.publicId, locale);
  const labels = copy[locale];
  if (!event) {
    const tombstone = await getPublicTombstone("event", resolved.publicId);
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
    if (tombstone.status === "source_withdrawn") {
      return (
        <main lang={locale}>
          <h1>{labels.sourceWithdrawn}</h1>
          <p>{labels.sourceWithdrawalReason}</p>
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
          <a href={`/${locale}/radar/events/${tombstone.targetEventPublicId}`}>
            {tombstone.targetEventPublicId}
          </a>
        </p>
        <p>
          {tombstone.reasonCode === "duplicate_coverage"
            ? labels.tombstoneReasons.duplicate_coverage
            : tombstone.reasonCode}
        </p>
        <time dateTime={tombstone.mergedAt}>{tombstone.mergedAt}</time>
      </main>
    );
  }
  const separator = locale === "zh" ? "：" : ": ";

  return (
    <main lang={locale}>
      <p>
        {event.eventType} · {event.factStatus} ·{" "}
        {labels.sourceStatus[event.sourceStatus]} ·{" "}
        {labels.evidenceConfidence[event.evidenceConfidence]}
      </p>
      <h1>{event.localization.title}</h1>
      <p>{event.localization.summary}</p>
      <section aria-label="Verification metadata">
        <p>
          {labels.occurred}
          {separator}
          <time dateTime={event.occurredAt}>
            {displayTimestamp(event.occurredAt, event.occurredAtPrecision)}
          </time>
        </p>
        <p>
          {labels.discovered}
          {separator}
          <time dateTime={event.discoveredAt}>{event.discoveredAt}</time>
        </p>
        <p>
          {labels.verified}
          {separator}
          <time dateTime={event.lastVerifiedAt}>{event.lastVerifiedAt}</time>
        </p>
        <p>
          {labels.rights}
          {separator}
          {rightsLabels[locale][event.rightsStatus]}
        </p>
        <p>
          {labels.localization}
          {separator}
          {authorshipLabels[locale][event.localization.authorship]} ·{" "}
          {reviewLabels[locale][event.localization.reviewStatus]}
        </p>
      </section>
      <p>
        <a href="https://github.com/cryanskl/ai-radar/issues/new">
          {labels.report}
        </a>
      </p>
      {event.corrections.length > 0 ? (
        <section>
          <h2>{labels.corrections}</h2>
          {event.corrections.map((correction) => (
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
      {event.rightsDecisions.length > 0 ? (
        <section>
          <h2>{labels.rightsDecisions}</h2>
          {event.rightsDecisions.map((decision) => (
            <article key={decision.publicId}>
              <p>
                {labels.rightsDecisionReasons[decision.reasonCode]} ·{" "}
                {decision.targetPublicId}
              </p>
              <time dateTime={decision.effectiveAt}>
                {decision.effectiveAt}
              </time>
            </article>
          ))}
        </section>
      ) : null}
      {event.entities.length > 0 ? (
        <section>
          <h2>{labels.entities}</h2>
          <ul>
            {event.entities.map((entity) => (
              <li key={entity.relationPublicId}>
                {entity.predicate} ·{" "}
                <a href={`/${locale}/entities/${entity.publicId}`}>
                  {entity.name}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section>
        <h2>{labels.sources}</h2>
        <p>
          {labels.sourceCount(
            new Set(event.sources.map(({ publicId }) => publicId)).size,
          )}
        </p>
        {event.sources.map((source) => (
          <article key={source.sourceItemPublicId}>
            <h3>{source.name}</h3>
            {source.isPrimary ? <p>{labels.representative}</p> : null}
            <p>
              {labels.sourceTier}
              {separator}
              {source.tier}
            </p>
            <p>
              {labels.sourcePublished}
              {separator}
              <time dateTime={source.publishedAt}>
                {displayTimestamp(
                  source.publishedAt,
                  source.publishedAtPrecision,
                )}
              </time>
            </p>
            <p>
              {labels.sourceRights}
              {separator}
              {rightsLabels[locale][source.rightsStatus]}
            </p>
            <p>
              {labels.attribution}
              {separator}
              {source.attribution}
            </p>
            {source.licenseUrl ? (
              <p>
                {labels.license}
                {separator}
                <a href={source.licenseUrl}>{source.licenseUrl}</a>
              </p>
            ) : null}
            <a href={source.originalUrl}>{source.originalTitle}</a>
          </article>
        ))}
      </section>
    </main>
  );
}
