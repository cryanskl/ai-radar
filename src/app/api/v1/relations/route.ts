import { publicRelationListSchema } from "@/public-api/contracts";
import { localeSchema } from "@/events/contracts";
import { getPublicApiEnv } from "@/config/server-env";
import { listPublicRelations } from "@/public-api/service";
import {
  invalidPublicApiRequest,
  readPublicPageRequest,
} from "@/public-api/response";

export async function GET(request: Request) {
  const locale = localeSchema.safeParse(
    new URL(request.url).searchParams.get("locale") ?? "en",
  );
  if (!locale.success) {
    return invalidPublicApiRequest(
      "invalid_request",
      "Public API locale is invalid",
    );
  }
  const page = readPublicPageRequest(request, "relations", {
    locale: locale.data,
  });
  if (!page.success) return page.response;
  const afterPublicId = page.data.position?.publicId;
  if (page.data.position && !afterPublicId) {
    return invalidPublicApiRequest(
      "invalid_cursor",
      "Cursor does not match this Public API request",
    );
  }
  const result = await listPublicRelations({
    locale: locale.data,
    limit: page.data.limit,
    afterPublicId,
    requestKey: page.data.requestKey,
  });
  return Response.json(
    publicRelationListSchema.parse({
      dataVersion: getPublicApiEnv().PUBLIC_DATA_VERSION,
      ...result,
    }),
  );
}
