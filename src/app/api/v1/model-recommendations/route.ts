import {
  modelRecommendationQuerySchema,
  publicModelRecommendationSchema,
} from "@/models/contracts";
import { recommendPublicModels } from "@/models/service";

export async function GET(request: Request) {
  const parsed = modelRecommendationQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  return Response.json(
    publicModelRecommendationSchema.parse(
      await recommendPublicModels(parsed.data),
    ),
  );
}
