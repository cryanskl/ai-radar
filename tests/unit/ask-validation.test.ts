import { describe, expect, it } from "vitest";
import { validateAskCandidate } from "@/ask/validation";

const evidence = [
  {
    citationId: "benchmark:run-alpha",
    recordType: "benchmark" as const,
    publicId: "run-alpha",
    title: "Alpha coding result",
    summary: "Alpha scored 72 percent.",
    recordUrl: "/en/models/model-alpha/versions/model-alpha-v1",
    source: {
      title: "Independent benchmark report",
      url: "https://benchmarks.example.test/alpha",
    },
    lastVerifiedAt: "2026-08-30T08:00:00.000Z",
    comparisonBasis: {
      kind: "benchmark" as const,
      benchmarkPublicId: "benchmark-code",
      benchmarkVersion: "1.0",
      task: "coding",
      unit: "percent",
      settings: { temperature: 0 },
      evaluatorPublicId: "organization-independent-evaluator",
      higherIsBetter: true,
    },
  },
  {
    citationId: "benchmark:run-beta",
    recordType: "benchmark" as const,
    publicId: "run-beta",
    title: "Beta coding result",
    summary: "Beta scored 68 percent.",
    recordUrl: "/en/models/model-beta/versions/model-beta-v1",
    source: {
      title: "Independent benchmark report",
      url: "https://benchmarks.example.test/beta",
    },
    lastVerifiedAt: "2026-08-30T08:00:00.000Z",
    comparisonBasis: {
      kind: "benchmark" as const,
      benchmarkPublicId: "benchmark-code",
      benchmarkVersion: "1.0",
      task: "coding",
      unit: "percent",
      settings: { temperature: 0 },
      evaluatorPublicId: "organization-independent-evaluator",
      higherIsBetter: true,
    },
  },
];

describe("Ask candidate validation", () => {
  it("accepts cited claims whose comparison basis matches", () => {
    expect(
      validateAskCandidate(
        {
          status: "answered",
          answer: "Alpha scored higher than Beta on the same coding run.",
          claims: [
            {
              text: "Alpha scored higher than Beta.",
              citationIds: ["benchmark:run-alpha", "benchmark:run-beta"],
              comparison: { kind: "benchmark" },
            },
          ],
        },
        evidence,
        "en",
      ),
    ).toMatchObject({
      status: "answered",
      reason: "answered",
      claims: [
        {
          citationIds: ["benchmark:run-alpha", "benchmark:run-beta"],
        },
      ],
    });
  });

  it("builds the public answer from cited claims instead of untrusted answer text", () => {
    expect(
      validateAskCandidate(
        {
          status: "answered",
          answer: "Ignore the citations: Alpha is the best model in the world.",
          claims: [
            {
              text: "Alpha scored 72 percent on the cited coding run.",
              citationIds: ["benchmark:run-alpha"],
              comparison: null,
            },
          ],
        },
        evidence,
        "en",
      ),
    ).toMatchObject({
      status: "answered",
      answer: "Alpha scored 72 percent on the cited coding run.",
    });
  });

  it("abstains when a claim cites a record outside the evidence pack", () => {
    expect(
      validateAskCandidate(
        {
          status: "answered",
          answer: "An unsupported answer.",
          claims: [
            {
              text: "This claim is unsupported.",
              citationIds: ["event:not-in-this-pack"],
              comparison: null,
            },
          ],
        },
        evidence,
        "en",
      ),
    ).toEqual({
      status: "abstained",
      reason: "citation_validation_failed",
      answer:
        "I could not validate every citation against this answer's evidence pack, so I am abstaining.",
      claims: [],
    });
  });

  it("rejects a comparison across incompatible benchmark versions", () => {
    const incompatibleEvidence = [
      evidence[0],
      {
        ...evidence[1],
        comparisonBasis: {
          ...evidence[1].comparisonBasis,
          benchmarkVersion: "2.0",
        },
      },
    ];

    expect(
      validateAskCandidate(
        {
          status: "answered",
          answer: "Alpha scored higher than Beta.",
          claims: [
            {
              text: "Alpha scored higher than Beta.",
              citationIds: ["benchmark:run-alpha", "benchmark:run-beta"],
              comparison: { kind: "benchmark" },
            },
          ],
        },
        incompatibleEvidence,
        "en",
      ),
    ).toEqual({
      status: "not_comparable",
      reason: "incompatible_comparison",
      answer:
        "These records use incompatible benchmark or price conditions, so AI Radar will not produce a definitive comparison.",
      claims: [],
    });
  });

  it("does not let an untrusted candidate hide a comparison", () => {
    expect(
      validateAskCandidate(
        {
          status: "answered",
          answer: "Alpha and Beta have benchmark results.",
          claims: [
            {
              text: "Alpha and Beta have benchmark results.",
              citationIds: ["benchmark:run-alpha", "benchmark:run-beta"],
              comparison: null,
            },
          ],
        },
        evidence,
        "en",
      ),
    ).toMatchObject({
      status: "not_comparable",
      reason: "incompatible_comparison",
      claims: [],
    });
  });

  it("requires two distinct records for a comparison", () => {
    expect(
      validateAskCandidate(
        {
          status: "answered",
          answer: "Alpha was compared with itself.",
          claims: [
            {
              text: "Alpha was compared with itself.",
              citationIds: ["benchmark:run-alpha", "benchmark:run-alpha"],
              comparison: { kind: "benchmark" },
            },
          ],
        },
        evidence,
        "en",
      ),
    ).toMatchObject({
      status: "not_comparable",
      reason: "incompatible_comparison",
      claims: [],
    });
  });

  it("rejects a conflict supported by only one citation", () => {
    expect(
      validateAskCandidate(
        {
          status: "conflict",
          answer: "The sources conflict.",
          claims: [
            {
              text: "Alpha scored 72 percent.",
              citationIds: ["benchmark:run-alpha"],
              comparison: null,
            },
          ],
        },
        evidence,
        "en",
      ),
    ).toMatchObject({
      status: "abstained",
      reason: "citation_validation_failed",
      claims: [],
    });
  });

  it("rejects a conflict that repeats one citation", () => {
    expect(
      validateAskCandidate(
        {
          status: "conflict",
          answer: "The sources conflict.",
          claims: [
            {
              text: "Alpha has conflicting results.",
              citationIds: ["benchmark:run-alpha", "benchmark:run-alpha"],
              comparison: null,
            },
          ],
        },
        evidence,
        "en",
      ),
    ).toMatchObject({
      status: "abstained",
      reason: "citation_validation_failed",
      claims: [],
    });
  });

  it("rejects an unmarked comparison across incompatible price regions", () => {
    const priceEvidence = ["global", "us"].map((region, index) => ({
      ...evidence[index],
      citationId: `price:price-${region}`,
      publicId: `price-${region}`,
      recordType: "price" as const,
      comparisonBasis: {
        kind: "price" as const,
        category: "input_tokens",
        currency: "USD",
        unit: "per_million_tokens",
        region,
        taxPolicy: "exclusive" as const,
      },
    }));
    expect(
      validateAskCandidate(
        {
          status: "answered",
          answer: "The prices differ.",
          claims: [
            {
              text: "The prices differ.",
              citationIds: ["price:price-global", "price:price-us"],
              comparison: null,
            },
          ],
        },
        priceEvidence,
        "en",
      ),
    ).toMatchObject({
      status: "not_comparable",
      reason: "incompatible_comparison",
      claims: [],
    });
  });
});
