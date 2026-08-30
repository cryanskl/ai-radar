import { createHash } from "node:crypto";
import { z } from "zod";
import { RetryableIngestError } from "./errors";

const githubSearchItemSchema = z.object({
  id: z.number().int().positive(),
  full_name: z.string().regex(/^[^/]+\/[^/]+$/),
  private: z.boolean(),
  visibility: z.string(),
});

const githubSearchSchema = z.object({
  incomplete_results: z.boolean(),
  items: z.array(githubSearchItemSchema),
});

const githubLicenseSchema = z
  .object({
    name: z.string().min(1),
    spdx_id: z.string().min(1),
  })
  .nullable();

const githubRepositoryReferenceSchema = z.object({
  id: z.number().int().positive(),
  full_name: z.string().regex(/^[^/]+\/[^/]+$/),
  html_url: z.url(),
});

const githubRepositorySchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  full_name: z.string().regex(/^[^/]+\/[^/]+$/),
  private: z.boolean(),
  owner: z.object({
    id: z.number().int().positive(),
    login: z.string().min(1),
  }),
  html_url: z.url(),
  description: z.string().nullable(),
  fork: z.boolean(),
  mirror_url: z.url().nullable(),
  archived: z.boolean(),
  disabled: z.boolean(),
  visibility: z.string(),
  is_template: z.boolean().default(false),
  parent: githubRepositoryReferenceSchema.nullish(),
  source: githubRepositoryReferenceSchema.nullish(),
  template_repository: githubRepositoryReferenceSchema.nullish(),
  topics: z.array(z.string()),
  language: z.string().nullable(),
  license: githubLicenseSchema,
  stargazers_count: z.number().int().nonnegative(),
  forks_count: z.number().int().nonnegative(),
  open_issues_count: z.number().int().nonnegative(),
  subscribers_count: z.number().int().nonnegative(),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
  pushed_at: z.iso.datetime({ offset: true }).nullable(),
});

const githubLanguagesSchema = z.record(
  z.string().min(1),
  z.number().int().nonnegative(),
);

const githubReleaseSchema = z.object({
  id: z.number().int().positive(),
  tag_name: z.string().min(1),
  name: z.string().nullable(),
  html_url: z.url(),
  draft: z.boolean(),
  prerelease: z.boolean(),
  created_at: z.iso.datetime({ offset: true }),
  published_at: z.iso.datetime({ offset: true }).nullable(),
});

export const buildGithubSearchUrl = ({
  endpoint,
  maxItems,
  query,
}: {
  endpoint: string;
  maxItems: number;
  query: string;
}) => {
  const url = new URL("/search/repositories", endpoint);
  const publicQuery = `${query
    .replace(/\bis:(?:public|private|internal)\b/gi, "")
    .trim()} is:public`.trim();
  url.searchParams.set("q", publicQuery);
  url.searchParams.set("sort", "updated");
  url.searchParams.set("order", "desc");
  url.searchParams.set("per_page", String(maxItems));
  return url;
};

export type GithubRepositoryCandidate = {
  githubRepositoryId: number;
  fullName: string;
};

export const parseGithubSearch = (body: string) => {
  try {
    const parsed = githubSearchSchema.parse(JSON.parse(body));
    if (parsed.incomplete_results) {
      throw new Error("GitHub Search returned incomplete results");
    }
    return parsed.items
      .filter(
        (repository) =>
          !repository.private && repository.visibility === "public",
      )
      .map(({ id, full_name }) => ({
        githubRepositoryId: id,
        fullName: full_name,
      }));
  } catch (error) {
    throw new Error("Invalid GitHub Search response", { cause: error });
  }
};

const isCanonicalRepositoryUrl = (value: string, fullName: string) => {
  const url = new URL(value);
  return (
    url.protocol === "https:" &&
    url.username === "" &&
    url.password === "" &&
    url.port === "" &&
    url.hostname === "github.com" &&
    url.pathname === `/${fullName}`
  );
};

