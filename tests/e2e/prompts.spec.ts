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

test("publishes rights-aware Prompt records and preserves stale compatibility history", async ({
  context,
  page,
}) => {
  if (!application) throw new Error("Test application did not start");
  const applicationUrl = application.url;
  const profileUrl = `${applicationUrl}/api/v1/admin/prompt-profiles`;
  const validationUrl = `${applicationUrl}/api/v1/admin/prompt-validation-observations`;

  expect((await context.request.post(profileUrl, { data: {} })).status()).toBe(
    401,
  );
  const owner = await completeFakeGithubOAuth({
    applicationUrl,
    databaseUrl: application.databaseUrl,
    ownerGithubId: "34471145",
    profile: {
      avatar_url: "https://avatars.example.test/prompt-owner",
      email: "prompt-owner@example.test",
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

  const createEvidenceEvent = async ({
    attribution = "Prompt author source",
    eventPublicId,
    rightsStatus = "open",
    sourceItemPublicId,
    title,
  }: {
    attribution?: string;
    eventPublicId: string;
    rightsStatus?: "open" | "attribution_required";
    sourceItemPublicId: string;
    title: string;
  }) => {
    const response = await context.request.post(
      `${applicationUrl}/api/v1/admin/event-drafts`,
      {
        data: {
          source: {
            publicId: `source-${eventPublicId}`,
            name: "Prompt author source",
            homepageUrl: "https://prompts.example.test/",
            tier: "A",
            accessStatus: "approved",
            acquisitionMethod: "manual",
            policyLastReviewedAt: "2026-08-01T00:00:00.000Z",
          },
          sourceItem: {
            publicId: sourceItemPublicId,
            externalId: sourceItemPublicId,
            externalIdVerifiedAt: "2026-08-20T08:00:00.000Z",
            isOriginalSource: true,
            originalUrl: `https://prompts.example.test/${sourceItemPublicId}`,
            canonicalUrl: `https://prompts.example.test/${sourceItemPublicId}`,
            originalTitle: title,
            originalLanguage: "en",
            publishedAt: "2026-08-20T08:00:00.000Z",
            publishedAtPrecision: "second",
            discoveredAt: "2026-08-20T09:00:00.000Z",
            rightsStatus,
            rightsCheckedAt: "2026-08-20T09:00:00.000Z",
            attribution,
            licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
          },
          event: {
            publicId: eventPublicId,
            eventType: "announces",
            factStatus: "confirmed",
            occurredAt: "2026-08-20T08:00:00.000Z",
            occurredAtPrecision: "second",
            lastVerifiedAt: "2026-08-20T09:00:00.000Z",
            rightsStatus: "open",
          },
          localizations: [
            {
              locale: "en",
              title,
              summary: "Verified Prompt source evidence.",
              authorship: "human_authored",
              reviewStatus: "reviewed",
            },
            {
              locale: "zh",
              title: `${title}（中文）`,
              summary: "经过核验的 Prompt 来源证据。",
              authorship: "human_authored",
              reviewStatus: "reviewed",
            },
          ],
        },
      },
    );
    expect(response.status()).toBe(201);
    expect(
      (
        await context.request.post(
          `${applicationUrl}/api/v1/admin/events/${eventPublicId}/publish`,
        )
      ).status(),
    ).toBe(200);
  };

  await createEvidenceEvent({
    attribution:
      "Credit Prompt Research Collective and link the licensed source.",
    eventPublicId: "event-prompt-review-source",
    rightsStatus: "attribution_required",
    sourceItemPublicId: "source-prompt-review",
    title: "Review Loop Prompt published under CC BY 4.0",
  });
  await createEvidenceEvent({
    eventPublicId: "event-prompt-external-source",
    sourceItemPublicId: "source-prompt-external",
    title: "External Prompt metadata published",
  });
  await createEvidenceEvent({
    eventPublicId: "event-prompt-stale-source",
    sourceItemPublicId: "source-prompt-stale",
    title: "Review Model compatibility changed",
  });

  const createEntity = async ({
    publicId,
    type,
    name,
    zhName,
    versions = [],
  }: {
    publicId: string;
    type: "model" | "product" | "prompt";
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
            publicId,
            type,
            officialName: name,
            officialUrl: `https://${publicId}.example.test/`,
            lastVerifiedAt: "2026-08-30T08:00:00.000Z",
            rightsStatus: "open",
          },
          localizations: [
            {
              locale: "en",
              name,
              summary: `${name} is a verified AI Radar record.`,
              authorship: "human_authored",
              reviewStatus: "reviewed",
            },
            {
              locale: "zh",
              name: zhName,
              summary: `${zhName}是经过核验的 AI Radar 记录。`,
              authorship: "human_authored",
              reviewStatus: "reviewed",
            },
          ],
          aliases: [],
          versions,
        },
      },
    );
    expect(response.status(), await response.text()).toBe(201);
  };

  await createEntity({
    publicId: "model-radar-review",
    type: "model",
    name: "Radar Review Model",
    zhName: "雷达审阅模型",
    versions: [
      {
        publicId: "model-radar-review-v1",
        versionLabel: "2026-08",
        releasedAt: "2026-08-01T08:00:00.000Z",
        releasedAtPrecision: "second",
      },
    ],
  });
  await createEntity({
    publicId: "product-radar-editor",
    type: "product",
    name: "Radar Editor",
    zhName: "雷达编辑器",
  });
  await createEntity({
    publicId: "prompt-review-loop",
    type: "prompt",
    name: "Review Loop Prompt",
    zhName: "审阅循环提示词",
  });
  await createEntity({
    publicId: "prompt-external-link",
    type: "prompt",
    name: "External Link Prompt",
    zhName: "外部链接提示词",
  });
  await createEntity({
    publicId: "prompt-profile-race",
    type: "prompt",
    name: "Prompt Profile Race",
    zhName: "提示词资料并发测试",
  });

  const searchBeforeProfile = await context.request.get(
    `${applicationUrl}/api/v1/search?q=Review%20Loop%20Prompt&locale=en&type=prompt`,
  );
  expect(searchBeforeProfile.status()).toBe(200);
  expect((await searchBeforeProfile.json()).items).toEqual([]);

  const createRelation = async ({
    publicId,
    promptPublicId,
    targetPublicId,
  }: {
    publicId: string;
    promptPublicId: string;
    targetPublicId: string;
  }) => {
    const response = await context.request.post(
      `${applicationUrl}/api/v1/admin/relations`,
      {
        data: {
          relation: {
            publicId,
            subject: { type: "entity", publicId: promptPublicId },
            predicate: "WORKS_WITH",
            objectEntityPublicId: targetPublicId,
            validFrom: "2026-08-20T08:00:00.000Z",
            validTo: null,
            firstVerifiedAt: "2026-08-20T09:00:00.000Z",
            lastVerifiedAt: "2026-08-20T09:00:00.000Z",
            confidence: 100,
            reviewStatus: "reviewed",
            creationMethod: "editor",
            rightsStatus: "open",
          },
          evidenceSourceItemPublicIds: ["source-prompt-review"],
        },
      },
    );
    expect(response.status(), await response.text()).toBe(201);
  };

  await createRelation({
    publicId: "relation-review-prompt-model",
    promptPublicId: "prompt-review-loop",
    targetPublicId: "model-radar-review",
  });
  await createRelation({
    publicId: "relation-review-prompt-editor",
    promptPublicId: "prompt-review-loop",
    targetPublicId: "product-radar-editor",
  });
  await createRelation({
    publicId: "relation-external-prompt-model",
    promptPublicId: "prompt-external-link",
    targetPublicId: "model-radar-review",
  });
  await createRelation({
    publicId: "relation-profile-race-model",
    promptPublicId: "prompt-profile-race",
    targetPublicId: "model-radar-review",
  });

  const invalidExternalFullText = await context.request.post(profileUrl, {
    data: {
      promptPublicId: "prompt-external-link",
      sourceItemPublicId: "source-prompt-external",
      author: { name: "External Author", url: null },
      provenance: "external_link",
      task: "coding",
      inputTypes: ["text"],
      rightsStatus: "link_only",
      license: null,
      fullText: "This third-party text must not be redistributed.",
      localizations: [
        {
          locale: "en",
          purpose: "Review code.",
          variables: [],
          inputExample: "A code sample",
          expectedOutputExample: "A review",
          knownLimitations: ["Version dependent"],
          authorship: "human_authored",
          reviewStatus: "reviewed",
        },
        {
          locale: "zh",
          purpose: "审阅代码。",
          variables: [],
          inputExample: "一段代码",
          expectedOutputExample: "审阅结果",
          knownLimitations: ["依赖具体版本"],
          authorship: "human_authored",
          reviewStatus: "reviewed",
        },
      ],
      compatibilities: [
        {
          publicId: "prompt-compat-invalid-external-model-v1",
          targetEntityPublicId: "model-radar-review",
          targetVersionPublicId: "model-radar-review-v1",
          verifiedVersion: "2026-08",
          validation: {
            publicId: "prompt-validation-invalid-external-current",
            sourceItemPublicId: "source-prompt-external",
            status: "current",
            validatedAt: "2026-08-24T08:00:00.000Z",
            observedAt: "2026-08-24T09:00:00.000Z",
            localizations: [],
          },
        },
      ],
    },
  });
  expect(invalidExternalFullText.status()).toBe(400);
  expect(await invalidExternalFullText.json()).toMatchObject({
    error: "invalid_request",
    issues: [expect.objectContaining({ path: ["fullText"] })],
  });

  const openProfileRequest = {
    promptPublicId: "prompt-review-loop",
    sourceItemPublicId: "source-prompt-review",
    author: {
      name: "AI Radar Editorial",
      url: "https://ai-radar.example.test/about",
    },
    provenance: "open_licensed",
    task: "coding",
    inputTypes: ["text", "code"],
    rightsStatus: "attribution_required",
    license: {
      name: "CC BY 4.0",
      url: "https://creativecommons.org/licenses/by/4.0/",
    },
    fullText:
      "Review {{code}} against {{goal}}. Return findings with evidence.",
    localizations: [
      {
        locale: "en",
        purpose: "Produce an evidence-based code review.",
        variables: [
          { name: "code", description: "Code to review", required: true },
          { name: "goal", description: "Expected behavior", required: true },
        ],
        inputExample: "A TypeScript handler and its acceptance criteria.",
        expectedOutputExample: "Prioritized findings with file references.",
        knownLimitations: ["Not validated for image-only models"],
        authorship: "human_authored",
        reviewStatus: "reviewed",
      },
      {
        locale: "zh",
        purpose: "生成基于证据的代码审阅。",
        variables: [
          { name: "code", description: "待审阅代码", required: true },
          { name: "goal", description: "预期行为", required: true },
        ],
        inputExample: "TypeScript 处理器及其验收标准。",
        expectedOutputExample: "带文件引用的分级问题清单。",
        knownLimitations: ["尚未针对纯图像模型验证"],
        authorship: "human_authored",
        reviewStatus: "reviewed",
      },
    ],
    compatibilities: [
      {
        publicId: "prompt-compat-review-model-v1",
        targetEntityPublicId: "model-radar-review",
        targetVersionPublicId: "model-radar-review-v1",
        verifiedVersion: "2026-08",
        validation: {
          publicId: "prompt-validation-review-model-current",
          sourceItemPublicId: "source-prompt-review",
          status: "current",
          validatedAt: "2026-08-25T08:00:00.000Z",
          observedAt: "2026-08-25T09:00:00.000Z",
          localizations: [],
        },
      },
      {
        publicId: "prompt-compat-review-editor",
        targetEntityPublicId: "product-radar-editor",
        targetVersionPublicId: null,
        verifiedVersion: "2026.08",
        validation: {
          publicId: "prompt-validation-review-editor-current",
          sourceItemPublicId: "source-prompt-review",
          status: "current",
          validatedAt: "2026-08-25T08:00:00.000Z",
          observedAt: "2026-08-25T09:01:00.000Z",
          localizations: [],
        },
      },
    ],
  };
  const openProfile = await context.request.post(profileUrl, {
    data: openProfileRequest,
  });
  expect(openProfile.status(), await openProfile.text()).toBe(201);

  const linkProfile = await context.request.post(profileUrl, {
    data: {
      promptPublicId: "prompt-external-link",
      sourceItemPublicId: "source-prompt-external",
      author: { name: "External Author", url: null },
      provenance: "external_link",
      task: "coding",
      inputTypes: ["text"],
      rightsStatus: "link_only",
      license: null,
      fullText: null,
      localizations: [
        {
          locale: "en",
          purpose: "Summarize an external code review workflow.",
          variables: [],
          inputExample: "A repository link.",
          expectedOutputExample: "A concise review plan.",
          knownLimitations: [
            "Full text is available only at the original source",
          ],
          authorship: "human_authored",
          reviewStatus: "reviewed",
        },
        {
          locale: "zh",
          purpose: "概述外部代码审阅工作流。",
          variables: [],
          inputExample: "一个代码仓库链接。",
          expectedOutputExample: "简洁的审阅计划。",
          knownLimitations: ["全文仅在原始来源提供"],
          authorship: "human_authored",
          reviewStatus: "reviewed",
        },
      ],
      compatibilities: [
        {
          publicId: "prompt-compat-external-model-v1",
          targetEntityPublicId: "model-radar-review",
          targetVersionPublicId: "model-radar-review-v1",
          verifiedVersion: "2026-08",
          validation: {
            publicId: "prompt-validation-external-model-current",
            sourceItemPublicId: "source-prompt-external",
            status: "current",
            validatedAt: "2026-08-24T08:00:00.000Z",
            observedAt: "2026-08-31T09:00:00.000Z",
            localizations: [],
          },
        },
      ],
    },
  });
  expect(linkProfile.status(), await linkProfile.text()).toBe(201);

  const raceControlDatabase = new Client({
    connectionString: application.databaseUrl,
  });
  const raceUpdateDatabase = new Client({
    connectionString: application.databaseUrl,
  });
  await Promise.all([
    raceControlDatabase.connect(),
    raceUpdateDatabase.connect(),
  ]);
  try {
    await raceControlDatabase.query(`
      create function pause_prompt_profile_insert() returns trigger
      language plpgsql as $$
      begin
        if new.entity_id = (
          select id from entities where public_id = 'prompt-profile-race'
        ) then
          perform pg_sleep(1);
        end if;
        return new;
      end;
      $$;
      create trigger pause_prompt_profile_insert
      after insert on prompt_profiles
      for each row execute function pause_prompt_profile_insert();
    `);
    const raceProfileCreation = context.request.post(profileUrl, {
      data: {
        ...openProfileRequest,
        promptPublicId: "prompt-profile-race",
        fullText: "Review {{code}} while preserving monotonic verification.",
        compatibilities: [
          {
            ...openProfileRequest.compatibilities[0],
            publicId: "prompt-compat-profile-race-model-v1",
            validation: {
              ...openProfileRequest.compatibilities[0].validation,
              publicId: "prompt-validation-profile-race-current",
            },
          },
        ],
      },
    });
    let creationIsPaused = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const pauseState = await raceControlDatabase.query(
        "select exists (select 1 from pg_stat_activity where datname = current_database() and wait_event = 'PgSleep' and query like '%prompt_profiles%') as paused",
      );
      creationIsPaused = pauseState.rows[0].paused;
      if (creationIsPaused) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(creationIsPaused).toBe(true);
    const newerVerification = raceUpdateDatabase.query(
      "update entities set last_verified_at = $1 where public_id = 'prompt-profile-race'",
      ["2026-08-30T12:00:00.000Z"],
    );
    const [raceProfileResponse] = await Promise.all([
      raceProfileCreation,
      newerVerification,
    ]);
    expect(raceProfileResponse.status(), await raceProfileResponse.text()).toBe(
      201,
    );
    const finalVerification = await raceControlDatabase.query(
      "select last_verified_at from entities where public_id = 'prompt-profile-race'",
    );
    expect(finalVerification.rows[0].last_verified_at.toISOString()).toBe(
      "2026-08-30T12:00:00.000Z",
    );
    await raceControlDatabase.query(
      "update entities set public_visibility = false where public_id = 'prompt-profile-race'",
    );
    expect(
      (
        await context.request.get(
          `${applicationUrl}/api/v1/prompts/prompt-profile-race?locale=en`,
        )
      ).status(),
    ).toBe(404);
  } finally {
    await raceControlDatabase.query(
      "drop trigger pause_prompt_profile_insert on prompt_profiles; drop function pause_prompt_profile_insert();",
    );
    await Promise.all([raceControlDatabase.end(), raceUpdateDatabase.end()]);
  }

  const list = await context.request.get(
    `${applicationUrl}/api/v1/prompts?locale=en&task=coding&model=model-radar-review&tool=product-radar-editor&rightsStatus=attribution_required&validation=current`,
  );
  expect(list.status()).toBe(200);
  const listBody = await list.json();
  expect(listBody).toMatchObject({
    locale: "en",
    methodology: {
      publicId: "prompt-task-fit",
      version: "1.0.0",
      kind: "filtered_discovery",
    },
    items: [
      {
        publicId: "prompt-review-loop",
        task: "coding",
        rightsStatus: "attribution_required",
        contentMode: "full_text",
      },
    ],
  });
  expect(JSON.stringify(listBody)).not.toContain('"score"');
  expect(
    (
      await context.request.get(
        `${applicationUrl}/api/v1/prompts?locale=en&view=global-ranking`,
      )
    ).status(),
  ).toBe(400);

  const openDetail = await context.request.get(
    `${applicationUrl}/api/v1/prompts/prompt-review-loop?locale=en`,
  );
  expect(openDetail.status()).toBe(200);
  const openDetailBody = await openDetail.json();
  expect(openDetailBody).toMatchObject({
    publicId: "prompt-review-loop",
    author: { name: "AI Radar Editorial" },
    provenance: "open_licensed",
    fullText:
      "Review {{code}} against {{goal}}. Return findings with evidence.",
    originalSource: {
      attribution:
        "Credit Prompt Research Collective and link the licensed source.",
    },
    variables: [
      { name: "code", required: true },
      { name: "goal", required: true },
    ],
    compatibilities: expect.arrayContaining([
      expect.objectContaining({
        publicId: "prompt-compat-review-model-v1",
        target: expect.objectContaining({
          publicId: "model-radar-review",
          version: "2026-08",
        }),
        currentValidation: expect.objectContaining({ status: "current" }),
      }),
      expect.objectContaining({
        publicId: "prompt-compat-review-editor",
        target: expect.objectContaining({
          publicId: "product-radar-editor",
          version: "2026.08",
        }),
      }),
    ]),
    relations: expect.arrayContaining([
      expect.objectContaining({
        predicate: "WORKS_WITH",
        publicId: "relation-review-prompt-model",
      }),
    ]),
  });
  const initialPromptSearch = await context.request.get(
    `${applicationUrl}/api/v1/search?q=Review%20Loop%20Prompt&locale=en&type=prompt`,
  );
  expect(initialPromptSearch.status()).toBe(200);
  const initialSearchItem = (await initialPromptSearch.json()).items.find(
    (item: { publicId: string }) => item.publicId === "prompt-review-loop",
  );
  const initialListItem = listBody.items.find(
    (item: { publicId: string }) => item.publicId === "prompt-review-loop",
  );
  expect(initialListItem.lastVerifiedAt).toBe(openDetailBody.lastVerifiedAt);
  expect(initialSearchItem.lastVerifiedAt).toBe(openDetailBody.lastVerifiedAt);
  expect(openDetailBody.lastVerifiedAt).toBe("2026-08-30T08:00:00.000Z");
  const linkDetail = await context.request.get(
    `${applicationUrl}/api/v1/prompts/prompt-external-link?locale=en`,
  );
  expect(linkDetail.status()).toBe(200);
  expect(await linkDetail.json()).toMatchObject({
    contentMode: "link_only",
    fullText: null,
    originalSource: {
      url: "https://prompts.example.test/source-prompt-external",
    },
  });

  const stale = await context.request.post(validationUrl, {
    data: {
      compatibilityPublicId: "prompt-compat-review-model-v1",
      observation: {
        publicId: "prompt-validation-review-model-stale",
        sourceItemPublicId: "source-prompt-stale",
        status: "stale",
        validatedAt: "2026-08-25T08:00:00.000Z",
        observedAt: "2026-08-30T10:00:00.000Z",
        localizations: [
          {
            locale: "en",
            staleReason: "A newer Model version changed tool-use behavior.",
            authorship: "human_authored",
            reviewStatus: "reviewed",
          },
          {
            locale: "zh",
            staleReason: "较新的模型版本改变了工具调用行为。",
            authorship: "human_authored",
            reviewStatus: "reviewed",
          },
        ],
      },
    },
  });
  expect(stale.status(), await stale.text()).toBe(201);
  const staleDetail = await context.request.get(
    `${applicationUrl}/api/v1/prompts/prompt-review-loop?locale=en`,
  );
  expect(staleDetail.status()).toBe(200);
  const staleDetailBody = await staleDetail.json();
  expect(staleDetailBody).toMatchObject({
    publicId: "prompt-review-loop",
    compatibilities: expect.arrayContaining([
      expect.objectContaining({
        publicId: "prompt-compat-review-model-v1",
        currentValidation: expect.objectContaining({
          status: "stale",
          staleReason: "A newer Model version changed tool-use behavior.",
        }),
      }),
    ]),
  });
  const staleList = await context.request.get(
    `${applicationUrl}/api/v1/prompts?locale=en&model=model-radar-review&validation=stale`,
  );
  expect(staleList.status()).toBe(200);
  expect((await staleList.json()).items).toEqual([
    expect.objectContaining({ publicId: "prompt-review-loop" }),
  ]);

  const search = await context.request.get(
    `${applicationUrl}/api/v1/search?q=Review%20Loop%20Prompt&locale=en&type=prompt`,
  );
  expect(search.status()).toBe(200);
  const searchBody = await search.json();
  expect(searchBody.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        publicId: "prompt-review-loop",
        lastVerifiedAt: staleDetailBody.lastVerifiedAt,
      }),
    ]),
  );
  await page.goto(
    `${applicationUrl}/en/prompts?task=coding&model=model-radar-review&tool=product-radar-editor&rightsStatus=attribution_required&validation=stale`,
  );
  await expect(
    page.getByRole("link", { name: "Review Loop Prompt" }),
  ).toBeVisible();
  await expect(page.getByText("AI Radar Editorial")).toBeVisible();
  await expect(
    page.getByText("Attribution required", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("does not publish a universal best Prompt ranking"),
  ).toBeVisible();

  await page.goto(
    `${applicationUrl}/zh/prompts?task=coding&model=model-radar-review&tool=product-radar-editor&rightsStatus=attribution_required&validation=stale`,
  );
  await expect(
    page.getByRole("link", { name: "审阅循环提示词" }),
  ).toBeVisible();
  await expect(
    page.getByText("AI Radar 不发布通用最佳 Prompt 总榜。", {
      exact: false,
    }),
  ).toBeVisible();

  await page.goto(
    `${applicationUrl}/en/search?q=Review%20Loop%20Prompt&type=prompt`,
  );
  await page.getByRole("link", { name: "Review Loop Prompt" }).first().click();
  await expect(page).toHaveURL(/\/en\/prompts\/prompt-review-loop(?:\?|$)/);
  await expect(page.getByText("CC BY 4.0")).toBeVisible();
  await expect(page.getByText("Full Prompt text")).toBeVisible();
  await expect(page.getByText("Stale")).toBeVisible();
  await expect(
    page.getByText(
      "Credit Prompt Research Collective and link the licensed source.",
    ),
  ).toBeVisible();

  await page.goto(`${applicationUrl}/zh/prompts/prompt-review-loop`);
  await expect(page.getByText("生成基于证据的代码审阅。")).toBeVisible();
  await expect(page.getByText("待审阅代码", { exact: false })).toBeVisible();
  await expect(
    page.getByText("较新的模型版本改变了工具调用行为。", {
      exact: false,
    }),
  ).toBeVisible();

  await page.goto(`${applicationUrl}/zh/prompts/prompt-external-link`);
  await expect(
    page.getByRole("heading", { name: "外部链接提示词" }),
  ).toBeVisible();
  await expect(page.getByText("仅原链接")).toBeVisible();
  await expect(page.getByText("正文未获再分发授权")).toBeVisible();
  await expect(page.getByText("This third-party text")).toHaveCount(0);

  const invalidLocale = await context.request.get(
    `${applicationUrl}/api/v1/prompts/prompt-review-loop?locale=fr`,
  );
  expect(invalidLocale.status()).toBe(400);
  const invalidLocaleBody = await invalidLocale.json();

  const snapshot = await context.request.get(
    `${applicationUrl}/api/v1/prompts?locale=en&limit=1`,
  );
  expect(snapshot.status()).toBe(200);
  const snapshotBody = await snapshot.json();
  expect(snapshotBody).toMatchObject({
    items: [expect.objectContaining({ publicId: "prompt-external-link" })],
    nextCursor: expect.any(String),
  });
  const decodedCursor = JSON.parse(
    Buffer.from(snapshotBody.nextCursor, "base64url").toString("utf8"),
  );
  for (const invalidCursor of [
    { ...decodedCursor, snapshotId: "not-a-uuid" },
    { ...decodedCursor, dataCutoff: "not-a-time" },
  ]) {
    const response = await context.request.get(
      `${applicationUrl}/api/v1/prompts?locale=en&limit=1&cursor=${Buffer.from(
        JSON.stringify(invalidCursor),
        "utf8",
      ).toString("base64url")}`,
    );
    expect(response.status()).toBe(400);
  }

  const openApiResponse = await context.request.get(
    `${applicationUrl}/api/openapi.json`,
  );
  expect(openApiResponse.status()).toBe(200);
  const openApi = await openApiResponse.json();
  const listSchema =
    openApi.paths["/api/v1/prompts"].get.responses["200"].content[
      "application/json"
    ].schema;
  const detailSchema =
    openApi.paths["/api/v1/prompts/{publicId}"].get.responses["200"].content[
      "application/json"
    ].schema;
  const invalidDetailSchema =
    openApi.paths["/api/v1/prompts/{publicId}"].get.responses["400"].content[
      "application/json"
    ].schema;
  const ajv = new Ajv2020({ strict: false });
  addFormats(ajv);
  expect(ajv.compile(listSchema)(listBody)).toBe(true);
  expect(ajv.compile(detailSchema)(openDetailBody)).toBe(true);
  expect(ajv.compile(invalidDetailSchema)(invalidLocaleBody)).toBe(true);

  const withdrawal = await context.request.post(
    `${applicationUrl}/api/v1/admin/rights-decisions`,
    {
      data: {
        publicId: "rights-prompt-stale-source-withdrawal",
        case: {
          publicId: "case-prompt-stale-source-withdrawal",
          receivedAt: "2026-08-31T10:00:00.000Z",
          originalRequest: "Withdraw the stale validation source.",
          evidenceSummary: "The source owner withdrew public access.",
        },
        target: { type: "source_item", publicId: "source-prompt-stale" },
        toStatus: "withdrawn",
        publicReasonCode: "source_withdrawal",
        effectiveAt: "2026-08-31T10:00:00.000Z",
        internalNote: "Owner verified the source withdrawal.",
      },
    },
  );
  expect(withdrawal.status(), await withdrawal.text()).toBe(201);

  const detailAfterWithdrawal = await context.request.get(
    `${applicationUrl}/api/v1/prompts/prompt-review-loop?locale=en`,
  );
  expect(detailAfterWithdrawal.status()).toBe(200);
  const detailAfterWithdrawalBody = await detailAfterWithdrawal.json();
  expect(detailAfterWithdrawalBody.compatibilities).toEqual([
    expect.objectContaining({ publicId: "prompt-compat-review-editor" }),
  ]);
  expect(JSON.stringify(detailAfterWithdrawalBody)).not.toContain(
    "prompt-validation-review-model-current",
  );
  const currentModelAfterWithdrawal = await context.request.get(
    `${applicationUrl}/api/v1/prompts?locale=en&model=model-radar-review&rightsStatus=attribution_required&validation=current`,
  );
  expect(currentModelAfterWithdrawal.status()).toBe(200);
  expect((await currentModelAfterWithdrawal.json()).items).toEqual([]);
  const frozenPageAfterWithdrawal = await context.request.get(
    `${applicationUrl}/api/v1/prompts?locale=en&limit=1&cursor=${encodeURIComponent(snapshotBody.nextCursor)}`,
  );
  expect(frozenPageAfterWithdrawal.status()).toBe(200);
  expect(await frozenPageAfterWithdrawal.json()).toMatchObject({
    items: [],
    nextCursor: null,
  });
});
