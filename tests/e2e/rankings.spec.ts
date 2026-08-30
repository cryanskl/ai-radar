import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
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

test("publishes versioned Rankings and keeps Featured editorially separate", async ({
  context,
  page,
}) => {
  if (!application) throw new Error("Test application did not start");
  const applicationUrl = application.url;
  const definitionUrl = `${applicationUrl}/api/v1/admin/ranking-definitions`;
  const observationUrl = `${applicationUrl}/api/v1/admin/ranking-observations`;
  const featuredUrl = `${applicationUrl}/api/v1/admin/featured-selections`;

  expect(
    (await context.request.post(definitionUrl, { data: {} })).status(),
  ).toBe(401);
  expect(
    (await context.request.post(observationUrl, { data: {} })).status(),
  ).toBe(401);
  expect((await context.request.post(featuredUrl, { data: {} })).status()).toBe(
    401,
  );

  const owner = await completeFakeGithubOAuth({
    applicationUrl,
    databaseUrl: application.databaseUrl,
    ownerGithubId: "34471145",
    profile: {
      avatar_url: "https://avatars.example.test/ranking-owner",
      email: "ranking-owner@example.test",
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
    const eventPublicId = `event-ranking-${key}`;
    const sourceItemPublicId = `source-item-ranking-${key}`;
    const draft = await context.request.post(
      `${applicationUrl}/api/v1/admin/event-drafts`,
      {
        data: {
          source: {
            publicId: `source-ranking-${key}`,
            name: `${title} source`,
            homepageUrl: `https://ranking-${key}.example.test/`,
            tier: "A",
            accessStatus: "approved",
            acquisitionMethod: "manual",
            policyLastReviewedAt: "2026-08-01T00:00:00.000Z",
          },
          sourceItem: {
            publicId: sourceItemPublicId,
            externalId: `ranking-${key}`,
            externalIdVerifiedAt: "2026-08-30T08:00:00.000Z",
            isOriginalSource: true,
            originalUrl: `https://ranking-${key}.example.test/evidence`,
            canonicalUrl: `https://ranking-${key}.example.test/`,
            originalTitle: title,
            originalLanguage: "en",
            publishedAt: "2026-08-30T08:00:00.000Z",
            publishedAtPrecision: "second",
            discoveredAt: "2026-08-30T08:30:00.000Z",
            rightsStatus: "open",
            rightsCheckedAt: "2026-08-30T08:30:00.000Z",
            attribution: `${title} authors`,
            licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
          },
          event: {
            publicId: eventPublicId,
            eventType: "updates",
            factStatus: "confirmed",
            occurredAt: "2026-08-30T08:00:00.000Z",
            occurredAtPrecision: "second",
            lastVerifiedAt: "2026-08-30T08:30:00.000Z",
            rightsStatus: "open",
          },
          localizations: [
            {
              locale: "en",
              title,
              summary: `${title} supplies public Ranking evidence.`,
              authorship: "human_authored",
              reviewStatus: "reviewed",
            },
            {
              locale: "zh",
              title: `${title} 中文`,
              summary: `${title}提供公开榜单证据。`,
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

  const sourceA = await publishEvidence("source-a", "Ranking Source A");
  const sourceB = await publishEvidence("source-b", "Ranking Source B");
  const sourceASecond = {
    sourceItemPublicId: "source-item-ranking-source-a-second",
  };
  const seedClient = new Client({ connectionString: application.databaseUrl });
  await seedClient.connect();
  try {
    await seedClient.query(
      `insert into source_items (
         id, public_id, source_id, external_id, external_id_verified_at,
         is_original_source, original_url, canonical_url, original_title,
         original_language, published_at, published_at_precision, discovered_at,
         rights_status, rights_checked_at, attribution, license_url,
         public_visibility
       ) select $1, $2, id, $3, $4, true, $5, $5, $6, 'en', $4, 'second',
         $4, 'open', $4, $7, $8, true
       from sources where public_id = $9`,
      [
        randomUUID(),
        sourceASecond.sourceItemPublicId,
        "ranking-source-a-second",
        "2026-08-30T08:05:00.000Z",
        "https://ranking-source-a.example.test/evidence-second",
        "Ranking Source A second item",
        "Ranking Source A authors",
        "https://creativecommons.org/licenses/by/4.0/",
        "source-ranking-source-a",
      ],
    );
  } finally {
    await seedClient.end();
  }
  const featuredEvidence = await publishEvidence(
    "featured",
    "Featured selection evidence",
  );

  const createEntity = async (
    publicId: string,
    type: "repository" | "paper" | "model" | "benchmark" | "organization",
    name: string,
    zhName: string,
    versions: Array<{
      publicId: string;
      versionLabel: string;
      releasedAt: string;
      releasedAtPrecision: "day" | "minute" | "second";
    }> = [],
  ) => {
    const response = await context.request.post(
      `${applicationUrl}/api/v1/admin/entities`,
      {
        data: {
          entity: {
            publicId,
            type,
            officialName: name,
            officialUrl: `https://${publicId}.example.test/`,
            lastVerifiedAt: "2026-08-31T08:00:00.000Z",
            rightsStatus: "open",
          },
          localizations: [
            {
              locale: "en",
              name,
              summary: `${name} is an evidenced Ranking candidate.`,
              authorship: "human_authored",
              reviewStatus: "reviewed",
            },
            {
              locale: "zh",
              name: zhName,
              summary: `${zhName}是有证据的榜单候选项。`,
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
  await createEntity(
    "repository-ranking-alpha",
    "repository",
    "Ranking Repository Alpha",
    "榜单仓库甲",
  );
  await createEntity(
    "repository-ranking-beta",
    "repository",
    "Ranking Repository Beta",
    "榜单仓库乙",
  );
  await createEntity(
    "repository-ranking-gamma",
    "repository",
    "Ranking Repository Gamma",
    "榜单仓库丙",
  );
  await createEntity(
    "repository-ranking-delta",
    "repository",
    "Ranking Repository Delta",
    "榜单仓库丁",
  );
  await createEntity(
    "paper-ranking-featured",
    "paper",
    "Featured Ranking Paper",
    "精选榜单论文",
  );
  await createEntity(
    "organization-ranking-lab",
    "organization",
    "Ranking Lab",
    "榜单实验室",
  );
  await createEntity(
    "benchmark-swe-bench-verified",
    "benchmark",
    "SWE-bench Verified",
    "SWE-bench Verified 基准",
  );
  await createEntity(
    "benchmark-ranking-latency",
    "benchmark",
    "Ranking Latency",
    "榜单延迟基准",
  );
  const modelVersions = [
    {
      publicId: "model-ranking-family-v1",
      versionLabel: "v1",
      releasedAt: "2026-08-20T00:00:00.000Z",
      releasedAtPrecision: "second" as const,
      quality: "80.00000000",
      latency: "200.00000000",
      price: "2.00000000",
    },
    {
      publicId: "model-ranking-family-v2",
      versionLabel: "v2",
      releasedAt: "2026-08-30T00:00:00.000Z",
      releasedAtPrecision: "second" as const,
      quality: "80.00000000",
      latency: "100.00000000",
      price: "1.00000000",
    },
  ];
  await createEntity(
    "model-ranking-family",
    "model",
    "Ranking Model",
    "榜单模型",
    modelVersions.map((version) => ({
      publicId: version.publicId,
      versionLabel: version.versionLabel,
      releasedAt: version.releasedAt,
      releasedAtPrecision: version.releasedAtPrecision,
    })),
  );
  for (const version of modelVersions) {
    const profile = await context.request.post(
      `${applicationUrl}/api/v1/admin/model-version-profiles`,
      {
        data: {
          familyPublicId: "model-ranking-family",
          versionPublicId: version.publicId,
          providerPublicId: "organization-ranking-lab",
          lifecycleStatus: "active",
          inputModalities: ["text"],
          outputModalities: ["text"],
          contextWindowTokens: 128000,
          accessMethods: ["hosted_api"],
          regions: ["global"],
          priceRecords: [
            {
              publicId: `price-ranking-${version.versionLabel}`,
              category: "input_tokens",
              amount: version.price,
              currency: "USD",
              unit: "per_million_tokens",
              region: "global",
              taxPolicy: "exclusive",
              validFrom: "2026-08-01T00:00:00.000Z",
              validTo: null,
              sourceItemPublicId: sourceA.sourceItemPublicId,
              lastVerifiedAt: "2026-08-31T08:00:00.000Z",
            },
            ...(version.versionLabel === "v1"
              ? [
                  {
                    publicId: "price-ranking-v1-expired",
                    category: "input_tokens",
                    amount: "0.50000000",
                    currency: "USD",
                    unit: "per_million_tokens",
                    region: "global",
                    taxPolicy: "exclusive",
                    validFrom: "2026-08-01T00:00:00.000Z",
                    validTo: "2026-08-29T23:59:59.000Z",
                    sourceItemPublicId: sourceA.sourceItemPublicId,
                    lastVerifiedAt: "2026-08-31T08:00:00.000Z",
                  },
                ]
              : []),
          ],
          benchmarkRuns: [
            {
              publicId: `benchmark-run-ranking-quality-${version.versionLabel}`,
              benchmarkPublicId: "benchmark-swe-bench-verified",
              benchmarkVersion: "2026-08",
              task: "coding agent tasks",
              score: version.quality,
              unit: "resolved_percent",
              higherIsBetter: true,
              settings: { attempts: 1 },
              evaluatorPublicId: "organization-ranking-lab",
              provenance: "independent_reproduced",
              runAt: "2026-08-30T00:00:00.000Z",
              evidenceSourceItemPublicId: sourceA.sourceItemPublicId,
              reproducibility: "reproduced",
              confidence: 95,
              lastVerifiedAt: "2026-08-31T08:00:00.000Z",
            },
            {
              publicId: `benchmark-run-ranking-latency-${version.versionLabel}`,
              benchmarkPublicId: "benchmark-ranking-latency",
              benchmarkVersion: "1.0",
              task: "agent latency",
              score: version.latency,
              unit: "ms",
              higherIsBetter: false,
              settings: { concurrency: 1 },
              evaluatorPublicId: "organization-ranking-lab",
              provenance: "independent_reproduced",
              runAt: "2026-08-30T00:00:00.000Z",
              evidenceSourceItemPublicId: sourceB.sourceItemPublicId,
              reproducibility: "reproduced",
              confidence: 95,
              lastVerifiedAt: "2026-08-31T08:00:00.000Z",
            },
          ],
        },
      },
    );
    expect(profile.status(), await profile.text()).toBe(201);
  }

  const targetTypes = [
    "event",
    "model",
    "paper",
    "product",
    "repository",
    "prompt",
    "skill",
    "guide",
  ] as const;
  const definitionRequest = (targetType: (typeof targetTypes)[number]) => ({
    definitionPublicId: `ranking-latest-${targetType}`,
    targetType,
    methodologyVersion: "1.0.0",
    effectiveAt: "2026-08-30T09:00:00.000Z",
    eligibility: ["Public, rights-cleared and reviewed record"],
    dimensions: ["published time"],
    method: {
      kind: "latest" as const,
      timeField: {
        event: "occurred_at",
        model: "released_at",
        paper: "released_at",
        product: "effective_at",
        repository: "created_at",
        prompt: "published_at",
        skill: "released_at",
        guide: "published_at",
      }[targetType],
      tieBreaker: "confidence_then_public_id" as const,
    },
    localizations: [
      {
        locale: "en" as const,
        title: `Latest ${targetType}`,
        question: `Which public ${targetType} records are newest?`,
        eligibilitySummary: "Only public and rights-cleared records qualify.",
        limitations: ["Latest does not mean best or most important."],
        authorship: "human_authored" as const,
        reviewStatus: "reviewed" as const,
      },
      {
        locale: "zh" as const,
        title: `最新 ${targetType}`,
        question: `哪些公开 ${targetType} 记录最新？`,
        eligibilitySummary: "仅公开且权利清晰的记录可进入。",
        limitations: ["最新不代表最好或最重要。"],
        authorship: "human_authored" as const,
        reviewStatus: "reviewed" as const,
      },
    ],
  });
  for (const targetType of targetTypes) {
    const response = await context.request.post(definitionUrl, {
      data: definitionRequest(targetType),
    });
    expect(response.status(), await response.text()).toBe(201);
  }

  const trendingV1 = {
    definitionPublicId: "ranking-github-rising",
    targetType: "repository",
    methodologyVersion: "1.0.0",
    effectiveAt: "2026-08-30T10:00:00.000Z",
    eligibility: ["At least two recent signals from two independent sources"],
    dimensions: [
      "source-normalized percentile",
      "velocity",
      "source breadth",
      "freshness",
      "confidence",
    ],
    method: {
      kind: "trending",
      windowHours: 168,
      sourceNormalization: "within_source_percentile",
      minimumSignals: 2,
      minimumSources: 2,
      breadthSaturationSources: 4,
      freshnessHalfLifeHours: 48,
      formula:
        "mean_by_source(mean((0.6 * source percentile + 0.4 * velocity) * freshness)) * confidence * source breadth",
      tieBreaker: "score_then_public_id",
    },
    localizations: [
      {
        locale: "en",
        title: "GitHub Rising",
        question: "Which AI repositories are gaining unusual recent attention?",
        eligibilitySummary:
          "Two recent signals from independent sources are required.",
        limitations: [
          "Rising does not measure code quality and cumulative Stars do not determine placement.",
        ],
        authorship: "human_authored",
        reviewStatus: "reviewed",
      },
      {
        locale: "zh",
        title: "GitHub 上升榜",
        question: "哪些 AI 仓库正在获得异常增长的近期关注？",
        eligibilitySummary: "必须有两个独立来源的近期信号。",
        limitations: ["上升不代表代码质量，累计 Stars 不决定名次。"],
        authorship: "human_authored",
        reviewStatus: "reviewed",
      },
    ],
  };
  expect(
    (await context.request.post(definitionUrl, { data: trendingV1 })).status(),
  ).toBe(201);

  const scopedMethodologies = [
    {
      definitionPublicId: "ranking-model-coding-quality",
      targetType: "model",
      methodologyVersion: "1.0.0",
      effectiveAt: "2026-08-30T10:00:00.000Z",
      eligibility: ["Model version has comparable coding benchmark evidence"],
      dimensions: ["coding quality"],
      method: {
        kind: "benchmark",
        scenario: "coding agent tasks",
        benchmarkPublicId: "benchmark-swe-bench-verified",
        benchmarkVersion: "2026-08",
        scoreUnit: "resolved_percent",
        direction: "higher_is_better",
        tieBreaker: "score_then_version_or_public_id",
      },
      localizations: [
        {
          locale: "en",
          title: "Coding quality by scenario",
          question: "Which model performs better on this coding scenario?",
          eligibilitySummary: "Only comparable benchmark runs qualify.",
          limitations: ["This result does not generalize to every task."],
          authorship: "human_authored",
          reviewStatus: "reviewed",
        },
        {
          locale: "zh",
          title: "分场景编程质量",
          question: "哪个模型在该编程场景中表现更好？",
          eligibilitySummary: "仅可比较的基准测试记录可进入。",
          limitations: ["该结果不能泛化到所有任务。"],
          authorship: "human_authored",
          reviewStatus: "reviewed",
        },
      ],
    },
    {
      definitionPublicId: "ranking-model-coding-value",
      targetType: "model",
      methodologyVersion: "1.0.0",
      effectiveAt: "2026-08-30T10:00:00.000Z",
      eligibility: ["Model meets the disclosed coding quality threshold"],
      dimensions: ["coding quality threshold", "regional input price"],
      method: {
        kind: "value",
        scenario: "coding agent tasks",
        qualityBenchmarkPublicId: "benchmark-swe-bench-verified",
        qualityBenchmarkVersion: "2026-08",
        qualityScoreUnit: "resolved_percent",
        qualityThreshold: 50,
        qualityDirection: "at_least",
        priceCategory: "input_tokens",
        priceUnit: "per_million_tokens",
        currency: "USD",
        region: "global",
        costBasis: "hosted_api_list_price",
        exchangeRatePolicy: "no_conversion",
        selfDeploymentAssumptions: null,
        tieBreaker: "score_then_version_or_public_id",
      },
      localizations: [
        {
          locale: "en",
          title: "Coding value",
          question: "Which qualifying model has the lowest comparable price?",
          eligibilitySummary: "Quality threshold and price unit are fixed.",
          limitations: ["Taxes, discounts and output prices may differ."],
          authorship: "human_authored",
          reviewStatus: "reviewed",
        },
        {
          locale: "zh",
          title: "编程性价比",
          question: "达到质量门槛的模型中，哪个可比价格最低？",
          eligibilitySummary: "质量门槛与价格单位固定。",
          limitations: ["税费、折扣和输出价格可能不同。"],
          authorship: "human_authored",
          reviewStatus: "reviewed",
        },
      ],
    },
    {
      definitionPublicId: "ranking-paper-attention",
      targetType: "paper",
      methodologyVersion: "1.0.0",
      effectiveAt: "2026-08-30T10:00:00.000Z",
      eligibility: ["At least two recent source-normalized attention signals"],
      dimensions: ["recent attention", "source breadth", "freshness"],
      method: { ...trendingV1.method },
      localizations: [
        {
          locale: "en",
          title: "Paper attention",
          question: "Which papers are receiving unusual recent attention?",
          eligibilitySummary:
            "Independent recent attention signals are required.",
          limitations: ["Attention is not evidence of academic quality."],
          authorship: "human_authored",
          reviewStatus: "reviewed",
        },
        {
          locale: "zh",
          title: "论文关注度",
          question: "哪些论文正在获得异常增长的近期关注？",
          eligibilitySummary: "必须有独立的近期关注信号。",
          limitations: ["关注度不代表学术质量。"],
          authorship: "human_authored",
          reviewStatus: "reviewed",
        },
      ],
    },
    {
      definitionPublicId: "ranking-model-latency",
      targetType: "model",
      methodologyVersion: "1.0.0",
      effectiveAt: "2026-08-30T10:00:00.000Z",
      eligibility: ["Exact model versions with comparable latency runs"],
      dimensions: ["agent latency"],
      method: {
        kind: "benchmark",
        scenario: "agent latency",
        benchmarkPublicId: "benchmark-ranking-latency",
        benchmarkVersion: "1.0",
        scoreUnit: "ms",
        direction: "lower_is_better",
        tieBreaker: "score_then_version_or_public_id",
      },
      localizations: [
        {
          locale: "en",
          title: "Agent latency",
          question: "Which exact model version has lower agent latency?",
          eligibilitySummary: "Only matching public benchmark runs qualify.",
          limitations: ["Latency depends on the disclosed settings."],
          authorship: "human_authored",
          reviewStatus: "reviewed",
        },
        {
          locale: "zh",
          title: "Agent 延迟",
          question: "哪个精确模型版本的 Agent 延迟更低？",
          eligibilitySummary: "仅匹配的公开基准记录可进入。",
          limitations: ["延迟取决于已披露的测试设置。"],
          authorship: "human_authored",
          reviewStatus: "reviewed",
        },
      ],
    },
    {
      definitionPublicId: "ranking-model-coding-value-strict",
      targetType: "model",
      methodologyVersion: "1.0.0",
      effectiveAt: "2026-08-30T10:00:00.000Z",
      eligibility: ["Model reaches a 90 percent coding quality threshold"],
      dimensions: ["strict quality threshold", "regional input price"],
      method: {
        kind: "value",
        scenario: "coding agent tasks",
        qualityBenchmarkPublicId: "benchmark-swe-bench-verified",
        qualityBenchmarkVersion: "2026-08",
        qualityScoreUnit: "resolved_percent",
        qualityThreshold: 90,
        qualityDirection: "at_least",
        priceCategory: "input_tokens",
        priceUnit: "per_million_tokens",
        currency: "USD",
        region: "global",
        costBasis: "hosted_api_list_price",
        exchangeRatePolicy: "no_conversion",
        selfDeploymentAssumptions: null,
        tieBreaker: "score_then_version_or_public_id",
      },
      localizations: [
        {
          locale: "en",
          title: "Strict coding value",
          question: "Which model passes the strict quality threshold?",
          eligibilitySummary: "A 90 percent quality threshold is required.",
          limitations: ["No tested model is assumed to qualify."],
          authorship: "human_authored",
          reviewStatus: "reviewed",
        },
        {
          locale: "zh",
          title: "严格编程性价比",
          question: "哪个模型达到严格质量门槛？",
          eligibilitySummary: "必须达到 90% 的质量门槛。",
          limitations: ["不假设任何受测模型必然合格。"],
          authorship: "human_authored",
          reviewStatus: "reviewed",
        },
      ],
    },
  ];
  for (const methodology of scopedMethodologies) {
    const response = await context.request.post(definitionUrl, {
      data: methodology,
    });
    expect(response.status(), await response.text()).toBe(201);
  }

  const createModelObservation = (
    definitionPublicId: string,
    versionLabel: "v1" | "v2",
    comparison:
      | { kind: "benchmark"; benchmarkRunPublicId: string }
      | {
          kind: "value";
          benchmarkRunPublicId: string;
          priceRecordPublicId: string;
        },
    publicIdSuffix: string = versionLabel,
  ) =>
    context.request.post(observationUrl, {
      data: {
        definitionPublicId,
        methodologyVersion: "1.0.0",
        observation: {
          publicId: `ranking-observation-${definitionPublicId}-${publicIdSuffix}`,
          target: {
            type: "model",
            publicId: "model-ranking-family",
            versionPublicId: `model-ranking-family-${versionLabel}`,
          },
          observedAt: "2026-08-31T10:00:00.000Z",
          dataCutoff: "2026-08-31T09:00:00.000Z",
          comparison,
          confidence: "low",
          rawMetrics: {},
          evidenceSourceItemPublicIds: [],
          signals: [],
        },
      },
    });
  for (const versionLabel of ["v1", "v2"] as const) {
    const quality = await createModelObservation(
      "ranking-model-coding-quality",
      versionLabel,
      {
        kind: "benchmark",
        benchmarkRunPublicId: `benchmark-run-ranking-quality-${versionLabel}`,
      },
    );
    expect(quality.status(), await quality.text()).toBe(201);
    const value = await createModelObservation(
      "ranking-model-coding-value",
      versionLabel,
      {
        kind: "value",
        benchmarkRunPublicId: `benchmark-run-ranking-quality-${versionLabel}`,
        priceRecordPublicId: `price-ranking-${versionLabel}`,
      },
    );
    expect(value.status(), await value.text()).toBe(201);
    const latency = await createModelObservation(
      "ranking-model-latency",
      versionLabel,
      {
        kind: "benchmark",
        benchmarkRunPublicId: `benchmark-run-ranking-latency-${versionLabel}`,
      },
    );
    expect(latency.status(), await latency.text()).toBe(201);
  }
  const wrongBenchmark = await createModelObservation(
    "ranking-model-coding-quality",
    "v1",
    {
      kind: "benchmark",
      benchmarkRunPublicId: "benchmark-run-ranking-latency-v1",
    },
    "wrong-benchmark",
  );
  expect(wrongBenchmark.status()).toBe(400);
  const expiredPrice = await createModelObservation(
    "ranking-model-coding-value",
    "v1",
    {
      kind: "value",
      benchmarkRunPublicId: "benchmark-run-ranking-quality-v1",
      priceRecordPublicId: "price-ranking-v1-expired",
    },
    "expired-price",
  );
  expect(expiredPrice.status()).toBe(400);
  const belowThreshold = await createModelObservation(
    "ranking-model-coding-value-strict",
    "v1",
    {
      kind: "value",
      benchmarkRunPublicId: "benchmark-run-ranking-quality-v1",
      priceRecordPublicId: "price-ranking-v1",
    },
    "below-threshold",
  );
  expect(belowThreshold.status()).toBe(400);
  const qualityRanking = await context.request.get(
    `${applicationUrl}/api/v1/rankings/ranking-model-coding-quality?locale=en`,
  );
  expect(await qualityRanking.json()).toMatchObject({
    observations: [
      {
        target: { versionPublicId: "model-ranking-family-v1" },
        score: 80,
        rank: 1,
        confidence: "high",
        comparison: {
          benchmarkRunPublicId: "benchmark-run-ranking-quality-v1",
          priceRecordPublicId: null,
          benchmarkRun: {
            runAt: "2026-08-30T00:00:00.000Z",
            evaluator: {
              publicId: "organization-ranking-lab",
              name: "Ranking Lab",
            },
            settings: { attempts: 1 },
            provenance: "independent_reproduced",
            reproducibility: "reproduced",
            lastVerifiedAt: "2026-08-31T08:00:00.000Z",
          },
          priceRecord: null,
        },
      },
      {
        target: { versionPublicId: "model-ranking-family-v2" },
        score: 80,
        rank: 2,
      },
    ],
  });
  const valueRanking = await context.request.get(
    `${applicationUrl}/api/v1/rankings/ranking-model-coding-value?locale=en`,
  );
  expect(await valueRanking.json()).toMatchObject({
    observations: [
      {
        target: { versionPublicId: "model-ranking-family-v2" },
        score: 1,
        rank: 1,
        comparison: {
          benchmarkRunPublicId: "benchmark-run-ranking-quality-v2",
          priceRecordPublicId: "price-ranking-v2",
          priceRecord: {
            amount: "1.00000000",
            category: "input_tokens",
            currency: "USD",
            unit: "per_million_tokens",
            region: "global",
            taxPolicy: "exclusive",
            validFrom: "2026-08-01T00:00:00.000Z",
            validTo: null,
            lastVerifiedAt: "2026-08-31T08:00:00.000Z",
            costBasis: "hosted_api_list_price",
            exchangeRatePolicy: "no_conversion",
            selfDeploymentAssumptions: null,
          },
        },
      },
      {
        target: { versionPublicId: "model-ranking-family-v1" },
        score: 2,
        rank: 2,
      },
    ],
  });
  const latencyRanking = await context.request.get(
    `${applicationUrl}/api/v1/rankings/ranking-model-latency?locale=en`,
  );
  expect(await latencyRanking.json()).toMatchObject({
    observations: [
      {
        target: { versionPublicId: "model-ranking-family-v2" },
        score: 100,
        rank: 1,
      },
      {
        target: { versionPublicId: "model-ranking-family-v1" },
        score: 200,
        rank: 2,
      },
    ],
  });
  await page.goto(`${applicationUrl}/en/rankings/ranking-model-coding-quality`);
  await expect(
    page.getByRole("heading", { name: "Ranking Model · v1" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("heading", { name: "Ranking Model · v1" })
      .locator("..")
      .getByText(/Score: 80/),
  ).toBeVisible();
  await expect(
    page.getByText(/Benchmark Run: benchmark-run-ranking-quality-v1/),
  ).toBeVisible();
  await expect(page.getByText(/Evaluator: Ranking Lab/).first()).toBeVisible();
  await expect(
    page.getByText(/Provenance: independent_reproduced/).first(),
  ).toBeVisible();
  await expect(
    page.getByText(/Settings: \{"attempts":1\}/).first(),
  ).toBeVisible();
  await page.goto(`${applicationUrl}/en/rankings/ranking-model-coding-value`);
  await expect(page.getByText(/Price Record: price-ranking-v2/)).toBeVisible();
  await expect(page.getByText(/Tax Policy: exclusive/).first()).toBeVisible();
  await expect(
    page.getByText(/Cost Basis: hosted_api_list_price/).first(),
  ).toBeVisible();
  await expect(
    page.getByText(/Self-deployment Assumptions: Not applicable/).first(),
  ).toBeVisible();

  const createObservation = async (
    publicId: string,
    repositoryPublicId: string,
    signals: Array<{
      sourceItemPublicId: string;
      origin:
        | "independent_publication"
        | "commercial"
        | "submission_volume"
        | "onsite_engagement";
      normalizedPercentile: number;
      velocity: number;
      observedAt: string;
    }>,
  ) =>
    context.request.post(observationUrl, {
      data: {
        definitionPublicId: "ranking-github-rising",
        methodologyVersion: "1.0.0",
        observation: {
          publicId,
          target: {
            type: "repository",
            publicId: repositoryPublicId,
            versionPublicId: null,
          },
          observedAt: "2026-08-31T10:00:00.000Z",
          dataCutoff: "2026-08-31T09:00:00.000Z",
          comparison: null,
          confidence: "high",
          rawMetrics: { cumulativeStars: 999999 },
          evidenceSourceItemPublicIds: [],
          signals,
        },
      },
    });
  const activeObservation = await createObservation(
    "ranking-observation-repository-alpha",
    "repository-ranking-alpha",
    [
      {
        sourceItemPublicId: sourceA.sourceItemPublicId,
        origin: "independent_publication",
        normalizedPercentile: 0.8,
        velocity: 0.8,
        observedAt: "2026-08-31T08:00:00.000Z",
      },
      {
        sourceItemPublicId: sourceB.sourceItemPublicId,
        origin: "independent_publication",
        normalizedPercentile: 0.8,
        velocity: 0.8,
        observedAt: "2026-08-31T08:00:00.000Z",
      },
    ],
  );
  expect(activeObservation.status(), await activeObservation.text()).toBe(201);
  expect(await activeObservation.json()).toMatchObject({
    status: "active",
    observationPublicId: "ranking-observation-repository-alpha",
  });
  const insufficientObservation = await createObservation(
    "ranking-observation-repository-beta",
    "repository-ranking-beta",
    [
      {
        sourceItemPublicId: sourceA.sourceItemPublicId,
        origin: "independent_publication",
        normalizedPercentile: 0.99,
        velocity: 0.99,
        observedAt: "2026-08-31T08:45:00.000Z",
      },
    ],
  );
  expect(
    insufficientObservation.status(),
    await insufficientObservation.text(),
  ).toBe(201);
  expect(await insufficientObservation.json()).toMatchObject({
    status: "insufficient_evidence",
    score: null,
  });
  const commercialObservation = await createObservation(
    "ranking-observation-repository-gamma-commercial",
    "repository-ranking-gamma",
    [
      {
        sourceItemPublicId: sourceA.sourceItemPublicId,
        origin: "commercial",
        normalizedPercentile: 1,
        velocity: 1,
        observedAt: "2026-08-31T08:40:00.000Z",
      },
      {
        sourceItemPublicId: sourceB.sourceItemPublicId,
        origin: "onsite_engagement",
        normalizedPercentile: 1,
        velocity: 1,
        observedAt: "2026-08-31T08:50:00.000Z",
      },
    ],
  );
  expect(await commercialObservation.json()).toMatchObject({
    status: "insufficient_evidence",
    score: null,
  });
  const singlePublisherObservation = await createObservation(
    "ranking-observation-repository-delta-one-publisher",
    "repository-ranking-delta",
    [
      {
        sourceItemPublicId: sourceA.sourceItemPublicId,
        origin: "independent_publication",
        normalizedPercentile: 0.9,
        velocity: 0.9,
        observedAt: "2026-08-31T08:40:00.000Z",
      },
      {
        sourceItemPublicId: sourceASecond.sourceItemPublicId,
        origin: "independent_publication",
        normalizedPercentile: 0.9,
        velocity: 0.9,
        observedAt: "2026-08-31T08:50:00.000Z",
      },
    ],
  );
  expect(await singlePublisherObservation.json()).toMatchObject({
    status: "insufficient_evidence",
    score: null,
  });
  const broaderObservation = await createObservation(
    "ranking-observation-repository-gamma-wide",
    "repository-ranking-gamma",
    [sourceA, sourceB, featuredEvidence].map(({ sourceItemPublicId }) => ({
      sourceItemPublicId,
      origin: "independent_publication" as const,
      normalizedPercentile: 0.8,
      velocity: 0.8,
      observedAt: "2026-08-31T08:00:00.000Z",
    })),
  );
  expect(await broaderObservation.json()).toMatchObject({
    status: "active",
  });

  const latestEventRequest = {
    definitionPublicId: "ranking-latest-event",
    methodologyVersion: "1.0.0",
    observation: {
      publicId: "ranking-observation-latest-event-a",
      target: {
        type: "event",
        publicId: sourceA.eventPublicId,
        versionPublicId: null,
      },
      observedAt: "2026-08-31T10:00:00.000Z",
      dataCutoff: "2026-08-31T09:00:00.000Z",
      comparison: null,
      confidence: "low",
      rawMetrics: { timeField: "occurred_at" },
      evidenceSourceItemPublicIds: [sourceA.sourceItemPublicId],
      signals: [],
    },
  };
  const forgedLatestTime = await context.request.post(observationUrl, {
    data: {
      ...latestEventRequest,
      observation: {
        ...latestEventRequest.observation,
        candidateTime: "2030-01-01T00:00:00.000Z",
      },
    },
  });
  expect(forgedLatestTime.status()).toBe(400);
  const latestEventObservation = await context.request.post(observationUrl, {
    data: {
      ...latestEventRequest,
      observation: {
        ...latestEventRequest.observation,
      },
    },
  });
  expect(
    latestEventObservation.status(),
    await latestEventObservation.text(),
  ).toBe(201);
  const secondLatestEventObservation = await context.request.post(
    observationUrl,
    {
      data: {
        ...latestEventRequest,
        observation: {
          ...latestEventRequest.observation,
          publicId: "ranking-observation-latest-event-b",
          target: {
            type: "event",
            publicId: sourceB.eventPublicId,
            versionPublicId: null,
          },
          confidence: "high",
          evidenceSourceItemPublicIds: [sourceB.sourceItemPublicId],
        },
      },
    },
  );
  expect(
    secondLatestEventObservation.status(),
    await secondLatestEventObservation.text(),
  ).toBe(201);
  const latestEventDetail = await context.request.get(
    `${applicationUrl}/api/v1/rankings/ranking-latest-event?locale=en`,
  );
  expect(await latestEventDetail.json()).toMatchObject({
    observations: [
      {
        target: { publicId: sourceB.eventPublicId },
        candidateTime: "2026-08-30T08:00:00.000Z",
        rank: 1,
      },
      {
        target: { publicId: sourceA.eventPublicId },
        candidateTime: "2026-08-30T08:00:00.000Z",
        rank: 2,
      },
    ],
  });

  const featuredRequest = {
    publicId: "featured-ranking-paper",
    target: { type: "paper", publicId: "paper-ranking-featured" },
    selectedAt: "2026-08-31T08:00:00.000Z",
    reviewDueAt: "2026-09-30T08:00:00.000Z",
    editorRole: "AI Radar Editor",
    topic: "ranking-methodology",
    commercialRelationship: "affiliate",
    rankingInfluence: false,
    evidenceSourceItemPublicIds: [featuredEvidence.sourceItemPublicId],
    localizations: [
      {
        locale: "en",
        reason:
          "Explains transparent ranking methodology with primary evidence.",
        audience: "Developers evaluating AI discovery systems",
        commercialDisclosure:
          "An affiliate relationship exists; it did not affect selection or natural ranking.",
        authorship: "human_authored",
        reviewStatus: "reviewed",
      },
      {
        locale: "zh",
        reason: "使用一手证据解释透明排名方法。",
        audience: "评估 AI 信息发现系统的开发者",
        commercialDisclosure: "存在联盟关系，但不影响精选或自然排名。",
        authorship: "human_authored",
        reviewStatus: "reviewed",
      },
    ],
  };
  const purchasableFeatured = await context.request.post(featuredUrl, {
    data: { ...featuredRequest, rankingInfluence: true },
  });
  expect(purchasableFeatured.status()).toBe(400);
  const featured = await context.request.post(featuredUrl, {
    data: featuredRequest,
  });
  expect(featured.status(), await featured.text()).toBe(201);

  const v1Detail = await context.request.get(
    `${applicationUrl}/api/v1/rankings/ranking-github-rising?locale=en&methodologyVersion=1.0.0`,
  );
  expect(v1Detail.status(), await v1Detail.text()).toBe(200);
  const v1Body = await v1Detail.json();
  expect(v1Body).toMatchObject({
    locale: "en",
    definition: {
      kind: "trending",
      targetType: "repository",
      methodologyVersion: "1.0.0",
      rankingState: "available",
      dataCutoff: "2026-08-31T09:00:00.000Z",
      method: {
        sourceNormalization: "within_source_percentile",
        minimumSources: 2,
        breadthSaturationSources: 4,
        freshnessHalfLifeHours: 48,
        tieBreaker: "score_then_public_id",
      },
    },
  });
  expect(v1Body.observations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        target: expect.objectContaining({
          publicId: "repository-ranking-alpha",
        }),
        rank: 2,
        status: "active",
        rawMetrics: { cumulativeStars: 999999 },
        evidence: expect.arrayContaining([
          expect.objectContaining({
            sourceItemPublicId: sourceA.sourceItemPublicId,
          }),
          expect.objectContaining({
            sourceItemPublicId: sourceB.sourceItemPublicId,
          }),
        ]),
      }),
      expect.objectContaining({
        target: expect.objectContaining({
          publicId: "repository-ranking-gamma",
        }),
        rank: 1,
        status: "active",
      }),
      expect.objectContaining({
        target: expect.objectContaining({
          publicId: "repository-ranking-beta",
        }),
        rank: null,
        score: null,
        status: "insufficient_evidence",
      }),
    ]),
  );
  const alphaScore = v1Body.observations.find(
    ({ target }: { target: { publicId: string } }) =>
      target.publicId === "repository-ranking-alpha",
  ).score;
  const gammaScore = v1Body.observations.find(
    ({ target }: { target: { publicId: string } }) =>
      target.publicId === "repository-ranking-gamma",
  ).score;
  expect(gammaScore).toBeGreaterThan(alphaScore);

  const trendingV2 = {
    ...trendingV1,
    methodologyVersion: "2.0.0",
    effectiveAt: "2026-08-30T11:00:00.000Z",
    method: { ...trendingV1.method, minimumSignals: 3, minimumSources: 3 },
  };
  const versioned = await context.request.post(definitionUrl, {
    data: trendingV2,
  });
  expect(versioned.status(), await versioned.text()).toBe(201);
  expect(await versioned.json()).toMatchObject({ status: "created_version" });
  const currentDetail = await context.request.get(
    `${applicationUrl}/api/v1/rankings/ranking-github-rising?locale=en`,
  );
  expect(await currentDetail.json()).toMatchObject({
    definition: {
      methodologyVersion: "2.0.0",
      rankingState: "insufficient_evidence",
      dataCutoff: null,
    },
    observations: [],
  });
  expect(v1Body.definition.methodologyVersion).toBe("1.0.0");

  const list = await context.request.get(
    `${applicationUrl}/api/v1/rankings?locale=en`,
  );
  expect(list.status(), await list.text()).toBe(200);
  const listBody = await list.json();
  expect(
    new Set(
      listBody.definitions.map(
        ({ targetType }: { targetType: string }) => targetType,
      ),
    ),
  ).toEqual(new Set(targetTypes));
  expect(
    listBody.definitions.map(({ publicId }: { publicId: string }) => publicId),
  ).toEqual(
    expect.arrayContaining([
      "ranking-model-coding-quality",
      "ranking-model-coding-value",
      "ranking-paper-attention",
    ]),
  );
  expect(listBody.featured).toEqual([
    expect.objectContaining({
      publicId: "featured-ranking-paper",
      reason: "Explains transparent ranking methodology with primary evidence.",
      audience: "Developers evaluating AI discovery systems",
      commercialRelationship: "affiliate",
      rankingInfluence: false,
    }),
  ]);
  expect(listBody.featured[0]).not.toHaveProperty("rank");
  expect(listBody.featured[0]).not.toHaveProperty("score");

  await page.goto(`${applicationUrl}/en/rankings`);
  await expect(
    page.getByRole("heading", { name: "Transparent Rankings" }),
  ).toBeVisible();
  await expect(page.getByText("GitHub Rising")).toBeVisible();
  await expect(
    page.getByText(
      "An affiliate relationship exists; it did not affect selection or natural ranking.",
    ),
  ).toBeVisible();
  await page.goto(
    `${applicationUrl}/zh/rankings/ranking-github-rising?methodologyVersion=1.0.0`,
  );
  await expect(
    page.getByRole("heading", { name: "GitHub 上升榜" }),
  ).toBeVisible();
  await expect(page.getByText("证据不足").first()).toBeVisible();

  const openApiResponse = await context.request.get(
    `${applicationUrl}/api/openapi.json`,
  );
  expect(openApiResponse.status()).toBe(200);
  const openApi = await openApiResponse.json();
  const ajv = new Ajv2020({ strict: false });
  addFormats(ajv);
  const listSchema =
    openApi.paths["/api/v1/rankings"].get.responses["200"].content[
      "application/json"
    ].schema;
  const detailSchema =
    openApi.paths["/api/v1/rankings/{publicId}"].get.responses["200"].content[
      "application/json"
    ].schema;
  const definitionSchema =
    openApi.paths["/api/v1/admin/ranking-definitions"].post.requestBody.content[
      "application/json"
    ].schema;
  const featuredSchema =
    openApi.paths["/api/v1/admin/featured-selections"].post.requestBody.content[
      "application/json"
    ].schema;
  expect(ajv.compile(listSchema)(listBody)).toBe(true);
  expect(ajv.compile(detailSchema)(v1Body)).toBe(true);
  expect(ajv.compile(definitionSchema)(trendingV1)).toBe(true);
  expect(ajv.compile(featuredSchema)(featuredRequest)).toBe(true);

  const withdrawal = await context.request.post(
    `${applicationUrl}/api/v1/admin/rights-decisions`,
    {
      data: {
        publicId: "rights-featured-ranking-withdrawal",
        case: {
          publicId: "case-featured-ranking-withdrawal",
          receivedAt: "2026-08-31T12:00:00.000Z",
          originalRequest: "Withdraw Featured evidence.",
          evidenceSummary: "The source owner requested withdrawal.",
        },
        target: {
          type: "source_item",
          publicId: featuredEvidence.sourceItemPublicId,
        },
        toStatus: "withdrawn",
        publicReasonCode: "source_withdrawal",
        effectiveAt: "2026-08-31T12:00:00.000Z",
        internalNote: "Owner verified the source withdrawal.",
      },
    },
  );
  expect(withdrawal.status(), await withdrawal.text()).toBe(201);
  const filtered = await context.request.get(
    `${applicationUrl}/api/v1/rankings?locale=en`,
  );
  expect((await filtered.json()).featured).toEqual([]);

  const rankingEvidenceWithdrawal = await context.request.post(
    `${applicationUrl}/api/v1/admin/rights-decisions`,
    {
      data: {
        publicId: "rights-ranking-source-b-withdrawal",
        case: {
          publicId: "case-ranking-source-b-withdrawal",
          receivedAt: "2026-08-31T12:30:00.000Z",
          originalRequest: "Withdraw one source used by a Ranking observation.",
          evidenceSummary: "The source owner requested withdrawal.",
        },
        target: { type: "source_item", publicId: sourceB.sourceItemPublicId },
        toStatus: "withdrawn",
        publicReasonCode: "source_withdrawal",
        effectiveAt: "2026-08-31T12:30:00.000Z",
        internalNote: "Owner verified the source withdrawal.",
      },
    },
  );
  expect(
    rankingEvidenceWithdrawal.status(),
    await rankingEvidenceWithdrawal.text(),
  ).toBe(201);
  const rankingAfterWithdrawal = await context.request.get(
    `${applicationUrl}/api/v1/rankings/ranking-github-rising?locale=en&methodologyVersion=1.0.0`,
  );
  const bodyAfterWithdrawal = await rankingAfterWithdrawal.json();
  expect(bodyAfterWithdrawal.definition).toMatchObject({
    rankingState: "insufficient_evidence",
  });
  expect(bodyAfterWithdrawal.observations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        target: expect.objectContaining({
          publicId: "repository-ranking-beta",
        }),
        rank: null,
        status: "insufficient_evidence",
      }),
    ]),
  );
  expect(
    bodyAfterWithdrawal.observations.every(
      ({ status }: { status: string }) => status === "insufficient_evidence",
    ),
  ).toBe(true);

  const benchmarkWithdrawal = await context.request.post(
    `${applicationUrl}/api/v1/admin/rights-decisions`,
    {
      data: {
        publicId: "rights-ranking-benchmark-withdrawal",
        case: {
          publicId: "case-ranking-benchmark-withdrawal",
          receivedAt: "2026-08-31T13:00:00.000Z",
          originalRequest: "Withdraw the benchmark used by model Rankings.",
          evidenceSummary: "The benchmark rights holder requested withdrawal.",
        },
        target: {
          type: "entity",
          publicId: "benchmark-swe-bench-verified",
        },
        toStatus: "withdrawn",
        publicReasonCode: "rights_withdrawal",
        effectiveAt: "2026-08-31T13:00:00.000Z",
        internalNote: "Owner verified the benchmark rights withdrawal.",
      },
    },
  );
  expect(benchmarkWithdrawal.status(), await benchmarkWithdrawal.text()).toBe(
    201,
  );
  for (const definitionPublicId of [
    "ranking-model-coding-quality",
    "ranking-model-coding-value",
  ]) {
    const response = await context.request.get(
      `${applicationUrl}/api/v1/rankings/${definitionPublicId}?locale=en`,
    );
    expect(await response.json()).toMatchObject({
      definition: { rankingState: "insufficient_evidence" },
      observations: [],
    });
  }
});
