import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { database, databasePool } from "@/db/client";
import {
  inboxItems,
  ingestRuns,
  sourceCursors,
  sourceHealth,
  sourceItems,
  sourcePolicies,
  sources,
} from "@/db/schema";
import { retrieveArxivFeed } from "./arxiv-adapter";
import { RetryableIngestError } from "./errors";

const defaultArxivEndpoint = "https://export.arxiv.org/api/query";

const arxivEndpoint = () => {
  const override = process.env.ARXIV_API_URL;
  if (!override) return defaultArxivEndpoint;
  if (process.env.NODE_ENV !== "test") {
    throw new Error("ARXIV_API_URL overrides are only allowed in tests");
  }
  return override;
};

const sourceItemPublicId = (externalId: string) =>
  `arxiv-${externalId.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

const runArxivIngestLocked = async (now: Date) => {
  const [configuration] = await database
    .select({
      sourceId: sources.id,
      accessStatus: sources.accessStatus,
      policyLastReviewedAt: sources.policyLastReviewedAt,
      cursor: sourceCursors.cursorValue,
      nextRunAt: sourceHealth.nextRunAt,
      lastItemAt: sourceHealth.lastItemAt,
      consecutiveErrorCount: sourceHealth.consecutiveErrorCount,
      query: sourcePolicies.query,
      minRequestIntervalMs: sourcePolicies.minRequestIntervalMs,
      maxItemsPerRun: sourcePolicies.maxItemsPerRun,
      requestTimeoutMs: sourcePolicies.requestTimeoutMs,
      userAgent: sourcePolicies.userAgent,
      retainRawPayload: sourcePolicies.retainRawPayload,
      defaultRightsStatus: sourcePolicies.defaultRightsStatus,
      defaultAttribution: sourcePolicies.defaultAttribution,
      defaultLicenseUrl: sourcePolicies.defaultLicenseUrl,
      enabled: sourcePolicies.enabled,
    })
    .from(sources)
    .innerJoin(sourcePolicies, eq(sourcePolicies.sourceId, sources.id))
    .innerJoin(sourceCursors, eq(sourceCursors.sourceId, sources.id))
    .innerJoin(sourceHealth, eq(sourceHealth.sourceId, sources.id))
    .where(
      and(
        eq(sources.publicId, "arxiv"),
        eq(sourcePolicies.adapterKey, "arxiv_api"),
      ),
    );
  if (!configuration) {
    throw new Error("The arXiv Source is not configured");
  }
  if (
    !configuration.enabled ||
    (configuration.accessStatus !== "approved" &&
      configuration.accessStatus !== "approved_limited")
  ) {
    throw new Error("The arXiv Source is not approved for retrieval");
  }
  if (configuration.retainRawPayload) {
    throw new Error("The arXiv policy must not retain raw API payloads");
  }
  if (configuration.nextRunAt && now < configuration.nextRunAt) {
    return { status: "not_due" as const };
  }

  const runPublicId = `ingest-${randomUUID()}`;
  const [run] = await database
    .insert(ingestRuns)
    .values({
      publicId: runPublicId,
      sourceId: configuration.sourceId,
      status: "running",
      cursorBefore: configuration.cursor,
      startedAt: now,
    })
    .returning({ id: ingestRuns.id });
  await database
    .update(sourceHealth)
    .set({ lastAttemptAt: now, updatedAt: now })
    .where(eq(sourceHealth.sourceId, configuration.sourceId));

  try {
    const retrieved = await retrieveArxivFeed({
      cursor: configuration.cursor,
      endpoint: arxivEndpoint(),
      maxItems: configuration.maxItemsPerRun,
      now,
      query: configuration.query,
      requestTimeoutMs: configuration.requestTimeoutMs,
      userAgent: configuration.userAgent,
    });
    const nextRunAt = new Date(
      now.getTime() + configuration.minRequestIntervalMs,
    );

    return database.transaction(async (transaction) => {
      let createdCount = 0;
      for (const item of retrieved.items) {
        const [inserted] = await transaction
          .insert(sourceItems)
          .values({
            publicId: sourceItemPublicId(item.externalId),
            sourceId: configuration.sourceId,
            externalId: item.externalId,
            originalUrl: item.originalUrl,
            canonicalUrl: item.originalUrl,
            originalTitle: item.originalTitle,
            originalLanguage: "en",
            publishedAt: new Date(item.publishedAt),
            publishedAtPrecision: "second",
            discoveredAt: now,
            rightsStatus: configuration.defaultRightsStatus,
            rightsCheckedAt: configuration.policyLastReviewedAt,
            attribution: configuration.defaultAttribution,
            licenseUrl: configuration.defaultLicenseUrl,
          })
          .onConflictDoNothing({
            target: [sourceItems.sourceId, sourceItems.externalId],
          })
          .returning({ id: sourceItems.id });
        if (inserted) {
          createdCount += 1;
          await transaction.insert(inboxItems).values({
            sourceItemId: inserted.id,
            parseStatus: "parsed",
          });
        }
      }

      await transaction
        .update(sourceCursors)
        .set({ cursorValue: retrieved.nextCursor, updatedAt: now })
        .where(eq(sourceCursors.sourceId, configuration.sourceId));
      await transaction
        .update(ingestRuns)
        .set({
          status: "succeeded",
          cursorAfter: retrieved.nextCursor,
          finishedAt: now,
          fetchedCount: retrieved.fetchedCount,
          createdCount,
          responseContentHash: retrieved.responseContentHash,
        })
        .where(eq(ingestRuns.id, run.id));
      const newestItemAt = retrieved.items.reduce<Date | null>(
        (latest, item) => {
          const publishedAt = new Date(item.publishedAt);
          return !latest || publishedAt > latest ? publishedAt : latest;
        },
        null,
      );
      const effectiveLastItemAt = newestItemAt ?? configuration.lastItemAt;
      await transaction
        .update(sourceHealth)
        .set({
          status: "healthy",
          lastSuccessAt: now,
          lastItemAt: effectiveLastItemAt ?? undefined,
          lagSeconds: effectiveLastItemAt
            ? Math.max(
                0,
                Math.floor(
                  (now.getTime() - effectiveLastItemAt.getTime()) / 1000,
                ),
              )
            : null,
          consecutiveErrorCount: 0,
          lastErrorKind: null,
          lastErrorMessage: null,
          nextRunAt,
          updatedAt: now,
        })
        .where(eq(sourceHealth.sourceId, configuration.sourceId));

      return {
        status: "succeeded" as const,
        runPublicId,
        fetchedCount: retrieved.fetchedCount,
        createdCount,
      };
    });
  } catch (error) {
    if (!(error instanceof RetryableIngestError)) throw error;
    const minimumRetryAt = new Date(
      now.getTime() + configuration.minRequestIntervalMs,
    );
    const retryAfterAt =
      error.retryAfterAt && error.retryAfterAt > minimumRetryAt
        ? error.retryAfterAt
        : minimumRetryAt;
    const lagSeconds = configuration.lastItemAt
      ? Math.max(
          0,
          Math.floor(
            (now.getTime() - configuration.lastItemAt.getTime()) / 1000,
          ),
        )
      : null;
    await database.transaction(async (transaction) => {
      await transaction
        .update(ingestRuns)
        .set({
          status: "retryable_failure",
          cursorAfter: configuration.cursor,
          finishedAt: now,
          errorKind: error.kind,
          errorMessage: error.message,
          retryAfterAt,
        })
        .where(eq(ingestRuns.id, run.id));
      await transaction
        .update(sourceHealth)
        .set({
          status: "degraded",
          consecutiveErrorCount: configuration.consecutiveErrorCount + 1,
          lastErrorKind: error.kind,
          lastErrorMessage: error.message,
          lagSeconds,
          nextRunAt: retryAfterAt,
          updatedAt: now,
        })
        .where(eq(sourceHealth.sourceId, configuration.sourceId));
    });
    throw error;
  }
};

const arxivLockKey = "ai-radar:source:arxiv";

export const runArxivIngest = async (now = new Date()) => {
  const lockClient = await databasePool.connect();
  let acquired = false;
  try {
    const lock = await lockClient.query<{ acquired: boolean }>(
      "select pg_try_advisory_lock(hashtext($1)) as acquired",
      [arxivLockKey],
    );
    acquired = lock.rows[0].acquired;
    if (!acquired) return { status: "busy" as const };
    return await runArxivIngestLocked(now);
  } finally {
    if (acquired) {
      await lockClient.query("select pg_advisory_unlock(hashtext($1))", [
        arxivLockKey,
      ]);
    }
    lockClient.release();
  }
};
