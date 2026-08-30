import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  buildGithubSearchUrl,
  parseGithubLanguages,
  parseGithubReleases,
  parseGithubRepository,
  parseGithubSearch,
  retrieveGithubRepositories,
} from "../../src/ingestion/github-adapter";

const fixture = (name: string) =>
  readFile(new URL(`../fixtures/${name}`, import.meta.url), "utf8");

afterEach(() => vi.unstubAllGlobals());

describe("GitHub production Source adapter contract", () => {
  test("maps only public repository and Release metadata", async () => {
    const search = parseGithubSearch(await fixture("github-search.json"));
    const repository = parseGithubRepository(
      await fixture("github-repository.json"),
      search[0],
    );
    const languages = parseGithubLanguages(
      await fixture("github-languages.json"),
    );
    const releases = parseGithubReleases(
      await fixture("github-releases.json"),
      repository.fullName,
    );

    expect(search).toEqual([
      { githubRepositoryId: 1351105824, fullName: "cryanskl/ai-radar" },
    ]);
    expect(repository).toMatchObject({
      githubRepositoryId: 1351105824,
      ownerLogin: "cryanskl",
      name: "ai-radar",
      fullName: "cryanskl/ai-radar",
      lifecycleState: "active",
      license: {
        status: "detected",
        spdxId: "Apache-2.0",
        name: "Apache License 2.0",
      },
      stars: 120,
      forks: 12,
      topics: ["ai", "radar"],
    });
    expect(languages).toEqual([
      { name: "TypeScript", bytes: 859205 },
      { name: "JavaScript", bytes: 365 },
    ]);
    expect(releases).toEqual([
      {
        githubReleaseId: 310000001,
        tagName: "v0.1.0",
        name: "Public Alpha fixture",
        url: "https://github.com/cryanskl/ai-radar/releases/tag/v0.1.0",
        prerelease: false,
        createdAt: "2026-08-29T12:00:00.000Z",
        publishedAt: "2026-08-29T13:00:00.000Z",
      },
    ]);
    expect(JSON.stringify({ repository, languages, releases })).not.toContain(
      "README",
    );
  });

  test("builds a bounded official search request", () => {
    const url = buildGithubSearchUrl({
      endpoint: "https://api.github.com/search/repositories",
      maxItems: 10,
      query: "topic:artificial-intelligence",
    });
    expect(url.searchParams.get("q")).toBe(
      "topic:artificial-intelligence is:public",
    );
    expect(url.searchParams.get("sort")).toBe("updated");
    expect(url.searchParams.get("order")).toBe("desc");
    expect(url.searchParams.get("per_page")).toBe("10");
  });

  test("uses the versioned REST API and classifies rate limits", async () => {
    const responses = [
      await fixture("github-search.json"),
      await fixture("github-repository.json"),
      await fixture("github-languages.json"),
      await fixture("github-releases.json"),
    ];
    const requests: Array<{ headers: Headers; url: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
        requests.push({
          headers: new Headers(init?.headers),
          url: input.toString(),
        });
        return new Response(responses.shift(), { status: 200 });
      }),
    );
    const result = await retrieveGithubRepositories({
      endpoint: "https://api.github.com",
      maxItems: 10,
      now: new Date("2026-08-30T15:10:00.000Z"),
      query: "topic:artificial-intelligence archived:false",
      requestTimeoutMs: 10_000,
      token: "fixture-token",
      userAgent: "AI-Radar/0.1",
    });
    expect(result.items[0]).toMatchObject({
      fullName: "cryanskl/ai-radar",
      observedAt: "2026-08-30T15:10:00.000Z",
    });
    const item = result.items[0];
    if (item.unavailable === true) {
      throw new Error("The discovered fixture Repository became unavailable");
    }
    expect(item.languages).toEqual(
      expect.arrayContaining([{ name: "TypeScript", bytes: 859205 }]),
    );
    expect(item.releases).toEqual(
      expect.arrayContaining([expect.objectContaining({ tagName: "v0.1.0" })]),
    );
    expect(requests).toHaveLength(4);
    for (const request of requests) {
      expect(request.headers.get("accept")).toBe("application/vnd.github+json");
      expect(request.headers.get("x-github-api-version")).toBe("2022-11-28");
      expect(request.headers.get("authorization")).toBe("Bearer fixture-token");
    }

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Promise.resolve(
          new Response("{}", {
            status: 403,
            headers: {
              "x-ratelimit-remaining": "0",
              "x-ratelimit-reset": "1788103200",
            },
          }),
        ),
      ),
    );
    await expect(
      retrieveGithubRepositories({
        endpoint: "https://api.github.com",
        maxItems: 10,
        now: new Date("2026-08-30T15:10:00.000Z"),
        query: "topic:artificial-intelligence",
        requestTimeoutMs: 10_000,
        token: null,
        userAgent: "AI-Radar/0.1",
      }),
    ).rejects.toMatchObject({ kind: "rate_limit" });
  });

  test("rejects identity and canonical URL mismatches", async () => {
    const search = parseGithubSearch(await fixture("github-search.json"));
    const repository = await fixture("github-repository.json");
    expect(() =>
      parseGithubRepository(
        repository.replace(
          '"html_url": "https://github.com/cryanskl/ai-radar"',
          '"html_url": "https://attacker.example/cryanskl/ai-radar"',
        ),
        search[0],
      ),
    ).toThrow("Invalid GitHub Repository response");
    expect(() =>
      parseGithubRepository(
        repository.replace("1351105824", "1351105825"),
        search[0],
      ),
    ).toThrow("Invalid GitHub Repository response");
  });

  test("preserves archived, mirrored and unavailable lifecycle states", async () => {
    const search = parseGithubSearch(await fixture("github-search.json"));
    const repository = JSON.parse(
      await fixture("github-repository.json"),
    ) as Record<string, unknown>;

    expect(
      parseGithubRepository(
        JSON.stringify({ ...repository, archived: true }),
        search[0],
      ).lifecycleState,
    ).toBe("archived");
    expect(
      parseGithubRepository(
        JSON.stringify({
          ...repository,
          mirror_url: "https://mirror.example.test/ai-radar.git",
        }),
        search[0],
      ).lifecycleState,
    ).toBe("mirrored");
    expect(
      parseGithubRepository(
        JSON.stringify({ ...repository, archived: true, disabled: true }),
        search[0],
      ).lifecycleState,
    ).toBe("unavailable");
  });

  test("preserves canonical fork and template provenance identities", async () => {
    const search = parseGithubSearch(await fixture("github-search.json"));
    const repository = JSON.parse(
      await fixture("github-repository.json"),
    ) as Record<string, unknown>;
    const provenance = {
      id: 777,
      full_name: "example/origin",
      html_url: "https://github.com/example/origin",
    };
    expect(
      parseGithubRepository(
        JSON.stringify({
          ...repository,
          fork: true,
          is_template: true,
          parent: provenance,
          source: provenance,
          template_repository: provenance,
        }),
        search[0],
      ),
    ).toMatchObject({
      parentRepository: {
        githubRepositoryId: 777,
        fullName: "example/origin",
      },
      sourceRepository: { githubRepositoryId: 777 },
      templateRepository: { githubRepositoryId: 777 },
    });
  });

  test("turns a known Repository HTTP 404 into an unavailable observation", async () => {
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: URL | RequestInfo) => {
        requests.push(input.toString());
        return requests.length === 1
          ? new Response(await fixture("github-search.json"), { status: 200 })
          : new Response("{}", { status: 404 });
      }),
    );
    const result = await retrieveGithubRepositories({
      endpoint: "https://api.github.com",
      knownRepositories: [
        {
          githubRepositoryId: 1351105824,
          fullName: "cryanskl/ai-radar",
        },
      ],
      maxItems: 10,
      now: new Date("2026-09-13T15:10:00.000Z"),
      query: "topic:artificial-intelligence",
      requestTimeoutMs: 10_000,
      token: null,
      userAgent: "AI-Radar/0.1",
    });
    expect(result.items).toEqual([
      {
        unavailable: true,
        githubRepositoryId: 1351105824,
        fullName: "cryanskl/ai-radar",
        observedAt: "2026-09-13T15:10:00.000Z",
      },
    ]);
    expect(requests).toHaveLength(2);
  });

  test("follows a same-origin rename for a known Repository by stable id", async () => {
    const renamedRepository = {
      ...(JSON.parse(await fixture("github-repository.json")) as Record<
        string,
        unknown
      >),
      full_name: "newowner/ai-radar",
      owner: { id: 34471145, login: "newowner" },
      html_url: "https://github.com/newowner/ai-radar",
    };
    const renamedReleases = (await fixture("github-releases.json")).replaceAll(
      "cryanskl/ai-radar",
      "newowner/ai-radar",
    );
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: URL | RequestInfo) => {
        const url = input.toString();
        requests.push(url);
        if (url.includes("/search/repositories?")) {
          return new Response(await fixture("github-search.json"), {
            status: 200,
          });
        }
        if (url === "https://api.github.com/repos/cryanskl/ai-radar") {
          return new Response(null, {
            status: 301,
            headers: {
              location: "https://api.github.com/repos/newowner/ai-radar",
            },
          });
        }
        if (url === "https://api.github.com/repos/newowner/ai-radar") {
          return new Response(JSON.stringify(renamedRepository), {
            status: 200,
          });
        }
        if (
          url === "https://api.github.com/repos/newowner/ai-radar/languages"
        ) {
          return new Response(await fixture("github-languages.json"), {
            status: 200,
          });
        }
        if (
          url ===
          "https://api.github.com/repos/newowner/ai-radar/releases?per_page=10"
        ) {
          return new Response(renamedReleases, { status: 200 });
        }
        return new Response("{}", { status: 404 });
      }),
    );

    const result = await retrieveGithubRepositories({
      endpoint: "https://api.github.com",
      knownRepositories: [
        {
          githubRepositoryId: 1351105824,
          fullName: "cryanskl/ai-radar",
        },
      ],
      maxItems: 10,
      now: new Date("2026-09-10T15:10:00.000Z"),
      query: "topic:artificial-intelligence",
      requestTimeoutMs: 10_000,
      token: "fixture-token",
      userAgent: "AI-Radar/0.1",
    });

    expect(result.items[0]).toMatchObject({
      githubRepositoryId: 1351105824,
      fullName: "newowner/ai-radar",
      ownerLogin: "newowner",
      url: "https://github.com/newowner/ai-radar",
    });
    expect(requests).toEqual([
      expect.stringContaining("/search/repositories?"),
      "https://api.github.com/repos/cryanskl/ai-radar",
      "https://api.github.com/repos/newowner/ai-radar",
      "https://api.github.com/repos/newowner/ai-radar/languages",
      "https://api.github.com/repos/newowner/ai-radar/releases?per_page=10",
    ]);
  });

  test("stops metadata retrieval when a known Repository becomes private", async () => {
    const privateRepository = {
      ...(JSON.parse(await fixture("github-repository.json")) as Record<
        string,
        unknown
      >),
      private: true,
      visibility: "private",
    };
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: URL | RequestInfo) => {
        const url = input.toString();
        requests.push(url);
        return url.includes("/search/repositories?")
          ? new Response(await fixture("github-search.json"), { status: 200 })
          : new Response(JSON.stringify(privateRepository), { status: 200 });
      }),
    );

    const result = await retrieveGithubRepositories({
      endpoint: "https://api.github.com",
      knownRepositories: [
        {
          githubRepositoryId: 1351105824,
          fullName: "cryanskl/ai-radar",
        },
      ],
      maxItems: 10,
      now: new Date("2026-09-11T15:10:00.000Z"),
      query: "topic:artificial-intelligence",
      requestTimeoutMs: 10_000,
      token: "fixture-token",
      userAgent: "AI-Radar/0.1",
    });

    expect(result.items).toEqual([
      {
        unavailable: true,
        githubRepositoryId: 1351105824,
        fullName: "cryanskl/ai-radar",
        observedAt: "2026-09-11T15:10:00.000Z",
      },
    ]);
    expect(requests).toHaveLength(2);
  });

  test("filters a token-visible untracked private Repository before detail retrieval", async () => {
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: URL | RequestInfo) => {
        requests.push(input.toString());
        return new Response(
          JSON.stringify({
            incomplete_results: false,
            items: [
              {
                id: 7001,
                full_name: "private-owner/private-ai",
                private: true,
                visibility: "private",
              },
            ],
          }),
          { status: 200 },
        );
      }),
    );

    const result = await retrieveGithubRepositories({
      endpoint: "https://api.github.com",
      maxItems: 10,
      now: new Date("2026-09-14T15:10:00.000Z"),
      query: "topic:artificial-intelligence is:private",
      requestTimeoutMs: 10_000,
      token: "token-with-private-access",
      userAgent: "AI-Radar/0.1",
    });

    expect(result).toMatchObject({ fetchedCount: 0, items: [] });
    expect(requests).toHaveLength(1);
    const searchUrl = new URL(requests[0]);
    expect(searchUrl.searchParams.get("q")).toBe(
      "topic:artificial-intelligence is:public",
    );
  });
});