const parseRepositoryReference = (
  reference: z.infer<typeof githubRepositoryReferenceSchema> | null | undefined,
) => {
  if (!reference) return null;
  if (!isCanonicalRepositoryUrl(reference.html_url, reference.full_name)) {
    throw new Error("GitHub Repository provenance URL is not canonical");
  }
  return {
    githubRepositoryId: reference.id,
    fullName: reference.full_name,
    url: reference.html_url,
  };
};

const parseGithubRepositoryResponse = (
  body: string,
  candidate: GithubRepositoryCandidate,
  knownRepository: boolean,
) => {
  try {
    const repository = githubRepositorySchema.parse(JSON.parse(body));
    if (
      repository.id !== candidate.githubRepositoryId ||
      repository.full_name !== `${repository.owner.login}/${repository.name}` ||
      !isCanonicalRepositoryUrl(repository.html_url, repository.full_name)
    ) {
      throw new Error("GitHub Repository identity is inconsistent");
    }
    if (repository.private || repository.visibility !== "public") {
      if (!knownRepository) {
        throw new Error("GitHub Repository is not public");
      }
      return {
        unavailable: true as const,
        githubRepositoryId: repository.id,
        fullName: candidate.fullName,
      };
    }
    if (!knownRepository && repository.full_name !== candidate.fullName) {
      throw new Error("GitHub Repository identity is inconsistent");
    }
    return {
      githubRepositoryId: repository.id,
      githubOwnerId: repository.owner.id,
      ownerLogin: repository.owner.login,
      name: repository.name,
      fullName: repository.full_name,
      url: repository.html_url,
      description: repository.description,
      topics: repository.topics,
      primaryLanguage: repository.language,
      license: repository.license
        ? {
            status: "detected" as const,
            spdxId: repository.license.spdx_id,
            name: repository.license.name,
          }
        : {
            status: "missing" as const,
            spdxId: null,
            name: null,
          },
      stars: repository.stargazers_count,
      forks: repository.forks_count,
      openIssues: repository.open_issues_count,
      subscribers: repository.subscribers_count,
      lifecycleState: repository.disabled
        ? ("unavailable" as const)
        : repository.archived
          ? ("archived" as const)
          : repository.mirror_url
            ? ("mirrored" as const)
            : ("active" as const),
      fork: repository.fork,
      mirrorUrl: repository.mirror_url,
      template: repository.is_template,
      parentRepository: parseRepositoryReference(repository.parent),
      sourceRepository: parseRepositoryReference(repository.source),
      templateRepository: parseRepositoryReference(
        repository.template_repository,
      ),
      createdAt: new Date(repository.created_at).toISOString(),
      updatedAt: new Date(repository.updated_at).toISOString(),
      pushedAt: repository.pushed_at
        ? new Date(repository.pushed_at).toISOString()
        : null,
    };
  } catch (error) {
    throw new Error("Invalid GitHub Repository response", { cause: error });
  }
};

type ParsedGithubRepository = ReturnType<typeof parseGithubRepositoryResponse>;
type PublicGithubRepository = Exclude<
  ParsedGithubRepository,
  { unavailable: true }
>;

export function parseGithubRepository(
  body: string,
  candidate: GithubRepositoryCandidate,
): PublicGithubRepository;
export function parseGithubRepository(
  body: string,
  candidate: GithubRepositoryCandidate,
  options: { knownRepository: true },
): ParsedGithubRepository;
export function parseGithubRepository(
  body: string,
  candidate: GithubRepositoryCandidate,
  options?: { knownRepository: true },
) {
  return parseGithubRepositoryResponse(
    body,
    candidate,
    options?.knownRepository ?? false,
  );
}

export const parseGithubLanguages = (body: string) => {
  try {
    return Object.entries(githubLanguagesSchema.parse(JSON.parse(body)))
      .map(([name, bytes]) => ({ name, bytes }))
      .sort(
        (left, right) =>
          right.bytes - left.bytes || left.name.localeCompare(right.name),
      );
  } catch (error) {
    throw new Error("Invalid GitHub Languages response", { cause: error });
  }
};

