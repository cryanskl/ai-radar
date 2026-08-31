import { expect, test } from "@playwright/test";
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

test("composes the bilingual homepage from published Event and Featured records", async ({
  context,
  page,
}) => {
  if (!application) throw new Error("Test application did not start");

  const owner = await completeFakeGithubOAuth({
    applicationUrl: application.url,
    databaseUrl: application.databaseUrl,
    ownerGithubId: "34471145",
    profile: {
      avatar_url: "https://avatars.example.test/homepage-owner",
      email: "homepage-owner@example.test",
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

  const eventPublicId = "event-homepage-model-release";
  const sourceItemPublicId = "source-item-homepage-model-release";
  const draft = await context.request.post(
    `${application.url}/api/v1/admin/event-drafts`,
    {
      data: {
        source: {
          publicId: "source-homepage-model-lab",
          name: "Model Lab",
          homepageUrl: "https://model-lab.example.test/",
          tier: "A",
          accessStatus: "approved",
          acquisitionMethod: "manual",
          policyLastReviewedAt: "2026-08-30T08:00:00.000Z",
        },
        sourceItem: {
          publicId: sourceItemPublicId,
          externalId: "homepage-model-release",
          externalIdVerifiedAt: "2026-08-30T08:00:00.000Z",
          isOriginalSource: true,
          originalUrl: "https://model-lab.example.test/releases/one",
          canonicalUrl: "https://model-lab.example.test/releases/one",
          originalTitle: "Model Lab releases One",
          originalLanguage: "en",
          publishedAt: "2026-08-30T08:00:00.000Z",
          publishedAtPrecision: "second",
          discoveredAt: "2026-08-30T08:05:00.000Z",
          rightsStatus: "metadata_only",
          rightsCheckedAt: "2026-08-30T08:05:00.000Z",
          attribution: "Model Lab",
          licenseUrl: null,
        },
        event: {
          publicId: eventPublicId,
          eventType: "announces",
          factStatus: "confirmed",
          occurredAt: "2026-08-30T08:00:00.000Z",
          occurredAtPrecision: "second",
          lastVerifiedAt: "2026-08-30T08:05:00.000Z",
          rightsStatus: "metadata_only",
        },
        localizations: [
          {
            locale: "en",
            title: "Model Lab releases One with a longer context window",
            summary:
              "The exact One release adds a longer context window and a new coding evaluation.",
            authorship: "human_authored",
            reviewStatus: "reviewed",
          },
          {
            locale: "zh",
            title: "Model Lab 发布上下文窗口更长的 One",
            summary: "明确版本 One 增加了更长的上下文窗口和新的编程评测。",
            authorship: "human_authored",
            reviewStatus: "reviewed",
          },
        ],
      },
    },
  );
  expect(draft.status(), await draft.text()).toBe(201);
  const published = await context.request.post(
    `${application.url}/api/v1/admin/events/${eventPublicId}/publish`,
  );
  expect(published.status(), await published.text()).toBe(200);

  const model = await context.request.post(
    `${application.url}/api/v1/admin/entities`,
    {
      data: {
        entity: {
          publicId: "model-homepage-one",
          type: "model",
          officialName: "Model One",
          officialUrl: "https://model-lab.example.test/models/one",
          lastVerifiedAt: "2026-08-30T08:05:00.000Z",
          rightsStatus: "metadata_only",
        },
        localizations: [
          {
            locale: "en",
            name: "Model One",
            summary: "A model family with one verified release.",
            authorship: "human_authored",
            reviewStatus: "reviewed",
          },
          {
            locale: "zh",
            name: "模型 One",
            summary: "包含一个已核验版本的模型系列。",
            authorship: "human_authored",
            reviewStatus: "reviewed",
          },
        ],
        aliases: [],
        versions: [
          {
            publicId: "model-homepage-one-v1",
            versionLabel: "One v1",
            releasedAt: "2026-08-30T08:00:00.000Z",
            releasedAtPrecision: "second",
          },
        ],
      },
    },
  );
  expect(model.status(), await model.text()).toBe(201);
  const relation = await context.request.post(
    `${application.url}/api/v1/admin/relations`,
    {
      data: {
        relation: {
          publicId: "relation-homepage-event-announces-model",
          subject: { type: "event", publicId: eventPublicId },
          predicate: "ANNOUNCES",
          objectEntityPublicId: "model-homepage-one",
          validFrom: "2026-08-30T08:00:00.000Z",
          validTo: null,
          firstVerifiedAt: "2026-08-30T08:05:00.000Z",
          lastVerifiedAt: "2026-08-30T08:05:00.000Z",
          confidence: 95,
          reviewStatus: "reviewed",
          creationMethod: "editor",
          rightsStatus: "metadata_only",
        },
        evidenceSourceItemPublicIds: [sourceItemPublicId],
      },
    },
  );
  expect(relation.status(), await relation.text()).toBe(201);
  const provider = await context.request.post(
    `${application.url}/api/v1/admin/entities`,
    {
      data: {
        entity: {
          publicId: "organization-homepage-model-lab",
          type: "organization",
          officialName: "Model Lab",
          officialUrl: "https://model-lab.example.test/",
          lastVerifiedAt: "2026-08-30T08:05:00.000Z",
          rightsStatus: "metadata_only",
        },
        localizations: [
          {
            locale: "en",
            name: "Model Lab",
            summary: "The provider of Model One.",
            authorship: "human_authored",
            reviewStatus: "reviewed",
          },
          {
            locale: "zh",
            name: "模型实验室",
            summary: "模型 One 的提供商。",
            authorship: "human_authored",
            reviewStatus: "reviewed",
          },
        ],
        aliases: [],
        versions: [],
      },
    },
  );
  expect(provider.status(), await provider.text()).toBe(201);
  const modelProfile = await context.request.post(
    `${application.url}/api/v1/admin/model-version-profiles`,
    {
      data: {
        familyPublicId: "model-homepage-one",
        versionPublicId: "model-homepage-one-v1",
        providerPublicId: "organization-homepage-model-lab",
        lifecycleStatus: "active",
        inputModalities: ["text"],
        outputModalities: ["text"],
        contextWindowTokens: 128000,
        accessMethods: ["hosted_api"],
        regions: ["global"],
        priceRecords: [],
        benchmarkRuns: [],
      },
    },
  );
  expect(modelProfile.status(), await modelProfile.text()).toBe(201);

  const product = await context.request.post(
    `${application.url}/api/v1/admin/entities`,
    {
      data: {
        entity: {
          publicId: "product-homepage-console",
          type: "product",
          officialName: "Model Lab Console",
          officialUrl: "https://model-lab.example.test/console",
          lastVerifiedAt: "2026-08-30T08:17:00.000Z",
          rightsStatus: "metadata_only",
        },
        localizations: [
          {
            locale: "en",
            name: "Model Lab Console",
            summary: "A developer console for Model Lab services.",
            authorship: "human_authored",
            reviewStatus: "reviewed",
          },
          {
            locale: "zh",
            name: "模型实验室控制台",
            summary: "用于访问模型实验室服务的开发者控制台。",
            authorship: "human_authored",
            reviewStatus: "reviewed",
          },
        ],
        aliases: [],
        versions: [],
      },
    },
  );
  expect(product.status(), await product.text()).toBe(201);
  const productProfile = await context.request.post(
    `${application.url}/api/v1/admin/product-profiles`,
    {
      data: {
        productPublicId: "product-homepage-console",
        category: "developer_tool",
        platforms: ["web"],
        audienceTypes: ["developers"],
        observations: [
          {
            publicId: "product-observation-homepage-console",
            sourceItemPublicId,
            effectiveAt: "2026-08-30T08:09:00.000Z",
            observedAt: "2026-08-30T08:12:00.000Z",
            changeKind: "product_update",
            lifecycleStatus: "active",
            availabilityRegions: ["global"],
            pricingMode: "free",
            commercialRelationship: "none_disclosed",
            commercialDisclosure: null,
            vendorReportedMetrics: [],
          },
        ],
      },
    },
  );
  expect(productProfile.status(), await productProfile.text()).toBe(201);
  const productOwnership = await context.request.post(
    `${application.url}/api/v1/admin/relations`,
    {
      data: {
        relation: {
          publicId: "relation-homepage-lab-develops-console",
          subject: {
            type: "entity",
            publicId: "organization-homepage-model-lab",
          },
          predicate: "DEVELOPS",
          objectEntityPublicId: "product-homepage-console",
          validFrom: "2026-08-30T08:09:00.000Z",
          validTo: null,
          firstVerifiedAt: "2026-08-30T08:09:00.000Z",
          lastVerifiedAt: "2026-08-30T08:09:00.000Z",
          confidence: 95,
          reviewStatus: "reviewed",
          creationMethod: "editor",
          rightsStatus: "metadata_only",
        },
        evidenceSourceItemPublicIds: [sourceItemPublicId],
      },
    },
  );
  expect(productOwnership.status(), await productOwnership.text()).toBe(201);

  const featured = await context.request.post(
    `${application.url}/api/v1/admin/featured-selections`,
    {
      data: {
        publicId: "featured-homepage-model-release",
        target: { type: "event", publicId: eventPublicId },
        selectedAt: "2026-08-30T08:10:00.000Z",
        reviewDueAt: "2026-09-30T08:10:00.000Z",
        editorRole: "AI Radar Editor",
        topic: "model-releases",
        commercialRelationship: "none",
        rankingInfluence: false,
        evidenceSourceItemPublicIds: [sourceItemPublicId],
        localizations: [
          {
            locale: "en",
            reason: "A version-specific release with primary evidence.",
            audience: "Developers comparing model capabilities",
            commercialDisclosure: "No commercial relationship.",
            authorship: "human_authored",
            reviewStatus: "reviewed",
          },
          {
            locale: "zh",
            reason: "有一手证据且明确到版本的重要发布。",
            audience: "比较模型能力的开发者",
            commercialDisclosure: "无商业关系。",
            authorship: "human_authored",
            reviewStatus: "reviewed",
          },
        ],
      },
    },
  );
  expect(featured.status(), await featured.text()).toBe(201);

  for (const index of [1, 2, 3, 4]) {
    const auxiliaryDefinition = await context.request.post(
      `${application.url}/api/v1/admin/ranking-definitions`,
      {
        data: {
          definitionPublicId: `ranking-homepage-auxiliary-event-${index}`,
          targetType: "event",
          methodologyVersion: "1.0.0",
          effectiveAt: `2026-08-30T08:0${index}:00.000Z`,
          eligibility: ["Public, rights-cleared Events"],
          dimensions: ["occurred time"],
          method: {
            kind: "latest",
            timeField: "occurred_at",
            tieBreaker: "confidence_then_public_id",
          },
          localizations: [
            {
              locale: "en",
              title: `Auxiliary Event ranking ${index}`,
              question: "Which verified Events occurred most recently?",
              eligibilitySummary: "Only public Events qualify.",
              limitations: ["This definition exercises homepage selection."],
              authorship: "human_authored",
              reviewStatus: "reviewed",
            },
            {
              locale: "zh",
              title: `辅助事件榜单 ${index}`,
              question: "哪些已核验事件最近发生？",
              eligibilitySummary: "只有公开事件可以进入。",
              limitations: ["此定义用于验证首页选择顺序。"],
              authorship: "human_authored",
              reviewStatus: "reviewed",
            },
          ],
        },
      },
    );
    expect(auxiliaryDefinition.status(), await auxiliaryDefinition.text()).toBe(
      201,
    );
  }

  const definition = await context.request.post(
    `${application.url}/api/v1/admin/ranking-definitions`,
    {
      data: {
        definitionPublicId: "ranking-homepage-latest-model",
        targetType: "model",
        methodologyVersion: "1.0.0",
        effectiveAt: "2026-08-30T08:10:00.000Z",
        eligibility: ["Public, rights-cleared Models"],
        dimensions: ["released time"],
        method: {
          kind: "latest",
          timeField: "released_at",
          tieBreaker: "confidence_then_public_id",
        },
        localizations: [
          {
            locale: "en",
            title: "Latest verified Models",
            question: "Which verified models were released most recently?",
            eligibilitySummary: "Only public Models qualify.",
            limitations: ["Latest does not mean most important."],
            authorship: "human_authored",
            reviewStatus: "reviewed",
          },
          {
            locale: "zh",
            title: "最新核验模型",
            question: "哪些已核验的模型最近发布？",
            eligibilitySummary: "只有公开模型可以进入。",
            limitations: ["最新不代表最重要。"],
            authorship: "human_authored",
            reviewStatus: "reviewed",
          },
        ],
      },
    },
  );
  expect(definition.status(), await definition.text()).toBe(201);
  const observation = await context.request.post(
    `${application.url}/api/v1/admin/ranking-observations`,
    {
      data: {
        definitionPublicId: "ranking-homepage-latest-model",
        methodologyVersion: "1.0.0",
        observation: {
          publicId: "ranking-observation-homepage-model",
          target: {
            type: "model",
            publicId: "model-homepage-one",
            versionPublicId: null,
          },
          observedAt: "2026-08-30T08:15:00.000Z",
          dataCutoff: "2026-08-30T08:10:00.000Z",
          comparison: null,
          confidence: "high",
          rawMetrics: { timeField: "released_at" },
          evidenceSourceItemPublicIds: [sourceItemPublicId],
          signals: [],
        },
      },
    },
  );
  expect(observation.status(), await observation.text()).toBe(201);

  const trendingDefinition = await context.request.post(
    `${application.url}/api/v1/admin/ranking-definitions`,
    {
      data: {
        definitionPublicId: "ranking-homepage-trending-event",
        targetType: "event",
        methodologyVersion: "1.0.0",
        effectiveAt: "2026-08-30T08:11:00.000Z",
        eligibility: ["At least two signals from two independent sources"],
        dimensions: ["attention velocity"],
        method: {
          kind: "trending",
          windowHours: 24,
          sourceNormalization: "within_source_percentile",
          minimumSignals: 2,
          minimumSources: 2,
          breadthSaturationSources: 3,
          freshnessHalfLifeHours: 12,
          formula:
            "mean_by_source(mean((0.6 * source percentile + 0.4 * velocity) * freshness)) * confidence * source breadth",
          tieBreaker: "score_then_public_id",
        },
        localizations: [
          {
            locale: "en",
            title: "Trending Events",
            question: "Which verified Events are gaining attention?",
            eligibilitySummary: "Two independent signals are required.",
            limitations: ["Attention does not measure importance."],
            authorship: "human_authored",
            reviewStatus: "reviewed",
          },
          {
            locale: "zh",
            title: "趋势事件",
            question: "哪些已核验事件正在获得关注？",
            eligibilitySummary: "至少需要两个独立信号。",
            limitations: ["关注度不等于重要性。"],
            authorship: "human_authored",
            reviewStatus: "reviewed",
          },
        ],
      },
    },
  );
  expect(trendingDefinition.status(), await trendingDefinition.text()).toBe(
    201,
  );
  const insufficientTrendingObservation = await context.request.post(
    `${application.url}/api/v1/admin/ranking-observations`,
    {
      data: {
        definitionPublicId: "ranking-homepage-trending-event",
        methodologyVersion: "1.0.0",
        observation: {
          publicId: "ranking-observation-homepage-trending-insufficient",
          target: {
            type: "event",
            publicId: eventPublicId,
            versionPublicId: null,
          },
          observedAt: "2026-08-30T08:16:00.000Z",
          dataCutoff: "2026-08-30T08:10:00.000Z",
          comparison: null,
          confidence: "low",
          rawMetrics: {},
          evidenceSourceItemPublicIds: [sourceItemPublicId],
          signals: [],
        },
      },
    },
  );
  expect(
    insufficientTrendingObservation.status(),
    await insufficientTrendingObservation.text(),
  ).toBe(201);
  expect(await insufficientTrendingObservation.json()).toMatchObject({
    status: "insufficient_evidence",
  });

  await page.goto(`${application.url}/en`);
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.reload();
  await expect(page).toHaveTitle(/AI Radar/);
  const alphaNotice = page.locator('[data-component="alpha-notice"]');
  await expect(alphaNotice).toContainText("Public Alpha");
  await expect(alphaNotice).toContainText(
    "The open, bilingual map of global AI.",
  );
  await expect(alphaNotice).toContainText(
    "English and Chinese sources; global Events",
  );
  await expect(alphaNotice).toContainText("Data cutoff");
  await expect(
    alphaNotice.getByRole("link", { name: "Coverage and known limitations" }),
  ).toHaveAttribute("href", "/en/trust");
  await expect(
    page.getByRole("navigation", { name: "Primary navigation" }),
  ).toContainText("RadarModelsPapersProductsGitHubPromptsSkillsGuides");
  await expect(page.getByRole("search")).toContainText("Ask AI Radar");
  await expect(
    page.getByRole("heading", { name: "Today’s Brief" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Top Stories" }),
  ).toBeVisible();
  const featuredCard = page.locator('[data-component="featured-card"]');
  await expect(featuredCard).toContainText(
    "Model Lab releases One with a longer context window",
  );
  await expect(featuredCard).toContainText(
    "A version-specific release with primary evidence.",
  );
  await expect(featuredCard).toContainText("No commercial relationship.");
  await expect(
    featuredCard.getByRole("link", {
      name: "Model Lab releases One",
      exact: true,
    }),
  ).toHaveAttribute("href", "https://model-lab.example.test/releases/one");
  const eventRow = page.locator('[data-component="event-row"]');
  await expect(eventRow).toContainText(
    "The exact One release adds a longer context window",
  );
  await expect(eventRow).toContainText("Model Lab");
  await expect(eventRow).toContainText("1 source");
  await expect(eventRow).toContainText("Model One");
  await expect(eventRow).toContainText("confirmed");
  await expect(eventRow).toContainText("Last verified");
  const rankingRow = page.locator('[data-component="ranking-row"]');
  await expect(rankingRow).toContainText("#1");
  await expect(rankingRow).toContainText("Model One");
  await expect(rankingRow).toContainText("released_at");
  await expect(rankingRow).toContainText("v1.0.0");
  await expect(rankingRow).toContainText("Model Lab releases One");
  const modelCard = page
    .locator('[data-component="entity-card"]')
    .filter({ hasText: "Model One" });
  await expect(modelCard).toContainText("1 relation");
  await expect(modelCard).toContainText("Last verified");
  const productCard = page
    .locator('[data-component="entity-card"]')
    .filter({ hasText: "Model Lab Console" });
  await expect(productCard).toContainText("Observed: 2026-08-30T08:12:00.000Z");
  await expect(productCard).toContainText(
    "Last verified: 2026-08-30T08:17:00.000Z",
  );

  await page.goto(`${application.url}/en?view=trending`);
  await expect(page.locator('[data-component="event-row"]')).toHaveCount(0);
  await expect(
    page.getByText("Insufficient evidence", { exact: true }),
  ).toBeVisible();
  await page.goto(`${application.url}/en?view=featured`);
  await expect(page.locator('[data-component="event-row"]')).toContainText(
    "Model Lab releases One with a longer context window",
  );

  await page.goto(`${application.url}/zh`);
  const chineseAlphaNotice = page.locator('[data-component="alpha-notice"]');
  await expect(chineseAlphaNotice).toContainText("公开测试版");
  await expect(chineseAlphaNotice).toContainText(
    "开放、双语、全景的全球 AI 信息雷达。",
  );
  await expect(chineseAlphaNotice).toContainText(
    "以中英文来源为主，事件面向全球",
  );
  await expect(
    chineseAlphaNotice.getByRole("link", { name: "覆盖范围与已知限制" }),
  ).toHaveAttribute("href", "/zh/trust");
  await expect(page.getByRole("heading", { name: "今日简报" })).toBeVisible();
  await expect(page.locator('[data-component="featured-card"]')).toContainText(
    "有一手证据且明确到版本的重要发布。",
  );
  await expect(page.locator('[data-component="event-row"]')).toContainText(
    "明确版本 One 增加了更长的上下文窗口",
  );
  await expect(page.locator('[data-component="event-row"]')).toContainText(
    "模型 One",
  );
  await expect(page.locator('[data-component="ranking-row"]')).toContainText(
    "模型 One",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${application.url}/en?view=featured`);
  await expect(page.locator('[data-component="featured-card"]')).toContainText(
    "2026-08-30T08:10:00.000Z",
  );
  await page.goto(`${application.url}/zh?view=featured`);
  await expect(page.locator('[data-component="featured-card"]')).toContainText(
    "2026-08-30T08:10:00.000Z",
  );
});

test("exposes every homepage domain and stays keyboard-accessible without mobile overflow", async ({
  page,
}) => {
  if (!application) throw new Error("Test application did not start");

  await page.goto(`${application.url}/en`);
  const headings = await page.locator("main h1, main h2").allTextContents();
  expect(headings).toEqual([
    "Today’s Brief",
    "Top Stories",
    "The Radar",
    "Models / Benchmark Updates",
    "Trending Papers",
    "GitHub New & Rising",
    "Product Updates",
    "Prompts & Skills",
    "Guides",
    "Topics",
    "Stay current",
    "Open Source & Open Data",
    "Trust Center",
  ]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const ask = page.getByRole("link", { name: "Ask AI Radar" });
  let reachedAsk = false;
  for (let index = 0; index < 80; index += 1) {
    await page.keyboard.press("Tab");
    if (await ask.evaluate((element) => element === document.activeElement)) {
      reachedAsk = true;
      break;
    }
  }
  expect(reachedAsk).toBe(true);
  await expect(ask).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/en\/ask$/);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${application.url}/en`);
  const mobileNavigation = page.getByRole("navigation", {
    name: "Mobile navigation",
  });
  await expect(mobileNavigation).toContainText("HomeRadarExploreSearchSaved");
  const explore = page.getByRole("navigation", { name: "Explore AI domains" });
  await expect(explore.getByRole("link")).toHaveCount(8);
  for (const domain of [
    "Radar",
    "Models",
    "Papers",
    "Products",
    "GitHub",
    "Prompts",
    "Skills",
    "Guides",
  ]) {
    await expect(
      explore.getByRole("link", { name: new RegExp(`^${domain}`) }),
    ).toBeVisible();
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await page.goto(`${application.url}/zh`);
  await expect(
    page.getByRole("heading", { name: "模型与基准更新" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "论文趋势" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "信任中心" })).toBeVisible();
  const chineseMobileNavigation = page.getByRole("navigation", {
    name: "移动导航",
  });
  await expect(chineseMobileNavigation).toContainText("首页动态探索搜索收藏");
  await expect(
    chineseMobileNavigation.getByRole("link", { name: "收藏" }),
  ).toHaveAttribute("href", "/zh/saved");
  const chineseExplore = page.getByRole("navigation", {
    name: "探索 AI 领域",
  });
  await expect(chineseExplore.getByRole("link")).toHaveCount(8);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await chineseMobileNavigation.getByRole("link", { name: "收藏" }).click();
  await expect(page).toHaveURL(/\/zh\/saved$/);
  await expect(page.getByRole("heading", { name: "收藏" })).toBeVisible();
  await expect(page.getByText("收藏记录只保存在当前浏览器中")).toBeVisible();
});
