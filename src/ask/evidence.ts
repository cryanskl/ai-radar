import { getPublicEntity } from "@/entities/service";
import { getPublicModel } from "@/models/service";
import { searchPublicRecords } from "@/search/service";
import {
  askEvidenceItemSchema,
  type AskEvidenceItem,
  type AskRequest,
} from "./contracts";
import { versionAskEvidencePack } from "./version";

const EVIDENCE_LIMIT = 8 as const;
const SEARCH_LIMIT = 4;
const SUMMARY_LIMIT = 1200;
const TITLE_LIMIT = 240;

const recordUrl = (
  locale: AskRequest["locale"],
  kind: "event" | "entity",
  entityType: AskEvidenceItem["recordType"] | null,
  publicId: string,
) => {
  if (kind === "event") return `/${locale}/radar/events/${publicId}`;
  if (entityType === "repository") return `/${locale}/github/${publicId}`;
  if (
    entityType === "model" ||
    entityType === "paper" ||
    entityType === "product" ||
    entityType === "prompt" ||
    entityType === "skill" ||
    entityType === "guide"
  ) {
    return `/${locale}/${entityType}s/${publicId}`;
  }
  return `/${locale}/entities/${publicId}`;
};

const bounded = (value: string) => value.slice(0, SUMMARY_LIMIT);
const boundedTitle = (value: string) => value.slice(0, TITLE_LIMIT);

