import { localeSchema, publicEventListSchema } from "@/events/contracts";
import { listPublicEvents } from "@/events/service";

export async function GET(request: Request) {
  const parsedLocale = localeSchema.safeParse(
    new URL(request.url).searchParams.get("locale") ?? "en",
  );
  if (!parsedLocale.success) {
    return Response.json({ error: "invalid_locale" }, { status: 400 });
  }

  return Response.json(
    publicEventListSchema.parse({
      items: await listPublicEvents(parsedLocale.data),
    }),
  );
}
