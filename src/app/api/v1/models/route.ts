import {
  modelListRequestSchema,
  publicModelListSchema,
} from "@/models/contracts";
import { listPublicModels } from "@/models/service";

export async function GET(request: Request) {
  const parameters = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = modelListRequestSchema.safeParse(parameters);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  return Response.json(
    publicModelListSchema.parse(await listPublicModels(parsed.data)),
  );
}
