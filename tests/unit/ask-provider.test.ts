import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAiAskLlm } from "@/ask/provider";
import { versionAskEvidencePack } from "@/ask/version";

const evidence = [
  {
    citationId: "event:event-alpha",
    recordType: "event" as const,
    publicId: "event-alpha",
    title: "Alpha",
    summary: "Alpha public summary.",
    recordUrl: "/en/radar/events/event-alpha",
    source: {
      title: "Alpha source",
      url: "https://evidence.example.test/alpha",
    },
    lastVerifiedAt: "2026-08-30T08:00:00.000Z",
    comparisonBasis: null,
  },
];

const generationInput = {
  question: "What is Alpha?",
  locale: "en" as const,
  evidence,
  dataCutoff: "2026-08-30T08:00:00.000Z",
  dataVersion: "public-0123456789abcdef",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenAI Ask provider", () => {
  it("reads aggregate output text when a response also contains reasoning items", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          status: "completed",
          output: [
            { type: "reasoning", id: "reasoning-1", summary: [] },
            { type: "message", id: "message-1", content: [] },
          ],
          output_text: JSON.stringify({
            status: "answered",
            answer: "Alpha is present in the public evidence pack.",
            claims: [
              {
                text: "Alpha is present.",
                citationIds: ["event:event-alpha"],
                comparison: null,
              },
            ],
          }),
        }),
      ),
    );

    await expect(
      new OpenAiAskLlm("test-key", "test-model").generate(generationInput),
    ).resolves.toMatchObject({ status: "answered" });
  });

  it("aborts a stalled provider request at the configured timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (_url: string | URL | Request, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) =>
            init?.signal?.addEventListener("abort", () =>
              reject(init.signal?.reason),
            ),
          ),
      ),
    );

    await expect(
      new OpenAiAskLlm("test-key", "test-model", 5).generate(generationInput),
    ).rejects.toThrow();
  });
});

describe("Ask evidence version", () => {
  it("changes when any answer-driving content or cutoff changes", () => {
    const baseline = versionAskEvidencePack({
      items: evidence,
      dataCutoff: "2026-08-30T08:00:00.000Z",
    });
    expect(
      versionAskEvidencePack({
        items: [{ ...evidence[0], summary: "Changed public summary." }],
        dataCutoff: "2026-08-30T08:00:00.000Z",
      }),
    ).not.toBe(baseline);
    expect(
      versionAskEvidencePack({
        items: evidence,
        dataCutoff: "2026-08-30T09:00:00.000Z",
      }),
    ).not.toBe(baseline);
  });
});
