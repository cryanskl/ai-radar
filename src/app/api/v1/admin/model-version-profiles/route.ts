import { getServerSession } from "next-auth";
import { authOptions } from "@/auth/options";
import { isUniqueViolation } from "@/db/errors";
import {
  modelVersionProfileCreateRequestSchema,
  modelVersionProfileCreateResponseSchema,
} from "@/models/contracts";
import { createModelVersionProfile } from "@/models/service";

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
  const parsed = modelVersionProfileCreateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    const result = await createModelVersionProfile(parsed.data);
    if (result.status === "invalid_reference") {
      return Response.json({ error: "invalid_reference" }, { status: 400 });
    }
    return Response.json(
      modelVersionProfileCreateResponseSchema.parse({
        familyPublicId: result.familyPublicId,
        versionPublicId: result.versionPublicId,
        publicVisibility: result.publicVisibility,
        priceRecordPublicIds: result.priceRecordPublicIds,
        benchmarkRunPublicIds: result.benchmarkRunPublicIds,
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
