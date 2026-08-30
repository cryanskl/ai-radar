import { getServerSession } from "next-auth";
import { authOptions } from "@/auth/options";
import { isUniqueViolation } from "@/db/errors";
import {
  relationCreateRequestSchema,
  relationCreateResponseSchema,
} from "@/entities/contracts";
import { createRelation } from "@/entities/service";

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
  const parsed = relationCreateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await createRelation(parsed.data);
    if (result.status === "not_found") {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    if (result.status === "invalid_relation") {
      return Response.json({ error: "invalid_relation" }, { status: 400 });
    }
    return Response.json(
      relationCreateResponseSchema.parse({
        publicId: result.publicId,
        publicVisibility: result.publicVisibility,
        evidenceSourceItemPublicIds: result.evidenceSourceItemPublicIds,
      }),
      { status: 201 },
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      return Response.json({ error: "already_exists" }, { status: 409 });
    }
    throw error;
  }
}
