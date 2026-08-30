import {
  searchErrorResponseSchema,
  searchRequestSchema,
  searchResponseSchema,
} from "@/search/contracts";
import { searchPublicRecords } from "@/search/service";

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
    return Response.json(
      searchErrorResponseSchema.parse({
        error: "invalid_search_request",
        issues: input.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      }),
      { status: 400 },
    );
  }

  const result = await searchPublicRecords(input.data);
  if (result.status === "invalid_cursor") {
    return Response.json(
      searchErrorResponseSchema.parse({
        error: "invalid_search_request",
        issues: [{ path: "cursor", message: "Invalid Search cursor" }],
      }),
      { status: 400 },
    );
  }

  return Response.json(searchResponseSchema.parse(result.response));
}
