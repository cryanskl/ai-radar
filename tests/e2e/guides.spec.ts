import { expect, test } from "@playwright/test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
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

test("publishes a bilingual, rights-aware original Guide with verified steps and evidenced links", async ({
  context,
  page,
}) => {
  if (!application) throw new Error("Test application did not start");
  const applicationUrl = application.url;
  const profileUrl = `${applicationUrl}/api/v1/admin/guide-profiles`;

  expect((await context.request.post(profileUrl, { data: {} })).status()).toBe(
    401,
  );
  const owner = await completeFakeGithubOAuth({
    applicationUrl,
    databaseUrl: application.databaseUrl,
    ownerGithubId: "34471145",
    profile: {
      avatar_url: "https://avatars.example.test/guide-owner",
      email: "guide-owner@example.test",
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

  const publishEvidence = async (key: string, title: string) => {
    const eventPublicId = `event-${key}`;
    const sourceItemPublicId = `source-item-${key}`;
    const draft = await context.request.post(
      `${applicationUrl}/api/v1/admin/event-drafts`,
      {
        data: {
          source: {
            publicId: `source-${key}`,
            name: `${title} publisher`,
            homepageUrl: `https://${key}.example.test/`,
            tier: "A",
            accessStatus: "approved",
            acquisitionMethod: "manual",
            policyLastReviewedAt: "2026-08-01T00:00:00.000Z",
          },
          sourceItem: {
            publicId: sourceItemPublicId,
            externalId: `${key}-evidence`,
            externalIdVerifiedAt: "2026-08-28T08:00:00.000Z",
            isOriginalSource: true,
            originalUrl: `https://${key}.example.test/evidence`,
            canonicalUrl: `https://${key}.example.test/`,
            originalTitle: title,
            originalLanguage: "en",
            publishedAt: "2026-08-28T08:00:00.000Z",
            publishedAtPrecision: "second",
            discoveredAt: "2026-08-28T09:00:00.000Z",
            rightsStatus: "open",
            rightsCheckedAt: "2026-08-28T09:00:00.000Z",
            attribution: `${title} authors`,
            licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
          },
          event: {
            publicId: eventPublicId,
            eventType: "updates",
            factStatus: "confirmed",
            occurredAt: "2026-08-28T08:00:00.000Z",
            occurredAtPrecision: "second",
            lastVerifiedAt: "2026-08-28T09:00:00.000Z",
            rightsStatus: "open",
          },
          localizations: [
            {
              locale: "en",
              title: `${title} published`,
              summary: `${title} is available as public evidence.`,
              authorship: "human_authored",
              reviewStatus: "reviewed",
            },
            {
              locale: "zh",
              title: `${title} 已发布`,
              summary: `${title}已作为公开证据发布。`,
              authorship: "human_authored",
              reviewStatus: "reviewed",
            },
          ],
        },
      },
    );
    expect(draft.status(), await draft.text()).toBe(201);
    const published = await context.request.post(
      `${applicationUrl}/api/v1/admin/events/${eventPublicId}/publish`,
    );
    expect(published.status(), await published.text()).toBe(200);
    return { eventPublicId, sourceItemPublicId };
  };

  const createEntity = async (data: {
    publicId: string;
    type: "model" | "product" | "repository" | "prompt" | "skill" | "guide";
    name: string;
    zhName: string;
    versions?: Array<{
      publicId: string;
      versionLabel: string;
      releasedAt: string;
      releasedAtPrecision: "second";
    }>;
  }) => {
    const response = await context.request.post(
      `${applicationUrl}/api/v1/admin/entities`,
      {
        data: {
          entity: {
            publicId: data.publicId,
            type: data.type,
            officialName: data.name,
            officialUrl: `https://${data.publicId}.example.test/`,
            lastVerifiedAt: "2026-08-30T08:00:00.000Z",
            rightsStatus: "open",
          },
          localizations: [
            {
              locale: "en",
              name: data.name,
              summary: `${data.name} helps readers complete a repeatable workflow.`,
              authorship: "human_authored",
              reviewStatus: "reviewed",
            },
            {
              locale: "zh",
              name: data.zhName,
              summary: `${data.zhName}帮助读者完成可重复的工作流。`,
              authorship: "human_authored",
              reviewStatus: "reviewed",
            },
          ],
          aliases: [],
          versions: data.versions ?? [],
        },
      },
    );
    expect(response.status(), await response.text()).toBe(201);
  };

  const guideEvidence = await publishEvidence(
    "guide-deploy-radar",
    "Deploy AI Radar Guide",
  );
  const relationEvidence = await publishEvidence(
    "guide-relations",
    "Guide relation evidence",
  );
  const related = [
    ["model-radar", "model", "Radar Model", "雷达模型"],
    ["product-radar-console", "product", "Radar Console", "雷达控制台"],
    ["repository-radar", "repository", "Radar Repository", "雷达仓库"],
    ["prompt-radar-check", "prompt", "Radar Check Prompt", "雷达检查提示词"],
    ["skill-radar-deploy", "skill", "Radar Deploy Skill", "雷达部署 Skill"],
  ] as const;
  for (const [publicId, type, name, zhName] of related) {
    await createEntity({ publicId, type, name, zhName });
  }
  await createEntity({
    publicId: "guide-deploy-ai-radar",
    type: "guide",
    name: "Deploy AI Radar",
    zhName: "部署 AI Radar",
    versions: [
      {
        publicId: "guide-deploy-ai-radar-v1",
        versionLabel: "1.0.0",
        releasedAt: "2026-08-28T08:00:00.000Z",
        releasedAtPrecision: "second",
      },
    ],
  });

  for (const [publicId] of related) {
    const relation = await context.request.post(
      `${applicationUrl}/api/v1/admin/relations`,
      {
        data: {
          relation: {
            publicId: `relation-guide-explains-${publicId}`,
            subject: { type: "entity", publicId: "guide-deploy-ai-radar" },
            predicate: "EXPLAINS",
            objectEntityPublicId: publicId,
            validFrom: "2026-08-28T08:00:00.000Z",
            validTo: null,
            firstVerifiedAt: "2026-08-28T09:00:00.000Z",
            lastVerifiedAt: "2026-08-28T09:00:00.000Z",
            confidence: 100,
            reviewStatus: "reviewed",
            creationMethod: "editor",
            rightsStatus: "open",
          },
          evidenceSourceItemPublicIds: [relationEvidence.sourceItemPublicId],
        },
      },
    );
    expect(relation.status(), await relation.text()).toBe(201);
  }
  const eventRelation = await context.request.post(
    `${applicationUrl}/api/v1/admin/relations`,
    {
      data: {
        relation: {
          publicId: "relation-guide-event-announces-guide",
          subject: { type: "event", publicId: guideEvidence.eventPublicId },
          predicate: "UPDATES",
          objectEntityPublicId: "guide-deploy-ai-radar",
          validFrom: "2026-08-28T08:00:00.000Z",
          validTo: null,
          firstVerifiedAt: "2026-08-28T09:00:00.000Z",
          lastVerifiedAt: "2026-08-28T09:00:00.000Z",
          confidence: 100,
          reviewStatus: "reviewed",
          creationMethod: "editor",
          rightsStatus: "open",
        },
        evidenceSourceItemPublicIds: [guideEvidence.sourceItemPublicId],
      },
    },
  );
  expect(eventRelation.status(), await eventRelation.text()).toBe(201);

  const originalGuideRequest = {
    guidePublicId: "guide-deploy-ai-radar",
    sourceItemPublicId: guideEvidence.sourceItemPublicId,
    author: {
      name: "AI Radar Editorial",
      url: "https://guide-deploy-ai-radar.example.test/about",
    },
    provenance: "ai_radar_original",
    category: "deployment",
    rightsStatus: "open",
    license: {
      name: "CC-BY-4.0",
      url: "https://creativecommons.org/licenses/by/4.0/",
    },
    contentMode: "full_guide",
    version: {
      entityVersionPublicId: "guide-deploy-ai-radar-v1",
      sourceItemPublicId: guideEvidence.sourceItemPublicId,
      publishedAt: "2026-08-28T08:00:00.000Z",
      reviewedAt: "2026-08-30T08:00:00.000Z",
      steps: [
        {
          id: "choose-model",
          kind: "settings",
          verifiedAt: "2026-08-30T08:00:00.000Z",
        },
        {
          id: "check-price",
          kind: "price",
          verifiedAt: "2026-08-30T08:00:00.000Z",
        },
        {
          id: "open-interface",
          kind: "interface",
          verifiedAt: "2026-08-30T08:00:00.000Z",
        },
        { id: "deploy", kind: "durable", verifiedAt: null },
      ],
      localizations: [
        {
          locale: "en",
          prerequisites: ["A PostgreSQL database", "A supported AI model"],
          steps: [
            { id: "choose-model", instruction: "Choose the model setting." },
            { id: "check-price", instruction: "Confirm the current price." },
            {
              id: "open-interface",
              instruction: "Open the deployment page.",
            },
            { id: "deploy", instruction: "Run the documented deployment." },
          ],
          expectedOutcome: "AI Radar responds from the deployed service.",
          limitations: ["Provider settings and prices may change."],
          authorship: "human_authored",
          reviewStatus: "reviewed",
        },
        {
          locale: "zh",
          prerequisites: ["一个 PostgreSQL 数据库", "一个受支持的 AI 模型"],
          steps: [
            { id: "choose-model", instruction: "选择模型设置。" },
            { id: "check-price", instruction: "确认当前价格。" },
            { id: "open-interface", instruction: "打开部署页面。" },
            { id: "deploy", instruction: "按文档执行部署。" },
          ],
          expectedOutcome: "AI Radar 可从已部署服务响应。",
          limitations: ["供应商设置与价格可能变化。"],
          authorship: "human_authored",
          reviewStatus: "reviewed",
        },
      ],
      statusObservation: {
        publicId: "guide-status-deploy-current",
        sourceItemPublicId: guideEvidence.sourceItemPublicId,
        status: "current",
        observedAt: "2026-08-30T08:00:00.000Z",
        localizations: [],
      },
    },
  };
  const invalidMutableStep = await context.request.post(profileUrl, {
    data: {
      ...originalGuideRequest,
      version: {
        ...originalGuideRequest.version,
        steps: originalGuideRequest.version.steps.map((step) =>
          step.kind === "settings" ? { ...step, verifiedAt: null } : step,
        ),
      },
    },
  });
  expect(invalidMutableStep.status()).toBe(400);
  expect(await invalidMutableStep.json()).toMatchObject({
    error: "invalid_request",
  });
  const created = await context.request.post(profileUrl, {
    data: originalGuideRequest,
  });
  expect(created.status(), await created.text()).toBe(201);

  const list = await context.request.get(
    `${applicationUrl}/api/v1/guides?locale=en&category=deployment`,
  );
  expect(list.status(), await list.text()).toBe(200);
  const listBody = await list.json();
  expect(listBody).toMatchObject({
    locale: "en",
    items: [
      {
        publicId: "guide-deploy-ai-radar",
        name: "Deploy AI Radar",
        provenance: "ai_radar_original",
        contentMode: "full_guide",
        currentStatus: { status: "current", staleReason: null },
      },
    ],
  });

  const detail = await context.request.get(
    `${applicationUrl}/api/v1/guides/guide-deploy-ai-radar?locale=en`,
  );
  expect(detail.status(), await detail.text()).toBe(200);
  const detailBody = await detail.json();
  expect(detailBody).toMatchObject({
    publicId: "guide-deploy-ai-radar",
    author: { name: "AI Radar Editorial" },
    version: "1.0.0",
    publishedAt: "2026-08-28T08:00:00.000Z",
    reviewedAt: "2026-08-30T08:00:00.000Z",
    license: { name: "CC-BY-4.0" },
    prerequisites: ["A PostgreSQL database", "A supported AI model"],
    steps: [
      {
        id: "choose-model",
        kind: "settings",
        instruction: "Choose the model setting.",
        verifiedAt: "2026-08-30T08:00:00.000Z",
      },
      {
        id: "check-price",
        kind: "price",
        instruction: "Confirm the current price.",
        verifiedAt: "2026-08-30T08:00:00.000Z",
      },
      {
        id: "open-interface",
        kind: "interface",
        instruction: "Open the deployment page.",
        verifiedAt: "2026-08-30T08:00:00.000Z",
      },
      {
        id: "deploy",
        kind: "durable",
        instruction: "Run the documented deployment.",
        verifiedAt: null,
      },
    ],
    expectedOutcome: "AI Radar responds from the deployed service.",
    limitations: ["Provider settings and prices may change."],
    currentStatus: { status: "current", staleReason: null },
    relatedRecords: expect.arrayContaining([
      expect.objectContaining({
        target: expect.objectContaining({
          type: "model",
          publicId: "model-radar",
        }),
      }),
      expect.objectContaining({
        target: expect.objectContaining({
          type: "product",
          publicId: "product-radar-console",
        }),
      }),
      expect.objectContaining({
        target: expect.objectContaining({
          type: "repository",
          publicId: "repository-radar",
        }),
      }),
      expect.objectContaining({
        target: expect.objectContaining({
          type: "prompt",
          publicId: "prompt-radar-check",
        }),
      }),
      expect.objectContaining({
        target: expect.objectContaining({
          type: "skill",
          publicId: "skill-radar-deploy",
        }),
      }),
      expect.objectContaining({
        target: expect.objectContaining({
          type: "event",
          publicId: guideEvidence.eventPublicId,
        }),
      }),
    ]),
  });
  expect(detailBody.relatedRecords[0].evidence[0]).toMatchObject({
    title: "Guide relation evidence",
    url: "https://guide-relations.example.test/evidence",
  });

  await page.goto(`${applicationUrl}/en/guides/guide-deploy-ai-radar`);
  await expect(
    page.getByRole("heading", { name: "Deploy AI Radar" }),
  ).toBeVisible();
  await expect(page.getByText("Choose the model setting.")).toBeVisible();
  await expect(
    page.getByText("Verified 2026-08-30T08:00:00.000Z").first(),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Radar Model" })).toBeVisible();

  await page.goto(`${applicationUrl}/zh/guides/guide-deploy-ai-radar`);
  await expect(
    page.getByRole("heading", { name: "部署 AI Radar" }),
  ).toBeVisible();
  await expect(page.getByText("选择模型设置。")).toBeVisible();
  expect(
    (
      await context.request.get(
        `${applicationUrl}/en/guides?provenance=not-a-provenance`,
      )
    ).status(),
  ).toBe(404);

  const externalEvidence = await publishEvidence(
    "guide-external-radar",
    "External Radar Guide",
  );
  await createEntity({
    publicId: "guide-external-radar",
    type: "guide",
    name: "External Radar Guide",
    zhName: "外部雷达指南",
    versions: [
      {
        publicId: "guide-external-radar-v1",
        versionLabel: "2026.08",
        releasedAt: "2026-08-28T08:00:00.000Z",
        releasedAtPrecision: "second",
      },
    ],
  });
  const externalRelation = await context.request.post(
    `${applicationUrl}/api/v1/admin/relations`,
    {
      data: {
        relation: {
          publicId: "relation-external-guide-explains-model",
          subject: { type: "entity", publicId: "guide-external-radar" },
          predicate: "EXPLAINS",
          objectEntityPublicId: "model-radar",
          validFrom: "2026-08-28T08:00:00.000Z",
          validTo: null,
          firstVerifiedAt: "2026-08-28T09:00:00.000Z",
          lastVerifiedAt: "2026-08-28T09:00:00.000Z",
          confidence: 100,
          reviewStatus: "reviewed",
          creationMethod: "editor",
          rightsStatus: "open",
        },
        evidenceSourceItemPublicIds: [relationEvidence.sourceItemPublicId],
      },
    },
  );
  expect(externalRelation.status(), await externalRelation.text()).toBe(201);

  const externalRequest = {
    guidePublicId: "guide-external-radar",
    sourceItemPublicId: externalEvidence.sourceItemPublicId,
    author: {
      name: "External Guide Author",
      url: "https://guide-external-radar.example.test/about",
    },
    provenance: "external_guidance",
    category: "workflow",
    rightsStatus: "link_only",
    license: null,
    contentMode: "summary_link",
    version: {
      entityVersionPublicId: "guide-external-radar-v1",
      sourceItemPublicId: externalEvidence.sourceItemPublicId,
      publishedAt: "2026-08-28T08:00:00.000Z",
      reviewedAt: "2026-08-30T09:00:00.000Z",
      localizations: [
        {
          locale: "en",
          authorship: "human_authored",
          reviewStatus: "reviewed",
        },
        {
          locale: "zh",
          authorship: "human_authored",
          reviewStatus: "reviewed",
        },
      ],
      statusObservation: {
        publicId: "guide-status-external-current",
        sourceItemPublicId: externalEvidence.sourceItemPublicId,
        status: "current",
        observedAt: "2026-08-30T09:00:00.000Z",
        localizations: [],
      },
    },
  };
  const invalidExternalFullGuide = await context.request.post(profileUrl, {
    data: { ...externalRequest, contentMode: "full_guide" },
  });
  expect(invalidExternalFullGuide.status()).toBe(400);
  expect(await invalidExternalFullGuide.json()).toMatchObject({
    error: "invalid_request",
  });
  const externalCreated = await context.request.post(profileUrl, {
    data: externalRequest,
  });
  expect(externalCreated.status(), await externalCreated.text()).toBe(201);
  const externalDetail = await context.request.get(
    `${applicationUrl}/api/v1/guides/guide-external-radar?locale=en`,
  );
  expect(externalDetail.status(), await externalDetail.text()).toBe(200);
  expect(await externalDetail.json()).toMatchObject({
    publicId: "guide-external-radar",
    provenance: "external_guidance",
    rightsStatus: "link_only",
    contentMode: "summary_link",
    source: {
      url: "https://guide-external-radar.example.test/evidence",
    },
  });
  expect(await externalDetail.json()).not.toHaveProperty("steps");
  const invalidExternalBody = await context.request.post(profileUrl, {
    data: {
      ...externalRequest,
      guidePublicId: "guide-external-radar-copy",
      version: {
        ...externalRequest.version,
        localizations: externalRequest.version.localizations.map(
          (localization) => ({
            ...localization,
            prerequisites: ["Copied external tutorial content"],
          }),
        ),
      },
    },
  });
  expect(invalidExternalBody.status()).toBe(400);

  const firstSearch = await context.request.get(
    `${applicationUrl}/api/v1/search?q=Radar&locale=en&type=guide&limit=1`,
  );
  expect(firstSearch.status()).toBe(200);
  const firstSearchBody = await firstSearch.json();
  expect(firstSearchBody.items).toHaveLength(1);
  expect(typeof firstSearchBody.nextCursor).toBe("string");
  const secondSearch = await context.request.get(
    `${applicationUrl}/api/v1/search?q=Radar&locale=en&type=guide&limit=1&cursor=${encodeURIComponent(firstSearchBody.nextCursor)}`,
  );
  expect(secondSearch.status()).toBe(200);
  const secondSearchBody = await secondSearch.json();
  expect(secondSearchBody.items).toHaveLength(1);
  const staleGuidePublicId = secondSearchBody.items[0].publicId as string;

  const staleRequest = {
    guidePublicId: staleGuidePublicId,
    observation: {
      publicId: `guide-status-${staleGuidePublicId}-stale`,
      sourceItemPublicId: externalEvidence.sourceItemPublicId,
      status: "stale",
      observedAt: "2026-08-31T10:00:00.000Z",
      localizations: [
        {
          locale: "en",
          staleReason: "The provider changed a referenced interface.",
          authorship: "human_authored",
          reviewStatus: "reviewed",
        },
        {
          locale: "zh",
          staleReason: "供应商修改了指南引用的界面。",
          authorship: "human_authored",
          reviewStatus: "reviewed",
        },
      ],
    },
  };
  const stale = await context.request.post(
    `${applicationUrl}/api/v1/admin/guide-status-observations`,
    { data: staleRequest },
  );
  expect(stale.status(), await stale.text()).toBe(201);

  const currentListAfterStale = await context.request.get(
    `${applicationUrl}/api/v1/guides?locale=en`,
  );
  expect(
    (await currentListAfterStale.json()).items.map(
      ({ publicId }: { publicId: string }) => publicId,
    ),
  ).not.toContain(staleGuidePublicId);
  const staleList = await context.request.get(
    `${applicationUrl}/api/v1/guides?locale=en&status=stale`,
  );
  expect(await staleList.json()).toMatchObject({
    items: [
      {
        publicId: staleGuidePublicId,
        currentStatus: {
          status: "stale",
          staleReason: "The provider changed a referenced interface.",
        },
      },
    ],
  });
  const staleDetail = await context.request.get(
    `${applicationUrl}/api/v1/guides/${staleGuidePublicId}?locale=en`,
  );
  expect(staleDetail.status()).toBe(200);
  expect(await staleDetail.json()).toMatchObject({
    currentStatus: {
      status: "stale",
      staleReason: "The provider changed a referenced interface.",
    },
  });

  const rehydratedSecondPage = await context.request.get(
    `${applicationUrl}/api/v1/search?q=Radar&locale=en&type=guide&limit=1&cursor=${encodeURIComponent(firstSearchBody.nextCursor)}`,
  );
  expect(rehydratedSecondPage.status()).toBe(200);
  expect((await rehydratedSecondPage.json()).items).toEqual([]);
  const freshSearchAfterStale = await context.request.get(
    `${applicationUrl}/api/v1/search?q=${encodeURIComponent(staleGuidePublicId)}&locale=en&type=guide`,
  );
  expect(
    (await freshSearchAfterStale.json()).items.map(
      ({ publicId }: { publicId: string }) => publicId,
    ),
  ).not.toContain(staleGuidePublicId);

  await page.goto(`${applicationUrl}/en/guides/${staleGuidePublicId}`);
  await expect(
    page.getByText("The provider changed a referenced interface."),
  ).toBeVisible();

  const openApiResponse = await context.request.get(
    `${applicationUrl}/api/openapi.json`,
  );
  expect(openApiResponse.status()).toBe(200);
  const openApi = await openApiResponse.json();
  const ajv = new Ajv2020({ strict: false });
  addFormats(ajv);
  const guideListSchema =
    openApi.paths["/api/v1/guides"].get.responses["200"].content[
      "application/json"
    ].schema;
  const guideDetailSchema =
    openApi.paths["/api/v1/guides/{publicId}"].get.responses["200"].content[
      "application/json"
    ].schema;
  const guideCreateSchema =
    openApi.paths["/api/v1/admin/guide-profiles"].post.requestBody.content[
      "application/json"
    ].schema;
  const guideStatusSchema =
    openApi.paths["/api/v1/admin/guide-status-observations"].post.requestBody
      .content["application/json"].schema;
  expect(ajv.compile(guideListSchema)(listBody)).toBe(true);
  expect(ajv.compile(guideDetailSchema)(detailBody)).toBe(true);
  expect(
    ajv.compile(guideDetailSchema)({
      ...detailBody,
      steps: detailBody.steps.map(
        (step: { kind: string; verifiedAt: string | null }) =>
          step.kind === "settings" ? { ...step, verifiedAt: null } : step,
      ),
    }),
  ).toBe(false);
  expect(ajv.compile(guideCreateSchema)(externalRequest)).toBe(true);
  expect(ajv.compile(guideStatusSchema)(staleRequest)).toBe(true);

  const withdrawal = await context.request.post(
    `${applicationUrl}/api/v1/admin/rights-decisions`,
    {
      data: {
        publicId: "rights-external-guide-source-withdrawal",
        case: {
          publicId: "case-external-guide-source-withdrawal",
          receivedAt: "2026-08-31T11:00:00.000Z",
          originalRequest: "Withdraw the external Guide source.",
          evidenceSummary: "The source owner requested withdrawal.",
        },
        target: {
          type: "source_item",
          publicId: externalEvidence.sourceItemPublicId,
        },
        toStatus: "withdrawn",
        publicReasonCode: "source_withdrawal",
        effectiveAt: "2026-08-31T11:00:00.000Z",
        internalNote: "Owner verified the source withdrawal.",
      },
    },
  );
  expect(withdrawal.status(), await withdrawal.text()).toBe(201);
  expect(
    (
      await context.request.get(
        `${applicationUrl}/api/v1/guides/guide-external-radar?locale=en`,
      )
    ).status(),
  ).toBe(404);
  for (const status of ["current", "stale"] as const) {
    const rightsFilteredList = await context.request.get(
      `${applicationUrl}/api/v1/guides?locale=en&status=${status}`,
    );
    expect(
      (await rightsFilteredList.json()).items.map(
        ({ publicId }: { publicId: string }) => publicId,
      ),
    ).not.toContain("guide-external-radar");
  }
  const rightsFilteredSearch = await context.request.get(
    `${applicationUrl}/api/v1/search?q=External%20Radar%20Guide&locale=en&type=guide`,
  );
  expect(
    (await rightsFilteredSearch.json()).items.map(
      ({ publicId }: { publicId: string }) => publicId,
    ),
  ).not.toContain("guide-external-radar");
});
