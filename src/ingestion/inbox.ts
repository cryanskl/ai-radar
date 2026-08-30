import { desc, eq } from "drizzle-orm";
import { database } from "@/db/client";
import {
  inboxItems,
  ingestRuns,
  sourceHealth,
  sourceItems,
  sources,
} from "@/db/schema";

export const getInboxOverview = async () => {
  const candidates = await database
    .select({
      sourceItemPublicId: sourceItems.publicId,
      originalTitle: sourceItems.originalTitle,
      originalUrl: sourceItems.originalUrl,
      publishedAt: sourceItems.publishedAt,
      discoveredAt: sourceItems.discoveredAt,
      rightsStatus: sourceItems.rightsStatus,
      sourceName: sources.name,
      status: inboxItems.status,
      parseStatus: inboxItems.parseStatus,
    })
    .from(inboxItems)
    .innerJoin(sourceItems, eq(sourceItems.id, inboxItems.sourceItemId))
    .innerJoin(sources, eq(sources.id, sourceItems.sourceId))
    .orderBy(desc(inboxItems.createdAt));
  const runs = await database
    .select({
      publicId: ingestRuns.publicId,
      sourceName: sources.name,
      status: ingestRuns.status,
      errorKind: ingestRuns.errorKind,
      errorMessage: ingestRuns.errorMessage,
      fetchedCount: ingestRuns.fetchedCount,
      createdCount: ingestRuns.createdCount,
      startedAt: ingestRuns.startedAt,
      retryAfterAt: ingestRuns.retryAfterAt,
    })
    .from(ingestRuns)
    .innerJoin(sources, eq(sources.id, ingestRuns.sourceId))
    .orderBy(desc(ingestRuns.startedAt))
    .limit(10);
  const health = await database
    .select({
      sourceName: sources.name,
      status: sourceHealth.status,
      lastAttemptAt: sourceHealth.lastAttemptAt,
      lastSuccessAt: sourceHealth.lastSuccessAt,
      lastItemAt: sourceHealth.lastItemAt,
      lagSeconds: sourceHealth.lagSeconds,
      consecutiveErrorCount: sourceHealth.consecutiveErrorCount,
      nextRunAt: sourceHealth.nextRunAt,
    })
    .from(sourceHealth)
    .innerJoin(sources, eq(sources.id, sourceHealth.sourceId));

  return { candidates, runs, health };
};