export const parseGithubReleases = (body: string, fullName: string) => {
  try {
    return z
      .array(githubReleaseSchema)
      .parse(JSON.parse(body))
      .filter(({ draft }) => !draft)
      .map((release) => {
        const url = new URL(release.html_url);
        if (
          url.protocol !== "https:" ||
          url.hostname !== "github.com" ||
          !url.pathname.startsWith(`/${fullName}/releases/tag/`)
        ) {
          throw new Error("GitHub Release URL is not canonical");
        }
        return {
          githubReleaseId: release.id,
          tagName: release.tag_name,
          name: release.name,
          url: release.html_url,
          prerelease: release.prerelease,
          createdAt: new Date(release.created_at).toISOString(),
          publishedAt: release.published_at
            ? new Date(release.published_at).toISOString()
            : null,
        };
      });
  } catch (error) {
    throw new Error("Invalid GitHub Releases response", { cause: error });
  }
};

const retryAtFromGithub = (response: Response) => {
  const reset = response.headers.get("x-ratelimit-reset");
  if (!reset) return undefined;
  const epochSeconds = Number(reset);
  return Number.isFinite(epochSeconds)
    ? new Date(epochSeconds * 1000)
    : undefined;
};

const requestGithubJson = async ({
  allowNotFound = false,
  followSameOriginRedirects = false,
  token,
  url,
  userAgent,
  requestTimeoutMs,
}: {
  allowNotFound?: boolean;
  followSameOriginRedirects?: boolean;
  token: string | null;
  url: URL;
  userAgent: string;
  requestTimeoutMs: number;
}) => {
  const originalOrigin = url.origin;
  let currentUrl = url;
  let response: Response | undefined;
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    try {
      response = await fetch(currentUrl, {
        headers: {
          accept: "application/vnd.github+json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          "user-agent": userAgent,
          "x-github-api-version": "2022-11-28",
        },
        redirect: followSameOriginRedirects ? "manual" : "error",
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
    } catch (error) {
      throw new RetryableIngestError(
        "GitHub request failed before receiving a response",
        "network",
        undefined,
        { cause: error },
      );
    }
    if (
      !followSameOriginRedirects ||
      ![301, 302, 307, 308].includes(response.status)
    ) {
      break;
    }
    const location = response.headers.get("location");
    if (!location) {
      throw new RetryableIngestError(
        "GitHub redirect omitted its destination",
        "network",
      );
    }
    const redirectUrl = new URL(location, currentUrl);
    if (redirectUrl.origin !== originalOrigin) {
      throw new RetryableIngestError(
        "GitHub redirect crossed the authenticated API origin",
        "network",
      );
    }
    currentUrl = redirectUrl;
    response = undefined;
  }
  if (!response) {
    throw new RetryableIngestError(
      "GitHub returned too many redirects",
      "network",
    );
  }
  if (
    response.status === 429 ||
    (response.status === 403 &&
      response.headers.get("x-ratelimit-remaining") === "0")
  ) {
    throw new RetryableIngestError(
      "GitHub API rate limit was reached",
      "rate_limit",
      retryAtFromGithub(response),
    );
  }
  if (response.status === 401 || response.status === 403) {
    throw new RetryableIngestError(
      `GitHub rejected the request with HTTP ${response.status}`,
      "authentication",
    );
  }
  if (allowNotFound && response.status === 404) return null;
  if (!response.ok) {
    throw new RetryableIngestError(
      `GitHub returned HTTP ${response.status}`,
      "network",
    );
  }
  try {
    return await response.text();
  } catch (error) {
    throw new RetryableIngestError(
      "GitHub response ended before its body was read",
      "network",
      undefined,
      { cause: error },
    );
  }
};

export const retrieveGithubRepositories = async ({
  endpoint,
  maxItems,
  knownRepositories = [],
  now,
  query,
  requestTimeoutMs,
  token,
  userAgent,
}: {
  endpoint: string;
  maxItems: number;
  knownRepositories?: GithubRepositoryCandidate[];
  now: Date;
  query: string;
  requestTimeoutMs: number;
  token: string | null;
  userAgent: string;
}) => {
  const request = (
    url: URL,
    options: {
      allowNotFound?: boolean;
      followSameOriginRedirects?: boolean;
    } = {},
  ) =>
    requestGithubJson({
      ...options,
      token,
      url,
      userAgent,
      requestTimeoutMs,
    });
  const searchBody = await request(
    buildGithubSearchUrl({ endpoint, maxItems, query }),
  );
  if (searchBody === null) {
    throw new Error("GitHub Search cannot allow HTTP 404");
  }
  let candidates: ReturnType<typeof parseGithubSearch>;
  try {
    const discovered = parseGithubSearch(searchBody);
    const knownRefreshLimit = Math.min(
      knownRepositories.length,
      Math.max(1, Math.floor(maxItems / 2)),
    );
    const byRepositoryId = new Map(
      knownRepositories
        .slice(0, knownRefreshLimit)
        .map((candidate) => [candidate.githubRepositoryId, candidate]),
    );
    for (const candidate of discovered) {
      byRepositoryId.set(candidate.githubRepositoryId, candidate);
    }
    candidates = [...byRepositoryId.values()].slice(0, maxItems);
  } catch (error) {
    throw new RetryableIngestError(
      "GitHub returned an invalid Search response",
      "parsing",
      undefined,
      { cause: error },
    );
  }
  const responseBodies = [searchBody];
  const items = [];
  const knownRepositoryIds = new Set(
    knownRepositories.map(({ githubRepositoryId }) => githubRepositoryId),
  );
  for (const candidate of candidates) {
    const repositoryUrl = new URL(`/repos/${candidate.fullName}`, endpoint);
    const knownRepository = knownRepositoryIds.has(
      candidate.githubRepositoryId,
    );
    const repositoryBody = await request(repositoryUrl, {
      allowNotFound: knownRepository,
      followSameOriginRedirects: knownRepository,
    });
    if (repositoryBody === null) {
      responseBodies.push(`404:${candidate.githubRepositoryId}`);
      items.push({
        unavailable: true as const,
        ...candidate,
        observedAt: now.toISOString(),
      });
      continue;
    }
    let repository: ParsedGithubRepository;
    try {
      repository = knownRepository
        ? parseGithubRepository(repositoryBody, candidate, {
            knownRepository: true,
          })
        : parseGithubRepository(repositoryBody, candidate);
    } catch (error) {
      throw new RetryableIngestError(
        `GitHub returned invalid metadata for ${candidate.fullName}`,
        "parsing",
        undefined,
        { cause: error },
      );
    }
    responseBodies.push(repositoryBody);
    if (repository.unavailable === true) {
      items.push({
        ...repository,
        observedAt: now.toISOString(),
      });
      continue;
    }
    const languagesUrl = new URL(
      `/repos/${repository.fullName}/languages`,
      endpoint,
    );
    const releasesUrl = new URL(
      `/repos/${repository.fullName}/releases`,
      endpoint,
    );
    releasesUrl.searchParams.set("per_page", "10");
    const [languagesBody, releasesBody] = await Promise.all([
      request(languagesUrl),
      request(releasesUrl),
    ]);
    if (languagesBody === null || releasesBody === null) {
      throw new Error("GitHub metadata requests cannot allow HTTP 404");
    }
    responseBodies.push(languagesBody, releasesBody);
    try {
      items.push({
        ...repository,
        languages: parseGithubLanguages(languagesBody),
        releases: parseGithubReleases(releasesBody, repository.fullName),
        observedAt: now.toISOString(),
      });
    } catch (error) {
      throw new RetryableIngestError(
        `GitHub returned invalid metadata for ${candidate.fullName}`,
        "parsing",
        undefined,
        { cause: error },
      );
    }
  }
  return {
    fetchedCount: candidates.length,
    items,
    responseContentHash: createHash("sha256")
      .update(responseBodies.join("\n"))
      .digest("hex"),
  };
};
