import { localeSchema, publicEventResponseSchema } from "@/events/contracts";
import { getEventTombstone } from "@/events/cluster-service";
import { getPublicEvent } from "@/events/service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  const parsedLocale = localeSchema.safeParse(
    new URL(request.url).searchParams.get("locale") ?? "en",
  );
  if (!parsedLocale.success) {
    return Response.json({ error: "invalid_locale" }, { status: 400 });
  }

  const event = await getPublicEvent(
    (await params).publicId,
    parsedLocale.data,
  );
  if (event) return Response.json(publicEventResponseSchema.parse(event));
  const tombstone = await getEventTombstone((await params).publicId);
  if (!tombstone) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  return Response.json(publicEventResponseSchema.parse(tombstone));
}
