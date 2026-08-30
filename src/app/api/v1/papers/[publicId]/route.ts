import { localeSchema } from "@/events/contracts";
import { publicPaperDetailSchema } from "@/papers/contracts";
import { getPublicPaper } from "@/papers/service";

export async function GET(
  request: Request,
  context: RouteContext<"/api/v1/papers/[publicId]">,
) {
  const locale = localeSchema.safeParse(
    new URL(request.url).searchParams.get("locale") ?? "en",
  );
  if (!locale.success) {
    return Response.json({ error: "invalid_locale" }, { status: 400 });
  }
  const { publicId } = await context.params;
  const paper = await getPublicPaper(publicId, locale.data);
  if (!paper || !("revisions" in paper)) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  return Response.json(publicPaperDetailSchema.parse(paper));
}
