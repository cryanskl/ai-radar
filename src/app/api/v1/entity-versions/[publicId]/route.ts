import { publicEntityVersionSchema } from "@/entities/contracts";
import { getPublicEntityVersion } from "@/entities/service";
import { localeSchema } from "@/events/contracts";

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
  const version = await getPublicEntityVersion(
    (await params).publicId,
    locale.data,
  );
  if (!version) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json(publicEntityVersionSchema.parse(version));
}
