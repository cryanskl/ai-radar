import { createHash } from "node:crypto";
import { and, asc, eq, or } from "drizzle-orm";
import { database, databasePool } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import {
  historicalBackfillBatches,
  historicalBackfillCandidates,
} from "@/db/schema";
import { createEntity, createRelation } from "@/entities/service";
import { createHistoricalEventDraft, publishEvent } from "@/events/service";
import {
  historicalBackfillQualityReportSchema,
  type HistoricalBackfillCandidateResult,
  type HistoricalBackfillQualityReport,
  type HistoricalBackfillRequest,
} from "./contracts";

const hashInput = (input: HistoricalBackfillRequest) =>
  createHash("sha256").update(JSON.stringify(input)).digest("hex");

const targetPublicId = (
  candidate: HistoricalBackfillRequest["candidates"][number],
) => {
  if (candidate.kind === "entity") return candidate.input.entity.publicId;
  if (candidate.kind === "event") return candidate.input.event.publicId;
  if (candidate.kind === "relation") return candidate.input.relation.publicId;
  return candidate.targetPublicId;
};

const readBatch = async (publicId: string, replayed: boolean) => {
  const [batch] = await database
    .select()
    .from(historicalBackfillBatches)
    .where(eq(historicalBackfillBatches.publicId, publicId));
  if (!batch || !batch.qualityReport || batch.status === "running") return null;
  const candidates = await database
    .select({
      publicId: historicalBackfillCandidates.publicId,
      kind: historicalBackfillCandidates.kind,
      status: historicalBackfillCandidates.status,
      targetPublicId: historicalBackfillCandidates.targetPublicId,
      errorCode: historicalBackfillCandidates.errorCode,
    })
    .from(historicalBackfillCandidates)
    .where(eq(historicalBackfillCandidates.batchId, batch.id))
    .orderBy(asc(historicalBackfillCandidates.ordinal));

  return {
    publicId: batch.publicId,
    themeSlug: batch.themeSlug,
    version: batch.version,
    theme: { en: batch.nameEn, zh: batch.nameZh },
    timelineStart: batch.timelineStart.toISOString(),
    coverageEnd: batch.coverageEnd.toISOString(),
    prehistoryPolicy: "curated_prehistory" as const,
    status: batch.status,
    replayed,
    qualityReport: historicalBackfillQualityReportSchema.parse(
      batch.qualityReport,
    ),
    candidates,
  };
};

const qualityReport = (
  input: HistoricalBackfillRequest,
  results: HistoricalBackfillCandidateResult[],
): HistoricalBackfillQualityReport => {
  const importedIds = new Set(
    results
      .filter(({ status }) => status === "imported")
      .map(({ publicId }) => publicId),
  );
  const imported = input.candidates.filter(({ publicId }) =>
    importedIds.has(publicId),
  );
  const eventCandidates = input.candidates.filter(
    (candidate) => candidate.kind === "event",
  );
  const importedEvents = imported.filter(
    (candidate) => candidate.kind === "event",
  );
  const importedEntities = imported.filter(
    (candidate) => candidate.kind === "entity",
  );
  const importedRelations = imported.filter(
    (candidate) => candidate.kind === "relation",
  );
  const isReviewedBilingual = (
    localizations: { locale: string; reviewStatus: string }[],
  ) =>
    localizations.length === 2 &&
    new Set(localizations.map(({ locale }) => locale)).size === 2 &&
    localizations.every(({ reviewStatus }) => reviewStatus === "reviewed");

  return {
    candidateCount: input.candidates.length,
    importedCount: imported.length,
    failedCount: results.filter(({ status }) => status === "failed").length,
    unresolvedCount: results.filter(({ status }) => status === "unresolved")
      .length,
    eventCount: importedEvents.length,
    publishedEventCount: importedEvents.length,
    entityCount: importedEntities.length,
    versionCount: importedEntities.reduce(
      (count, candidate) => count + candidate.input.versions.length,
      0,
    ),
    relationCount: importedRelations.length,
    reviewedBilingualRecordCount:
      importedEntities.filter((candidate) =>
        isReviewedBilingual(candidate.input.localizations),
      ).length +
      importedEvents.filter((candidate) =>
        isReviewedBilingual(candidate.input.localizations),
      ).length,
    rightsClassifiedCandidateCount: imported.filter(
      (candidate) => candidate.kind !== "unresolved",
    ).length,
    originalOrHighQualitySourceCount: importedEvents.filter(
      (candidate) =>
        candidate.input.sourceItem.isOriginalSource === true ||
        candidate.input.source.tier === "S" ||
        candidate.input.source.tier === "A",
    ).length,
    allEventsPublished: importedEvents.length === eventCandidates.length,
    allEventsBilingual: eventCandidates.every(
      (candidate) =>
        importedIds.has(candidate.publicId) &&
        isReviewedBilingual(candidate.input.localizations),
    ),
    allEventsSourced: eventCandidates.every(
      (candidate) =>
        importedIds.has(candidate.publicId) &&
        candidate.input.sourceItem.attribution.length > 0,
    ),
    allCandidatesResolved: results.every(({ status }) => status === "imported"),
  };
};

