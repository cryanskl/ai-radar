import { publicCorrectionListSchema } from "@/public-api/contracts";
import { getPublicApiEnv } from "@/config/server-env";
import { listPublicCorrections } from "@/public-api/service";
import {
  invalidPublicApiRequest,
  readPublicPageRequest,
} from "@/public-api/response";

export async function GET(request: Request) {
  const page = readPublicPageRequest(request, "corrections", {});
  if (!page.success) return page.response;
  const afterPublicId = page.data.position?.publicId;
  if (page.data.position && !afterPublicId) {
    return invalidPublicApiRequest(
      "invalid_cursor",
      "Cursor does not match this Public API request",
    );
  }
  const result = await listPublicCorrections({
    limit: page.data.limit,
    afterPublicId,
    requestKey: page.data.requestKey,
  });
  return Response.json(
    publicCorrectionListSchema.parse({
      dataVersion: getPublicApiEnv().PUBLIC_DATA_VERSION,
      ...result,
    }),
  );
}
