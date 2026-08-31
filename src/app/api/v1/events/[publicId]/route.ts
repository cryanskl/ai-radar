import { localeSchema, publicEventResponseSchema } from "@/events/contracts";
import { getPublicEvent } from "@/events/service";
import { getPublicTombstone } from "@/operations/service";
import {
  invalidPublicApiRequest,
  publicApiNotFound,
} from "@/public-api/response";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  const parsedLocale = localeSchema.safeParse(
    new URL(request.url).searchParams.get("locale") ?? "en",
  );
  if (!parsedLocale.success) {
    return invalidPublicApiRequest(
      "invalid_request",
      "Public API locale is invalid",
    );
  }

  const event = await getPublicEvent(
    (await params).publicId,
    parsedLocale.data,
  );
  if (event) return Response.json(publicEventResponseSchema.parse(event));
  const tombstone = await getPublicTombstone("event", (await params).publicId);
  if (!tombstone) {
    return publicApiNotFound("Event was not found");
  }
  return Response.json(publicEventResponseSchema.parse(tombstone));
}
