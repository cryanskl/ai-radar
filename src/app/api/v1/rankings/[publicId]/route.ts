import { rankingDetailRequestSchema } from "@/rankings/contracts";
import { getPublicRanking } from "@/rankings/service";
import {
  invalidPublicApiRequest,
  publicApiNotFound,
} from "@/public-api/response";

export async function GET(
  request: Request,
  context: { params: Promise<{ publicId: string }> },
) {
  const parsed = rankingDetailRequestSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  if (!parsed.success) {
    return invalidPublicApiRequest(
      "invalid_request",
      "Public API Ranking request is invalid",
    );
  }
  const { publicId } = await context.params;
  const result = await getPublicRanking(publicId, parsed.data);
  return result
    ? Response.json(result)
    : publicApiNotFound("Ranking was not found");
}
