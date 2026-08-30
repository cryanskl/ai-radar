import { getServerSession } from "next-auth";
import { authOptions } from "@/auth/options";
import {
  editorialCaseTransitionRequestSchema,
  editorialCaseTransitionResponseSchema,
} from "@/operations/contracts";
import { transitionEditorialCase } from "@/operations/service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
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
  const parsed = editorialCaseTransitionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const result = await transitionEditorialCase(
    (await params).publicId,
    parsed.data,
  );
  if (result.status === "not_found") {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  if (result.status === "not_correctable") {
    return Response.json({ error: "not_correctable" }, { status: 409 });
  }
  return Response.json(editorialCaseTransitionResponseSchema.parse(result));
}
