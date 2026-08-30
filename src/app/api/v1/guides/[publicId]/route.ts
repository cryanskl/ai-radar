import { localeSchema } from "@/events/contracts";
import { getPublicGuide } from "@/guides/service";

export async function GET(
  request: Request,
  context: { params: Promise<{ publicId: string }> },
) {
  const locale = localeSchema.safeParse(
    new URL(request.url).searchParams.get("locale") ?? "en",
  );
  if (!locale.success) {
    return Response.json(
      { error: "invalid_request", issues: locale.error.issues },
      { status: 400 },
    );
  }
  const { publicId } = await context.params;
  const guide = await getPublicGuide(publicId, locale.data);
  return guide
    ? Response.json(guide)
    : Response.json({ error: "not_found" }, { status: 404 });
}
