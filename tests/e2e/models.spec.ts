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

test("publishes distinct Model families and versions with sourced prices and Benchmark Runs", async ({
  context,
  page,
}) => {
  if (!application) throw new Error("Test application did not start");
  const applicationUrl = application.url;
  const profileUrl = `${applicationUrl}/api/v1/admin/model-version-profiles`;

  const unauthorized = await context.request.post(profileUrl, { data: {} });
  expect(unauthorized.status()).toBe(401);

  const recommendationParameters = new URLSearchParams({
    locale: "en",
    task: "coding",
    benchmarkPublicId: "benchmark-code-suite",
    benchmarkVersion: "1.0",
    scoreUnit: "percent",
    qualityThreshold: "65",
    qualityDirection: "at_least",
    priceCategory: "output_tokens",
    priceUnit: "per_million_tokens",
    currency: "USD",
    region: "global",
    maximumUnitPrice: "12",
    deployment: "hosted_api",
    requireOpenWeights: "false",
    maximumLatencyMs: "200",
    latencyBenchmarkPublicId: "benchmark-latency-suite",
    latencyBenchmarkVersion: "1.0",
  });
  const emptyRecommendation = await context.request.get(
    `${applicationUrl}/api/v1/model-recommendations?${recommendationParameters}`,
  );
  expect(emptyRecommendation.status()).toBe(200);
  expect(await emptyRecommendation.json()).toMatchObject({
    status: "insufficient_evidence",
    dataCutoff: null,
    candidates: [],
  });

  const owner = await completeFakeGithubOAuth({
    applicationUrl,
    databaseUrl: application.databaseUrl,
    ownerGithubId: "34471145",
    profile: {
      avatar_url: "https://avatars.example.test/model-owner",
      email: "model-owner@example.test",
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
    enName,
    enSummary,
    zhName,
    zhSummary,
    versions = [],
  }: {
    publicId: string;
    type: "model" | "organization" | "benchmark";
    officialName: string;
    enName: string;
    enSummary: string;
    zhName: string;
    zhSummary: string;
    versions?: Array<{
      publicId: string;
      versionLabel: string;
      releasedAt: string | null;
      releasedAtPrecision: "second" | null;
    }>;
  }) => {
    const response = await context.request.post(
      `${applicationUrl}/api/v1/admin/entities`,
      {
        data: {
          entity: {
            publicId,
            type,
            officialName,
            officialUrl: `https://${publicId}.example.test/`,
            lastVerifiedAt: "2026-08-30T08:00:00.000Z",
            rightsStatus: "open",
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
          aliases: [],
          versions,
        },
      },
    );
    expect(response.status()).toBe(201);
  };

  await createEntity({
    publicId: "organization-model-provider",
    type: "organization",
    officialName: "Model Provider",
    enName: "Model Provider",
    enSummary: "The official provider of Radar Model.",
    zhName: "雷达模型提供商",
    zhSummary: "雷达模型的官方提供商。",
  });
  await createEntity({
    publicId: "organization-independent-evaluator",
    type: "organization",
    officialName: "Independent Evaluator",
    enName: "Independent Evaluator",
    enSummary: "An independent model evaluation laboratory.",
    zhName: "独立评测机构",
    zhSummary: "独立的模型评测实验室。",
  });
  await createEntity({
    publicId: "benchmark-code-suite",
    type: "benchmark",
    officialName: "Code Suite",
    enName: "Code Suite",
    enSummary: "A versioned coding benchmark.",
    zhName: "代码评测套件",
    zhSummary: "一个版本化的代码评测基准。",
  });
  await createEntity({
    publicId: "benchmark-latency-suite",
    type: "benchmark",
    officialName: "Latency Suite",
    enName: "Latency Suite",
    enSummary: "A versioned model latency benchmark.",
    zhName: "时延评测套件",
    zhSummary: "一个版本化的模型时延评测基准。",
  });
  await createEntity({
    publicId: "model-radar-one",
    type: "model",
    officialName: "Radar One",
    enName: "Radar One",
    enSummary: "A bilingual model family for coding and agent tasks.",
    zhName: "雷达一号",
    zhSummary: "面向编程与智能体任务的双语模型家族。",
    versions: [
      {
        publicId: "model-radar-one-2026-08",
        versionLabel: "2026-08",
        releasedAt: "2026-08-01T00:00:00.000Z",
        releasedAtPrecision: "second",
      },
      {
        publicId: "model-radar-one-2026-09",
        versionLabel: "2026-09",
        releasedAt: "2026-08-29T00:00:00.000Z",
        releasedAtPrecision: "second",
      },
      {
        publicId: "model-radar-one-undated",
        versionLabel: "undated",
        releasedAt: null,
        releasedAtPrecision: null,
      },
    ],
  });
  await createEntity({
    publicId: "model-unprofiled",
    type: "model",
    officialName: "Unprofiled Model",
    enName: "Unprofiled Model",
    enSummary: "A public Model family whose evidence profile is incomplete.",
    zhName: "未建档模型",
    zhSummary: "一个尚未完成证据档案的公开模型家族。",
    versions: [
      {
        publicId: "model-unprofiled-v1",
        versionLabel: "v1",
        releasedAt: "2026-08-15T00:00:00.000Z",
        releasedAtPrecision: "second",
      },
    ],
  });
  await createEntity({
    publicId: "model-recall-boundary",
    type: "model",
    officialName: "Recall Boundary Model",
    enName: "Recall Boundary Model",
    enSummary: "A family that proves evidence-qualified candidate recall.",
    zhName: "召回边界模型",
    zhSummary: "用于证明按证据资格召回候选的模型家族。",
    versions: Array.from({ length: 10 }, (_, index) => ({
      publicId: `model-recall-boundary-v${index + 1}`,
      versionLabel: `v${index + 1}`,
      releasedAt: `2026-08-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
      releasedAtPrecision: "second" as const,
    })),
  });

  const createEvidenceEvent = async ({
    eventPublicId,
    sourceItemPublicId,
    canonicalUrl,
    title,
    lastVerifiedAt = "2026-08-30T08:00:00.000Z",
  }: {
    eventPublicId: string;
    sourceItemPublicId: string;
    canonicalUrl: string;
    title: string;
    lastVerifiedAt?: string;
  }) => {
    const draft = await context.request.post(
      `${applicationUrl}/api/v1/admin/event-drafts`,
      {
        data: {
          source: {
            publicId: `${eventPublicId}-source`,
            name: `${title} Source`,
            homepageUrl: `${canonicalUrl}/source`,
            tier: "S",
            accessStatus: "approved",
            acquisitionMethod: "manual",
            policyLastReviewedAt: "2026-08-30T00:00:00.000Z",
          },
          sourceItem: {
            publicId: sourceItemPublicId,
            externalId: `${sourceItemPublicId}-external`,
            externalIdVerifiedAt: "2026-08-30T08:00:00.000Z",
            isOriginalSource: true,
            originalUrl: `${canonicalUrl}/original`,
            canonicalUrl,
            originalTitle: title,
            originalLanguage: "en",
            publishedAt: "2026-08-29T10:00:00.000Z",
            publishedAtPrecision: "second",
            discoveredAt: "2026-08-29T10:05:00.000Z",
            rightsStatus: "open",
            rightsCheckedAt: "2026-08-29T10:06:00.000Z",
            attribution: `${title} Source`,
            licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
          },
          event: {
            publicId: eventPublicId,
            eventType: "updates",
            factStatus: "confirmed",
            occurredAt: "2026-08-29T10:00:00.000Z",
            occurredAtPrecision: "second",
            lastVerifiedAt,
            rightsStatus: "open",
          },
          localizations: [
            {
              locale: "en",
              title,
              summary: `${title} supplies model evidence.`,
              authorship: "human_authored",
              reviewStatus: "reviewed",
            },
            {
              locale: "zh",
              title: `${title} 中文`,
              summary: `${title} 提供模型证据。`,
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

  await createEvidenceEvent({
    eventPublicId: "event-radar-one-official-evidence",
    sourceItemPublicId: "source-item-radar-one-official",
    canonicalUrl: "https://provider.example.test/radar-one",
    title: "Radar One official pricing and evaluation",
    lastVerifiedAt: "2026-08-30T09:00:00.000Z",
  });
  await createEvidenceEvent({
    eventPublicId: "event-radar-one-independent-evidence",
    sourceItemPublicId: "source-item-radar-one-independent",
    canonicalUrl: "https://evaluator.example.test/radar-one",
    title: "Radar One independent evaluation",
  });

  const providerRelation = await context.request.post(
    `${applicationUrl}/api/v1/admin/relations`,
    {
      data: {
        relation: {
          publicId: "relation-provider-develops-radar-one",
          subject: {
            type: "entity",
            publicId: "organization-model-provider",
          },
          predicate: "DEVELOPS",
          objectEntityPublicId: "model-radar-one",
          validFrom: "2026-08-29T10:00:00.000Z",
          validTo: null,
          firstVerifiedAt: "2026-08-30T08:00:00.000Z",
          lastVerifiedAt: "2026-08-30T08:00:00.000Z",
          confidence: 95,
          reviewStatus: "reviewed",
          creationMethod: "editor",
          rightsStatus: "open",
        },
        evidenceSourceItemPublicIds: ["source-item-radar-one-official"],
      },
    },
  );
  expect(providerRelation.status()).toBe(201);

  const invalidUnit = await context.request.post(profileUrl, {
    data: {
      familyPublicId: "model-radar-one",
      versionPublicId: "model-radar-one-2026-08",
      providerPublicId: "organization-model-provider",
      lifecycleStatus: "active",
      inputModalities: ["text"],
      outputModalities: ["text"],
      contextWindowTokens: 128000,
      accessMethods: ["hosted_api"],
      regions: ["global"],
      priceRecords: [
        {
          publicId: "price-radar-one-invalid",
          category: "input_tokens",
          amount: "2.50",
          currency: "USD",
          unit: "per_image",
          region: "global",
          taxPolicy: "exclusive",
          validFrom: "2026-08-01T00:00:00.000Z",
          validTo: null,
          sourceItemPublicId: "source-item-radar-one-official",
          lastVerifiedAt: "2026-08-30T08:00:00.000Z",
        },
      ],
      benchmarkRuns: [],
    },
  });
  expect(invalidUnit.status()).toBe(400);

  const profile = await context.request.post(profileUrl, {
    data: {
      familyPublicId: "model-radar-one",
      versionPublicId: "model-radar-one-2026-08",
      providerPublicId: "organization-model-provider",
      lifecycleStatus: "active",
      inputModalities: ["text"],
      outputModalities: ["text"],
      contextWindowTokens: 128000,
      accessMethods: ["hosted_api", "self_hosted", "open_weights"],
      regions: ["global", "us"],
      priceRecords: [
        {
          publicId: "price-radar-one-input",
          category: "input_tokens",
          amount: "2.50000000",
          currency: "USD",
          unit: "per_million_tokens",
          region: "global",
          taxPolicy: "exclusive",
          validFrom: "2026-08-01T00:00:00.000Z",
          validTo: null,
          sourceItemPublicId: "source-item-radar-one-official",
          lastVerifiedAt: "2026-08-30T08:00:00.000Z",
        },
        {
          publicId: "price-radar-one-output",
          category: "output_tokens",
          amount: "10.00000000",
          currency: "USD",
          unit: "per_million_tokens",
          region: "global",
          taxPolicy: "exclusive",
          validFrom: "2026-08-01T00:00:00.000Z",
          validTo: null,
          sourceItemPublicId: "source-item-radar-one-official",
          lastVerifiedAt: "2026-08-30T08:00:00.000Z",
        },
        {
          publicId: "price-radar-one-cached-input",
          category: "cached_input_tokens",
          amount: "1.25000000",
          currency: "USD",
          unit: "per_million_tokens",
          region: "global",
          taxPolicy: "exclusive",
          validFrom: "2026-08-01T00:00:00.000Z",
          validTo: null,
          sourceItemPublicId: "source-item-radar-one-official",
          lastVerifiedAt: "2026-08-30T08:00:00.000Z",
        },
        {
          publicId: "price-radar-one-cached-output",
          category: "cached_output_tokens",
          amount: "4.00000000",
          currency: "USD",
          unit: "per_million_tokens",
          region: "global",
          taxPolicy: "exclusive",
          validFrom: "2026-08-01T00:00:00.000Z",
          validTo: null,
          sourceItemPublicId: "source-item-radar-one-official",
          lastVerifiedAt: "2026-08-30T08:00:00.000Z",
        },
        {
          publicId: "price-radar-one-batch-input",
          category: "batch_input_tokens",
          amount: "1.00000000",
          currency: "USD",
          unit: "per_million_tokens",
          region: "global",
          taxPolicy: "exclusive",
          validFrom: "2026-08-01T00:00:00.000Z",
          validTo: null,
          sourceItemPublicId: "source-item-radar-one-official",
          lastVerifiedAt: "2026-08-30T08:00:00.000Z",
        },
        {
          publicId: "price-radar-one-batch-output",
          category: "batch_output_tokens",
          amount: "5.00000000",
          currency: "USD",
          unit: "per_million_tokens",
          region: "global",
          taxPolicy: "exclusive",
          validFrom: "2026-08-01T00:00:00.000Z",
          validTo: null,
          sourceItemPublicId: "source-item-radar-one-official",
          lastVerifiedAt: "2026-08-30T08:00:00.000Z",
        },
        {
          publicId: "price-radar-one-image",
          category: "image",
          amount: "0.04000000",
          currency: "USD",
          unit: "per_image",
          region: "global",
          taxPolicy: "exclusive",
          validFrom: "2026-08-01T00:00:00.000Z",
          validTo: null,
          sourceItemPublicId: "source-item-radar-one-official",
          lastVerifiedAt: "2026-08-30T08:00:00.000Z",
        },
        {
          publicId: "price-radar-one-audio",
          category: "audio",
          amount: "0.20000000",
          currency: "USD",
          unit: "per_minute",
          region: "global",
          taxPolicy: "exclusive",
          validFrom: "2026-08-01T00:00:00.000Z",
          validTo: null,
          sourceItemPublicId: "source-item-radar-one-official",
          lastVerifiedAt: "2026-08-30T08:00:00.000Z",
        },
        {
          publicId: "price-radar-one-video",
          category: "video",
          amount: "0.50000000",
          currency: "USD",
          unit: "per_second",
          region: "global",
          taxPolicy: "exclusive",
          validFrom: "2026-08-01T00:00:00.000Z",
          validTo: null,
          sourceItemPublicId: "source-item-radar-one-official",
          lastVerifiedAt: "2026-08-30T08:00:00.000Z",
        },
      ],
      benchmarkRuns: [
        {
          publicId: "benchmark-run-radar-one-vendor",
          benchmarkPublicId: "benchmark-code-suite",
          benchmarkVersion: "1.0",
          task: "coding",
          score: "72.40000000",
          unit: "percent",
          higherIsBetter: true,
          settings: { temperature: 0, maxTokens: 4096 },
          evaluatorPublicId: "organization-model-provider",
          provenance: "vendor_reported",
          runAt: "2026-08-20T00:00:00.000Z",
          evidenceSourceItemPublicId: "source-item-radar-one-official",
          reproducibility: "reported_only",
          confidence: 80,
          lastVerifiedAt: "2026-08-30T08:00:00.000Z",
        },
        {
          publicId: "benchmark-run-radar-one-independent",
          benchmarkPublicId: "benchmark-code-suite",
          benchmarkVersion: "1.0",
          task: "coding",
          score: "70.10000000",
          unit: "percent",
          higherIsBetter: true,
          settings: { temperature: 0, maxTokens: 4096 },
          evaluatorPublicId: "organization-independent-evaluator",
          provenance: "independent_reproduced",
          runAt: "2026-08-25T00:00:00.000Z",
          evidenceSourceItemPublicId: "source-item-radar-one-independent",
          reproducibility: "reproduced",
          confidence: 95,
          lastVerifiedAt: "2026-08-30T08:00:00.000Z",
        },
        {
          publicId: "benchmark-run-radar-one-latency",
          benchmarkPublicId: "benchmark-latency-suite",
          benchmarkVersion: "1.0",
          task: "latency",
          score: "180.00000000",
          unit: "ms",
          higherIsBetter: false,
          settings: { concurrency: 1 },
          evaluatorPublicId: "organization-independent-evaluator",
          provenance: "independent_reproduced",
          runAt: "2026-08-25T00:00:00.000Z",
          evidenceSourceItemPublicId: "source-item-radar-one-independent",
          reproducibility: "reproduced",
          confidence: 95,
          lastVerifiedAt: "2026-08-30T08:00:00.000Z",
        },
      ],
    },
  });
  expect(profile.status()).toBe(201);

  const incompleteProfile = await context.request.post(profileUrl, {
    data: {
      familyPublicId: "model-radar-one",
      versionPublicId: "model-radar-one-2026-09",
      providerPublicId: "organization-model-provider",
      lifecycleStatus: "active",
      inputModalities: ["text", "image"],
      outputModalities: ["text"],
      contextWindowTokens: 256000,
      accessMethods: ["hosted_api"],
      regions: ["global"],
      priceRecords: [
        {
          publicId: "price-radar-one-expired",
          category: "input_tokens",
          amount: "2.00000000",
          currency: "USD",
          unit: "per_million_tokens",
          region: "global",
          taxPolicy: "exclusive",
          validFrom: "2026-08-01T00:00:00.000Z",
          validTo: "2026-08-29T23:59:59.000Z",
          sourceItemPublicId: "source-item-radar-one-official",
          lastVerifiedAt: "2026-08-30T08:00:00.000Z",
        },
        {
          publicId: "price-radar-one-future",
          category: "output_tokens",
          amount: "8.00000000",
          currency: "USD",
          unit: "per_million_tokens",
          region: "global",
          taxPolicy: "exclusive",
          validFrom: "2026-09-01T00:00:00.000Z",
          validTo: null,
          sourceItemPublicId: "source-item-radar-one-official",
          lastVerifiedAt: "2026-08-30T08:00:00.000Z",
        },
      ],
      benchmarkRuns: [
        {
          publicId: "benchmark-run-radar-one-future-price-version",
          benchmarkPublicId: "benchmark-code-suite",
          benchmarkVersion: "1.0",
          task: "coding",
          score: "75.00000000",
          unit: "percent",
          higherIsBetter: true,
          settings: { temperature: 0, maxTokens: 4096 },
          evaluatorPublicId: "organization-independent-evaluator",
          provenance: "independent_reproduced",
          runAt: "2026-08-29T00:00:00.000Z",
          evidenceSourceItemPublicId: "source-item-radar-one-independent",
          reproducibility: "reproduced",
          confidence: 95,
          lastVerifiedAt: "2026-08-30T08:00:00.000Z",
        },
      ],
    },
  });
  expect(incompleteProfile.status()).toBe(201);

  for (let index = 1; index <= 10; index += 1) {
    const hasLatencyEvidence = index === 1 || index >= 6;
    const price = index === 1 ? "3.00000000" : "4.00000000";
    const quality = index === 1 ? "82.00000000" : `${96 - index}.00000000`;
    const recallProfile = await context.request.post(profileUrl, {
      data: {
        familyPublicId: "model-recall-boundary",
        versionPublicId: `model-recall-boundary-v${index}`,
        providerPublicId: "organization-model-provider",
        lifecycleStatus: "active",
        inputModalities: ["text"],
        outputModalities: ["text"],
        contextWindowTokens: 128000,
        accessMethods: ["hosted_api"],
        regions: ["global"],
        priceRecords: [
          {
            publicId: `price-recall-boundary-v${index}`,
            category: "output_tokens",
            amount: price,
            currency: "USD",
            unit: "per_million_tokens",
            region: "global",
            taxPolicy: "exclusive",
            validFrom: "2026-08-01T00:00:00.000Z",
            validTo: null,
            sourceItemPublicId: "source-item-radar-one-official",
            lastVerifiedAt: "2026-08-30T08:00:00.000Z",
          },
        ],
        benchmarkRuns: [
          {
            publicId: `benchmark-run-recall-boundary-quality-v${index}`,
            benchmarkPublicId: "benchmark-code-suite",
            benchmarkVersion: "1.0",
            task: "coding",
            score: quality,
            unit: "percent",
            higherIsBetter: true,
            settings: { temperature: 0, maxTokens: 4096 },
            evaluatorPublicId: "organization-independent-evaluator",
            provenance: "independent_reproduced",
            runAt: "2026-08-25T00:00:00.000Z",
            evidenceSourceItemPublicId: "source-item-radar-one-independent",
            reproducibility: "reproduced",
            confidence: 95,
            lastVerifiedAt: "2026-08-30T08:00:00.000Z",
          },
          ...(hasLatencyEvidence
            ? [
                {
                  publicId: `benchmark-run-recall-boundary-latency-v${index}`,
                  benchmarkPublicId: "benchmark-latency-suite",
                  benchmarkVersion: "1.0",
                  task: "latency",
                  score: "150.00000000",
                  unit: "ms",
                  higherIsBetter: false,
                  settings: { concurrency: 1 },
                  evaluatorPublicId: "organization-independent-evaluator",
                  provenance: "independent_reproduced",
                  runAt: "2026-08-25T00:00:00.000Z",
                  evidenceSourceItemPublicId:
                    "source-item-radar-one-independent",
                  reproducibility: "reproduced",
                  confidence: 95,
                  lastVerifiedAt: "2026-08-30T08:00:00.000Z",
                },
              ]
            : []),
        ],
      },
    });
    expect(recallProfile.status()).toBe(201);
  }

  const automaticRecommendation = await context.request.get(
    `${applicationUrl}/api/v1/model-recommendations?${recommendationParameters}`,
  );
  expect(automaticRecommendation.status()).toBe(200);
  const automaticRecommendationBody = await automaticRecommendation.json();
  expect(automaticRecommendationBody).toMatchObject({
    status: "available",
  });
  expect(automaticRecommendationBody.candidates[0]).toMatchObject({
    versionPublicId: "model-recall-boundary-v1",
    outcome: "fit",
    rank: 1,
  });
  expect(
    automaticRecommendationBody.candidates.map(
      ({ versionPublicId }: { versionPublicId: string }) => versionPublicId,
    ),
  ).toContain("model-recall-boundary-v6");

  const repeatedAutomaticRecommendation = await context.request.get(
    `${applicationUrl}/api/v1/model-recommendations?${recommendationParameters}`,
  );
  expect((await repeatedAutomaticRecommendation.json()).dataCutoff).toBe(
    automaticRecommendationBody.dataCutoff,
  );

  const databaseClient = new Client({
    connectionString: application.databaseUrl,
  });
  await databaseClient.connect();
  await databaseClient.query(
    `update price_records
     set last_verified_at = $2
     where public_id = $1`,
    [
      "price-recall-boundary-v1",
      new Date(
        Date.parse(automaticRecommendationBody.dataCutoff) + 1,
      ).toISOString(),
    ],
  );
  await databaseClient.end();
  const refreshedAutomaticRecommendation = await context.request.get(
    `${applicationUrl}/api/v1/model-recommendations?${recommendationParameters}`,
  );
  expect(
    Date.parse((await refreshedAutomaticRecommendation.json()).dataCutoff),
  ).toBeGreaterThan(Date.parse(automaticRecommendationBody.dataCutoff));

  const beforeTimeline = await context.request.get(
    `${applicationUrl}/api/v1/models?locale=zh&provider=organization-model-provider&modality=image&access=hosted_api&region=global`,
  );
  const beforeTimelineCutoff = (await beforeTimeline.json()).dataCutoff;
  const timelineVerifiedAt = new Date(
    Date.parse(beforeTimelineCutoff) + 1,
  ).toISOString();
  const attachTimeline = await context.request.post(
    `${applicationUrl}/api/v1/admin/relations`,
    {
      data: {
        relation: {
          publicId: "relation-official-update-radar-one",
          subject: {
            type: "event",
            publicId: "event-radar-one-official-evidence",
          },
          predicate: "UPDATES",
          objectEntityPublicId: "model-radar-one",
          validFrom: "2026-08-29T10:00:00.000Z",
          validTo: null,
          firstVerifiedAt: timelineVerifiedAt,
          lastVerifiedAt: timelineVerifiedAt,
          confidence: 95,
          reviewStatus: "reviewed",
          creationMethod: "editor",
          rightsStatus: "open",
        },
        evidenceSourceItemPublicIds: ["source-item-radar-one-official"],
      },
    },
  );
  expect(attachTimeline.status()).toBe(201);

  const modelList = await context.request.get(
    `${applicationUrl}/api/v1/models?locale=zh&provider=organization-model-provider&modality=image&access=hosted_api&region=global`,
  );
  expect(modelList.status()).toBe(200);
  const modelListBody = await modelList.json();
  expect(modelListBody.items).toEqual([
    expect.objectContaining({
      publicId: "model-radar-one",
      name: "雷达一号",
      provider: expect.objectContaining({
        publicId: "organization-model-provider",
      }),
      latestVersion: expect.objectContaining({
        publicId: "model-radar-one-2026-09",
        evidenceState: "insufficient_evidence",
      }),
    }),
  ]);
  expect(Date.parse(modelListBody.dataCutoff)).toBeGreaterThan(
    Date.parse(beforeTimelineCutoff),
  );
  const repeatedModelList = await context.request.get(
    `${applicationUrl}/api/v1/models?locale=zh&provider=organization-model-provider&modality=image&access=hosted_api&region=global`,
  );
  expect((await repeatedModelList.json()).dataCutoff).toBe(
    modelListBody.dataCutoff,
  );

  const splitVersionFilters = await context.request.get(
    `${applicationUrl}/api/v1/models?locale=en&modality=image&region=us`,
  );
  expect(splitVersionFilters.status()).toBe(200);
  expect((await splitVersionFilters.json()).items).toEqual([]);

  const unfilteredModels = await context.request.get(
    `${applicationUrl}/api/v1/models?locale=en`,
  );
  expect((await unfilteredModels.json()).items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        publicId: "model-unprofiled",
        provider: null,
        latestVersion: expect.objectContaining({
          publicId: "model-unprofiled-v1",
          evidenceState: "insufficient_evidence",
        }),
      }),
    ]),
  );

  const modelDetail = await context.request.get(
    `${applicationUrl}/api/v1/models/model-radar-one?locale=en`,
  );
  expect(modelDetail.status()).toBe(200);
  const modelDetailBody = await modelDetail.json();
  expect(modelDetailBody).toMatchObject({
    publicId: "model-radar-one",
    name: "Radar One",
    provider: {
      publicId: "organization-model-provider",
      name: "Model Provider",
    },
    versions: [
      {
        publicId: "model-radar-one-2026-08",
        evidenceState: "available",
        prices: [
          { category: "audio" },
          { category: "batch_input_tokens" },
          { category: "batch_output_tokens" },
          { category: "cached_input_tokens" },
          { category: "cached_output_tokens" },
          { category: "image" },
          { category: "input_tokens" },
          { category: "output_tokens" },
          { category: "video" },
        ],
        benchmarkRuns: [
          { provenance: "independent_reproduced" },
          { provenance: "independent_reproduced" },
          { provenance: "vendor_reported" },
        ],
      },
      {
        publicId: "model-radar-one-2026-09",
        evidenceState: "insufficient_evidence",
        prices: [
          { publicId: "price-radar-one-expired" },
          { publicId: "price-radar-one-future" },
        ],
        benchmarkRuns: [
          { publicId: "benchmark-run-radar-one-future-price-version" },
        ],
      },
      {
        publicId: "model-radar-one-undated",
        releasedAt: null,
        predecessorPublicId: null,
        successorPublicId: null,
        evidenceState: "insufficient_evidence",
      },
    ],
    relatedEntities: [
      {
        publicId: "organization-model-provider",
        name: "Model Provider",
        relation: "DEVELOPS",
      },
    ],
    timeline: [
      {
        eventPublicId: "event-radar-one-official-evidence",
        title: "Radar One official pricing and evaluation",
      },
    ],
  });
  expect(modelDetailBody.versions[0].prices[0].source).toMatchObject({
    sourceItemPublicId: "source-item-radar-one-official",
    url: "https://provider.example.test/radar-one",
  });
  expect(modelDetailBody.versions[0].prices[0].lastVerifiedAt).toBe(
    "2026-08-30T08:00:00.000Z",
  );
  expect(modelDetailBody.versions[0].benchmarkRuns[0]).toMatchObject({
    benchmark: {
      publicId: "benchmark-code-suite",
      name: "Code Suite",
      version: "1.0",
    },
    evaluator: {
      publicId: "organization-independent-evaluator",
      name: "Independent Evaluator",
    },
    evidence: {
      sourceItemPublicId: "source-item-radar-one-independent",
      url: "https://evaluator.example.test/radar-one",
    },
    lastVerifiedAt: "2026-08-30T08:00:00.000Z",
  });

  recommendationParameters.set(
    "versions",
    "model-radar-one-2026-08,model-radar-one-2026-09",
  );
  const recommendation = await context.request.get(
    `${applicationUrl}/api/v1/model-recommendations?${recommendationParameters}`,
  );
  expect(recommendation.status()).toBe(200);
  const recommendationBody = await recommendation.json();
  expect(recommendationBody).toMatchObject({
    status: "available",
    methodology: { publicId: "model-configuration-fit", version: "1.0.0" },
    candidates: [
      {
        versionPublicId: "model-radar-one-2026-08",
        outcome: "fit",
        rank: 1,
        priceEvidence: { publicId: "price-radar-one-output" },
        qualityEvidence: {
          publicId: "benchmark-run-radar-one-independent",
        },
        latencyEvidence: { publicId: "benchmark-run-radar-one-latency" },
      },
      {
        versionPublicId: "model-radar-one-2026-09",
        outcome: "insufficient_evidence",
        rank: null,
      },
    ],
  });

  const invalidComparisonParameters = new URLSearchParams(
    recommendationParameters,
  );
  invalidComparisonParameters.set("priceCategory", "image");
  const invalidComparison = await context.request.get(
    `${applicationUrl}/api/v1/model-recommendations?${invalidComparisonParameters}`,
  );
  expect(invalidComparison.status()).toBe(200);
  const invalidComparisonBody = await invalidComparison.json();
  expect(invalidComparisonBody.status).toBe("not_comparable");
  expect(invalidComparisonBody.candidates[0]).toMatchObject({
    outcome: "not_comparable",
    nonFitReasons: [
      expect.objectContaining({ code: "price_unit_incompatible" }),
    ],
  });

  const selfHostedParameters = new URLSearchParams(recommendationParameters);
  selfHostedParameters.set("deployment", "self_hosted");
  selfHostedParameters.set("requireOpenWeights", "true");
  selfHostedParameters.set("versions", "model-radar-one-2026-08");
  const selfHostedComparison = await context.request.get(
    `${applicationUrl}/api/v1/model-recommendations?${selfHostedParameters}`,
  );
  expect(selfHostedComparison.status()).toBe(200);
  expect(await selfHostedComparison.json()).toMatchObject({
    status: "not_comparable",
    candidates: [
      expect.objectContaining({
        outcome: "not_comparable",
        priceEvidence: null,
        nonFitReasons: [
          expect.objectContaining({ code: "deployment_cost_basis_missing" }),
        ],
      }),
    ],
  });

  const noEvidenceParameters = new URLSearchParams(recommendationParameters);
  noEvidenceParameters.set("versions", "model-unprofiled-v1");
  const noEvidence = await context.request.get(
    `${applicationUrl}/api/v1/model-recommendations?${noEvidenceParameters}`,
  );
  expect(noEvidence.status()).toBe(200);
  const noEvidenceBody = await noEvidence.json();
  expect(noEvidenceBody).toMatchObject({
    status: "insufficient_evidence",
    candidates: [
      expect.objectContaining({
        versionPublicId: "model-unprofiled-v1",
        outcome: "insufficient_evidence",
      }),
    ],
  });

  await page.goto(
    `${applicationUrl}/en/models/compare?${recommendationParameters}`,
  );
  await expect(
    page.getByRole("heading", { name: "Model configuration fit", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Recommendation available", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Radar One 2026-08", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Current Output tokens price", { exact: false }),
  ).toBeVisible();
  await expect(
    page.locator("p").filter({ hasText: "Data Cutoff:" }),
  ).toBeVisible();

  const chineseRecommendationParameters = new URLSearchParams(
    recommendationParameters,
  );
  chineseRecommendationParameters.set("locale", "zh");
  await page.goto(
    `${applicationUrl}/zh/models/compare?${chineseRecommendationParameters}`,
  );
  await expect(
    page.getByRole("heading", { name: "模型配置匹配", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("推荐可用", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("term").filter({ hasText: "质量门槛" }),
  ).toBeVisible();
  await expect(
    page.locator("p").filter({ hasText: "当前 输出 Token 价格" }),
  ).toBeVisible();
  await expect(
    page.getByRole("term").filter({ hasText: "价格地区" }),
  ).toBeVisible();
  await expect(page.getByText("未含税", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("term").filter({ hasText: "生效时间" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "适合原因", exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "方法 1.0.0", exact: true }),
  ).toBeVisible();

  await page.goto(
    `${applicationUrl}/en/models/compare?${invalidComparisonParameters}`,
  );
  await expect(
    page.getByRole("heading", { name: "Not comparable", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByText("The selected price category and unit are not comparable.", {
        exact: true,
      })
      .first(),
  ).toBeVisible();

  noEvidenceParameters.set("locale", "zh");
  await page.goto(
    `${applicationUrl}/zh/models/compare?${noEvidenceParameters}`,
  );
  await expect(
    page.getByRole("heading", { name: "证据不足", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("缺少完整的公开配置档案。", { exact: true }),
  ).toBeVisible();

  const versionDetail = await context.request.get(
    `${applicationUrl}/api/v1/model-versions/model-radar-one-2026-08?locale=en`,
  );
  expect(versionDetail.status()).toBe(200);
  const versionDetailBody = await versionDetail.json();
  expect(versionDetailBody).toMatchObject({
    publicId: "model-radar-one-2026-08",
    family: {
      publicId: "model-radar-one",
      name: "Radar One",
      relatedEntities: [
        expect.objectContaining({ publicId: "organization-model-provider" }),
      ],
      timeline: [
        expect.objectContaining({
          eventPublicId: "event-radar-one-official-evidence",
        }),
      ],
    },
    predecessorPublicId: null,
    successorPublicId: "model-radar-one-2026-09",
    evidenceState: "available",
  });

  const search = await context.request.get(
    `${applicationUrl}/api/v1/search?q=Radar%20One&locale=en&type=model`,
  );
  expect(search.status()).toBe(200);
  expect((await search.json()).items[0]).toMatchObject({
    publicId: "model-radar-one",
    entityType: "model",
  });
  await page.goto(`${applicationUrl}/en/search?q=Radar%20One&type=model`);
  await expect(
    page
      .getByRole("heading", { name: "Radar One", exact: true })
      .getByRole("link"),
  ).toHaveAttribute("href", "/en/models/model-radar-one");

  await page.goto(`${applicationUrl}/en/models`);
  await expect(
    page.getByRole("heading", { name: "Models", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Radar One", exact: true }),
  ).toHaveAttribute("href", "/en/models/model-radar-one");

  await page.goto(`${applicationUrl}/zh/models/model-radar-one`);
  await expect(
    page.getByRole("heading", { name: "雷达一号", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("证据不足", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "2026-08", exact: true }),
  ).toHaveAttribute(
    "href",
    "/zh/models/model-radar-one/versions/model-radar-one-2026-08",
  );
  await expect(
    page.getByText("独立复现", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("厂商自报", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("输入 Token", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("输出 Token", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("缓存输出 Token", { exact: true })).toBeVisible();
  await expect(
    page.getByText("批处理输入 Token", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("图像", { exact: true })).toBeVisible();
  await expect(page.getByText("音频", { exact: true })).toBeVisible();
  await expect(page.getByText("视频", { exact: true })).toBeVisible();
  await expect(
    page
      .getByText("运行日期: 2026-08-25T00:00:00.000Z", { exact: true })
      .first(),
  ).toBeVisible();

  await page.goto(
    `${applicationUrl}/en/models/model-radar-one/versions/model-radar-one-2026-08`,
  );
  await expect(
    page.getByRole("heading", { name: "Radar One 2026-08", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Radar One family", exact: true }),
  ).toHaveAttribute("href", "/en/models/model-radar-one");
  await expect(
    page.getByText("Provider: Model Provider", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Lifecycle: active", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByText("Valid from: 2026-08-01T00:00:00.000Z", { exact: true })
      .first(),
  ).toBeVisible();
  await expect(
    page.getByText("Task: coding", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page
      .getByText("Run date: 2026-08-25T00:00:00.000Z", { exact: true })
      .first(),
  ).toBeVisible();
  await expect(
    page
      .getByText("Provenance: Independent reproduced", { exact: true })
      .first(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Related Entities", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Model Provider", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "Radar One official pricing and evaluation",
      exact: true,
    }),
  ).toBeVisible();

  const undatedVersion = await context.request.get(
    `${applicationUrl}/api/v1/model-versions/model-radar-one-undated?locale=en`,
  );
  expect(await undatedVersion.json()).toMatchObject({
    predecessorPublicId: null,
    successorPublicId: null,
  });

  const openApiResponse = await context.request.get(
    `${applicationUrl}/api/openapi.json`,
  );
  expect(openApiResponse.status()).toBe(200);
  const openApi = await openApiResponse.json();
  const ajv = new Ajv2020({ strict: false });
  addFormats(ajv);
  const recommendationParameterSchema = (name: string) =>
    openApi.paths["/api/v1/model-recommendations"].get.parameters.find(
      (parameter: { name: string }) => parameter.name === name,
    ).schema;
  const validateQualityThreshold = ajv.compile(
    recommendationParameterSchema("qualityThreshold"),
  );
  const validateMaximumUnitPrice = ajv.compile(
    recommendationParameterSchema("maximumUnitPrice"),
  );
  expect(validateQualityThreshold("-999999999999.99999999")).toBe(true);
  expect(validateQualityThreshold("1e3")).toBe(false);
  expect(validateMaximumUnitPrice("999999999999.99999999")).toBe(true);
  expect(validateMaximumUnitPrice("-1")).toBe(false);
  for (const [path, body] of [
    ["/api/v1/models", modelListBody],
    ["/api/v1/models/{publicId}", modelDetailBody],
    ["/api/v1/model-versions/{publicId}", versionDetailBody],
    ["/api/v1/model-recommendations", recommendationBody],
    ["/api/v1/model-recommendations", invalidComparisonBody],
    ["/api/v1/model-recommendations", noEvidenceBody],
  ] as const) {
    const validate = ajv.compile(
      openApi.paths[path].get.responses["200"].content["application/json"]
        .schema,
    );
    expect(validate(body), ajv.errorsText(validate.errors)).toBe(true);
  }

  const withdrawIndependentEvidence = await context.request.post(
    `${applicationUrl}/api/v1/admin/rights-decisions`,
    {
      data: {
        publicId: "rights-radar-one-independent-evidence",
        case: {
          publicId: "case-radar-one-independent-evidence",
          receivedAt: "2026-08-30T09:00:00.000Z",
          originalRequest: "Withdraw the independent Benchmark source.",
          evidenceSummary: "The source owner requested withdrawal.",
        },
        target: {
          type: "source_item",
          publicId: "source-item-radar-one-independent",
        },
        toStatus: "withdrawn",
        publicReasonCode: "source_withdrawal",
        effectiveAt: "2026-08-30T09:05:00.000Z",
        internalNote: "Remove the affected public Benchmark evidence.",
      },
    },
  );
  expect(withdrawIndependentEvidence.status()).toBe(201);
  const afterWithdrawal = await context.request.get(
    `${applicationUrl}/api/v1/models/model-radar-one?locale=en`,
  );
  expect((await afterWithdrawal.json()).versions[0].benchmarkRuns).toEqual([
    expect.objectContaining({
      publicId: "benchmark-run-radar-one-vendor",
      provenance: "vendor_reported",
    }),
  ]);
});
