import {
  paperListRequestSchema,
  publicPaperListSchema,
} from "@/papers/contracts";
import { listPublicPapers } from "@/papers/service";

export async function GET(request: Request) {
  const parameters = new URL(request.url).searchParams;
  const parsed = paperListRequestSchema.safeParse(
    Object.fromEntries([...parameters].filter(([, value]) => value !== "")),
  );
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const result = await listPublicPapers(parsed.data);
  if (result.status === "invalid_cursor") {
    return Response.json(
      {
        error: "invalid_request",
        issues: [{ path: "cursor", message: "Invalid Paper cursor" }],
      },
      { status: 400 },
    );
  }
  return Response.json(publicPaperListSchema.parse(result.response));
}
