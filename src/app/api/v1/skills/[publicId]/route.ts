import { localeSchema } from "@/events/contracts";
import { getPublicSkill } from "@/skills/service";

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
  const skill = await getPublicSkill(publicId, locale.data);
  return skill
    ? Response.json(skill)
    : Response.json({ error: "not_found" }, { status: 404 });
}
