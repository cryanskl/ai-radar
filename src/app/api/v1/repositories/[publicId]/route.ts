import { localeSchema } from "@/events/contracts";
import { publicRepositoryDetailSchema } from "@/repositories/contracts";
import { getPublicRepository } from "@/repositories/service";

export async function GET(
  request: Request,
  context: { params: Promise<{ publicId: string }> },
) {
  const locale = localeSchema.safeParse(
    new URL(request.url).searchParams.get("locale") ?? "en",
  );
  if (!locale.success) {
    return Response.json({ error: "invalid_locale" }, { status: 400 });
  }
  const { publicId } = await context.params;
  const repository = await getPublicRepository(publicId, locale.data);
  if (!repository || !("observations" in repository)) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  return Response.json(publicRepositoryDetailSchema.parse(repository));
}
