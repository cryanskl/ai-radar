import { localeSchema } from "@/events/contracts";
import { publicModelDetailSchema } from "@/models/contracts";
import { getPublicModel } from "@/models/service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  const locale = localeSchema.safeParse(
    new URL(request.url).searchParams.get("locale") ?? "en",
  );
  if (!locale.success) {
    return Response.json({ error: "invalid_locale" }, { status: 400 });
  }
  const model = await getPublicModel((await params).publicId, locale.data);
  if (!model) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json(publicModelDetailSchema.parse(model));
}
