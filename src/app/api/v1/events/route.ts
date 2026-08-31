import { localeSchema } from "@/events/contracts";
import { listPublicEvents } from "@/events/service";
import { getPublicApiEnv } from "@/config/server-env";
import { versionedPublicEventListSchema } from "@/public-api/contracts";
import { encodePublicCursor } from "@/public-api/cursor";
import {
  invalidPublicApiRequest,
  readPublicPageRequest,
} from "@/public-api/response";

export async function GET(request: Request) {
  const parameters = new URL(request.url).searchParams;
  const parsedLocale = localeSchema.safeParse(parameters.get("locale") ?? "en");
  if (!parsedLocale.success) {
    return invalidPublicApiRequest(
      "invalid_request",
      "Public API locale is invalid",
    );
  }
  const page = readPublicPageRequest(request, "events", {
    locale: parsedLocale.data,
  });
  if (!page.success) return page.response;
  const occurredAt = page.data.position?.occurredAt;
  const publicId = page.data.position?.publicId;
  if (
    page.data.position &&
    (!occurredAt || !publicId || Number.isNaN(new Date(occurredAt).valueOf()))
  ) {
    return invalidPublicApiRequest(
      "invalid_cursor",
      "Cursor does not match this Public API request",
    );
  }
  const records = await listPublicEvents(
    parsedLocale.data,
    page.data.limit + 1,
    occurredAt && publicId
      ? { occurredAt: new Date(occurredAt), publicId }
      : undefined,
  );
  const hasNextPage = records.length > page.data.limit;
  const items = records.slice(0, page.data.limit);
  const lastItem = items.at(-1);

  return Response.json(
    versionedPublicEventListSchema.parse({
      dataVersion: getPublicApiEnv().PUBLIC_DATA_VERSION,
      items,
      nextCursor:
        hasNextPage && lastItem
          ? encodePublicCursor("events", page.data.requestKey, {
              occurredAt: lastItem.occurredAt,
              publicId: lastItem.publicId,
            })
          : null,
    }),
  );
}
