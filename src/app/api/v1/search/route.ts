import { searchRequestSchema, searchResponseSchema } from "@/search/contracts";
import { searchPublicRecords } from "@/search/service";
import { getPublicApiEnv } from "@/config/server-env";
import { versionedSearchResponseSchema } from "@/public-api/contracts";
import { invalidPublicApiRequest } from "@/public-api/response";

export async function GET(request: Request) {
  const parameters = new URL(request.url).searchParams;
  const input = searchRequestSchema.safeParse({
    q: parameters.get("q"),
    locale: parameters.get("locale") ?? "en",
    type: parameters.get("type") ?? "all",
    from: parameters.get("from") ?? undefined,
    to: parameters.get("to") ?? undefined,
    topic: parameters.get("topic") ?? undefined,
    organization: parameters.get("organization") ?? undefined,
    signalLanguage: parameters.get("signalLanguage") ?? "all",
    sort: parameters.get("sort") ?? "relevance",
    limit: parameters.get("limit") ?? 20,
    cursor: parameters.get("cursor") ?? undefined,
  });
  if (!input.success) {
    return invalidPublicApiRequest(
      "invalid_request",
      "Public API Search request is invalid",
    );
  }

  const result = await searchPublicRecords(input.data);
  if (result.status === "invalid_cursor") {
    return invalidPublicApiRequest(
      "invalid_cursor",
      "Cursor does not match this Public API request",
    );
  }

  return Response.json(
    versionedSearchResponseSchema.parse({
      ...searchResponseSchema.parse(result.response),
      dataVersion: getPublicApiEnv().PUBLIC_DATA_VERSION,
    }),
  );
}
