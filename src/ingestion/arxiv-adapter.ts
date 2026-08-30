import { XMLParser, XMLValidator } from "fast-xml-parser";
import { createHash } from "node:crypto";
import { z } from "zod";
import { RetryableIngestError } from "./errors";

const arxivLinkSchema = z.object({
  "@_href": z.url().regex(/^https?:\/\//),
  "@_rel": z.string(),
});

const arxivAuthorSchema = z.object({
  name: z.string().min(1),
});

const arxivEntrySchema = z.object({
  id: z.url(),
  title: z.string().min(1),
  published: z.iso.datetime({ offset: true }),
  author: z.union([arxivAuthorSchema, z.array(arxivAuthorSchema).min(1)]),
  link: z.union([arxivLinkSchema, z.array(arxivLinkSchema)]),
});

const arxivFeedSchema = z.object({
  feed: z.object({
    entry: z.union([arxivEntrySchema, z.array(arxivEntrySchema)]).optional(),
  }),
});

export const buildArxivRequestUrl = ({
  endpoint,
  maxItems,
  query,
}: {
  endpoint: string;
  maxItems: number;
  query: string;
}) => {
  const url = new URL(endpoint);
  url.searchParams.set("search_query", query);
  url.searchParams.set("start", "0");
  url.searchParams.set("max_results", String(maxItems));
  url.searchParams.set("sortBy", "submittedDate");
  url.searchParams.set("sortOrder", "descending");
  return url;
};

const arxivHosts = new Set(["arxiv.org", "www.arxiv.org", "export.arxiv.org"]);

export const isArxivAbstractUrl = (value: string, externalId: string) => {
  const url = new URL(value);
  return (
    ["http:", "https:"].includes(url.protocol) &&
    url.username === "" &&
    url.password === "" &&
    url.port === "" &&
    arxivHosts.has(url.hostname) &&
    url.pathname === `/abs/${externalId}`
  );
};

const normalizeEntry = (entry: z.infer<typeof arxivEntrySchema>) => {
  const idUrl = new URL(entry.id);
  const idMatch = idUrl.pathname.match(/^\/abs\/(.+)$/);
  const externalId = idMatch?.[1];
  const links = Array.isArray(entry.link) ? entry.link : [entry.link];
  const originalUrl = links.find((link) => link["@_rel"] === "alternate")?.[
    "@_href"
  ];
  const originalUrlObject = originalUrl ? new URL(originalUrl) : undefined;
  if (
    !externalId ||
    !originalUrlObject ||
    !["http:", "https:"].includes(idUrl.protocol) ||
    idUrl.username !== "" ||
    idUrl.password !== "" ||
    idUrl.port !== "" ||
    !arxivHosts.has(idUrl.hostname) ||
    !isArxivAbstractUrl(originalUrlObject.toString(), externalId)
  ) {
    throw new Error("arXiv entry is missing its identifier or abstract link");
  }
  const originalTitle = entry.title.replace(/\s+/g, " ").trim();
  if (!originalTitle) throw new Error("arXiv entry title is empty");
  originalUrlObject.protocol = "https:";

  return {
    authors: (Array.isArray(entry.author) ? entry.author : [entry.author]).map(
      ({ name }) => ({ name: name.replace(/\s+/g, " ").trim() }),
    ),
    externalId,
    originalTitle,
    originalUrl: originalUrlObject.toString(),
    publishedAt: new Date(entry.published).toISOString(),
  };
};

export const parseArxivFeed = (xml: string, cursor: string | null) => {
  try {
    const validation = XMLValidator.validate(xml);
    if (validation !== true) throw validation.err;

    const parsed = arxivFeedSchema.parse(
      new XMLParser({ ignoreAttributes: false }).parse(xml),
    );
    const entries = parsed.feed.entry
      ? Array.isArray(parsed.feed.entry)
        ? parsed.feed.entry
        : [parsed.feed.entry]
      : [];
    const normalized = entries.map(normalizeEntry);
    const cursorIndex = cursor
      ? normalized.findIndex(({ externalId }) => externalId === cursor)
      : -1;

    return {
      cursorFound: cursor === null || cursorIndex !== -1,
      items: cursorIndex === -1 ? normalized : normalized.slice(0, cursorIndex),
      nextCursor: normalized[0]?.externalId ?? cursor,
      fetchedCount: normalized.length,
    };
  } catch (error) {
    throw new Error("Invalid arXiv Atom feed", { cause: error });
  }
};

const retryAfterDate = (value: string | null, now: Date) => {
  if (value === null) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return new Date(now.getTime() + seconds * 1000);
  }
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : new Date(timestamp);
};

export const retrieveArxivFeed = async ({
  cursor,
  endpoint,
  maxItems,
  now,
  query,
  requestTimeoutMs,
  userAgent,
}: {
  cursor: string | null;
  endpoint: string;
  maxItems: number;
  now: Date;
  query: string;
  requestTimeoutMs: number;
  userAgent: string;
}) => {
  let response: Response;
  try {
    response = await fetch(
      buildArxivRequestUrl({ endpoint, maxItems, query }),
      {
        headers: { "user-agent": userAgent },
        redirect: "error",
        signal: AbortSignal.timeout(requestTimeoutMs),
      },
    );
  } catch (error) {
    throw new RetryableIngestError(
      "arXiv request failed before receiving a response",
      "network",
      undefined,
      { cause: error },
    );
  }

  if (response.status === 429) {
    throw new RetryableIngestError(
      "arXiv rate limit was reached",
      "rate_limit",
      retryAfterDate(response.headers.get("retry-after"), now),
    );
  }
  if (response.status === 401 || response.status === 403) {
    throw new RetryableIngestError(
      `arXiv rejected the request with HTTP ${response.status}`,
      "authentication",
    );
  }
  if (!response.ok) {
    throw new RetryableIngestError(
      `arXiv returned HTTP ${response.status}`,
      "network",
    );
  }

  let body: string;
  try {
    body = await response.text();
  } catch (error) {
    throw new RetryableIngestError(
      "arXiv response ended before its body was read",
      "network",
      undefined,
      { cause: error },
    );
  }
  let parsed: ReturnType<typeof parseArxivFeed>;
  try {
    parsed = parseArxivFeed(body, cursor);
  } catch (error) {
    throw new RetryableIngestError(
      "arXiv returned an invalid Atom feed",
      "parsing",
      undefined,
      { cause: error },
    );
  }
  if (!parsed.cursorFound) {
    throw new RetryableIngestError(
      "The stored arXiv cursor is outside the newest-results window",
      "cursor_gap",
    );
  }
  return {
    ...parsed,
    responseContentHash: createHash("sha256").update(body).digest("hex"),
  };
};