const importCandidate = async (
  candidate: HistoricalBackfillRequest["candidates"][number],
): Promise<HistoricalBackfillCandidateResult> => {
  if (candidate.kind === "unresolved") {
    return {
      publicId: candidate.publicId,
      kind: candidate.kind,
      status: "unresolved",
      targetPublicId: candidate.targetPublicId,
      errorCode: candidate.reasonCode,
    };
  }

  try {
    if (candidate.kind === "entity") {
      await createEntity(candidate.input);
    } else if (candidate.kind === "event") {
      if (
        candidate.input.sourceItem.isOriginalSource !== true &&
        candidate.input.source.tier !== "S" &&
        candidate.input.source.tier !== "A"
      ) {
        return {
          publicId: candidate.publicId,
          kind: candidate.kind,
          status: "failed",
          targetPublicId: targetPublicId(candidate),
          errorCode: "insufficient_source_quality",
        };
      }
      const draft = await createHistoricalEventDraft(candidate.input);
      if (draft.status === "source_conflict") {
        return {
          publicId: candidate.publicId,
          kind: candidate.kind,
          status: "failed",
          targetPublicId: targetPublicId(candidate),
          errorCode: "source_conflict",
        };
      }
      const publication = await publishEvent(draft.publicId);
      if (publication.status !== "published") {
        return {
          publicId: candidate.publicId,
          kind: candidate.kind,
          status: "failed",
          targetPublicId: targetPublicId(candidate),
          errorCode: publication.status,
        };
      }
    } else {
      const relation = await createRelation(candidate.input);
      if (
        relation.status === "not_found" ||
        relation.status === "invalid_relation"
      ) {
        return {
          publicId: candidate.publicId,
          kind: candidate.kind,
          status: "failed",
          targetPublicId: targetPublicId(candidate),
          errorCode: relation.status,
        };
      }
    }
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return {
      publicId: candidate.publicId,
      kind: candidate.kind,
      status: "failed",
      targetPublicId: targetPublicId(candidate),
      errorCode: "already_exists",
    };
  }

  return {
    publicId: candidate.publicId,
    kind: candidate.kind,
    status: "imported",
    targetPublicId: targetPublicId(candidate),
    errorCode: null,
  };
};

