import { describe, expect, test } from "vitest";
import { assessEventCandidate } from "../../src/events/clustering";

describe("Event candidate retrieval evidence", () => {
  test("ranks verified identifiers, canonical URLs, time and shared Entities", () => {
    expect(
      assessEventCandidate({
        candidateEventType: "announces",
        candidateOccurredAt: "2026-08-30T10:20:00.000Z",
        candidateSourceItems: [
          {
            externalId: "model-alpha-launch",
            externalIdVerified: true,
            canonicalUrl: "https://openai.com/index/model-alpha/",
          },
        ],
        candidateEntityPublicIds: ["model-alpha"],
        eventType: "announces",
        occurredAt: "2026-08-30T10:00:00.000Z",
        sourceItems: [
          {
            externalId: "model-alpha-launch",
            externalIdVerified: true,
            canonicalUrl: "https://openai.com/index/model-alpha/",
          },
        ],
        entityPublicIds: ["model-alpha"],
      }),
    ).toEqual({
      confidence: 100,
      highImpact: false,
      requiresOwnerReview: false,
      signals: {
        canonicalUrls: ["https://openai.com/index/model-alpha/"],
        sharedEntityPublicIds: ["model-alpha"],
        timeDistanceMinutes: 20,
        verifiedExternalIds: ["model-alpha-launch"],
      },
    });
  });

  test("rejects title-only candidates and requires review for low-confidence high-impact matches", () => {
    const base = {
      candidateOccurredAt: "2026-08-30T10:20:00.000Z",
      candidateSourceItems: [
        {
          externalId: "secondary-report",
          externalIdVerified: false,
          canonicalUrl: "https://example.com/secondary-report",
        },
      ],
      candidateEntityPublicIds: [] as string[],
      occurredAt: "2026-08-30T10:00:00.000Z",
      sourceItems: [
        {
          externalId: "official-report",
          externalIdVerified: false,
          canonicalUrl: "https://example.com/official-report",
        },
      ],
      entityPublicIds: [] as string[],
    };
    expect(
      assessEventCandidate({
        ...base,
        candidateEventType: "announces",
        eventType: "announces",
      }),
    ).toBeNull();
    expect(
      assessEventCandidate({
        ...base,
        candidateEventType: "changes_price_of",
        eventType: "changes_price_of",
        candidateEntityPublicIds: ["model-alpha"],
        entityPublicIds: ["model-alpha"],
      }),
    ).toMatchObject({
      confidence: 45,
      highImpact: true,
      requiresOwnerReview: true,
    });
  });
});
