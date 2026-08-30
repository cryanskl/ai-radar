import { getServerSession } from "next-auth";
import { authOptions } from "@/auth/options";
import { isUniqueViolation } from "@/db/errors";
import {
  rightsDecisionCreateRequestSchema,
  rightsDecisionCreateResponseSchema,
} from "@/operations/contracts";
import { applyRightsDecision } from "@/operations/service";

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
  const parsed = rightsDecisionCreateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    const result = await applyRightsDecision(parsed.data);
    if (result.status === "not_found") {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    if (result.status === "not_correctable") {
      return Response.json({ error: "not_correctable" }, { status: 409 });
    }
    return Response.json(rightsDecisionCreateResponseSchema.parse(result), {
      status: 201,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return Response.json({ error: "already_exists" }, { status: 409 });
    }
    throw error;
  }
}