export const runHistoricalBackfill = async (
  input: HistoricalBackfillRequest,
) => {
  const connection = await databasePool.connect();
  const lockKeys = [
    `historical-public-id:${input.batch.publicId}`,
    `historical-version:${input.batch.themeSlug}@${input.batch.version}`,
  ].sort();
  const acquiredLockKeys: string[] = [];
  try {
    for (const lockKey of lockKeys) {
      await connection.query("select pg_advisory_lock(hashtext($1))", [
        lockKey,
      ]);
      acquiredLockKeys.push(lockKey);
    }
    const inputSha256 = hashInput(input);
    const existing = await database
      .select({
        publicId: historicalBackfillBatches.publicId,
        themeSlug: historicalBackfillBatches.themeSlug,
        version: historicalBackfillBatches.version,
        inputSha256: historicalBackfillBatches.inputSha256,
      })
      .from(historicalBackfillBatches)
      .where(
        or(
          eq(historicalBackfillBatches.publicId, input.batch.publicId),
          and(
            eq(historicalBackfillBatches.themeSlug, input.batch.themeSlug),
            eq(historicalBackfillBatches.version, input.batch.version),
          ),
        ),
      );
    const publicIdMatch = existing.find(
      ({ publicId }) => publicId === input.batch.publicId,
    );
    const versionMatch = existing.find(
      ({ themeSlug, version }) =>
        themeSlug === input.batch.themeSlug && version === input.batch.version,
    );
    if (publicIdMatch) {
      if (publicIdMatch.inputSha256 !== inputSha256) {
        return { status: "conflict" as const };
      }
      if (versionMatch && versionMatch.publicId !== input.batch.publicId) {
        return { status: "version_conflict" as const };
      }
      return {
        status: "replayed" as const,
        report: await readBatch(input.batch.publicId, true),
      };
    }
    if (versionMatch) return { status: "version_conflict" as const };

    const [batch] = await database
      .insert(historicalBackfillBatches)
      .values({
        publicId: input.batch.publicId,
        themeSlug: input.batch.themeSlug,
        version: input.batch.version,
        nameEn: input.batch.name.en,
        nameZh: input.batch.name.zh,
        timelineStart: new Date(input.batch.timelineStart),
        coverageEnd: new Date(input.batch.coverageEnd),
        prehistoryPolicy: input.batch.prehistoryPolicy,
        inputSha256,
        input,
        status: "running",
      })
      .returning({ id: historicalBackfillBatches.id });

    const results: HistoricalBackfillCandidateResult[] = [];
    try {
      for (const [ordinal, candidate] of input.candidates.entries()) {
        const result = await importCandidate(candidate);
        await database.insert(historicalBackfillCandidates).values({
          batchId: batch.id,
          ordinal,
          publicId: result.publicId,
          kind: result.kind,
          status: result.status,
          targetPublicId: result.targetPublicId,
          errorCode: result.errorCode,
        });
        results.push(result);
      }

      const report = qualityReport(input, results);
      const status = report.allCandidatesResolved
        ? ("completed" as const)
        : ("completed_with_issues" as const);
      await database
        .update(historicalBackfillBatches)
        .set({ status, qualityReport: report, finishedAt: new Date() })
        .where(eq(historicalBackfillBatches.id, batch.id));
      return {
        status: "created" as const,
        report: await readBatch(input.batch.publicId, false),
      };
    } catch (error) {
      const remaining = input.candidates.slice(results.length);
      for (const [offset, candidate] of remaining.entries()) {
        const result: HistoricalBackfillCandidateResult = {
          publicId: candidate.publicId,
          kind: candidate.kind,
          status: "failed",
          targetPublicId: targetPublicId(candidate),
          errorCode: offset === 0 ? "system_error" : "not_run",
        };
        await database.insert(historicalBackfillCandidates).values({
          batchId: batch.id,
          ordinal: results.length,
          publicId: result.publicId,
          kind: result.kind,
          status: result.status,
          targetPublicId: result.targetPublicId,
          errorCode: result.errorCode,
        });
        results.push(result);
      }
      await database
        .update(historicalBackfillBatches)
        .set({
          status: "failed",
          qualityReport: qualityReport(input, results),
          finishedAt: new Date(),
        })
        .where(eq(historicalBackfillBatches.id, batch.id));
      throw error;
    }
  } finally {
    for (let index = acquiredLockKeys.length - 1; index >= 0; index -= 1) {
      const lockKey = acquiredLockKeys[index];
      await connection.query("select pg_advisory_unlock(hashtext($1))", [
        lockKey,
      ]);
    }
    connection.release();
  }
};

export const getHistoricalBackfill = (publicId: string) =>
  readBatch(publicId, true);
