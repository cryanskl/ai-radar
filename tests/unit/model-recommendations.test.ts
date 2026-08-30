import { describe, expect, it } from "vitest";
import {
  evaluateModelRecommendations,
  type RecommendationCandidate,
  type ModelRecommendationRequest,
} from "@/models/recommendation";

const dataCutoff = "2026-08-30T12:00:00.000Z";

const request: ModelRecommendationRequest = {
  locale: "en",
  task: "coding",
  benchmarkPublicId: "benchmark-code-suite",
  benchmarkVersion: "1.0",
  scoreUnit: "percent",
  qualityThreshold: "80",
  qualityDirection: "at_least",
  priceCategory: "output_tokens",
  priceUnit: "per_million_tokens",
  currency: "USD",
  region: "global",
  maximumUnitPrice: "5",
  deployment: "hosted_api",
  requireOpenWeights: false,
  maximumLatencyMs: 250,
  latencyBenchmarkPublicId: "benchmark-latency-suite",
  latencyBenchmarkVersion: "1.0",
};

const evidence = (publicId: string) => ({
  sourceItemPublicId: `source-${publicId}`,
  title: `${publicId} evidence`,
  url: `https://evidence.example.test/${publicId}`,
});

const candidate = ({
  familyPublicId,
  versionPublicId,
  price,
  quality,
  latency,
}: {
  familyPublicId: string;
  versionPublicId: string;
  price: number | string;
  quality: number | string;
  latency: number | string;
}): RecommendationCandidate => ({
  family: {
    publicId: familyPublicId,
    name: familyPublicId,
    summary: `${familyPublicId} summary`,
  },
  version: {
    publicId: versionPublicId,
    versionLabel: "v1",
    releasedAt: "2026-08-01T00:00:00.000Z",
    lifecycleStatus: "active",
    inputModalities: ["text"],
    outputModalities: ["text"],
    contextWindowTokens: 128000,
    accessMethods: ["hosted_api"],
    regions: ["global"],
    provider: {
      publicId: "organization-provider",
      name: "Provider",
    },
    prices: [
      {
        publicId: `price-${versionPublicId}`,
        category: "output_tokens",
        amount: price.toString(),
        currency: "USD",
        unit: "per_million_tokens",
        region: "global",
        taxPolicy: "exclusive",
        validFrom: "2026-01-01T00:00:00.000Z",
        validTo: null,
        lastVerifiedAt: dataCutoff,
        source: evidence(`price-${versionPublicId}`),
      },
    ],
    benchmarkRuns: [
      {
        publicId: `quality-${versionPublicId}`,
        benchmark: {
          publicId: "benchmark-code-suite",
          name: "Code Suite",
          version: "1.0",
        },
        task: "coding",
        score: quality.toString(),
        unit: "percent",
        higherIsBetter: true,
        settings: { temperature: 0 },
        evaluator: {
          publicId: "organization-evaluator",
          name: "Evaluator",
        },
        provenance: "independent_reproduced",
        runAt: "2026-08-20T00:00:00.000Z",
        lastVerifiedAt: dataCutoff,
        evidence: evidence(`quality-${versionPublicId}`),
        reproducibility: "reproduced",
        confidence: 95,
      },
      {
        publicId: `latency-${versionPublicId}`,
        benchmark: {
          publicId: "benchmark-latency-suite",
          name: "Latency Suite",
          version: "1.0",
        },
        task: "latency",
        score: latency.toString(),
        unit: "ms",
        higherIsBetter: false,
        settings: { concurrency: 1 },
        evaluator: {
          publicId: "organization-evaluator",
          name: "Evaluator",
        },
        provenance: "independent_reproduced",
        runAt: "2026-08-20T00:00:00.000Z",
        lastVerifiedAt: dataCutoff,
        evidence: evidence(`latency-${versionPublicId}`),
        reproducibility: "reproduced",
        confidence: 95,
      },
    ],
    evidenceState: "available",
    predecessorPublicId: null,
    successorPublicId: null,
  },
});

