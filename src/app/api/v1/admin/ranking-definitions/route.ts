import { getServerSession } from "next-auth";
import { authOptions } from "@/auth/options";
import { isUniqueViolation } from "@/db/errors";
import {
  rankingDefinitionCreateRequestSchema,
  rankingDefinitionCreateResponseSchema,
} from "@/rankings/contracts";
import { createRankingDefinitionVersion } from "@/rankings/service";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "owner") {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: "invalid_json" }, { status: 400 });
    }
    throw error;
  }
  const parsed = rankingDefinitionCreateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    const result = await createRankingDefinitionVersion(parsed.data);
    if (result.status === "invalid_method") {
      return Response.json({ error: "invalid_method" }, { status: 400 });
    }
    return Response.json(rankingDefinitionCreateResponseSchema.parse(result), {
      status: 201,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return Response.json({ error: "already_exists" }, { status: 409 });
    }
    throw error;
  }
}
