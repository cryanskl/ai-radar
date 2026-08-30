import {
  publicRepositoryListSchema,
  repositoryListRequestSchema,
} from "@/repositories/contracts";
import { listPublicRepositories } from "@/repositories/service";

export async function GET(request: Request) {
  const parameters = new URL(request.url).searchParams;
  const parsed = repositoryListRequestSchema.safeParse(
    Object.fromEntries([...parameters].filter(([, value]) => value !== "")),
  );
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const result = await listPublicRepositories(parsed.data);
  if (result.status === "invalid_cursor") {
    return Response.json(
      {
        error: "invalid_request",
        issues: [{ path: "cursor", message: "Invalid Repository cursor" }],
      },
      { status: 400 },
    );
  }
  return Response.json(publicRepositoryListSchema.parse(result.response));
}
