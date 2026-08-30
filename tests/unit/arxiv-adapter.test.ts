import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  buildArxivRequestUrl,
  parseArxivFeed,
  retrieveArxivFeed,
} from "../../src/ingestion/arxiv-adapter";

const fixtureUrl = new URL("../fixtures/arxiv-feed.xml", import.meta.url);

afterEach(() => vi.unstubAllGlobals());

describe("arXiv production Source adapter contract", () => {
  test("requests a bounded newest-first window and maps only rights-safe metadata", async () => {
    const requestUrl = buildArxivRequestUrl({
      endpoint: "https://export.arxiv.org/api/query",
      maxItems: 25,
      query: "cat:cs.AI",
    });
    expect(requestUrl.searchParams.get("max_results")).toBe("25");
    expect(requestUrl.searchParams.get("sortBy")).toBe("submittedDate");
    expect(requestUrl.searchParams.get("sortOrder")).toBe("descending");
    expect(requestUrl.searchParams.get("search_query")).toBe("cat:cs.AI");

    const feed = await readFile(fixtureUrl, "utf8");
    const parsed = parseArxivFeed(feed, null);

    expect(parsed).toEqual({
      cursorFound: true,
      fetchedCount: 1,
      items: [
        {
          authors: [{ name: "Example Author" }],
          externalId: "2608.12345v1",
          originalTitle: "A Fixture Paper for AI Radar Ingestion",
          originalUrl: "https://arxiv.org/abs/2608.12345v1",
          publishedAt: "2026-08-29T13:00:00.000Z",
        },
      ],
      nextCursor: "2608.12345v1",
    });
    expect(parsed.items[0]).not.toHaveProperty("summary");
    expect(parseArxivFeed(feed, "2608.12345v1").items).toEqual([]);
    expect(parseArxivFeed(feed, "2608.00000v1").cursorFound).toBe(false);
    expect(() =>
      parseArxivFeed(
        feed.replace(
          'https://arxiv.org/abs/2608.12345v1" rel="alternate',
          'https://attacker.example/abs/2608.12345v1" rel="alternate',
        ),
        null,
      ),
    ).toThrow("Invalid arXiv Atom feed");
    expect(() =>
      parseArxivFeed(
        feed.replace(
          'href="https://arxiv.org/abs/2608.12345v1" rel="alternate',
          'href="https://arxiv.org/abs/2608.99999v1" rel="alternate',
        ),
        null,
      ),
    ).toThrow("Invalid arXiv Atom feed");
  });

  test("rejects malformed Atom instead of treating it as an empty feed", () => {
    expect(() => parseArxivFeed("<feed><entry>", null)).toThrow(
      "Invalid arXiv Atom feed",
    );
  });

  test("classifies a response-body stream failure as retryable network state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            headers: new Headers(),
            ok: true,
            status: 200,
            text: async () => {
              throw new TypeError("connection reset while reading body");
            },
          }) as unknown as Response,
      ),
    );

    await expect(
      retrieveArxivFeed({
        cursor: null,
        endpoint: "https://export.arxiv.org/api/query",
        maxItems: 1,
        now: new Date("2026-08-30T08:00:00.000Z"),
        query: "cat:cs.AI",
        requestTimeoutMs: 10_000,
        userAgent: "AI-Radar/0.1",
      }),
    ).rejects.toMatchObject({ kind: "network" });
  });
});
