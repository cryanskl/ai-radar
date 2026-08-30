import { skillListRequestSchema } from "@/skills/contracts";
import { listPublicSkills } from "@/skills/service";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = skillListRequestSchema.safeParse(
    Object.fromEntries(url.searchParams.entries()),
  );
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  return Response.json(await listPublicSkills(parsed.data));
}
