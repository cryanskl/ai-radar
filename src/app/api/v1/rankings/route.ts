import { rankingListRequestSchema } from "@/rankings/contracts";
import { listPublicRankings } from "@/rankings/service";

export async function GET(request: Request) {
  const parsed = rankingListRequestSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  return Response.json(await listPublicRankings(parsed.data));
}
