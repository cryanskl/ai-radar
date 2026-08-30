import { guideListRequestSchema } from "@/guides/contracts";
import { listPublicGuides } from "@/guides/service";

export async function GET(request: Request) {
  const parsed = guideListRequestSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  return Response.json(await listPublicGuides(parsed.data));
}
