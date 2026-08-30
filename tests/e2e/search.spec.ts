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

test("Search ranks exact and bilingual matches, composes filters, paginates, and propagates public status", async ({
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
      email: "search-owner@example.test",
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

  const createEntity = async ({
    publicId,
    type,
    officialName,
    officialUrl,
    enName,
    enSummary,
    zhName,
    zhSummary,
    aliases = [],
    rightsStatus = "open",
  }: {
    publicId: string;
    type: "model" | "organization" | "topic";
    officialName: string;
    officialUrl: string;
    enName: string;
    enSummary: string;
    zhName: string;
    zhSummary: string;
    aliases?: Array<{
      publicId: string;
      locale: "en" | "zh";
      kind: "official" | "localized" | "historical";
      value: string;
    }>;
    rightsStatus?: "open" | "internal_only";
  }) => {
    const response = await context.request.post(
      `${applicationUrl}/api/v1/admin/entities`,
      {
        data: {
          entity: {
            publicId,
            type,
            officialName,
            officialUrl,
            lastVerifiedAt: "2026-08-30T08:00:00.000Z",
            rightsStatus,
          },
          localizations: [
            {
              locale: "en",
              name: enName,
              summary: enSummary,
              authorship: "human_authored",
              reviewStatus: "reviewed",
            },
            {
              locale: "zh",
              name: zhName,
              summary: zhSummary,
              authorship: "human_authored",
              reviewStatus: "reviewed",
            },
          ],
          aliases,
          versions: [],
        },
      },
    );
    expect(response.status()).toBe(201);
  };

  await createEntity({
    publicId: "model-search-alpha",
    type: "model",
    officialName: "Search Alpha",
    officialUrl: "https://models.example.test/search-alpha",
    enName: "Search Alpha",
    enSummary:
      "A model for deterministic discovery and QuartzVector retrieval.",
    zhName: "搜索阿尔法",
    zhSummary: "用于确定性发现与可靠检索的模型。",
    aliases: [
      {
        publicId: "alias-search-alpha-legacy",
        locale: "en",
        kind: "historical",
        value: "Legacy Search Alpha",
      },
      {
        publicId: "alias-search-alpha-zh-old",
        locale: "zh",
        kind: "historical",
        value: "旧搜索模型",
      },
    ],
  });
  await createEntity({
    publicId: "model-search-companion",
    type: "model",
    officialName: "Search Alpha Companion",
    officialUrl: "https://models.example.test/search-alpha-companion",
    enName: "Search Alpha Companion",
    enSummary: "A companion whose text mentions Legacy Search Alpha.",
    zhName: "搜索阿尔法伴侣",
    zhSummary: "一个在文本中提及旧搜索模型的伴侣模型。",
    aliases: [
      {
        publicId: "alias-search-companion-legacy",
        locale: "en",
        kind: "historical",
        value: "Legacy Search Alpha Companion",
      },
    ],
  });
  await createEntity({
    publicId: "organization-search-labs",
    type: "organization",
    officialName: "Search Labs",
    officialUrl: "https://organizations.example.test/search-labs",
    enName: "Search Labs",
    enSummary: "The organization developing Search Alpha.",
    zhName: "搜索实验室",
    zhSummary: "开发搜索阿尔法的组织。",
  });
  await createEntity({
    publicId: "topic-search-agents",
    type: "topic",
    officialName: "Search Agents",
    officialUrl: "https://topics.example.test/search-agents",
    enName: "Search Agents",
    enSummary: "The search-agent topic.",
    zhName: "搜索智能体",
    zhSummary: "搜索智能体主题。",
  });
  await createEntity({
    publicId: "model-search-internal",
    type: "model",
    officialName: "Internal Search Cipher",
    officialUrl: "https://models.example.test/internal-search-cipher",
    enName: "Internal Search Cipher",
    enSummary: "Restricted text must never enter public Search.",
    zhName: "内部搜索密码",
    zhSummary: "受限文本不得进入公开搜索。",
    rightsStatus: "internal_only",
  });

  const createEvent = async ({
    eventPublicId,
    eventType,
    sourceItemPublicId,
    externalId,
    canonicalUrl,
    originalLanguage,
    occurredAt,
    enTitle,
    enSummary,
    zhTitle,
    zhSummary,
  }: {
    eventPublicId: string;
    eventType: "announces" | "updates";
    sourceItemPublicId: string;
    externalId: string;
    canonicalUrl: string;
    originalLanguage: "en" | "zh";
    occurredAt: string;
    enTitle: string;
    enSummary: string;
    zhTitle: string;
    zhSummary: string;
  }) => {
    const sourcePublicId = `${eventPublicId}-source`;
    const draft = await context.request.post(
      `${applicationUrl}/api/v1/admin/event-drafts`,
      {
        data: {
          source: {
            publicId: sourcePublicId,
            name: `${eventPublicId} Primary Source`,
            homepageUrl: `https://${sourcePublicId}.example.test/`,
            tier: "S",
            accessStatus: "approved",
            acquisitionMethod: "manual",
            policyLastReviewedAt: "2026-08-30T00:00:00.000Z",
          },
          sourceItem: {
            publicId: sourceItemPublicId,
            externalId,
            externalIdVerifiedAt: "2026-08-30T08:00:00.000Z",
            isOriginalSource: true,
            originalUrl: `https://${sourcePublicId}.example.test/${sourceItemPublicId}`,
            canonicalUrl,
            originalTitle: `${eventPublicId} original source title`,
            originalLanguage,
            publishedAt: occurredAt,
            publishedAtPrecision: "second",
            discoveredAt: "2026-08-30T08:45:00.000Z",
            rightsStatus: "open",
            rightsCheckedAt: "2026-08-30T08:50:00.000Z",
            attribution: `${eventPublicId} Primary Source`,
            licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
          },
          event: {
            publicId: eventPublicId,
            eventType,
            factStatus: "confirmed",
            occurredAt,
            occurredAtPrecision: "second",
            lastVerifiedAt: "2026-08-30T09:00:00.000Z",
            rightsStatus: "open",
          },
          localizations: [
            {
              locale: "en",
              title: enTitle,
              summary: enSummary,
              authorship: "human_authored",
              reviewStatus: "reviewed",
            },
            {
              locale: "zh",
              title: zhTitle,
              summary: zhSummary,
              authorship: "human_authored",
              reviewStatus: "reviewed",
            },
          ],
        },
      },
    );
    expect(draft.status()).toBe(201);
    const publish = await context.request.post(
      `${applicationUrl}/api/v1/admin/events/${eventPublicId}/publish`,
    );
    expect(publish.status()).toBe(200);
  };

  await createEvent({
    eventPublicId: "event-search-launch",
    eventType: "announces",
    sourceItemPublicId: "source-item-search-launch",
    externalId: "news-search-alpha-launch",
    canonicalUrl: "https://canonical.example.test/search-alpha-launch",
    originalLanguage: "en",
    occurredAt: "2026-08-30T08:30:00.000Z",
    enTitle: "Search Alpha launches NebulaMark",
    enSummary:
      "SnapshotNeedle and CrossCursorNeedle mark Legacy Search Alpha launching for deterministic discovery.",
    zhTitle: "搜索阿尔法发布星云标记",
    zhSummary: "旧搜索模型面向确定性发现正式发布。",
  });
  await createEvent({
    eventPublicId: "event-search-update",
    eventType: "updates",
    sourceItemPublicId: "source-item-search-update",
    externalId: "news-search-alpha-update",
    canonicalUrl: "https://canonical.example.test/search-alpha-update",
    originalLanguage: "zh",
    occurredAt: "2026-08-30T08:35:00.000Z",
    enTitle: "Search Alpha receives a bilingual update",
    enSummary:
      "SnapshotNeedle and CrossCursorNeedle mark the Search Alpha update improving reliable retrieval.",
    zhTitle: "搜索阿尔法获得双语更新",
    zhSummary: "搜索阿尔法更新改进了可靠检索。",
  });
  await createEvent({
    eventPublicId: "event-search-duplicate",
    eventType: "announces",
    sourceItemPublicId: "source-item-search-duplicate",
    externalId: "news-search-alpha-duplicate",
    canonicalUrl: "https://canonical.example.test/search-alpha-duplicate",
    originalLanguage: "zh",
    occurredAt: "2026-08-30T08:40:00.000Z",
    enTitle: "Search Alpha launch duplicate coverage",
    enSummary: "Duplicate coverage of the Search Alpha launch.",
    zhTitle: "搜索阿尔法发布重复报道",
    zhSummary: "搜索阿尔法发布的重复报道。",
  });

  const createRelation = async (data: object) => {
    const response = await context.request.post(
      `${applicationUrl}/api/v1/admin/relations`,
      { data },
    );
    expect(response.status()).toBe(201);
  };
  const relationFields = {
    validFrom: "2026-08-30T08:00:00.000Z",
    validTo: null,
    firstVerifiedAt: "2026-08-30T09:00:00.000Z",
    lastVerifiedAt: "2026-08-30T09:00:00.000Z",
    confidence: 95,
    reviewStatus: "reviewed",
    creationMethod: "editor",
    rightsStatus: "open",
  } as const;
  await createRelation({
    relation: {
      ...relationFields,
      publicId: "relation-search-labs-develops-alpha",
      subject: { type: "entity", publicId: "organization-search-labs" },
      predicate: "DEVELOPS",
      objectEntityPublicId: "model-search-alpha",
    },
    evidenceSourceItemPublicIds: ["source-item-search-launch"],
  });
  await createRelation({
    relation: {
      ...relationFields,
      publicId: "relation-search-alpha-tagged-agents",
      subject: { type: "entity", publicId: "model-search-alpha" },
      predicate: "TAGGED_WITH",
      objectEntityPublicId: "topic-search-agents",
    },
    evidenceSourceItemPublicIds: ["source-item-search-launch"],
  });
  for (const event of [
    {
      publicId: "event-search-launch",
      relationPublicId: "relation-search-launch-alpha",
      predicate: "ANNOUNCES",
      sourceItemPublicId: "source-item-search-launch",
    },
    {
      publicId: "event-search-update",
      relationPublicId: "relation-search-update-alpha",
      predicate: "UPDATES",
      sourceItemPublicId: "source-item-search-update",
    },
    {
      publicId: "event-search-duplicate",
      relationPublicId: "relation-search-duplicate-alpha",
      predicate: "ANNOUNCES",
      sourceItemPublicId: "source-item-search-duplicate",
    },
  ] as const) {
    await createRelation({
      relation: {
        ...relationFields,
        publicId: event.relationPublicId,
        subject: { type: "event", publicId: event.publicId },
        predicate: event.predicate,
        objectEntityPublicId: "model-search-alpha",
      },
      evidenceSourceItemPublicIds: [event.sourceItemPublicId],
    });
  }

  const exactAlias = await context.request.get(
    `${applicationUrl}/api/v1/search?q=${encodeURIComponent("Legacy Search Alpha")}&locale=en`,
  );
  expect(exactAlias.status()).toBe(200);
  expect((await exactAlias.json()).items[0]).toMatchObject({
    kind: "entity",
    publicId: "model-search-alpha",
    matchReason: "alias",
    matchedText: "Legacy Search Alpha",
  });

  const crossLanguage = await context.request.get(
    `${applicationUrl}/api/v1/search?q=${encodeURIComponent("旧搜索模型")}&locale=en`,
  );
  expect(crossLanguage.status()).toBe(200);
  expect((await crossLanguage.json()).items[0]).toMatchObject({
    publicId: "model-search-alpha",
    locale: "en",
    matchedLocale: "zh",
    matchReason: "alias",
  });
  const englishToChinese = await context.request.get(
    `${applicationUrl}/api/v1/search?q=${encodeURIComponent("NebulaMark")}&locale=zh`,
  );
  expect(englishToChinese.status()).toBe(200);
  expect((await englishToChinese.json()).items[0]).toMatchObject({
    publicId: "event-search-launch",
    locale: "zh",
    matchedLocale: "en",
    matchReason: "full_text",
  });

  for (const [query, reason] of [
    ["model-search-alpha", "public_id"],
    ["https://models.example.test/search-alpha", "canonical_url"],
    ["https://canonical.example.test/search-alpha-launch", "canonical_url"],
    ["news-search-alpha-launch", "external_id"],
  ] as const) {
    const response = await context.request.get(
      `${applicationUrl}/api/v1/search?q=${encodeURIComponent(query)}&locale=en`,
    );
    expect(response.status()).toBe(200);
    expect((await response.json()).items[0]).toMatchObject({
      matchReason: reason,
    });
  }

  const fullText = await context.request.get(
    `${applicationUrl}/api/v1/search?q=QuartzVector&locale=en`,
  );
  expect(fullText.status()).toBe(200);
  expect((await fullText.json()).items[0]).toMatchObject({
    publicId: "model-search-alpha",
    matchReason: "full_text",
  });
  const typo = await context.request.get(
    `${applicationUrl}/api/v1/search?q=${encodeURIComponent("Serch Alhpa")}&locale=en`,
  );
  expect(typo.status()).toBe(200);
  expect((await typo.json()).items[0]).toMatchObject({
    publicId: "model-search-alpha",
    matchReason: "trigram",
  });

  const crossLanguageCursorFirst = await context.request.get(
    `${applicationUrl}/api/v1/search?q=CrossCursorNeedle&locale=zh&type=event&sort=latest&limit=1`,
  );
  const crossLanguageCursorFirstBody = await crossLanguageCursorFirst.json();
  expect(crossLanguageCursorFirstBody.items[0].publicId).toBe(
    "event-search-update",
  );
  const crossLanguageCursorSecond = await context.request.get(
    `${applicationUrl}/api/v1/search?q=CrossCursorNeedle&locale=zh&type=event&sort=latest&limit=1&cursor=${encodeURIComponent(crossLanguageCursorFirstBody.nextCursor)}`,
  );
  expect((await crossLanguageCursorSecond.json()).items[0]).toMatchObject({
    publicId: "event-search-launch",
    matchedLocale: "en",
    matchReason: "full_text",
    matchedText: expect.stringContaining("CrossCursorNeedle"),
  });

  const aliasCursorFirst = await context.request.get(
    `${applicationUrl}/api/v1/search?q=${encodeURIComponent("Legacy Search")}&locale=en&type=model&sort=latest&limit=1`,
  );
  const aliasCursorFirstBody = await aliasCursorFirst.json();
  expect(aliasCursorFirstBody.items[0].publicId).toBe("model-search-companion");
  const aliasCursorSecond = await context.request.get(
    `${applicationUrl}/api/v1/search?q=${encodeURIComponent("Legacy Search")}&locale=en&type=model&sort=latest&limit=1&cursor=${encodeURIComponent(aliasCursorFirstBody.nextCursor)}`,
  );
  expect((await aliasCursorSecond.json()).items[0]).toMatchObject({
    publicId: "model-search-alpha",
    matchedLocale: "en",
    matchReason: "full_text",
    matchedText: "Legacy Search Alpha",
  });

  const latest = await context.request.get(
    `${applicationUrl}/api/v1/search?q=${encodeURIComponent("Search Alpha")}&locale=en&type=event&sort=latest`,
  );
  expect(latest.status()).toBe(200);
  const latestBody = await latest.json();
  expect(latestBody).toMatchObject({
    sort: "latest",
    rankingState: "available",
  });
  expect(latestBody.items[0]).toMatchObject({
    publicId: "event-search-duplicate",
  });
  const trending = await context.request.get(
    `${applicationUrl}/api/v1/search?q=${encodeURIComponent("Search Alpha")}&locale=en&type=event&sort=trending`,
  );
  expect(trending.status()).toBe(200);
  expect(await trending.json()).toMatchObject({
    sort: "trending",
    rankingState: "insufficient_evidence",
    items: [],
  });

  const filtered = await context.request.get(
    `${applicationUrl}/api/v1/search?q=${encodeURIComponent("Search Alpha")}&locale=en&type=event&from=2026-08-30T08:29:00.000Z&to=2026-08-30T08:36:00.000Z&topic=topic-search-agents&organization=organization-search-labs&signalLanguage=en`,
  );
  expect(filtered.status()).toBe(200);
  expect((await filtered.json()).items).toEqual([
    expect.objectContaining({
      publicId: "event-search-launch",
      signalLanguages: ["en"],
    }),
  ]);

  const firstPage = await context.request.get(
    `${applicationUrl}/api/v1/search?q=SnapshotNeedle&locale=en&type=event&limit=1`,
  );
  expect(firstPage.status()).toBe(200);
  const firstPageBody = await firstPage.json();
  expect(firstPageBody.items).toHaveLength(1);
  expect(firstPageBody.items[0].publicId).toBe("event-search-update");
  expect(firstPageBody.nextCursor).toEqual(expect.any(String));

  const correction = await context.request.post(
    `${applicationUrl}/api/v1/admin/corrections`,
    {
      data: {
        publicId: "correction-search-launch-title",
        case: {
          publicId: "case-search-launch-title",
          receivedAt: "2026-08-30T09:05:00.000Z",
          originalRequest: "Correct the Search launch title.",
          evidenceSummary: "The primary source confirms OrbitMark.",
        },
        target: { type: "event", publicId: "event-search-launch" },
        reasonCode: "factual_error",
        effectiveAt: "2026-08-30T09:10:00.000Z",
        replacementVersion: "event-search-launch@2026-08-30T09:10:00.000Z",
        evidenceSourceItemPublicIds: ["source-item-search-launch"],
        changes: {
          localizations: [
            {
              locale: "en",
              title: "Search Alpha launches OrbitMark",
              summary: "Search Alpha launches for deterministic discovery.",
            },
            {
              locale: "zh",
              title: "搜索阿尔法发布轨道标记",
              summary: "搜索阿尔法面向确定性发现正式发布。",
            },
          ],
        },
        internalNote: "Verified against the primary source.",
      },
    },
  );
  expect(correction.status()).toBe(201);
  const secondPage = await context.request.get(
    `${applicationUrl}/api/v1/search?q=SnapshotNeedle&locale=en&type=event&limit=1&cursor=${encodeURIComponent(firstPageBody.nextCursor)}`,
  );
  expect(secondPage.status()).toBe(200);
  const secondPageBody = await secondPage.json();
  expect(secondPageBody.items).toHaveLength(1);
  expect(secondPageBody.items[0].publicId).toBe("event-search-launch");
  expect(secondPageBody.items[0].matchReason).toBe("snapshot_member");
  expect(secondPageBody.items[0].matchedText).not.toContain("SnapshotNeedle");
  expect(secondPageBody.dataCutoff).toBe(firstPageBody.dataCutoff);
  expect(secondPageBody.resultSet).toEqual({
    capturedCount: 2,
    limit: 1000,
    truncated: false,
  });

  const restricted = await context.request.get(
    `${applicationUrl}/api/v1/search?q=${encodeURIComponent("Internal Search Cipher")}&locale=en`,
  );
  expect(restricted.status()).toBe(200);
  expect((await restricted.json()).items).not.toContainEqual(
    expect.objectContaining({ publicId: "model-search-internal" }),
  );

  await page.goto(
    `${applicationUrl}/en/search?q=${encodeURIComponent("旧搜索模型")}`,
  );
  await expect(
    page.getByRole("heading", { name: "Search", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("heading", { name: "Search Alpha", exact: true })
      .getByRole("link"),
  ).toHaveAttribute("href", "/en/models/model-search-alpha");
  await expect(page.getByText("Matched Chinese alias")).toBeVisible();
  await page.goto(
    `${applicationUrl}/zh/search?q=${encodeURIComponent("旧搜索模型")}`,
  );
  await expect(page.getByText(/模型 · 公开 ·/)).toBeVisible();
  await expect(page.getByText(/信号语言: 英文, 中文/)).toBeVisible();
  const removedCorrectionText = await context.request.get(
    `${applicationUrl}/api/v1/search?q=NebulaMark&locale=en`,
  );
  expect((await removedCorrectionText.json()).items).toEqual([]);
  const correctedText = await context.request.get(
    `${applicationUrl}/api/v1/search?q=OrbitMark&locale=en`,
  );
  expect((await correctedText.json()).items[0]).toMatchObject({
    publicId: "event-search-launch",
  });

  const merge = await context.request.post(
    `${applicationUrl}/api/v1/admin/events/merge`,
    {
      data: {
        targetEventPublicId: "event-search-launch",
        sourceEventPublicId: "event-search-duplicate",
        publicReasonCode: "duplicate_coverage",
        internalNote: "Duplicate Search launch coverage.",
      },
    },
  );
  expect(merge.status()).toBe(200);
  const mergedSearch = await context.request.get(
    `${applicationUrl}/api/v1/search?q=event-search-duplicate&locale=en`,
  );
  const mergedItems = (await mergedSearch.json()).items;
  expect(mergedItems[0]).toMatchObject({
    kind: "event",
    publicId: "event-search-duplicate",
    status: "merged_into",
    replacementPublicId: "event-search-launch",
    matchReason: "public_id",
  });
  expect(mergedItems).not.toContainEqual(
    expect.objectContaining({
      publicId: "event-search-duplicate",
      status: "public",
    }),
  );

  const sourceStatusSnapshot = await context.request.get(
    `${applicationUrl}/api/v1/search?q=${encodeURIComponent("Search Alpha")}&locale=en&type=event&sort=latest&limit=1`,
  );
  const sourceStatusSnapshotBody = await sourceStatusSnapshot.json();
  expect(sourceStatusSnapshotBody.items[0].publicId).toBe(
    "event-search-update",
  );
  expect(sourceStatusSnapshotBody.nextCursor).toEqual(expect.any(String));

  const partialSourceWithdrawal = await context.request.post(
    `${applicationUrl}/api/v1/admin/rights-decisions`,
    {
      data: {
        publicId: "rights-search-duplicate-source",
        case: {
          publicId: "case-rights-search-duplicate-source",
          receivedAt: "2026-08-30T11:20:00.000Z",
          originalRequest: "Withdraw the duplicate source only.",
          evidenceSummary: "The source publisher requested withdrawal.",
        },
        target: {
          type: "source_item",
          publicId: "source-item-search-duplicate",
        },
        toStatus: "withdrawn",
        publicReasonCode: "source_withdrawal",
        effectiveAt: "2026-08-30T11:25:00.000Z",
        internalNote: "Retain the independently sourced Event.",
      },
    },
  );
  expect(partialSourceWithdrawal.status()).toBe(201);
  const sourceWithdrawnSearch = await context.request.get(
    `${applicationUrl}/api/v1/search?q=event-search-launch&locale=en`,
  );
  expect((await sourceWithdrawnSearch.json()).items[0]).toMatchObject({
    publicId: "event-search-launch",
    status: "source_withdrawn",
    source: {
      url: "https://canonical.example.test/search-alpha-launch",
    },
  });
  const sourceStatusSnapshotPage = await context.request.get(
    `${applicationUrl}/api/v1/search?q=${encodeURIComponent("Search Alpha")}&locale=en&type=event&sort=latest&limit=1&cursor=${encodeURIComponent(sourceStatusSnapshotBody.nextCursor)}`,
  );
  expect(await sourceStatusSnapshotPage.json()).toMatchObject({
    items: [
      {
        publicId: "event-search-launch",
        status: "source_withdrawn",
        signalLanguages: ["en"],
      },
    ],
  });

  const withdrawal = await context.request.post(
    `${applicationUrl}/api/v1/admin/rights-decisions`,
    {
      data: {
        publicId: "rights-search-alpha",
        case: {
          publicId: "case-rights-search-alpha",
          receivedAt: "2026-08-30T09:15:00.000Z",
          originalRequest: "Withdraw the Search Alpha profile.",
          evidenceSummary: "The rights owner requested withdrawal.",
        },
        target: { type: "entity", publicId: "model-search-alpha" },
        toStatus: "withdrawn",
        publicReasonCode: "rights_withdrawal",
        effectiveAt: "2026-08-30T09:20:00.000Z",
        internalNote: "Apply the verified rights request.",
      },
    },
  );
  expect(withdrawal.status()).toBe(201);
  const withdrawnName = await context.request.get(
    `${applicationUrl}/api/v1/search?q=${encodeURIComponent("Legacy Search Alpha")}&locale=en`,
  );
  expect((await withdrawnName.json()).items).not.toContainEqual(
    expect.objectContaining({ publicId: "model-search-alpha" }),
  );
  const withdrawnId = await context.request.get(
    `${applicationUrl}/api/v1/search?q=model-search-alpha&locale=en`,
  );
  const withdrawnItems = (await withdrawnId.json()).items;
  expect(withdrawnItems[0]).toMatchObject({
    kind: "entity",
    publicId: "model-search-alpha",
    status: "withdrawn",
    replacementPublicId: null,
    matchReason: "public_id",
  });
  expect(withdrawnItems).not.toContainEqual(
    expect.objectContaining({
      publicId: "model-search-alpha",
      status: "public",
    }),
  );

  await page.goto(
    `${applicationUrl}/zh/search?q=${encodeURIComponent("不存在的雷达记录")}`,
  );
  await expect(page.getByRole("option", { name: "全部" })).toBeAttached();
  await expect(page.getByRole("option", { name: "事件" })).toBeAttached();
  await expect(page.getByRole("option", { name: "全球信号" })).toBeAttached();
  await expect(page.getByRole("option", { name: "最新" })).toBeAttached();
  await expect(
    page.getByText("AI Radar 只搜索已收录并通过公开权利检查的资料。"),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "提交来源" })).toHaveAttribute(
    "href",
    /github\.com\/cryanskl\/ai-radar\/issues\/new/,
  );

  const databaseClient = new Client({
    connectionString: application.databaseUrl,
  });
  await databaseClient.connect();
  try {
    await databaseClient.query(`
      with generated as (
        select series, gen_random_uuid() as object_id
        from generate_series(1, 1001) series
      )
      insert into search_documents (
        id, object_kind, object_id, public_id, entity_type, locale,
        name, summary, search_name, search_text, occurred_at, latest_at,
        last_verified_at, source_name, source_url, status, indexed_at
      )
      select gen_random_uuid(), 'event', object_id,
        'cap-event-' || series, null, 'en',
        'CapNeedle event ' || series, 'Bounded snapshot fixture',
        'CapNeedle event ' || series,
        'CapNeedle event ' || series || ' Bounded snapshot fixture',
        '2026-08-30T07:00:00.000Z', '2026-08-30T07:00:00.000Z',
        '2026-08-30T07:00:00.000Z', null, null, 'public', clock_timestamp()
      from generated
    `);
    const capped = await context.request.get(
      `${applicationUrl}/api/v1/search?q=CapNeedle&locale=en&type=event&limit=1`,
    );
    expect(capped.status()).toBe(200);
    expect(await capped.json()).toMatchObject({
      resultSet: { capturedCount: 1000, limit: 1000, truncated: true },
      items: [expect.objectContaining({ kind: "event" })],
      nextCursor: expect.any(String),
    });

    await databaseClient.query("set enable_seqscan = off");
    const fullTextPlan = await databaseClient.query(
      `explain (format json) select id from search_documents
       where to_tsvector('simple', search_text) @@ websearch_to_tsquery('simple', $1)`,
      ["QuartzVector"],
    );
    expect(JSON.stringify(fullTextPlan.rows)).toContain(
      "search_documents_search_vector_idx",
    );
    const trigramPlan = await databaseClient.query(
      `explain (format json) select id from search_documents
       where lower(search_name) % $1`,
      ["serch alhpa"],
    );
    expect(JSON.stringify(trigramPlan.rows)).toContain(
      "search_documents_name_trgm_idx",
    );
  } finally {
    await databaseClient.end();
  }

  for (const url of [
    `${applicationUrl}/api/v1/search?locale=en`,
    `${applicationUrl}/api/v1/search?q=Search&type=unknown`,
    `${applicationUrl}/api/v1/search?q=Search&cursor=not-a-cursor`,
  ]) {
    const invalid = await context.request.get(url);
    expect(invalid.status()).toBe(400);
  }

  const openApiResponse = await context.request.get(
    `${applicationUrl}/api/openapi.json`,
  );
  expect(openApiResponse.status()).toBe(200);
  const openApi = await openApiResponse.json();
  const responseSchema =
    openApi.paths["/api/v1/search"].get.responses["200"].content[
      "application/json"
    ].schema;
  const ajv = new Ajv2020({ strict: false });
  addFormats(ajv);
  const validate = ajv.compile(responseSchema);
  expect(
    validate(await exactAlias.json()),
    ajv.errorsText(validate.errors),
  ).toBe(true);
  expect(
    openApi.paths["/api/v1/search"].get.parameters.map(
      ({ name }: { name: string }) => name,
    ),
  ).toEqual([
    "q",
    "locale",
    "type",
    "from",
    "to",
    "topic",
    "organization",
    "signalLanguage",
    "sort",
    "limit",
    "cursor",
  ]);
});
