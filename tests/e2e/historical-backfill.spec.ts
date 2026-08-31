import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { Client } from "pg";
import {
  historicalBackfillRequestSchema,
  type HistoricalBackfillRequest,
} from "../../src/historical-backfills/contracts";
import { completeFakeGithubOAuth } from "../support/github-oauth";
import {
  startTestApplication,
  type TestApplication,
} from "../support/test-application";

let application: TestApplication | undefined;

test.beforeAll(async () => {
  application = await startTestApplication();
});

test.afterAll(async () => {
  if (application) await application.stop();
});

test("runs one versioned historical theme idempotently and exposes unresolved candidates", async ({
  context,
}) => {
  if (!application) throw new Error("Test application did not start");
  const applicationUrl = application.url;
  const manifest: HistoricalBackfillRequest =
    historicalBackfillRequestSchema.parse(
      JSON.parse(
        await readFile(
          new URL(
            "../../data/historical-batches/chatgpt-research-preview-v1.json",
            import.meta.url,
          ),
          "utf8",
        ),
      ),
    );
  const batchesUrl = `${applicationUrl}/api/v1/admin/historical-batches`;

  expect(
    (await context.request.post(batchesUrl, { data: manifest })).status(),
  ).toBe(401);

  const owner = await completeFakeGithubOAuth({
    applicationUrl,
    databaseUrl: application.databaseUrl,
    ownerGithubId: "34471145",
    profile: {
      avatar_url: "https://avatars.example.test/history-owner",
      email: "history-owner@example.test",
      id: 34_471_145,
      login: "cryanskl",
      name: "AI Radar Owner",
    },
  });
  if (!owner.sessionToken)
    throw new Error("Owner OAuth did not create a session");
  await context.addCookies([
    {
      name: "next-auth.session-token",
      value: owner.sessionToken,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);

  const beforeMainTimeline = structuredClone(manifest);
  beforeMainTimeline.batch.publicId =
    "historical-batch-before-main-timeline-v1";
  const beforeMainEvent = beforeMainTimeline.candidates.find(
    (candidate) => candidate.kind === "event",
  );
  if (!beforeMainEvent) throw new Error("Production manifest has no Event");
  beforeMainEvent.input.event.occurredAt = "2021-01-01T00:00:00.000Z";
  beforeMainEvent.input.sourceItem.publishedAt = "2021-01-01T00:00:00.000Z";
  expect(
    (
      await context.request.post(batchesUrl, { data: beforeMainTimeline })
    ).status(),
  ).toBe(400);

  const outsideCoverage = structuredClone(manifest);
  outsideCoverage.batch.publicId = "historical-batch-outside-coverage-v1";
  const outsideCoverageEvent = outsideCoverage.candidates.find(
    (candidate) => candidate.kind === "event",
  );
  if (!outsideCoverageEvent)
    throw new Error("Production manifest has no Event");
  outsideCoverageEvent.input.event.occurredAt = "2022-12-01T00:00:00.000Z";
  expect(
    (
      await context.request.post(batchesUrl, { data: outsideCoverage })
    ).status(),
  ).toBe(400);

  const concurrentRuns = await Promise.all([
    context.request.post(batchesUrl, { data: manifest }),
    context.request.post(batchesUrl, { data: manifest }),
  ]);
  expect(concurrentRuns.map((response) => response.status()).sort()).toEqual([
    200, 201,
  ]);
  const firstRun = concurrentRuns.find((response) => response.status() === 201);
  const concurrentReplay = concurrentRuns.find(
    (response) => response.status() === 200,
  );
  if (!firstRun || !concurrentReplay) {
    throw new Error("Concurrent batch did not create and replay exactly once");
  }
  expect(firstRun.status()).toBe(201);
  const firstReport = await firstRun.json();
  expect(firstReport).toMatchObject({
    publicId: "historical-batch-chatgpt-research-preview-v1",
    status: "completed",
    replayed: false,
    theme: {
      en: "ChatGPT Research Preview",
      zh: "ChatGPT 研究预览版",
    },
    prehistoryPolicy: "curated_prehistory",
    qualityReport: {
      candidateCount: 7,
      importedCount: 7,
      failedCount: 0,
      unresolvedCount: 0,
      eventCount: 1,
      publishedEventCount: 1,
      entityCount: 3,
      versionCount: 1,
      relationCount: 3,
      reviewedBilingualRecordCount: 4,
      rightsClassifiedCandidateCount: 7,
      originalOrHighQualitySourceCount: 1,
      allEventsPublished: true,
      allEventsBilingual: true,
      allEventsSourced: true,
      allCandidatesResolved: true,
    },
  });
  expect(firstReport.candidates).toHaveLength(7);
  expect(
    firstReport.candidates.every(
      ({ status }: { status: string }) => status === "imported",
    ),
  ).toBe(true);
  expect(await concurrentReplay.json()).toMatchObject({
    status: "completed",
    replayed: true,
  });

  const event = await context.request.get(
    `${applicationUrl}/api/v1/events/event-chatgpt-research-preview-2022-11-30?locale=en`,
  );
  expect(event.status()).toBe(200);
  expect(await event.json()).toMatchObject({
    publicId: "event-chatgpt-research-preview-2022-11-30",
    publicationState: "published",
    sources: [
      {
        sourceItemPublicId:
          "source-item-openai-chatgpt-research-preview-2022-11-30",
        isOriginalSource: true,
      },
    ],
  });
  expect(
    (
      await context.request.get(
        `${applicationUrl}/api/v1/events/event-chatgpt-research-preview-2022-11-30?locale=zh`,
      )
    ).status(),
  ).toBe(200);

  const chatgpt = await context.request.get(
    `${applicationUrl}/api/v1/entities/product-chatgpt?locale=en`,
  );
  expect(chatgpt.status()).toBe(200);
  expect(await chatgpt.json()).toMatchObject({
    publicId: "product-chatgpt",
    versions: [
      {
        publicId: "version-chatgpt-research-preview-2022-11-30",
        versionLabel: "Research Preview",
      },
    ],
    backlinks: expect.arrayContaining([
      expect.objectContaining({
        publicId: "relation-chatgpt-preview-announces-product",
      }),
      expect.objectContaining({
        publicId: "relation-openai-develops-chatgpt",
      }),
    ]),
    outgoingRelations: expect.arrayContaining([
      expect.objectContaining({
        publicId: "relation-chatgpt-tagged-conversational-ai",
      }),
    ]),
  });

  const correction = await context.request.post(
    `${applicationUrl}/api/v1/admin/corrections`,
    {
      data: {
        publicId: "correction-chatgpt-research-preview-summary",
        case: {
          publicId: "case-chatgpt-research-preview-summary",
          receivedAt: "2026-08-31T01:00:00.000Z",
          originalRequest: "Clarify the historical research preview summary.",
          evidenceSummary:
            "The original OpenAI announcement confirms the scope.",
        },
        target: {
          type: "event",
          publicId: "event-chatgpt-research-preview-2022-11-30",
        },
        reasonCode: "factual_error",
        effectiveAt: "2026-08-31T02:00:00.000Z",
        replacementVersion:
          "event-chatgpt-research-preview-2022-11-30@2026-08-31T02:00:00.000Z",
        evidenceSourceItemPublicIds: [
          "source-item-openai-chatgpt-research-preview-2022-11-30",
        ],
        changes: {
          localizations: [
            {
              locale: "en",
              title: "OpenAI releases ChatGPT as a research preview",
              summary:
                "OpenAI introduced ChatGPT as a public research preview to gather feedback on its strengths and limitations.",
            },
            {
              locale: "zh",
              title: "OpenAI 以研究预览版形式发布 ChatGPT",
              summary:
                "OpenAI 以公开研究预览版形式推出 ChatGPT，以收集对其优势与局限的反馈。",
            },
          ],
        },
        internalNote: "Validated against the original announcement.",
      },
    },
  );
  expect(correction.status()).toBe(201);
  expect(
    await (
      await context.request.get(
        `${applicationUrl}/api/v1/events/event-chatgpt-research-preview-2022-11-30?locale=en`,
      )
    ).json(),
  ).toMatchObject({
    corrections: [
      {
        publicId: "correction-chatgpt-research-preview-summary",
        reasonCode: "factual_error",
      },
    ],
  });

  const replay = await context.request.post(batchesUrl, { data: manifest });
  expect(replay.status()).toBe(200);
  expect(await replay.json()).toMatchObject({
    status: "completed",
    replayed: true,
    qualityReport: firstReport.qualityReport,
    candidates: firstReport.candidates,
  });
  const stored = await context.request.get(
    `${batchesUrl}/historical-batch-chatgpt-research-preview-v1`,
  );
  expect(stored.status()).toBe(200);
  expect(await stored.json()).toMatchObject({
    publicId: "historical-batch-chatgpt-research-preview-v1",
    replayed: true,
  });

  const lowQualitySource = structuredClone(manifest);
  lowQualitySource.batch = {
    ...lowQualitySource.batch,
    publicId: "historical-batch-low-quality-source-v1",
    themeSlug: "low-quality-source",
  };
  const lowQualityEvent = lowQualitySource.candidates.find(
    (candidate) => candidate.kind === "event",
  );
  if (!lowQualityEvent) throw new Error("Production manifest has no Event");
  lowQualityEvent.publicId = "history-candidate-event-low-quality-source";
  lowQualityEvent.input.source.publicId = "source-low-quality-history";
  lowQualityEvent.input.source.tier = "C";
  lowQualityEvent.input.sourceItem.publicId = "source-item-low-quality-history";
  lowQualityEvent.input.sourceItem.externalId = "low-quality-history";
  lowQualityEvent.input.sourceItem.isOriginalSource = false;
  lowQualityEvent.input.event.publicId = "event-low-quality-history";
  lowQualitySource.candidates = [lowQualityEvent];
  const lowQualityRun = await context.request.post(batchesUrl, {
    data: lowQualitySource,
  });
  expect(lowQualityRun.status()).toBe(201);
  expect(await lowQualityRun.json()).toMatchObject({
    status: "completed_with_issues",
    qualityReport: {
      failedCount: 1,
      publishedEventCount: 0,
      originalOrHighQualitySourceCount: 0,
      allEventsPublished: false,
      allEventsSourced: false,
      allCandidatesResolved: false,
    },
    candidates: [
      {
        publicId: "history-candidate-event-low-quality-source",
        status: "failed",
        errorCode: "insufficient_source_quality",
      },
    ],
  });

  const sourceReuse = structuredClone(manifest);
  sourceReuse.batch = {
    ...sourceReuse.batch,
    publicId: "historical-batch-chatgpt-research-preview-v2",
    version: "1.0.1",
    timelineStart: "2022-12-01T00:00:00.000Z",
    coverageEnd: "2022-12-01T23:59:59.999Z",
  };
  const sourceReuseEvent = sourceReuse.candidates.find(
    (candidate) => candidate.kind === "event",
  );
  if (!sourceReuseEvent) throw new Error("Production manifest has no Event");
  sourceReuseEvent.publicId = "history-candidate-event-source-reuse";
  sourceReuseEvent.input.sourceItem.publicId =
    "source-item-openai-chatgpt-source-reuse-2022-12-01";
  sourceReuseEvent.input.sourceItem.externalId =
    "openai-chatgpt-source-reuse-2022-12-01";
  sourceReuseEvent.input.sourceItem.publishedAt = "2022-12-01T00:00:00.000Z";
  sourceReuseEvent.input.event.publicId =
    "event-chatgpt-source-reuse-2022-12-01";
  sourceReuseEvent.input.event.occurredAt = "2022-12-01T00:00:00.000Z";
  sourceReuse.candidates = [sourceReuseEvent];
  const sourceReuseRun = await context.request.post(batchesUrl, {
    data: sourceReuse,
  });
  expect(sourceReuseRun.status()).toBe(201);
  expect(await sourceReuseRun.json()).toMatchObject({
    status: "completed",
    qualityReport: {
      publishedEventCount: 1,
      originalOrHighQualitySourceCount: 1,
    },
  });

  const sourceMismatch = structuredClone(sourceReuse);
  sourceMismatch.batch.publicId = "historical-batch-chatgpt-source-mismatch-v1";
  sourceMismatch.batch.themeSlug = "chatgpt-source-mismatch";
  sourceMismatch.batch.version = "1.0.0";
  const sourceMismatchEvent = sourceMismatch.candidates[0];
  if (sourceMismatchEvent.kind !== "event") {
    throw new Error("Source reuse fixture is not an Event");
  }
  sourceMismatchEvent.publicId = "history-candidate-event-source-mismatch";
  sourceMismatchEvent.input.source.tier = "A";
  sourceMismatchEvent.input.sourceItem.publicId =
    "source-item-openai-chatgpt-source-mismatch";
  sourceMismatchEvent.input.sourceItem.externalId =
    "openai-chatgpt-source-mismatch";
  sourceMismatchEvent.input.event.publicId = "event-chatgpt-source-mismatch";
  const sourceMismatchRun = await context.request.post(batchesUrl, {
    data: sourceMismatch,
  });
  expect(sourceMismatchRun.status()).toBe(201);
  expect(await sourceMismatchRun.json()).toMatchObject({
    status: "completed_with_issues",
    candidates: [
      {
        status: "failed",
        errorCode: "source_conflict",
      },
    ],
  });

  const incompleteManifest = {
    batch: {
      publicId: "historical-batch-unresolved-fixture-v1",
      themeSlug: "unresolved-fixture",
      version: "1.0.0",
      name: { en: "Unresolved fixture", zh: "未决测试" },
      timelineStart: "2022-11-30T00:00:00.000Z",
      coverageEnd: "2022-11-30T23:59:59.999Z",
      prehistoryPolicy: "curated_prehistory",
    },
    candidates: [
      {
        publicId: "history-candidate-curated-prehistory",
        kind: "unresolved",
        targetPublicId: "event-prehistory-context",
        reasonCode: "curated_prehistory",
      },
      {
        publicId: "history-candidate-missing-relation-endpoint",
        kind: "relation",
        input: {
          relation: {
            publicId: "relation-history-missing-endpoint",
            subject: { type: "entity", publicId: "organization-missing" },
            predicate: "DEVELOPS",
            objectEntityPublicId: "product-missing",
            validFrom: null,
            validTo: null,
            firstVerifiedAt: "2026-08-31T00:00:00.000Z",
            lastVerifiedAt: "2026-08-31T00:00:00.000Z",
            confidence: 100,
            reviewStatus: "reviewed",
            creationMethod: "editor",
            rightsStatus: "link_only",
          },
          evidenceSourceItemPublicIds: [
            "source-item-openai-chatgpt-research-preview-2022-11-30",
          ],
        },
      },
    ],
  };
  const incompleteRun = await context.request.post(batchesUrl, {
    data: incompleteManifest,
  });
  expect(incompleteRun.status()).toBe(201);
  expect(await incompleteRun.json()).toMatchObject({
    status: "completed_with_issues",
    qualityReport: {
      candidateCount: 2,
      importedCount: 0,
      failedCount: 1,
      unresolvedCount: 1,
      allCandidatesResolved: false,
    },
    candidates: [
      {
        publicId: "history-candidate-curated-prehistory",
        status: "unresolved",
        errorCode: "curated_prehistory",
      },
      {
        publicId: "history-candidate-missing-relation-endpoint",
        status: "failed",
        errorCode: "not_found",
      },
    ],
  });

  const conflictingManifest = structuredClone(manifest) as {
    batch: { name: { en: string } };
  };
  conflictingManifest.batch.name.en = "Conflicting theme";
  expect(
    (
      await context.request.post(batchesUrl, { data: conflictingManifest })
    ).status(),
  ).toBe(409);

  const conflictingVersion = structuredClone(manifest);
  conflictingVersion.batch.publicId =
    "historical-batch-chatgpt-research-preview-same-version";
  const versionConflictResponse = await context.request.post(batchesUrl, {
    data: conflictingVersion,
  });
  expect(versionConflictResponse.status()).toBe(409);
  expect(await versionConflictResponse.json()).toEqual({
    error: "batch_version_conflict",
  });

  const systemFailure = structuredClone(manifest);
  systemFailure.batch = {
    ...systemFailure.batch,
    publicId: "historical-batch-system-failure-v1",
    themeSlug: "system-failure",
  };
  const systemFailureEntity = systemFailure.candidates.find(
    (candidate) => candidate.kind === "entity",
  );
  if (!systemFailureEntity)
    throw new Error("Production manifest has no Entity");
  systemFailureEntity.publicId = "history-candidate-system-failure";
  systemFailureEntity.input.entity.publicId = "product-history-system-failure";
  systemFailureEntity.input.aliases = [];
  systemFailureEntity.input.versions = [];
  systemFailure.candidates = [systemFailureEntity];
  const failureDatabase = new Client({
    connectionString: application.databaseUrl,
  });
  await failureDatabase.connect();
  await failureDatabase.query(`
    create function fail_history_entity_insert() returns trigger language plpgsql as $$
    begin
      raise exception 'injected historical backfill failure';
    end
    $$;
    create trigger fail_history_entity_insert
      before insert on entities
      for each row when (new.public_id = 'product-history-system-failure')
      execute function fail_history_entity_insert();
  `);
  expect(
    (await context.request.post(batchesUrl, { data: systemFailure })).status(),
  ).toBe(500);
  await failureDatabase.query(`
    drop trigger fail_history_entity_insert on entities;
    drop function fail_history_entity_insert();
  `);
  await failureDatabase.end();
  const failedReplay = await context.request.post(batchesUrl, {
    data: systemFailure,
  });
  expect(failedReplay.status()).toBe(200);
  expect(await failedReplay.json()).toMatchObject({
    status: "failed",
    replayed: true,
    qualityReport: {
      candidateCount: 1,
      failedCount: 1,
      allCandidatesResolved: false,
    },
    candidates: [
      {
        publicId: "history-candidate-system-failure",
        status: "failed",
        errorCode: "system_error",
      },
    ],
  });
  expect(
    (
      await context.request.get(
        `${batchesUrl}/historical-batch-system-failure-v1`,
      )
    ).status(),
  ).toBe(200);

  const database = new Client({ connectionString: application.databaseUrl });
  await database.connect();
  const counts = await database.query<{
    batches: string;
    candidates: string;
    chatgpt_events: string;
  }>(`
    select
      (select count(*)::text from historical_backfill_batches) as batches,
      (select count(*)::text from historical_backfill_candidates) as candidates,
      (select count(*)::text from events where public_id = 'event-chatgpt-research-preview-2022-11-30') as chatgpt_events
  `);
  await database.end();
  expect(counts.rows[0]).toEqual({
    batches: "6",
    candidates: "13",
    chatgpt_events: "1",
  });

  const openApi = (await (
    await context.request.get(`${applicationUrl}/api/openapi.json`)
  ).json()) as { paths: Record<string, unknown> };
  expect(openApi.paths).toHaveProperty("/api/v1/admin/historical-batches");
  expect(openApi.paths).toHaveProperty(
    "/api/v1/admin/historical-batches/{publicId}",
  );
  const batchPath = openApi.paths["/api/v1/admin/historical-batches"] as {
    post: {
      security: unknown;
      requestBody: {
        content: { "application/json": { schema: { type: string } } };
      };
      responses: Record<
        string,
        { content?: { "application/json": { schema: { type: string } } } }
      >;
    };
  };
  expect(batchPath.post.security).toEqual([{ ownerSession: [] }]);
  expect(
    batchPath.post.requestBody.content["application/json"].schema.type,
  ).toBe("object");
  expect(
    batchPath.post.responses["200"].content?.["application/json"].schema.type,
  ).toBe("object");
  expect(Object.keys(batchPath.post.responses).sort()).toEqual([
    "200",
    "201",
    "400",
    "401",
    "409",
  ]);
});
