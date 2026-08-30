import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { database, databasePool } from "@/db/client";
import {
  arxivSourceItemMetadata,
  entities,
  githubSourceItemMetadata,
  inboxItems,
  ingestRuns,
  repositoryIdentities,
  repositoryObservations,
  sourceCursors,
  sourceHealth,
  sourceItems,
  sourcePolicies,
  sources,
} from "@/db/schema";
import { refreshEntitySearchIndex } from "@/search/indexer";
import { retrieveArxivFeed } from "./arxiv-adapter";
import { retrieveGithubRepositories } from "./github-adapter";
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
          await transaction.insert(arxivSourceItemMetadata).values({
            sourceItemId: inserted.id,
            authors: item.authors,
          });
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

const defaultGithubEndpoint = "https://api.github.com";

const githubEndpoint = () => {
  const override = process.env.GITHUB_API_URL;
  if (!override) return defaultGithubEndpoint;
  if (process.env.NODE_ENV !== "test") {
    throw new Error("GITHUB_API_URL overrides are only allowed in tests");
  }
  return override;
};

const githubSourceItemPublicId = (repositoryId: number, observedAt: string) =>
  `github-repository-${repositoryId}-${observedAt.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`.replace(
    /-$/,
    "",
  );

const runGithubIngestLocked = async (now: Date) => {
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
        eq(sources.publicId, "github"),
        eq(sourcePolicies.adapterKey, "github_rest_api"),
      ),
    );
  if (!configuration) throw new Error("The GitHub Source is not configured");
  if (
    !configuration.enabled ||
    !["approved", "approved_limited"].includes(configuration.accessStatus)
  ) {
    throw new Error("The GitHub Source is not approved for retrieval");
  }
  if (configuration.retainRawPayload) {
    throw new Error("The GitHub policy must not retain raw API payloads");
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
    const knownRows = await database
      .select({
        identityId: repositoryIdentities.id,
        entityId: repositoryIdentities.entityId,
        githubRepositoryId: repositoryIdentities.githubRepositoryId,
        entityLifecycleStatus: entities.lifecycleStatus,
        entityRightsStatus: entities.rightsStatus,
        entityPublicVisibility: entities.publicVisibility,
        githubOwnerId: githubSourceItemMetadata.githubOwnerId,
        ownerLogin: githubSourceItemMetadata.ownerLogin,
        name: githubSourceItemMetadata.name,
        fullName: githubSourceItemMetadata.fullName,
        url: githubSourceItemMetadata.url,
        description: githubSourceItemMetadata.description,
        topics: githubSourceItemMetadata.topics,
        primaryLanguage: githubSourceItemMetadata.primaryLanguage,
        languages: githubSourceItemMetadata.languages,
        licenseStatus: githubSourceItemMetadata.licenseStatus,
        licenseSpdxId: githubSourceItemMetadata.licenseSpdxId,
        licenseName: githubSourceItemMetadata.licenseName,
        stars: githubSourceItemMetadata.stars,
        forks: githubSourceItemMetadata.forks,
        openIssues: githubSourceItemMetadata.openIssues,
        subscribers: githubSourceItemMetadata.subscribers,
        fork: githubSourceItemMetadata.fork,
        mirrorUrl: githubSourceItemMetadata.mirrorUrl,
        template: githubSourceItemMetadata.template,
        parentRepository: githubSourceItemMetadata.parentRepository,
        sourceRepository: githubSourceItemMetadata.sourceRepository,
        templateRepository: githubSourceItemMetadata.templateRepository,
        repositoryCreatedAt: githubSourceItemMetadata.repositoryCreatedAt,
        repositoryUpdatedAt: githubSourceItemMetadata.repositoryUpdatedAt,
        pushedAt: githubSourceItemMetadata.pushedAt,
        releases: githubSourceItemMetadata.releases,
        observedAt: githubSourceItemMetadata.observedAt,
      })
      .from(repositoryIdentities)
      .innerJoin(entities, eq(entities.id, repositoryIdentities.entityId))
      .innerJoin(
        repositoryObservations,
        eq(
          repositoryObservations.repositoryIdentityId,
          repositoryIdentities.id,
        ),
      )
      .innerJoin(
        githubSourceItemMetadata,
        eq(
          githubSourceItemMetadata.sourceItemId,
          repositoryObservations.metadataSourceItemId,
        ),
      )
      .orderBy(
        repositoryIdentities.id,
        desc(githubSourceItemMetadata.observedAt),
      );
    const knownByRepositoryId = new Map<number, (typeof knownRows)[number]>();
    for (const row of knownRows) {
      if (!knownByRepositoryId.has(row.githubRepositoryId)) {
        knownByRepositoryId.set(row.githubRepositoryId, row);
      }
    }
    const retrieved = await retrieveGithubRepositories({
      endpoint: githubEndpoint(),
      knownRepositories: [...knownByRepositoryId.values()]
        .sort(
          (left, right) =>
            left.observedAt.getTime() - right.observedAt.getTime(),
        )
        .map(({ githubRepositoryId, fullName }) => ({
          githubRepositoryId,
          fullName,
        })),
      maxItems: configuration.maxItemsPerRun,
      now,
      query: configuration.query,
      requestTimeoutMs: configuration.requestTimeoutMs,
      token: process.env.GITHUB_API_TOKEN ?? null,
      userAgent: configuration.userAgent,
    });
    const nextRunAt = new Date(
      now.getTime() + configuration.minRequestIntervalMs,
    );
    return database.transaction(async (transaction) => {
      let createdCount = 0;
      let newestItemAt: Date | null = null;
      for (const retrievedItem of retrieved.items) {
        const previous = knownByRepositoryId.get(
          retrievedItem.githubRepositoryId,
        );
        if (retrievedItem.unavailable === true && !previous) {
          throw new Error(
            "An unavailable GitHub Repository must have prior metadata",
          );
        }
        const item =
          retrievedItem.unavailable === true
            ? {
                githubRepositoryId: previous!.githubRepositoryId,
                githubOwnerId: previous!.githubOwnerId,
                ownerLogin: previous!.ownerLogin,
                name: previous!.name,
                fullName: previous!.fullName,
                url: previous!.url,
                description: previous!.description,
                topics: previous!.topics,
                primaryLanguage: previous!.primaryLanguage,
                languages: previous!.languages,
                license: {
                  status: previous!.licenseStatus,
                  spdxId: previous!.licenseSpdxId,
                  name: previous!.licenseName,
                },
                stars: previous!.stars,
                forks: previous!.forks,
                openIssues: previous!.openIssues,
                subscribers: previous!.subscribers,
                lifecycleState: "unavailable" as const,
                fork: previous!.fork,
                mirrorUrl: previous!.mirrorUrl,
                template: previous!.template,
                parentRepository: previous!.parentRepository,
                sourceRepository: previous!.sourceRepository,
                templateRepository: previous!.templateRepository,
                createdAt: previous!.repositoryCreatedAt.toISOString(),
                updatedAt: previous!.repositoryUpdatedAt.toISOString(),
                pushedAt: previous!.pushedAt?.toISOString() ?? null,
                releases: previous!.releases,
                observedAt: retrievedItem.observedAt,
              }
            : retrievedItem;
        const itemUpdatedAt = new Date(item.updatedAt);
        if (!newestItemAt || itemUpdatedAt > newestItemAt) {
          newestItemAt = itemUpdatedAt;
        }
        const publicRefresh =
          previous !== undefined &&
          previous.entityLifecycleStatus === "active" &&
          previous.entityPublicVisibility &&
          [
            "open",
            "attribution_required",
            "source_license",
            "metadata_only",
            "link_only",
          ].includes(previous.entityRightsStatus);
        const externalId = `repository:${item.githubRepositoryId}:${item.observedAt}`;
        const [inserted] = await transaction
          .insert(sourceItems)
          .values({
            publicId: githubSourceItemPublicId(
              item.githubRepositoryId,
              item.observedAt,
            ),
            sourceId: configuration.sourceId,
            externalId,
            isOriginalSource: true,
            originalUrl: item.url,
            canonicalUrl: item.url,
            originalTitle: item.fullName,
            originalLanguage: "en",
            publishedAt: new Date(item.updatedAt),
            publishedAtPrecision: "second",
            discoveredAt: now,
            rightsStatus: configuration.defaultRightsStatus,
            rightsCheckedAt: configuration.policyLastReviewedAt,
            attribution: configuration.defaultAttribution,
            licenseUrl: configuration.defaultLicenseUrl,
            publicVisibility: publicRefresh,
          })
          .onConflictDoNothing({
            target: [sourceItems.sourceId, sourceItems.externalId],
          })
          .returning({ id: sourceItems.id });
        if (!inserted) continue;
        createdCount += 1;
        await transaction.insert(githubSourceItemMetadata).values({
          sourceItemId: inserted.id,
          githubRepositoryId: item.githubRepositoryId,
          githubOwnerId: item.githubOwnerId,
          ownerLogin: item.ownerLogin,
          name: item.name,
          fullName: item.fullName,
          url: item.url,
          description: item.description,
          topics: item.topics,
          primaryLanguage: item.primaryLanguage,
          languages: item.languages,
          licenseStatus: item.license.status,
          licenseSpdxId: item.license.spdxId,
          licenseName: item.license.name,
          stars: item.stars,
          forks: item.forks,
          openIssues: item.openIssues,
          subscribers: item.subscribers,
          lifecycleState: item.lifecycleState,
          fork: item.fork,
          mirrorUrl: item.mirrorUrl,
          template: item.template,
          parentRepository: item.parentRepository,
          sourceRepository: item.sourceRepository,
          templateRepository: item.templateRepository,
          repositoryCreatedAt: new Date(item.createdAt),
          repositoryUpdatedAt: new Date(item.updatedAt),
          pushedAt: item.pushedAt ? new Date(item.pushedAt) : null,
          observedAt: new Date(item.observedAt),
          releases: item.releases,
        });
        if (
          previous &&
          (previous.fullName !== item.fullName || previous.url !== item.url)
        ) {
          await transaction
            .update(entities)
            .set({
              officialName: item.fullName,
              officialUrl: item.url,
              lastVerifiedAt: now,
              updatedAt: now,
            })
            .where(eq(entities.id, previous.entityId));
          await refreshEntitySearchIndex(transaction, previous.entityId);
        }
        if (previous) {
          await transaction.insert(repositoryObservations).values({
            repositoryIdentityId: previous.identityId,
            metadataSourceItemId: inserted.id,
            publicVisibility: publicRefresh,
          });
        }
      }

      await transaction
        .update(sourceCursors)
        .set({
          cursorValue: retrieved.responseContentHash,
          updatedAt: now,
        })
        .where(eq(sourceCursors.sourceId, configuration.sourceId));
      await transaction
        .update(ingestRuns)
        .set({
          status: "succeeded",
          cursorAfter: retrieved.responseContentHash,
          finishedAt: now,
          fetchedCount: retrieved.fetchedCount,
          createdCount,
          responseContentHash: retrieved.responseContentHash,
        })
        .where(eq(ingestRuns.id, run.id));
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
          nextRunAt: retryAfterAt,
          updatedAt: now,
        })
        .where(eq(sourceHealth.sourceId, configuration.sourceId));
    });
    throw error;
  }
};

const githubLockKey = "ai-radar:source:github";

export const runGithubIngest = async (now = new Date()) => {
  const lockClient = await databasePool.connect();
  let acquired = false;
  try {
    const lock = await lockClient.query<{ acquired: boolean }>(
      "select pg_try_advisory_lock(hashtext($1)) as acquired",
      [githubLockKey],
    );
    acquired = lock.rows[0].acquired;
    if (!acquired) return { status: "busy" as const };
    return await runGithubIngestLocked(now);
  } finally {
    if (acquired) {
      await lockClient.query("select pg_advisory_unlock(hashtext($1))", [
        githubLockKey,
      ]);
    }
    lockClient.release();
  }
};