export const buildAskEvidencePack = async (input: AskRequest) => {
  const search = await searchPublicRecords({
    q: input.question,
    locale: input.locale,
    type: "all",
    signalLanguage: "all",
    sort: "relevance",
    limit: SEARCH_LIMIT,
  });
  if (search.status !== "ok") throw new Error("Ask search cursor is invalid");

  const publicResults = search.response.items.filter(
    ({ status }) => status === "public",
  );
  const records = publicResults.map((item) =>
    askEvidenceItemSchema.parse({
      citationId: `${item.kind}:${item.publicId}`,
      recordType:
        item.kind === "event" ? "event" : (item.entityType ?? "entity"),
      publicId: item.publicId,
      title: boundedTitle(item.name),
      summary: bounded(item.summary),
      recordUrl: recordUrl(
        input.locale,
        item.kind,
        item.entityType,
        item.publicId,
      ),
      source: item.source
        ? { title: boundedTitle(item.source.name), url: item.source.url }
        : null,
      lastVerifiedAt: item.lastVerifiedAt,
      comparisonBasis: null,
    }),
  );

  const entityDetails = (
    await Promise.all(
      publicResults
        .filter(({ kind }) => kind === "entity")
        .map(({ publicId }) => getPublicEntity(publicId, input.locale)),
    )
  ).filter((entity) => entity !== null);
  const seenRelationPublicIds = new Set<string>();
  const relationEvidence = entityDetails.flatMap((entity) =>
    [...entity.outgoingRelations, ...entity.backlinks].flatMap((relation) => {
      if (seenRelationPublicIds.has(relation.publicId)) return [];
      seenRelationPublicIds.add(relation.publicId);
      const source = relation.evidence[0];
      return [
        askEvidenceItemSchema.parse({
          citationId: `relation:${relation.publicId}`,
          recordType: "relation",
          publicId: relation.publicId,
          title: boundedTitle(
            `${relation.subject.name} ${relation.predicate} ${relation.object.name}`,
          ),
          summary: bounded(
            input.locale === "en"
              ? `${relation.subject.name} ${relation.predicate.toLocaleLowerCase()} ${relation.object.name}.`
              : `${relation.subject.name} 与 ${relation.object.name} 的公开关系为 ${relation.predicate}。`,
          ),
          recordUrl: recordUrl(
            input.locale,
            "entity",
            entity.type,
            entity.publicId,
          ),
          source: {
            title: boundedTitle(source.originalTitle),
            url: source.originalUrl,
          },
          lastVerifiedAt: relation.lastVerifiedAt,
          comparisonBasis: null,
        }),
      ];
    }),
  );

  const models = (
    await Promise.all(
      publicResults
        .filter(
          ({ kind, entityType }) => kind === "entity" && entityType === "model",
        )
        .map(({ publicId }) => getPublicModel(publicId, input.locale)),
    )
  ).filter((model) => model !== null);
  const benchmarkEvidence = models.flatMap((model) => {
    const version = [...model.versions]
      .reverse()
      .find(({ benchmarkRuns }) => benchmarkRuns.length > 0);
    const run = version?.benchmarkRuns[0];
    if (!version || !run) return [];
    return [
      askEvidenceItemSchema.parse({
        citationId: `benchmark:${run.publicId}`,
        recordType: "benchmark",
        publicId: run.publicId,
        title: boundedTitle(
          `${model.name} · ${version.versionLabel} · ${run.benchmark.name}`,
        ),
        summary: bounded(
          input.locale === "en"
            ? `Score ${run.score} ${run.unit}; task ${run.task}; evaluated by ${run.evaluator.name}.`
            : `得分 ${run.score} ${run.unit}；任务 ${run.task}；评测方 ${run.evaluator.name}。`,
        ),
        recordUrl: `/${input.locale}/models/${model.publicId}/versions/${version.publicId}`,
        source: {
          title: boundedTitle(run.evidence.title),
          url: run.evidence.url,
        },
        lastVerifiedAt: run.lastVerifiedAt,
        comparisonBasis: {
          kind: "benchmark",
          benchmarkPublicId: run.benchmark.publicId,
          benchmarkVersion: run.benchmark.version,
          task: run.task,
          unit: run.unit,
          settings: run.settings,
          evaluatorPublicId: run.evaluator.publicId,
          higherIsBetter: run.higherIsBetter,
        },
      }),
    ];
  });
  const priceEvidence = models.flatMap((model) => {
    const cutoff = Date.parse(model.dataCutoff);
    const version = [...model.versions]
      .reverse()
      .find(({ prices }) =>
        prices.some(
          ({ validFrom, validTo }) =>
            Date.parse(validFrom) <= cutoff &&
            (validTo === null || Date.parse(validTo) >= cutoff),
        ),
      );
    const price = version?.prices.find(
      ({ validFrom, validTo }) =>
        Date.parse(validFrom) <= cutoff &&
        (validTo === null || Date.parse(validTo) >= cutoff),
    );
    if (!version || !price) return [];
    return [
      askEvidenceItemSchema.parse({
        citationId: `price:${price.publicId}`,
        recordType: "price",
        publicId: price.publicId,
        title: boundedTitle(
          `${model.name} · ${version.versionLabel} · ${price.category}`,
        ),
        summary: bounded(
          `${price.amount} ${price.currency} / ${price.unit} · ${price.region} · tax ${price.taxPolicy}`,
        ),
        recordUrl: `/${input.locale}/models/${model.publicId}/versions/${version.publicId}`,
        source: {
          title: boundedTitle(price.source.title),
          url: price.source.url,
        },
        lastVerifiedAt: price.lastVerifiedAt,
        comparisonBasis: {
          kind: "price",
          category: price.category,
          currency: price.currency,
          unit: price.unit,
          region: price.region,
          taxPolicy: price.taxPolicy,
        },
      }),
    ];
  });
  const items = [
    ...records,
    ...relationEvidence,
    ...benchmarkEvidence,
    ...priceEvidence,
  ].slice(0, EVIDENCE_LIMIT);
  const dataCutoff =
    items.length === 0
      ? search.response.dataCutoff
      : new Date(
          Math.max(
            ...items.map(({ lastVerifiedAt }) => Date.parse(lastVerifiedAt)),
          ),
        ).toISOString();
  const dataVersion = versionAskEvidencePack({ items, dataCutoff });

  return { items, dataCutoff, dataVersion, limit: EVIDENCE_LIMIT };
};
