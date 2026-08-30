import { expect, test } from "@playwright/test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { Client } from "pg";
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

test("Owner corrections, identity merges and Rights withdrawals propagate without erasing history", async ({
  context,
  page,
}) => {
  if (!application) throw new Error("Test application did not start");
  const applicationUrl = application.url;
  const owner = await completeFakeGithubOAuth({
    applicationUrl,
    databaseUrl: application.databaseUrl,
    ownerGithubId: "34471145",
    profile: {
      avatar_url: "https://avatars.example.test/owner",
      email: "correction-owner@example.test",
      id: 34_471_145,
      login: "cryanskl",
      name: "AI Radar Owner",
    },
  });
  if (!owner.sessionToken)
    throw new Error("Owner OAuth did not create a session");

  for (const path of [
    "/api/v1/admin/corrections",
    "/api/v1/admin/rights-decisions",
    "/api/v1/admin/entities/merge",
    "/api/v1/admin/editorial-cases/restrict",
  ]) {
    const response = await context.request.post(`${applicationUrl}${path}`, {
      data: {},
    });
    expect(response.status()).toBe(401);
  }

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
  const caseRecord = (publicId: string, receivedAt: string) => ({
    publicId,
    receivedAt,
    originalRequest: `Original request for ${publicId}.`,
    evidenceSummary: `Owner-verified evidence for ${publicId}.`,
  });

  const createEntity = async ({
    publicId,
    officialName,
    aliasPublicId,
    versionPublicId,
    type = "model",
  }: {
    publicId: string;
    officialName: string;
    aliasPublicId: string;
    versionPublicId: string;
    type?: "model" | "organization";
  }) => {
    const response = await context.request.post(
      `${applicationUrl}/api/v1/admin/entities`,
      {
        data: {
          entity: {
            publicId,
            type,
            officialName,
            officialUrl: `https://models.example.test/${publicId}`,
            lastVerifiedAt: "2026-08-30T08:00:00.000Z",
            rightsStatus: "open",
          },
          localizations: [
            {
              locale: "en",
              name: officialName,
              summary: `${officialName} original public profile.`,
              authorship: "human_authored",
              reviewStatus: "reviewed",
            },
            {
              locale: "zh",
              name: `${officialName} 中文名`,
              summary: `${officialName} 原始公开档案。`,
              authorship: "human_authored",
              reviewStatus: "reviewed",
            },
          ],
          aliases: [
            {
              publicId: aliasPublicId,
              locale: "en",
              kind: "historical",
              value: `${officialName} Legacy`,
            },
          ],
          versions: [
            {
              publicId: versionPublicId,
              versionLabel: versionPublicId,
              releasedAt: "2026-08-29T00:00:00.000Z",
              releasedAtPrecision: "day",
            },
          ],
        },
      },
    );
    expect(response.status()).toBe(201);
  };

  await createEntity({
    publicId: "model-correction-canonical",
    officialName: "Model Correction Canonical",
    aliasPublicId: "alias-model-correction-canonical",
    versionPublicId: "version-model-correction-canonical-v1",
  });
  await createEntity({
    publicId: "model-correction-duplicate",
    officialName: "Model Correction Duplicate",
    aliasPublicId: "alias-model-correction-duplicate",
    versionPublicId: "version-model-correction-duplicate-v1",
  });

  const createAndPublishEvent = async ({
    eventPublicId,
    sourcePublicId,
    sourceItemPublicId,
    isOriginalSource,
  }: {
    eventPublicId: string;
    sourcePublicId: string;
    sourceItemPublicId: string;
    isOriginalSource: boolean;
  }) => {
    const response = await context.request.post(
      `${applicationUrl}/api/v1/admin/event-drafts`,
      {
        data: {
          source: {
            publicId: sourcePublicId,
            name: isOriginalSource ? "Correction Official" : "Correction Wire",
            homepageUrl: `https://${sourcePublicId}.example.test/`,
            tier: isOriginalSource ? "S" : "A",
            accessStatus: "approved",
            acquisitionMethod: "manual",
            policyLastReviewedAt: "2026-08-30T00:00:00.000Z",
          },
          sourceItem: {
            publicId: sourceItemPublicId,
            externalId: "correction-fixture-event",
            externalIdVerifiedAt: "2026-08-30T08:00:00.000Z",
            isOriginalSource,
            originalUrl: `https://${sourcePublicId}.example.test/${sourceItemPublicId}`,
            canonicalUrl:
              "https://canonical.example.test/correction-fixture-event",
            originalTitle: isOriginalSource
              ? "Official original correction fixture"
              : "Wire duplicate correction fixture",
            originalLanguage: "en",
            publishedAt: isOriginalSource
              ? "2026-08-30T08:00:00.000Z"
              : "2026-08-30T08:10:00.000Z",
            publishedAtPrecision: "second",
            discoveredAt: "2026-08-30T08:15:00.000Z",
            rightsStatus: "open",
            rightsCheckedAt: "2026-08-30T08:20:00.000Z",
            attribution: isOriginalSource
              ? "Correction Official"
              : "Correction Wire",
            licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
          },
          event: {
            publicId: eventPublicId,
            eventType: "announces",
            factStatus: "confirmed",
            occurredAt: "2026-08-30T08:00:00.000Z",
            occurredAtPrecision: "second",
            lastVerifiedAt: "2026-08-30T08:30:00.000Z",
            rightsStatus: "open",
          },
          localizations: [
            {
              locale: "en",
              title: `${eventPublicId} original title`,
              summary: `${eventPublicId} original restricted expression.`,
              authorship: "human_authored",
              reviewStatus: "reviewed",
            },
            {
              locale: "zh",
              title: `${eventPublicId} 原始标题`,
              summary: `${eventPublicId} 原始受限表达。`,
              authorship: "human_authored",
              reviewStatus: "reviewed",
            },
          ],
        },
      },
    );
    expect(response.status()).toBe(201);
    const publish = await context.request.post(
      `${applicationUrl}/api/v1/admin/events/${eventPublicId}/publish`,
    );
    expect(publish.status()).toBe(200);
  };

  await createAndPublishEvent({
    eventPublicId: "event-correction-canonical",
    sourcePublicId: "correction-official",
    sourceItemPublicId: "source-item-correction-official",
    isOriginalSource: true,
  });
  await createAndPublishEvent({
    eventPublicId: "event-correction-duplicate",
    sourcePublicId: "correction-wire",
    sourceItemPublicId: "source-item-correction-wire",
    isOriginalSource: false,
  });

  const relationResponse = await context.request.post(
    `${applicationUrl}/api/v1/admin/relations`,
    {
      data: {
        relation: {
          publicId: "relation-correction-event-model",
          subject: {
            type: "event",
            publicId: "event-correction-duplicate",
          },
          predicate: "ANNOUNCES",
          objectEntityPublicId: "model-correction-duplicate",
          validFrom: "2026-08-30T08:00:00.000Z",
          validTo: null,
          firstVerifiedAt: "2026-08-30T08:30:00.000Z",
          lastVerifiedAt: "2026-08-30T08:30:00.000Z",
          confidence: 90,
          reviewStatus: "reviewed",
          creationMethod: "editor",
          rightsStatus: "open",
        },
        evidenceSourceItemPublicIds: ["source-item-correction-wire"],
      },
    },
  );
  expect(relationResponse.status()).toBe(201);

  const invalidCorrection = await context.request.post(
    `${applicationUrl}/api/v1/admin/corrections`,
    { data: { publicId: "correction-invalid" } },
  );
  expect(invalidCorrection.status()).toBe(400);
  const invalidCorrectionBody = await invalidCorrection.json();
  const invalidRightsDecision = await context.request.post(
    `${applicationUrl}/api/v1/admin/rights-decisions`,
    { data: {} },
  );
  expect(invalidRightsDecision.status()).toBe(400);
  const invalidRightsDecisionBody = await invalidRightsDecision.json();
  const invalidEntityMerge = await context.request.post(
    `${applicationUrl}/api/v1/admin/entities/merge`,
    { data: {} },
  );
  expect(invalidEntityMerge.status()).toBe(400);
  const invalidEntityMergeBody = await invalidEntityMerge.json();
  const invalidEditorialCase = await context.request.post(
    `${applicationUrl}/api/v1/admin/editorial-cases/restrict`,
    { data: {} },
  );
  expect(invalidEditorialCase.status()).toBe(400);
  const invalidEditorialCaseBody = await invalidEditorialCase.json();

  const eventCorrectionResponse = await context.request.post(
    `${applicationUrl}/api/v1/admin/corrections`,
    {
      data: {
        publicId: "correction-event-time-and-copy",
        case: caseRecord(
          "case-event-time-and-copy",
          "2026-08-30T08:40:00.000Z",
        ),
        target: { type: "event", publicId: "event-correction-canonical" },
        reasonCode: "factual_error",
        effectiveAt: "2026-08-30T09:00:00.000Z",
        replacementVersion:
          "event-correction-canonical@2026-08-30T09:00:00.000Z",
        evidenceSourceItemPublicIds: ["source-item-correction-official"],
        changes: {
          occurredAt: "2026-08-30T07:55:00.000Z",
          occurredAtPrecision: "minute",
          localizations: [
            {
              locale: "en",
              title: "Corrected canonical Event title",
              summary: "Corrected public Event summary.",
            },
            {
              locale: "zh",
              title: "已更正的规范事件标题",
              summary: "已更正的公开事件摘要。",
            },
          ],
        },
        internalNote: "Verified against the official timestamp.",
      },
    },
  );
  expect(eventCorrectionResponse.status()).toBe(201);
  expect(await eventCorrectionResponse.json()).toMatchObject({
    status: "corrected",
    publicId: "correction-event-time-and-copy",
    casePublicId: "case-event-time-and-copy",
    targetPublicId: "event-correction-canonical",
    changedFields: [
      "event.occurredAt",
      "event.occurredAtPrecision",
      "localization.en.title",
      "localization.en.summary",
      "localization.zh.title",
      "localization.zh.summary",
    ],
  });

  const entityCorrectionResponse = await context.request.post(
    `${applicationUrl}/api/v1/admin/corrections`,
    {
      data: {
        publicId: "correction-entity-name-and-copy",
        case: caseRecord(
          "case-entity-name-and-copy",
          "2026-08-30T08:45:00.000Z",
        ),
        target: { type: "entity", publicId: "model-correction-canonical" },
        reasonCode: "factual_error",
        effectiveAt: "2026-08-30T09:05:00.000Z",
        replacementVersion:
          "model-correction-canonical@2026-08-30T09:05:00.000Z",
        evidenceSourceItemPublicIds: ["source-item-correction-official"],
        changes: {
          officialName: "Model Correction",
          officialUrl: "https://models.example.test/model-correction",
          lastVerifiedAt: "2026-08-30T09:05:00.000Z",
          localizations: [
            {
              locale: "en",
              name: "Model Correction",
              summary: "Corrected public Entity summary.",
            },
            {
              locale: "zh",
              name: "更正模型",
              summary: "已更正的公开实体摘要。",
            },
          ],
        },
        internalNote: "Official product page confirms the canonical name.",
      },
    },
  );
  expect(entityCorrectionResponse.status()).toBe(201);

  const mergeEvents = await context.request.post(
    `${applicationUrl}/api/v1/admin/events/merge`,
    {
      data: {
        targetEventPublicId: "event-correction-canonical",
        sourceEventPublicId: "event-correction-duplicate",
        publicReasonCode: "duplicate_coverage",
        internalNote: "Same verified announcement.",
      },
    },
  );
  expect(mergeEvents.status()).toBe(200);

  const entityMergeResponse = await context.request.post(
    `${applicationUrl}/api/v1/admin/entities/merge`,
    {
      data: {
        targetEntityPublicId: "model-correction-canonical",
        sourceEntityPublicId: "model-correction-duplicate",
        publicReasonCode: "duplicate_identity",
        effectiveAt: "2026-08-30T09:10:00.000Z",
        internalNote: "Both profiles identify the same model.",
      },
    },
  );
  expect(entityMergeResponse.status()).toBe(200);
  expect(await entityMergeResponse.json()).toEqual({
    status: "merged",
    sourceEntityPublicId: "model-correction-duplicate",
    targetEntityPublicId: "model-correction-canonical",
  });

  const correctedEventResponse = await context.request.get(
    `${applicationUrl}/api/v1/events/event-correction-canonical?locale=en`,
  );
  expect(correctedEventResponse.status()).toBe(200);
  expect(await correctedEventResponse.json()).toMatchObject({
    publicId: "event-correction-canonical",
    factStatus: "corrected",
    occurredAt: "2026-08-30T07:55:00.000Z",
    occurredAtPrecision: "minute",
    localization: {
      title: "Corrected canonical Event title",
      summary: "Corrected public Event summary.",
    },
    corrections: [
      {
        publicId: "correction-event-time-and-copy",
        targetType: "event",
        reasonCode: "factual_error",
        evidence: [{ sourceItemPublicId: "source-item-correction-official" }],
      },
    ],
  });
  expect((await correctedEventResponse.json()).sources).toHaveLength(2);

  const correctedEntityResponse = await context.request.get(
    `${applicationUrl}/api/v1/entities/model-correction-canonical?locale=en`,
  );
  expect(correctedEntityResponse.status()).toBe(200);
  const correctedEntity = await correctedEntityResponse.json();
  expect(correctedEntity).toMatchObject({
    officialName: "Model Correction",
    officialUrl: "https://models.example.test/model-correction",
    localization: {
      name: "Model Correction",
      summary: "Corrected public Entity summary.",
    },
    corrections: [
      {
        publicId: "correction-entity-name-and-copy",
        targetType: "entity",
      },
    ],
  });
  expect(
    correctedEntity.aliases.map(
      ({ publicId }: { publicId: string }) => publicId,
    ),
  ).toContain("alias-model-correction-duplicate");
  expect(
    correctedEntity.versions.map(
      ({ publicId }: { publicId: string }) => publicId,
    ),
  ).toContain("version-model-correction-duplicate-v1");
  expect(correctedEntity.backlinks).toHaveLength(1);

  const movedAlias = await context.request.get(
    `${applicationUrl}/api/v1/entities/resolve?alias=Model%20Correction%20Duplicate%20Legacy&locale=en&type=model`,
  );
  expect(movedAlias.status()).toBe(200);
  expect(await movedAlias.json()).toMatchObject({
    publicId: "model-correction-canonical",
    matchedAlias: "Model Correction Duplicate Legacy",
  });
  const movedVersion = await context.request.get(
    `${applicationUrl}/api/v1/entity-versions/version-model-correction-duplicate-v1?locale=en`,
  );
  expect(movedVersion.status()).toBe(200);
  expect(await movedVersion.json()).toMatchObject({
    publicId: "version-model-correction-duplicate-v1",
    entityPublicId: "model-correction-canonical",
  });

  const mergedEntityTombstone = await context.request.get(
    `${applicationUrl}/api/v1/entities/model-correction-duplicate?locale=en`,
  );
  expect(mergedEntityTombstone.status()).toBe(200);
  expect(await mergedEntityTombstone.json()).toEqual({
    publicId: "model-correction-duplicate",
    objectType: "entity",
    status: "merged_into",
    targetEntityPublicId: "model-correction-canonical",
    reasonCode: "duplicate_identity",
    effectiveAt: "2026-08-30T09:10:00.000Z",
  });

  await page.goto(
    `${applicationUrl}/en/radar/events/event-correction-canonical`,
  );
  await expect(
    page.getByRole("heading", { name: "Corrections" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Corrected canonical Event title",
      exact: true,
    }),
  ).toBeVisible();
  await page.goto(`${applicationUrl}/en/entities/model-correction-canonical`);
  await expect(
    page.getByRole("heading", { name: "Corrections" }),
  ).toBeVisible();
  await expect(page.getByText("Model Correction").first()).toBeVisible();
  await page.goto(`${applicationUrl}/en/entities/model-correction-duplicate`);
  await expect(
    page.getByRole("heading", { name: "Entity merged" }),
  ).toBeVisible();
  await expect(page.getByText("model-correction-canonical")).toBeVisible();
  await expect(page.getByText("original public profile")).toHaveCount(0);

  await createEntity({
    publicId: "model-concurrent-merge-a",
    officialName: "Concurrent Merge A",
    aliasPublicId: "alias-concurrent-merge-a",
    versionPublicId: "version-concurrent-merge-a",
  });
  await createEntity({
    publicId: "model-concurrent-merge-b",
    officialName: "Concurrent Merge B",
    aliasPublicId: "alias-concurrent-merge-b",
    versionPublicId: "version-concurrent-merge-b",
  });
  const concurrentEntityMerges = await Promise.all([
    context.request.post(`${applicationUrl}/api/v1/admin/entities/merge`, {
      data: {
        targetEntityPublicId: "model-concurrent-merge-a",
        sourceEntityPublicId: "model-concurrent-merge-b",
        publicReasonCode: "duplicate_identity",
        effectiveAt: "2026-08-30T09:12:00.000Z",
        internalNote: "Concurrent A target check.",
      },
    }),
    context.request.post(`${applicationUrl}/api/v1/admin/entities/merge`, {
      data: {
        targetEntityPublicId: "model-concurrent-merge-b",
        sourceEntityPublicId: "model-concurrent-merge-a",
        publicReasonCode: "duplicate_identity",
        effectiveAt: "2026-08-30T09:12:00.000Z",
        internalNote: "Concurrent B target check.",
      },
    }),
  ]);
  expect(
    concurrentEntityMerges.map((response) => response.status()).sort(),
  ).toEqual([200, 409]);
  const concurrentEntityStates = await Promise.all(
    ["model-concurrent-merge-a", "model-concurrent-merge-b"].map(
      async (publicId) =>
        (
          await context.request.get(
            `${applicationUrl}/api/v1/entities/${publicId}?locale=en`,
          )
        ).json(),
    ),
  );
  const concurrentTombstones = concurrentEntityStates.filter(
    ({ status }) => status === "merged_into",
  );
  expect(concurrentTombstones).toHaveLength(1);
  const concurrentSurvivors = concurrentEntityStates.filter(
    ({ lifecycleStatus }) => lifecycleStatus === "active",
  );
  expect(concurrentSurvivors).toHaveLength(1);
  expect(concurrentTombstones[0].targetEntityPublicId).toBe(
    concurrentSurvivors[0].publicId,
  );

  await createAndPublishEvent({
    eventPublicId: "event-high-risk-review",
    sourcePublicId: "review-official",
    sourceItemPublicId: "source-item-high-risk-review",
    isOriginalSource: true,
  });
  const restrictForReview = await context.request.post(
    `${applicationUrl}/api/v1/admin/editorial-cases/restrict`,
    {
      data: {
        case: caseRecord("case-high-risk-review", "2026-08-30T09:12:30.000Z"),
        kind: "correction",
        priority: "critical",
        target: { type: "event", publicId: "event-high-risk-review" },
        internalNote: "Restrict propagation while the claim is verified.",
      },
    },
  );
  expect(restrictForReview.status()).toBe(201);
  const reviewingEvent = await context.request.get(
    `${applicationUrl}/api/v1/events/event-high-risk-review?locale=en`,
  );
  expect(await reviewingEvent.json()).toEqual({
    publicId: "event-high-risk-review",
    objectType: "event",
    status: "reviewing",
    reasonCode: "high_risk_review",
    effectiveAt: "2026-08-30T09:12:30.000Z",
    caseReferencePublicId: "case-high-risk-review",
  });
  await page.goto(`${applicationUrl}/en/radar/events/event-high-risk-review`);
  await expect(
    page.getByRole("heading", { name: "Event under review" }),
  ).toBeVisible();
  await expect(page.getByText("original restricted expression")).toHaveCount(0);

  const resolveReview = await context.request.post(
    `${applicationUrl}/api/v1/admin/corrections`,
    {
      data: {
        publicId: "correction-high-risk-review",
        case: { publicId: "case-high-risk-review" },
        target: { type: "event", publicId: "event-high-risk-review" },
        reasonCode: "factual_error",
        effectiveAt: "2026-08-30T09:13:00.000Z",
        replacementVersion: "event-high-risk-review@2026-08-30T09:13:00.000Z",
        evidenceSourceItemPublicIds: ["source-item-high-risk-review"],
        changes: {
          localizations: [
            {
              locale: "en",
              title: "Reviewed high-risk Event",
              summary: "Verified public summary after review.",
            },
            {
              locale: "zh",
              title: "已核验的高风险事件",
              summary: "核验后恢复的公开摘要。",
            },
          ],
        },
        internalNote: "The official evidence resolved the case.",
      },
    },
  );
  expect(resolveReview.status()).toBe(201);
  const resolvedReviewEvent = await context.request.get(
    `${applicationUrl}/api/v1/events/event-high-risk-review?locale=en`,
  );
  expect(await resolvedReviewEvent.json()).toMatchObject({
    publicId: "event-high-risk-review",
    localization: { title: "Reviewed high-risk Event" },
    corrections: [
      expect.objectContaining({
        publicId: "correction-high-risk-review",
        casePublicId: "case-high-risk-review",
      }),
    ],
  });

  await createAndPublishEvent({
    eventPublicId: "event-rejected-review",
    sourcePublicId: "rejected-review-official",
    sourceItemPublicId: "source-item-rejected-review",
    isOriginalSource: true,
  });
  const restrictRejectedReview = await context.request.post(
    `${applicationUrl}/api/v1/admin/editorial-cases/restrict`,
    {
      data: {
        case: caseRecord("case-rejected-review", "2026-08-30T09:13:01.000Z"),
        kind: "rights",
        priority: "high",
        target: { type: "event", publicId: "event-rejected-review" },
        internalNote: "Temporarily restrict while checking the request.",
      },
    },
  );
  expect(restrictRejectedReview.status()).toBe(201);
  const earlyRejection = await context.request.patch(
    `${applicationUrl}/api/v1/admin/editorial-cases/case-rejected-review`,
    {
      data: {
        transition: "reject",
        occurredAt: "2026-08-30T09:13:00.000Z",
        internalNote: "This decision predates receipt and must be rejected.",
      },
    },
  );
  expect(earlyRejection.status()).toBe(409);
  const rejectReview = await context.request.patch(
    `${applicationUrl}/api/v1/admin/editorial-cases/case-rejected-review`,
    {
      data: {
        transition: "reject",
        occurredAt: "2026-08-30T09:13:02.000Z",
        internalNote: "The evidence did not support the request.",
      },
    },
  );
  expect(await rejectReview.json()).toMatchObject({
    status: "rejected",
    casePublicId: "case-rejected-review",
  });
  const restoredRejectedReview = await context.request.get(
    `${applicationUrl}/api/v1/events/event-rejected-review?locale=en`,
  );
  expect(await restoredRejectedReview.json()).toMatchObject({
    publicId: "event-rejected-review",
    localization: {
      title: "event-rejected-review original title",
      summary: "event-rejected-review original restricted expression.",
    },
  });
  const appealBeforeDecision = await context.request.patch(
    `${applicationUrl}/api/v1/admin/editorial-cases/case-rejected-review`,
    {
      data: {
        transition: "appeal",
        occurredAt: "2026-08-30T09:13:01.500Z",
        internalNote: "An appeal cannot predate the recorded decision.",
      },
    },
  );
  expect(appealBeforeDecision.status()).toBe(409);
  for (const [transition, occurredAt, expectedStatus] of [
    ["appeal", "2026-08-30T09:13:03.000Z", "appealed"],
  ] as const) {
    const response = await context.request.patch(
      `${applicationUrl}/api/v1/admin/editorial-cases/case-rejected-review`,
      {
        data: {
          transition,
          occurredAt,
          internalNote: `Record ${transition} transition.`,
        },
      },
    );
    expect(await response.json()).toMatchObject({ status: expectedStatus });
  }
  const closeBeforeAppeal = await context.request.patch(
    `${applicationUrl}/api/v1/admin/editorial-cases/case-rejected-review`,
    {
      data: {
        transition: "close",
        occurredAt: "2026-08-30T09:13:02.500Z",
        internalNote: "Closure cannot predate the recorded appeal.",
      },
    },
  );
  expect(closeBeforeAppeal.status()).toBe(409);
  const closeReview = await context.request.patch(
    `${applicationUrl}/api/v1/admin/editorial-cases/case-rejected-review`,
    {
      data: {
        transition: "close",
        occurredAt: "2026-08-30T09:13:04.000Z",
        internalNote: "Close the completed appeal lifecycle.",
      },
    },
  );
  expect(await closeReview.json()).toMatchObject({ status: "closed" });

  await createAndPublishEvent({
    eventPublicId: "event-atomic-correction",
    sourcePublicId: "atomic-official",
    sourceItemPublicId: "source-item-atomic-correction",
    isOriginalSource: true,
  });
  const atomicDatabase = new Client({
    connectionString: application.databaseUrl,
  });
  await atomicDatabase.connect();
  try {
    await atomicDatabase.query(
      "delete from localized_contents where event_id = (select id from events where public_id = 'event-atomic-correction') and locale = 'zh'",
    );
  } finally {
    await atomicDatabase.end();
  }
  const incompleteCorrection = await context.request.post(
    `${applicationUrl}/api/v1/admin/corrections`,
    {
      data: {
        publicId: "correction-must-be-atomic",
        case: caseRecord(
          "case-correction-must-be-atomic",
          "2026-08-30T09:13:10.000Z",
        ),
        target: { type: "event", publicId: "event-atomic-correction" },
        reasonCode: "factual_error",
        effectiveAt: "2026-08-30T09:13:20.000Z",
        replacementVersion: "event-atomic-correction@2026-08-30T09:13:20.000Z",
        evidenceSourceItemPublicIds: ["source-item-atomic-correction"],
        changes: {
          occurredAt: "2026-08-30T07:45:00.000Z",
          occurredAtPrecision: "minute",
          localizations: [
            {
              locale: "en",
              title: "Atomic correction English",
              summary: "This write must not commit alone.",
            },
            {
              locale: "zh",
              title: "原子更正中文",
              summary: "此写入不可单独提交。",
            },
          ],
        },
        internalNote: "Exercise preflight validation before the first write.",
      },
    },
  );
  expect(incompleteCorrection.status()).toBe(409);
  const atomicVerificationDatabase = new Client({
    connectionString: application.databaseUrl,
  });
  await atomicVerificationDatabase.connect();
  try {
    const atomicState = await atomicVerificationDatabase.query(
      "select occurred_at, occurred_at_precision from events where public_id = 'event-atomic-correction'",
    );
    expect(atomicState.rows[0]).toMatchObject({
      occurred_at: new Date("2026-08-30T08:00:00.000Z"),
      occurred_at_precision: "second",
    });
    const partialRecords = await atomicVerificationDatabase.query(
      "select (select count(*) from corrections where public_id = 'correction-must-be-atomic') as corrections, (select count(*) from editorial_cases where public_id = 'case-correction-must-be-atomic') as cases",
    );
    expect(partialRecords.rows[0]).toEqual({ corrections: "0", cases: "0" });
  } finally {
    await atomicVerificationDatabase.end();
  }

  await createAndPublishEvent({
    eventPublicId: "event-concurrent-source-a",
    sourcePublicId: "concurrent-source-a",
    sourceItemPublicId: "source-item-concurrent-a",
    isOriginalSource: true,
  });
  await createAndPublishEvent({
    eventPublicId: "event-concurrent-source-b",
    sourcePublicId: "concurrent-source-b",
    sourceItemPublicId: "source-item-concurrent-b",
    isOriginalSource: false,
  });
  const mergeConcurrentSources = await context.request.post(
    `${applicationUrl}/api/v1/admin/events/merge`,
    {
      data: {
        targetEventPublicId: "event-concurrent-source-a",
        sourceEventPublicId: "event-concurrent-source-b",
        publicReasonCode: "duplicate_coverage",
        internalNote:
          "Create one Event with two independently withdrawable sources.",
      },
    },
  );
  expect(mergeConcurrentSources.status()).toBe(200);
  const concurrentSourceWithdrawals = await Promise.all(
    ["a", "b"].map((suffix) =>
      context.request.post(`${applicationUrl}/api/v1/admin/rights-decisions`, {
        data: {
          publicId: `rights-concurrent-source-${suffix}`,
          case: caseRecord(
            `case-concurrent-source-${suffix}`,
            "2026-08-30T09:13:30.000Z",
          ),
          target: {
            type: "source_item",
            publicId: `source-item-concurrent-${suffix}`,
          },
          toStatus: "withdrawn",
          publicReasonCode: "source_withdrawal",
          effectiveAt: "2026-08-30T09:14:00.000Z",
          internalNote: `Concurrent withdrawal ${suffix}.`,
        },
      }),
    ),
  );
  expect(
    concurrentSourceWithdrawals.map((response) => response.status()).sort(),
  ).toEqual([201, 201]);
  const eventAfterConcurrentSourceWithdrawals = await context.request.get(
    `${applicationUrl}/api/v1/events/event-concurrent-source-a?locale=en`,
  );
  expect(await eventAfterConcurrentSourceWithdrawals.json()).toMatchObject({
    publicId: "event-concurrent-source-a",
    status: "source_withdrawn",
    reasonCode: "source_withdrawal",
  });

  await createAndPublishEvent({
    eventPublicId: "event-sequential-source-a",
    sourcePublicId: "sequential-source-a",
    sourceItemPublicId: "source-item-sequential-a",
    isOriginalSource: true,
  });
  await createAndPublishEvent({
    eventPublicId: "event-sequential-source-b",
    sourcePublicId: "sequential-source-b",
    sourceItemPublicId: "source-item-sequential-b",
    isOriginalSource: false,
  });
  expect(
    (
      await context.request.post(
        `${applicationUrl}/api/v1/admin/events/merge`,
        {
          data: {
            targetEventPublicId: "event-sequential-source-a",
            sourceEventPublicId: "event-sequential-source-b",
            publicReasonCode: "duplicate_coverage",
            internalNote: "Prepare sequential source withdrawal chronology.",
          },
        },
      )
    ).status(),
  ).toBe(200);
  const firstSequentialWithdrawal = await context.request.post(
    `${applicationUrl}/api/v1/admin/rights-decisions`,
    {
      data: {
        publicId: "rights-sequential-source-a",
        case: caseRecord(
          "case-sequential-source-a",
          "2026-08-30T09:14:25.000Z",
        ),
        target: { type: "source_item", publicId: "source-item-sequential-a" },
        toStatus: "withdrawn",
        publicReasonCode: "source_withdrawal",
        effectiveAt: "2026-08-30T09:14:30.000Z",
        internalNote: "Advance the Event verification timeline.",
      },
    },
  );
  expect(firstSequentialWithdrawal.status()).toBe(201);
  const staleSequentialWithdrawal = await context.request.post(
    `${applicationUrl}/api/v1/admin/rights-decisions`,
    {
      data: {
        publicId: "rights-sequential-source-b-stale",
        case: caseRecord(
          "case-sequential-source-b-stale",
          "2026-08-30T09:14:15.000Z",
        ),
        target: { type: "source_item", publicId: "source-item-sequential-b" },
        toStatus: "withdrawn",
        publicReasonCode: "source_withdrawal",
        effectiveAt: "2026-08-30T09:14:20.000Z",
        internalNote: "Must not move the Event verification time backwards.",
      },
    },
  );
  expect(staleSequentialWithdrawal.status()).toBe(409);

  await createAndPublishEvent({
    eventPublicId: "event-shared-evidence-a",
    sourcePublicId: "shared-evidence-source-a",
    sourceItemPublicId: "source-item-shared-evidence-a",
    isOriginalSource: true,
  });
  await createAndPublishEvent({
    eventPublicId: "event-shared-evidence-b",
    sourcePublicId: "shared-evidence-source-b",
    sourceItemPublicId: "source-item-shared-evidence-b",
    isOriginalSource: false,
  });
  await createEntity({
    publicId: "organization-shared-evidence",
    officialName: "Shared Evidence Organization",
    aliasPublicId: "alias-organization-shared-evidence",
    versionPublicId: "version-organization-shared-evidence-v1",
    type: "organization",
  });
  const sharedEvidenceRelation = await context.request.post(
    `${applicationUrl}/api/v1/admin/relations`,
    {
      data: {
        relation: {
          publicId: "relation-shared-withdrawal-evidence",
          subject: {
            type: "entity",
            publicId: "organization-shared-evidence",
          },
          predicate: "DEVELOPS",
          objectEntityPublicId: "model-correction-canonical",
          validFrom: "2026-08-30T08:00:00.000Z",
          validTo: null,
          firstVerifiedAt: "2026-08-30T08:30:00.000Z",
          lastVerifiedAt: "2026-08-30T08:30:00.000Z",
          confidence: 90,
          reviewStatus: "reviewed",
          creationMethod: "editor",
          rightsStatus: "open",
        },
        evidenceSourceItemPublicIds: [
          "source-item-shared-evidence-a",
          "source-item-shared-evidence-b",
        ],
      },
    },
  );
  expect(sharedEvidenceRelation.status()).toBe(201);
  for (const suffix of ["a", "b"] as const) {
    const relation = await context.request.post(
      `${applicationUrl}/api/v1/admin/relations`,
      {
        data: {
          relation: {
            publicId: `relation-shared-event-${suffix}`,
            subject: {
              type: "event",
              publicId: `event-shared-evidence-${suffix}`,
            },
            predicate: "ANNOUNCES",
            objectEntityPublicId: "model-correction-canonical",
            validFrom: "2026-08-30T08:00:00.000Z",
            validTo: null,
            firstVerifiedAt: "2026-08-30T08:30:00.000Z",
            lastVerifiedAt: "2026-08-30T08:30:00.000Z",
            confidence: 90,
            reviewStatus: "reviewed",
            creationMethod: "editor",
            rightsStatus: "open",
          },
          evidenceSourceItemPublicIds: [
            `source-item-shared-evidence-${suffix}`,
          ],
        },
      },
    );
    expect(relation.status()).toBe(201);
  }
  const sharedEvidenceDatabase = new Client({
    connectionString: application.databaseUrl,
  });
  await sharedEvidenceDatabase.connect();
  try {
    await sharedEvidenceDatabase.query(`
      insert into relation_evidence (relation_id, source_item_id)
      select relation.id, source_item.id
      from relations relation
      cross join source_items source_item
      where
        (relation.public_id = 'relation-shared-event-a'
          and source_item.public_id = 'source-item-shared-evidence-b')
        or
        (relation.public_id = 'relation-shared-event-b'
          and source_item.public_id = 'source-item-shared-evidence-a');
    `);
    await sharedEvidenceDatabase.query(`
      create function pause_shared_evidence_withdrawal() returns trigger
      language plpgsql as $$
      begin
        if new.public_id like 'source-item-shared-evidence-%'
          and new.public_visibility = false then
          perform pg_sleep(0.25);
        end if;
        return new;
      end;
      $$;
      create trigger pause_shared_evidence_withdrawal
      after update on source_items
      for each row execute function pause_shared_evidence_withdrawal();
    `);
    const sharedEvidenceWithdrawals = await Promise.all(
      ["a", "b"].map((suffix) =>
        context.request.post(
          `${applicationUrl}/api/v1/admin/rights-decisions`,
          {
            data: {
              publicId: `rights-shared-evidence-${suffix}`,
              case: caseRecord(
                `case-shared-evidence-${suffix}`,
                "2026-08-30T09:14:35.000Z",
              ),
              target: {
                type: "source_item",
                publicId: `source-item-shared-evidence-${suffix}`,
              },
              toStatus: "withdrawn",
              publicReasonCode: "source_withdrawal",
              effectiveAt: "2026-08-30T09:14:40.000Z",
              internalNote: `Withdraw shared Relation evidence ${suffix}.`,
            },
          },
        ),
      ),
    );
    expect(
      sharedEvidenceWithdrawals.map((response) => response.status()).sort(),
    ).toEqual([201, 201]);
    const relation = await sharedEvidenceDatabase.query(
      "select public_visibility from relations where public_id = 'relation-shared-withdrawal-evidence'",
    );
    expect(relation.rows[0]).toEqual({ public_visibility: false });
  } finally {
    await sharedEvidenceDatabase.query(
      "drop trigger pause_shared_evidence_withdrawal on source_items; drop function pause_shared_evidence_withdrawal();",
    );
    await sharedEvidenceDatabase.end();
  }

  await createAndPublishEvent({
    eventPublicId: "event-create-relation-race",
    sourcePublicId: "create-relation-race-source",
    sourceItemPublicId: "source-item-create-relation-race",
    isOriginalSource: true,
  });
  await createEntity({
    publicId: "model-create-endpoint-race",
    officialName: "Model Create Endpoint Race",
    aliasPublicId: "alias-model-create-endpoint-race",
    versionPublicId: "version-model-create-endpoint-race-v1",
  });
  await createAndPublishEvent({
    eventPublicId: "event-create-endpoint-race",
    sourcePublicId: "create-endpoint-race-source",
    sourceItemPublicId: "source-item-create-endpoint-race",
    isOriginalSource: true,
  });
  const createRelationRaceDatabase = new Client({
    connectionString: application.databaseUrl,
  });
  await createRelationRaceDatabase.connect();
  try {
    await createRelationRaceDatabase.query(`
      create function pause_relation_insert() returns trigger
      language plpgsql as $$
      begin
        perform pg_sleep(1);
        return new;
      end;
      $$;
      create trigger pause_relation_insert
      before insert on relations
      for each row execute function pause_relation_insert();
    `);
    const relationCreation = context.request.post(
      `${applicationUrl}/api/v1/admin/relations`,
      {
        data: {
          relation: {
            publicId: "relation-create-withdrawal-race",
            subject: {
              type: "entity",
              publicId: "organization-shared-evidence",
            },
            predicate: "DEVELOPS",
            objectEntityPublicId: "model-correction-canonical",
            validFrom: "2026-08-30T08:00:00.000Z",
            validTo: null,
            firstVerifiedAt: "2026-08-30T08:30:00.000Z",
            lastVerifiedAt: "2026-08-30T08:30:00.000Z",
            confidence: 90,
            reviewStatus: "reviewed",
            creationMethod: "editor",
            rightsStatus: "open",
          },
          evidenceSourceItemPublicIds: ["source-item-create-relation-race"],
        },
      },
    );
    let creationIsPaused = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const pauseState = await createRelationRaceDatabase.query(
        "select exists (select 1 from pg_stat_activity where datname = current_database() and wait_event = 'PgSleep' and query like '%relations%') as paused",
      );
      creationIsPaused = pauseState.rows[0].paused;
      if (creationIsPaused) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(creationIsPaused).toBe(true);
    const sourceWithdrawal = context.request.post(
      `${applicationUrl}/api/v1/admin/rights-decisions`,
      {
        data: {
          publicId: "rights-create-relation-race",
          case: caseRecord(
            "case-create-relation-race",
            "2026-08-30T09:14:45.000Z",
          ),
          target: {
            type: "source_item",
            publicId: "source-item-create-relation-race",
          },
          toStatus: "withdrawn",
          publicReasonCode: "source_withdrawal",
          effectiveAt: "2026-08-30T09:14:50.000Z",
          internalNote: "Race Relation creation against its only Evidence.",
        },
      },
    );
    const [creationResponse, withdrawalResponse] = await Promise.all([
      relationCreation,
      sourceWithdrawal,
    ]);
    expect(creationResponse.status()).toBe(201);
    expect(withdrawalResponse.status()).toBe(201);
    const relation = await createRelationRaceDatabase.query(
      "select public_visibility from relations where public_id = 'relation-create-withdrawal-race'",
    );
    expect(relation.rows[0]).toEqual({ public_visibility: false });

    const entityEndpointRelationCreation = context.request.post(
      `${applicationUrl}/api/v1/admin/relations`,
      {
        data: {
          relation: {
            publicId: "relation-create-entity-endpoint-race",
            subject: {
              type: "entity",
              publicId: "organization-shared-evidence",
            },
            predicate: "DEVELOPS",
            objectEntityPublicId: "model-create-endpoint-race",
            validFrom: "2026-08-30T08:00:00.000Z",
            validTo: null,
            firstVerifiedAt: "2026-08-30T08:30:00.000Z",
            lastVerifiedAt: "2026-08-30T08:30:00.000Z",
            confidence: 90,
            reviewStatus: "reviewed",
            creationMethod: "editor",
            rightsStatus: "open",
          },
          evidenceSourceItemPublicIds: ["source-item-create-endpoint-race"],
        },
      },
    );
    let entityEndpointCreationIsPaused = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const pauseState = await createRelationRaceDatabase.query(
        "select exists (select 1 from pg_stat_activity where datname = current_database() and wait_event = 'PgSleep' and query like '%relations%') as paused",
      );
      entityEndpointCreationIsPaused = pauseState.rows[0].paused;
      if (entityEndpointCreationIsPaused) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(entityEndpointCreationIsPaused).toBe(true);
    const entityEndpointWithdrawal = context.request.post(
      `${applicationUrl}/api/v1/admin/rights-decisions`,
      {
        data: {
          publicId: "rights-create-entity-endpoint-race",
          case: caseRecord(
            "case-create-entity-endpoint-race",
            "2026-08-30T09:14:55.000Z",
          ),
          target: {
            type: "entity",
            publicId: "model-create-endpoint-race",
          },
          toStatus: "withdrawn",
          publicReasonCode: "rights_withdrawal",
          effectiveAt: "2026-08-30T09:15:00.000Z",
          internalNote: "Race Relation creation against its Entity endpoint.",
        },
      },
    );
    const [entityCreationResponse, entityWithdrawalResponse] =
      await Promise.all([
        entityEndpointRelationCreation,
        entityEndpointWithdrawal,
      ]);
    expect(entityCreationResponse.status()).toBe(201);
    expect(entityWithdrawalResponse.status()).toBe(201);
    const entityEndpointRelation = await createRelationRaceDatabase.query(
      "select public_visibility from relations where public_id = 'relation-create-entity-endpoint-race'",
    );
    expect(entityEndpointRelation.rows[0]).toEqual({
      public_visibility: false,
    });

    const eventEndpointRelationCreation = context.request.post(
      `${applicationUrl}/api/v1/admin/relations`,
      {
        data: {
          relation: {
            publicId: "relation-create-event-endpoint-race",
            subject: {
              type: "event",
              publicId: "event-create-endpoint-race",
            },
            predicate: "ANNOUNCES",
            objectEntityPublicId: "model-correction-canonical",
            validFrom: "2026-08-30T08:00:00.000Z",
            validTo: null,
            firstVerifiedAt: "2026-08-30T08:30:00.000Z",
            lastVerifiedAt: "2026-08-30T08:30:00.000Z",
            confidence: 90,
            reviewStatus: "reviewed",
            creationMethod: "editor",
            rightsStatus: "open",
          },
          evidenceSourceItemPublicIds: ["source-item-create-endpoint-race"],
        },
      },
    );
    let eventEndpointCreationIsPaused = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const pauseState = await createRelationRaceDatabase.query(
        "select exists (select 1 from pg_stat_activity where datname = current_database() and wait_event = 'PgSleep' and query like '%relations%') as paused",
      );
      eventEndpointCreationIsPaused = pauseState.rows[0].paused;
      if (eventEndpointCreationIsPaused) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(eventEndpointCreationIsPaused).toBe(true);
    const eventEndpointWithdrawal = context.request.post(
      `${applicationUrl}/api/v1/admin/rights-decisions`,
      {
        data: {
          publicId: "rights-create-event-endpoint-race",
          case: caseRecord(
            "case-create-event-endpoint-race",
            "2026-08-30T09:15:05.000Z",
          ),
          target: {
            type: "event",
            publicId: "event-create-endpoint-race",
          },
          toStatus: "withdrawn",
          publicReasonCode: "rights_withdrawal",
          effectiveAt: "2026-08-30T09:15:10.000Z",
          internalNote: "Race Relation creation against its Event endpoint.",
        },
      },
    );
    const [eventCreationResponse, eventWithdrawalResponse] = await Promise.all([
      eventEndpointRelationCreation,
      eventEndpointWithdrawal,
    ]);
    expect(eventCreationResponse.status()).toBe(201);
    expect(eventWithdrawalResponse.status()).toBe(201);
    const eventEndpointRelation = await createRelationRaceDatabase.query(
      "select public_visibility from relations where public_id = 'relation-create-event-endpoint-race'",
    );
    expect(eventEndpointRelation.rows[0]).toEqual({
      public_visibility: false,
    });
  } finally {
    await createRelationRaceDatabase.query(
      "drop trigger pause_relation_insert on relations; drop function pause_relation_insert();",
    );
    await createRelationRaceDatabase.end();
  }

  await createAndPublishEvent({
    eventPublicId: "event-split-race-a",
    sourcePublicId: "split-race-source-a",
    sourceItemPublicId: "source-item-split-race-a",
    isOriginalSource: true,
  });
  await createAndPublishEvent({
    eventPublicId: "event-split-race-b",
    sourcePublicId: "split-race-source-b",
    sourceItemPublicId: "source-item-split-race-b",
    isOriginalSource: false,
  });
  const mergeSplitRace = await context.request.post(
    `${applicationUrl}/api/v1/admin/events/merge`,
    {
      data: {
        targetEventPublicId: "event-split-race-a",
        sourceEventPublicId: "event-split-race-b",
        publicReasonCode: "duplicate_coverage",
        internalNote: "Prepare concurrent split and source withdrawal.",
      },
    },
  );
  expect(mergeSplitRace.status()).toBe(200);
  const [splitRace, withdrawalRace] = await Promise.all([
    context.request.post(`${applicationUrl}/api/v1/admin/events/split`, {
      data: {
        mergedEventPublicId: "event-split-race-b",
        internalNote: "Race the split against a source withdrawal.",
      },
    }),
    context.request.post(`${applicationUrl}/api/v1/admin/rights-decisions`, {
      data: {
        publicId: "rights-split-race-source-b",
        case: caseRecord(
          "case-split-race-source-b",
          "2026-08-30T09:14:10.000Z",
        ),
        target: {
          type: "source_item",
          publicId: "source-item-split-race-b",
        },
        toStatus: "withdrawn",
        publicReasonCode: "source_withdrawal",
        effectiveAt: "2026-08-30T09:14:20.000Z",
        internalNote: "Race the withdrawal against Event split.",
      },
    }),
  ]);
  const raceStatuses = [splitRace.status(), withdrawalRace.status()];
  expect(raceStatuses).not.toContain(500);
  expect(
    (
      [
        [200, 409],
        [409, 201],
      ] as const
    ).some(
      ([splitStatus, withdrawalStatus]) =>
        splitRace.status() === splitStatus &&
        withdrawalRace.status() === withdrawalStatus,
    ),
  ).toBe(true);

  const sourceWithdrawal = await context.request.post(
    `${applicationUrl}/api/v1/admin/rights-decisions`,
    {
      data: {
        publicId: "rights-source-wire-withdrawal",
        case: caseRecord(
          "case-source-wire-withdrawal",
          "2026-08-30T09:14:00.000Z",
        ),
        target: {
          type: "source_item",
          publicId: "source-item-correction-wire",
        },
        toStatus: "withdrawn",
        publicReasonCode: "source_withdrawal",
        effectiveAt: "2026-08-30T09:15:00.000Z",
        internalNote: "The wire source withdrew this item.",
      },
    },
  );
  expect(sourceWithdrawal.status()).toBe(201);
  expect(await sourceWithdrawal.json()).toMatchObject({
    status: "applied",
    publicId: "rights-source-wire-withdrawal",
    casePublicId: "case-source-wire-withdrawal",
    targetType: "source_item",
    targetPublicId: "source-item-correction-wire",
    fromStatus: "open",
    toStatus: "withdrawn",
  });

  const eventAfterSourceWithdrawal = await (
    await context.request.get(
      `${applicationUrl}/api/v1/events/event-correction-canonical?locale=en`,
    )
  ).json();
  expect(eventAfterSourceWithdrawal.sources).toHaveLength(1);
  expect(eventAfterSourceWithdrawal.sources[0].sourceItemPublicId).toBe(
    "source-item-correction-official",
  );
  expect(eventAfterSourceWithdrawal.rightsDecisions).toEqual([
    expect.objectContaining({
      publicId: "rights-source-wire-withdrawal",
      targetType: "source_item",
      reasonCode: "source_withdrawal",
    }),
  ]);
  expect(eventAfterSourceWithdrawal.sourceStatus).toBe("source_withdrawn");
  expect(eventAfterSourceWithdrawal.evidenceConfidence).toBe("high");

  const splitAfterWithdrawal = await context.request.post(
    `${applicationUrl}/api/v1/admin/events/split`,
    {
      data: {
        mergedEventPublicId: "event-correction-duplicate",
        internalNote:
          "A withdrawn partition must not be restored without public evidence.",
      },
    },
  );
  expect(splitAfterWithdrawal.status()).toBe(409);
  const stillMergedAfterWithdrawal = await context.request.get(
    `${applicationUrl}/api/v1/events/event-correction-duplicate?locale=en`,
  );
  expect(await stillMergedAfterWithdrawal.json()).toMatchObject({
    status: "merged_into",
    targetEventPublicId: "event-correction-canonical",
  });

  const entityAfterSourceWithdrawal = await (
    await context.request.get(
      `${applicationUrl}/api/v1/entities/model-correction-canonical?locale=en`,
    )
  ).json();
  expect(entityAfterSourceWithdrawal.backlinks).toHaveLength(0);

  const entityWithdrawal = await context.request.post(
    `${applicationUrl}/api/v1/admin/rights-decisions`,
    {
      data: {
        publicId: "rights-entity-withdrawal",
        case: caseRecord("case-entity-withdrawal", "2026-08-30T09:18:00.000Z"),
        target: { type: "entity", publicId: "model-correction-canonical" },
        toStatus: "withdrawn",
        publicReasonCode: "rights_withdrawal",
        effectiveAt: "2026-08-30T09:20:00.000Z",
        internalNote: "Rights holder requested removal of protected copy.",
      },
    },
  );
  expect(entityWithdrawal.status()).toBe(201);

  const eventWithdrawal = await context.request.post(
    `${applicationUrl}/api/v1/admin/rights-decisions`,
    {
      data: {
        publicId: "rights-event-withdrawal",
        case: caseRecord("case-event-withdrawal", "2026-08-30T09:23:00.000Z"),
        target: { type: "event", publicId: "event-correction-canonical" },
        toStatus: "withdrawn",
        publicReasonCode: "rights_withdrawal",
        effectiveAt: "2026-08-30T09:25:00.000Z",
        internalNote: "Restricted expression must no longer be distributed.",
      },
    },
  );
  expect(eventWithdrawal.status()).toBe(201);

  const withdrawnEvent = await context.request.get(
    `${applicationUrl}/api/v1/events/event-correction-canonical?locale=en`,
  );
  expect(withdrawnEvent.status()).toBe(200);
  expect(await withdrawnEvent.json()).toEqual({
    publicId: "event-correction-canonical",
    objectType: "event",
    status: "withdrawn",
    reasonCode: "rights_withdrawal",
    effectiveAt: "2026-08-30T09:25:00.000Z",
    caseReferencePublicId: "case-event-withdrawal",
  });

  const withdrawnEntity = await context.request.get(
    `${applicationUrl}/api/v1/entities/model-correction-canonical?locale=en`,
  );
  expect(withdrawnEntity.status()).toBe(200);
  expect(await withdrawnEntity.json()).toEqual({
    publicId: "model-correction-canonical",
    objectType: "entity",
    status: "withdrawn",
    reasonCode: "rights_withdrawal",
    effectiveAt: "2026-08-30T09:20:00.000Z",
    caseReferencePublicId: "case-entity-withdrawal",
  });

  await page.goto(
    `${applicationUrl}/zh/radar/events/event-correction-canonical`,
  );
  await expect(page.getByRole("heading", { name: "事件已撤回" })).toBeVisible();
  await expect(page.getByText("已更正的公开事件摘要。")).toHaveCount(0);
  await page.goto(`${applicationUrl}/zh/entities/model-correction-canonical`);
  await expect(page.getByRole("heading", { name: "实体已撤回" })).toBeVisible();
  await expect(page.getByText("已更正的公开实体摘要。")).toHaveCount(0);

  const correctionResource = await context.request.get(
    `${applicationUrl}/api/v1/corrections/correction-event-time-and-copy`,
  );
  expect(correctionResource.status()).toBe(200);
  const correctionResourceBody = await correctionResource.json();
  expect(correctionResourceBody).toMatchObject({
    publicId: "correction-event-time-and-copy",
    targetType: "event",
    targetPublicId: "event-correction-canonical",
    casePublicId: "case-event-time-and-copy",
    reasonCode: "factual_error",
    status: "redacted_due_to_rights",
  });
  expect(correctionResourceBody).not.toHaveProperty("changes");
  expect(JSON.stringify(correctionResourceBody)).not.toContain(
    "Corrected public Event summary.",
  );

  const openApi = await (
    await context.request.get(`${applicationUrl}/api/openapi.json`)
  ).json();
  for (const path of [
    "/api/v1/admin/corrections",
    "/api/v1/admin/rights-decisions",
    "/api/v1/admin/entities/merge",
    "/api/v1/admin/editorial-cases/restrict",
    "/api/v1/admin/editorial-cases/{publicId}",
    "/api/v1/corrections/{publicId}",
  ]) {
    expect(openApi.paths[path]).toBeDefined();
  }
  const ajv = new Ajv2020({ strict: false });
  addFormats(ajv);
  const validateEventResponse = ajv.compile(
    openApi.paths["/api/v1/events/{publicId}"].get.responses["200"].content[
      "application/json"
    ].schema,
  );
  expect(validateEventResponse(await withdrawnEvent.json())).toBe(true);
  const validateEntityResponse = ajv.compile(
    openApi.paths["/api/v1/entities/{publicId}"].get.responses["200"].content[
      "application/json"
    ].schema,
  );
  expect(validateEntityResponse(await withdrawnEntity.json())).toBe(true);
  const validateCorrectionResponse = ajv.compile(
    openApi.paths["/api/v1/corrections/{publicId}"].get.responses["200"]
      .content["application/json"].schema,
  );
  expect(validateCorrectionResponse(correctionResourceBody)).toBe(true);
  for (const [path, body] of [
    ["/api/v1/admin/corrections", invalidCorrectionBody],
    ["/api/v1/admin/rights-decisions", invalidRightsDecisionBody],
    ["/api/v1/admin/entities/merge", invalidEntityMergeBody],
    ["/api/v1/admin/editorial-cases/restrict", invalidEditorialCaseBody],
  ] as const) {
    const validateOperationError = ajv.compile(
      openApi.paths[path].post.responses["400"].content["application/json"]
        .schema,
    );
    expect(validateOperationError(body)).toBe(true);
  }

  const database = new Client({ connectionString: application.databaseUrl });
  await database.connect();
  try {
    const corrections = await database.query(
      "select public_id, target_type from corrections where public_id in ('correction-entity-name-and-copy', 'correction-event-time-and-copy') order by public_id",
    );
    expect(corrections.rows).toEqual([
      {
        public_id: "correction-entity-name-and-copy",
        target_type: "entity",
      },
      {
        public_id: "correction-event-time-and-copy",
        target_type: "event",
      },
    ]);
    const rightsDecisions = await database.query(
      "select public_id, target_type, from_status, to_status from rights_decisions where public_id in ('rights-source-wire-withdrawal', 'rights-entity-withdrawal', 'rights-event-withdrawal') order by effective_at",
    );
    expect(rightsDecisions.rows).toEqual([
      {
        public_id: "rights-source-wire-withdrawal",
        target_type: "source_item",
        from_status: "open",
        to_status: "withdrawn",
      },
      {
        public_id: "rights-entity-withdrawal",
        target_type: "entity",
        from_status: "open",
        to_status: "withdrawn",
      },
      {
        public_id: "rights-event-withdrawal",
        target_type: "event",
        from_status: "open",
        to_status: "withdrawn",
      },
    ]);
    const editorialCase = await database.query(
      "select public_id, kind, target_type, status, decision, received_at, original_request, evidence_summary, decided_at from editorial_cases where public_id = 'case-high-risk-review'",
    );
    expect(editorialCase.rows).toEqual([
      expect.objectContaining({
        public_id: "case-high-risk-review",
        kind: "correction",
        target_type: "event",
        status: "actioned",
        decision: "corrected",
        original_request: "Original request for case-high-risk-review.",
        evidence_summary: "Owner-verified evidence for case-high-risk-review.",
      }),
    ]);
    expect(editorialCase.rows[0].received_at).toBeInstanceOf(Date);
    expect(editorialCase.rows[0].decided_at).toBeInstanceOf(Date);
    const rejectedCase = await database.query(
      "select status, decision, decided_at, closed_at from editorial_cases where public_id = 'case-rejected-review'",
    );
    expect(rejectedCase.rows[0]).toMatchObject({
      status: "closed",
      decision: "rejected",
      decided_at: new Date("2026-08-30T09:13:02.000Z"),
      closed_at: new Date("2026-08-30T09:13:04.000Z"),
    });
    await expect(
      database.query(
        "update editorial_cases set closed_at = decided_at - interval '1 second' where public_id = 'case-rejected-review'",
      ),
    ).rejects.toMatchObject({
      constraint: "editorial_cases_timestamps_move_forward",
    });
    const activeTombstones = await database.query(
      "select object_public_id, object_type, status from tombstones where cleared_at is null and object_public_id not like 'model-concurrent-merge-%' and object_public_id not like 'event-concurrent-source-%' and object_public_id not like 'event-sequential-source-%' and object_public_id not like 'event-shared-evidence-%' and object_public_id not like 'event-create-relation-race%' and object_public_id not like 'model-create-endpoint-race%' and object_public_id not like 'event-create-endpoint-race%' and object_public_id not like 'event-split-race-%' order by object_public_id",
    );
    expect(activeTombstones.rows).toEqual([
      {
        object_public_id: "event-correction-canonical",
        object_type: "event",
        status: "withdrawn",
      },
      {
        object_public_id: "event-correction-duplicate",
        object_type: "event",
        status: "merged_into",
      },
      {
        object_public_id: "model-correction-canonical",
        object_type: "entity",
        status: "withdrawn",
      },
      {
        object_public_id: "model-correction-duplicate",
        object_type: "entity",
        status: "merged_into",
      },
    ]);
    const audits = await database.query(
      "select action from owner_operation_audits where action in ('correct_event', 'correct_entity', 'merge_entity', 'withdraw_source_item', 'withdraw_entity', 'withdraw_event') and target_public_id in ('event-correction-canonical', 'model-correction-canonical', 'model-correction-duplicate', 'source-item-correction-wire') order by created_at",
    );
    expect(audits.rows.map(({ action }) => action)).toEqual([
      "correct_event",
      "correct_entity",
      "merge_entity",
      "withdraw_source_item",
      "withdraw_entity",
      "withdraw_event",
    ]);
  } finally {
    await database.end();
  }
});
