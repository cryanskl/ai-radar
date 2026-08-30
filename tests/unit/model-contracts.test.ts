import { describe, expect, it } from "vitest";
import { modelVersionProfileCreateRequestSchema } from "../../src/models/contracts";

const validProfile = {
  familyPublicId: "model-radar-one",
  versionPublicId: "model-radar-one-v1",
  providerPublicId: "organization-provider",
  lifecycleStatus: "active" as const,
  inputModalities: ["text" as const],
  outputModalities: ["text" as const],
  contextWindowTokens: 128000,
  accessMethods: ["hosted_api" as const],
  regions: ["global"],
  priceRecords: [
    {
      publicId: "price-radar-one-input",
      category: "input_tokens" as const,
      amount: "2.50000000",
      currency: "USD",
      unit: "per_million_tokens" as const,
      region: "global",
      taxPolicy: "exclusive" as const,
      validFrom: "2026-01-01T00:00:00.000Z",
      validTo: null as string | null,
      sourceItemPublicId: "source-price",
      lastVerifiedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  benchmarkRuns: [
    {
      publicId: "run-radar-one-code",
      benchmarkPublicId: "benchmark-code",
      benchmarkVersion: "1.0",
      task: "coding",
      score: "70.10000000",
      unit: "percent",
      higherIsBetter: true,
      settings: { temperature: 0 },
      evaluatorPublicId: "organization-evaluator",
      provenance: "independent_reproduced" as const,
      runAt: "2026-01-01T00:00:00.000Z",
      evidenceSourceItemPublicId: "source-run",
      reproducibility: "reproduced" as const,
      confidence: 95,
      lastVerifiedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
};

describe("Model Version profile boundaries", () => {
  it("compares Price Record validity as instants across offsets", () => {
    const input = structuredClone(validProfile);
    input.priceRecords[0].validFrom = "2026-01-01T00:30:00-01:00";
    input.priceRecords[0].validTo = "2026-01-01T01:00:00+00:00";

    expect(
      modelVersionProfileCreateRequestSchema.safeParse(input).success,
    ).toBe(false);
  });

  it("rejects numbers wider than PostgreSQL numeric(20,8)", () => {
    const priceInput = structuredClone(validProfile);
    priceInput.priceRecords[0].amount = "1234567890123.00000000";
    expect(
      modelVersionProfileCreateRequestSchema.safeParse(priceInput).success,
    ).toBe(false);

    const benchmarkInput = structuredClone(validProfile);
    benchmarkInput.benchmarkRuns[0].score = "-1234567890123.00000000";
    expect(
      modelVersionProfileCreateRequestSchema.safeParse(benchmarkInput).success,
    ).toBe(false);
  });
});