describe("bounded Model recommendations", () => {
  it("passes quality first, then ranks eligible candidates by comparable cost", () => {
    const result = evaluateModelRecommendations(
      request,
      [
        candidate({
          familyPublicId: "model-fast",
          versionPublicId: "model-fast-v1",
          price: 2,
          quality: 85,
          latency: 200,
        }),
        candidate({
          familyPublicId: "model-slow",
          versionPublicId: "model-slow-v1",
          price: 4,
          quality: 90,
          latency: 300,
        }),
      ],
      dataCutoff,
    );

    expect(result.status).toBe("available");
    expect(result.candidates).toMatchObject([
      {
        versionPublicId: "model-fast-v1",
        outcome: "fit",
        rank: 1,
      },
      {
        versionPublicId: "model-slow-v1",
        outcome: "not_fit",
        rank: null,
        nonFitReasons: [{ code: "latency_exceeded" }],
      },
    ]);
    expect(result.candidates[0].fitReasons.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "quality_threshold_met",
        "budget_met",
        "latency_met",
        "deployment_met",
        "region_met",
      ]),
    );
    expect(result.candidates[0].qualityEvidence?.publicId).toBe(
      "quality-model-fast-v1",
    );
    expect(result.candidates[0].priceEvidence?.publicId).toBe(
      "price-model-fast-v1",
    );
    expect(result.methodology.version).toBe("1.0.0");
  });

  it("publishes Not Comparable when the requested price category and unit conflict", () => {
    const result = evaluateModelRecommendations(
      { ...request, priceCategory: "image" },
      [
        candidate({
          familyPublicId: "model-fast",
          versionPublicId: "model-fast-v1",
          price: 2,
          quality: 85,
          latency: 200,
        }),
      ],
      dataCutoff,
    );

    expect(result.status).toBe("not_comparable");
    expect(result.candidates[0]).toMatchObject({
      outcome: "not_comparable",
      nonFitReasons: [{ code: "price_unit_incompatible" }],
    });
  });

  it("publishes Insufficient Evidence instead of inventing a recommendation", () => {
    const incomplete = candidate({
      familyPublicId: "model-unknown",
      versionPublicId: "model-unknown-v1",
      price: 2,
      quality: 85,
      latency: 200,
    });
    incomplete.version.prices = [];
    incomplete.version.benchmarkRuns = [];
    incomplete.version.evidenceState = "insufficient_evidence";

    const result = evaluateModelRecommendations(
      request,
      [incomplete],
      dataCutoff,
    );

    expect(result.status).toBe("insufficient_evidence");
    expect(result.candidates[0]).toMatchObject({
      outcome: "insufficient_evidence",
      rank: null,
      nonFitReasons: [
        { code: "quality_evidence_missing" },
        { code: "current_price_missing" },
        { code: "latency_evidence_missing" },
      ],
    });
  });

  it("compares full numeric(20,8) prices and quality scores without floating-point rounding", () => {
    const exactRequest = {
      ...request,
      maximumLatencyMs: undefined,
      latencyBenchmarkPublicId: undefined,
      latencyBenchmarkVersion: undefined,
      maximumUnitPrice: "999999999999.99999998",
      qualityThreshold: "999999999999.99999999",
    };
    const belowQuality = candidate({
      familyPublicId: "model-below-quality",
      versionPublicId: "model-below-quality-v1",
      price: "999999999999.99999998",
      quality: "999999999999.99999998",
      latency: 200,
    });
    const aboveBudget = candidate({
      familyPublicId: "model-above-budget",
      versionPublicId: "model-above-budget-v1",
      price: "999999999999.99999999",
      quality: "999999999999.99999999",
      latency: 200,
    });

    const result = evaluateModelRecommendations(
      exactRequest,
      [belowQuality, aboveBudget],
      dataCutoff,
    );

    expect(result.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          versionPublicId: "model-below-quality-v1",
          outcome: "not_fit",
          nonFitReasons: [
            expect.objectContaining({ code: "quality_threshold_not_met" }),
          ],
        }),
        expect.objectContaining({
          versionPublicId: "model-above-budget-v1",
          outcome: "not_fit",
          nonFitReasons: [expect.objectContaining({ code: "budget_exceeded" })],
        }),
      ]),
    );
  });

  it("does not use future Benchmark Runs as current evidence", () => {
    const future = candidate({
      familyPublicId: "model-future-evidence",
      versionPublicId: "model-future-evidence-v1",
      price: 2,
      quality: 85,
      latency: 200,
    });
    for (const run of future.version.benchmarkRuns)
      run.runAt = "2026-09-01T00:00:00.000Z";

    const result = evaluateModelRecommendations(request, [future], dataCutoff);

    expect(result.status).toBe("insufficient_evidence");
    expect(result.candidates[0].nonFitReasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "quality_evidence_missing" }),
        expect.objectContaining({ code: "latency_evidence_missing" }),
      ]),
    );
  });

  it("does not reuse hosted API prices as self-hosted cost evidence", () => {
    const selfHosted = candidate({
      familyPublicId: "model-self-hosted",
      versionPublicId: "model-self-hosted-v1",
      price: 2,
      quality: 85,
      latency: 200,
    });
    selfHosted.version.accessMethods.push("self_hosted", "open_weights");

    const result = evaluateModelRecommendations(
      { ...request, deployment: "self_hosted" },
      [selfHosted],
      dataCutoff,
    );

    expect(result.status).toBe("not_comparable");
    expect(result.candidates[0]).toMatchObject({
      outcome: "not_comparable",
      priceEvidence: null,
      nonFitReasons: [
        expect.objectContaining({ code: "deployment_cost_basis_missing" }),
      ],
    });
  });

  it("emits each incompatibility reason once when quality and latency conditions both conflict", () => {
    const first = candidate({
      familyPublicId: "model-first",
      versionPublicId: "model-first-v1",
      price: 2,
      quality: 85,
      latency: 200,
    });
    const second = candidate({
      familyPublicId: "model-second",
      versionPublicId: "model-second-v1",
      price: 3,
      quality: 86,
      latency: 190,
    });
    second.version.benchmarkRuns[0].settings = { temperature: 1 };
    second.version.benchmarkRuns[1].settings = { concurrency: 2 };

    const result = evaluateModelRecommendations(
      request,
      [first, second],
      dataCutoff,
    );

    for (const evaluated of result.candidates) {
      expect(
        evaluated.nonFitReasons.filter(
          ({ code }) => code === "benchmark_conditions_incompatible",
        ),
      ).toHaveLength(1);
    }
  });
});
