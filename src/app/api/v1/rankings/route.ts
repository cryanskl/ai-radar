import { rankingListRequestSchema } from "@/rankings/contracts";
import { listPublicRankings } from "@/rankings/service";
import { getPublicApiEnv } from "@/config/server-env";
import { versionedPublicRankingListSchema } from "@/public-api/contracts";
import { encodePublicCursor } from "@/public-api/cursor";
import {
  invalidPublicApiRequest,
  readPublicPageRequest,
} from "@/public-api/response";

export async function GET(request: Request) {
  const parsed = rankingListRequestSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  if (!parsed.success) {
    return invalidPublicApiRequest(
      "invalid_request",
      "Public API Ranking request is invalid",
    );
  }
  const page = readPublicPageRequest(request, "rankings", {
    locale: parsed.data.locale,
    targetType: parsed.data.targetType,
    kind: parsed.data.kind,
  });
  if (!page.success) return page.response;
  const afterPublicId = page.data.position?.publicId;
  if (afterPublicId !== undefined && typeof afterPublicId !== "string") {
    return invalidPublicApiRequest(
      "invalid_cursor",
      "Cursor does not match this Public API request",
    );
  }
  const result = await listPublicRankings(
    { ...parsed.data, limit: parsed.data.limit + 1 },
    afterPublicId,
  );
  const hasNextPage = result.definitions.length > parsed.data.limit;
  const definitions = result.definitions.slice(0, parsed.data.limit);
  const nextCursor = hasNextPage
    ? encodePublicCursor("rankings", page.data.requestKey, {
        publicId: definitions[definitions.length - 1].publicId,
      })
    : null;
  return Response.json(
    versionedPublicRankingListSchema.parse({
      ...result,
      definitions,
      featured: result.featured.slice(0, parsed.data.limit),
      dataVersion: getPublicApiEnv().PUBLIC_DATA_VERSION,
      nextCursor,
    }),
  );
}
