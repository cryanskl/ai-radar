import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicApiEnv } from "@/config/server-env";
import { publicApiErrorResponseSchema } from "@/public-api/contracts";

const publicReadPrefixes = [
  "/api/v1/corrections",
  "/api/v1/daily-briefs",
  "/api/v1/entities",
  "/api/v1/entity-versions",
  "/api/v1/events",
  "/api/v1/guides",
  "/api/v1/model-recommendations",
  "/api/v1/model-versions",
  "/api/v1/models",
  "/api/v1/papers",
  "/api/v1/products",
  "/api/v1/prompts",
  "/api/v1/rankings",
  "/api/v1/relations",
  "/api/v1/releases",
  "/api/v1/repositories",
  "/api/v1/search",
  "/api/v1/skills",
  "/api/v1/status",
  "/api/v1/tombstones",
];

type RateWindow = { count: number; startsAt: number };
const rateWindows = new Map<string, RateWindow>();
let activeWindowStartsAt: number | undefined;

const publicClientIdentity = (request: NextRequest) =>
  createHash("sha256")
    .update(
      request.headers.get("x-real-ip") ??
        request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ??
        "anonymous",
    )
    .digest("hex");

const publicApiHeaders = (
  dataVersion: string,
  limit: number,
  remaining: number,
  resetsAt: number,
) => ({
  "X-AI-Radar-Data-Version": dataVersion,
  "X-RateLimit-Limit": String(limit),
  "X-RateLimit-Remaining": String(remaining),
  "X-RateLimit-Reset": String(Math.ceil(resetsAt / 1_000)),
});

export function proxy(request: NextRequest) {
  if (
    request.method !== "GET" ||
    !publicReadPrefixes.some(
      (prefix) =>
        request.nextUrl.pathname === prefix ||
        request.nextUrl.pathname.startsWith(`${prefix}/`),
    )
  ) {
    return NextResponse.next();
  }

  const environment = getPublicApiEnv();
  const now = Date.now();
  const windowMilliseconds =
    environment.PUBLIC_API_RATE_LIMIT_WINDOW_SECONDS * 1_000;
  const startsAt = Math.floor(now / windowMilliseconds) * windowMilliseconds;
  if (activeWindowStartsAt !== startsAt) {
    rateWindows.clear();
    activeWindowStartsAt = startsAt;
  }
  const identity = publicClientIdentity(request);
  const previous = rateWindows.get(identity);
  const window =
    previous?.startsAt === startsAt ? previous : { count: 0, startsAt };
  window.count += 1;
  rateWindows.set(identity, window);
  const remaining = Math.max(
    environment.PUBLIC_API_RATE_LIMIT_REQUESTS - window.count,
    0,
  );
  const resetsAt = startsAt + windowMilliseconds;
  const headers = publicApiHeaders(
    environment.PUBLIC_DATA_VERSION,
    environment.PUBLIC_API_RATE_LIMIT_REQUESTS,
    remaining,
    resetsAt,
  );

  if (window.count > environment.PUBLIC_API_RATE_LIMIT_REQUESTS) {
    return NextResponse.json(
      publicApiErrorResponseSchema.parse({
        error: "rate_limit_exceeded",
        message: "Public API rate limit exceeded",
      }),
      {
        status: 429,
        headers: {
          ...headers,
          "Cache-Control": "no-store",
          "Retry-After": String(
            Math.max(Math.ceil((resetsAt - now) / 1_000), 1),
          ),
        },
      },
    );
  }

  const response = NextResponse.next();
  for (const [name, value] of Object.entries(headers)) {
    response.headers.set(name, value);
  }
  return response;
}

export const config = { matcher: "/api/v1/:path*" };
