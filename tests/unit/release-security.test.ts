import { describe, expect, it } from "vitest";
import { scanReleaseFiles } from "@/release-readiness/security";

describe("release security scan", () => {
  it("accepts rights-safe public data without credential material", () => {
    expect(
      scanReleaseFiles([
        {
          path: "data/historical-batches/safe.json",
          content: JSON.stringify({
            publicId: "event-safe",
            attribution: "Official source",
            rightsStatus: "metadata_only",
          }),
        },
      ]),
    ).toEqual([]);
  });

  it("detects strong secret signatures in any repository file", () => {
    expect(
      scanReleaseFiles([
        {
          path: "docs/accidental.md",
          content: [
            "token: ghp_",
            "abcdefghijklmnopqrstuvwxyz1234567890AB",
          ].join(""),
        },
        {
          path: "config/key.txt",
          content: ["-----BEGIN ", "PRIVATE KEY-----"].join(""),
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        path: "docs/accidental.md",
        code: "github_token",
      }),
      expect.objectContaining({ path: "config/key.txt", code: "private_key" }),
    ]);
  });

  it("rejects email addresses and internal fields from checked-in public data", () => {
    expect(
      scanReleaseFiles([
        {
          path: "data/public-release.json",
          content: JSON.stringify({
            email: "reader@example.com",
            internalNote: "Owner-only review",
          }),
        },
      ]).map(({ code }) => code),
    ).toEqual(["email_address", "restricted_field"]);
  });
});
