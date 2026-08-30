import { describe, expect, it } from "vitest";
import {
  correctionCreateRequestSchema,
  rightsDecisionCreateRequestSchema,
} from "../../src/operations/contracts";

const futureCase = {
  publicId: "case-future-receipt",
  receivedAt: "2026-08-30T10:00:00.000Z",
  originalRequest: "A request that claims to arrive in the future.",
  evidenceSummary: "Evidence was reviewed before the declared receipt time.",
};

describe("editorial case chronology", () => {
  it("rejects a Correction decided before its case was received", () => {
    expect(
      correctionCreateRequestSchema.safeParse({
        publicId: "correction-future-receipt",
        case: futureCase,
        target: { type: "event", publicId: "event-example" },
        reasonCode: "factual_error",
        effectiveAt: "2026-08-30T09:00:00.000Z",
        replacementVersion: "event-example-v2",
        evidenceSourceItemPublicIds: ["source-item-example"],
        changes: {
          occurredAt: "2026-08-30T08:00:00.000Z",
          occurredAtPrecision: "second",
        },
        internalNote: "Chronology must be monotonic.",
      }).success,
    ).toBe(false);
  });

  it("rejects a Rights decision made before its case was received", () => {
    expect(
      rightsDecisionCreateRequestSchema.safeParse({
        publicId: "rights-future-receipt",
        case: futureCase,
        target: { type: "event", publicId: "event-example" },
        toStatus: "withdrawn",
        publicReasonCode: "rights_withdrawal",
        effectiveAt: "2026-08-30T09:00:00.000Z",
        internalNote: "Chronology must be monotonic.",
      }).success,
    ).toBe(false);
  });
});
