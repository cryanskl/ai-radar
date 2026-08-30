import { rankingDetailRequestSchema } from "@/rankings/contracts";
import { getPublicRanking } from "@/rankings/service";

export async function GET(
  request: Request,
  context: { params: Promise<{ publicId: string }> },
) {
  const parsed = rankingDetailRequestSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { publicId } = await context.params;
  const result = await getPublicRanking(publicId, parsed.data);
  return result
    ? Response.json(result)
    : Response.json({ error: "not_found" }, { status: 404 });
}
