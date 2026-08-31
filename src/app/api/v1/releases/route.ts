import { publicReleaseListSchema } from "@/public-api/contracts";
import { getPublicApiEnv } from "@/config/server-env";
import { listPublicDataReleases } from "@/data-releases/service";
import { encodePublicCursor } from "@/public-api/cursor";
import {
  invalidPublicApiRequest,
  readPublicPageRequest,
} from "@/public-api/response";

export async function GET(request: Request) {
  const page = readPublicPageRequest(request, "releases", {});
  if (!page.success) return page.response;
  const afterPublicId = page.data.position?.publicId;
  if (page.data.position && !afterPublicId) {
    return invalidPublicApiRequest(
      "invalid_cursor",
      "Cursor does not match this Public API request",
    );
  }
  const result = await listPublicDataReleases({
    limit: page.data.limit,
    afterPublicId,
  });
  const items = result.items.map((release) => ({
    publicId: release.publicId,
    dataVersion: release.dataVersion,
    dataCutoff: release.dataCutoff,
    publishedAt: release.publishedAt,
    canonicalUrl: release.canonicalUrl,
    checksumSha256: release.checksumSha256,
    license: release.license,
    attribution: release.attribution,
    lastVerifiedAt: release.lastVerifiedAt,
  }));
  return Response.json(
    publicReleaseListSchema.parse({
      dataVersion: getPublicApiEnv().PUBLIC_DATA_VERSION,
      items,
      nextCursor:
        result.hasNextPage && items.length > 0
          ? encodePublicCursor("releases", page.data.requestKey, {
              publicId: items[items.length - 1].publicId,
            })
          : null,
    }),
  );
}
