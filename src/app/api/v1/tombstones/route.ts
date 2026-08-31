import { publicTombstoneListSchema } from "@/public-api/contracts";
import { getPublicApiEnv } from "@/config/server-env";
import { listPublicTombstones } from "@/public-api/service";
import {
  invalidPublicApiRequest,
  readPublicPageRequest,
} from "@/public-api/response";

export async function GET(request: Request) {
  const page = readPublicPageRequest(request, "tombstones", {});
  if (!page.success) return page.response;
  const afterPublicId = page.data.position?.publicId;
  if (page.data.position && !afterPublicId) {
    return invalidPublicApiRequest(
      "invalid_cursor",
      "Cursor does not match this Public API request",
    );
  }
  const result = await listPublicTombstones({
    limit: page.data.limit,
    afterPublicId,
    requestKey: page.data.requestKey,
  });
  return Response.json(
    publicTombstoneListSchema.parse({
      dataVersion: getPublicApiEnv().PUBLIC_DATA_VERSION,
      ...result,
    }),
  );
}
