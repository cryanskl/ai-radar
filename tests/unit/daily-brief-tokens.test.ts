import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createEmailToken, verifyEmailToken } from "@/daily-briefs/tokens";

const secret = "unit-test-email-token-secret-with-32-characters";

describe("Daily Brief email tokens", () => {
  it("round-trips a token only for its signed purpose", () => {
    const subscriptionId = randomUUID();
    const consentVersion = randomUUID();
    const token = createEmailToken(
      { purpose: "confirm", subscriptionId, consentVersion },
      secret,
    );

    expect(verifyEmailToken(token, "confirm", secret)).toEqual({
      purpose: "confirm",
      subscriptionId,
      consentVersion,
    });
    expect(verifyEmailToken(token, "unsubscribe", secret)).toBeNull();
  });

  it("rejects a changed payload or signature", () => {
    const token = createEmailToken(
      { purpose: "unsubscribe", subscriptionId: randomUUID() },
      secret,
    );
    const [payload, signature] = token.split(".");

    expect(
      verifyEmailToken(`${payload}A.${signature}`, "unsubscribe", secret),
    ).toBeNull();
    expect(
      verifyEmailToken(
        `${payload}.${signature.slice(0, -1)}A`,
        "unsubscribe",
        secret,
      ),
    ).toBeNull();
  });
});
