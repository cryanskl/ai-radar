import { getServerSession } from "next-auth";
import { DatabaseError } from "pg";
import { authOptions } from "@/auth/options";
import {
  dataReleaseCreateRequestSchema,
  generatedDataReleaseSchema,
} from "@/data-releases/contracts";
import {
  createDataRelease,
  DataReleaseValidationError,
} from "@/data-releases/service";

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
  const parsed = dataReleaseCreateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    const release = await createDataRelease(parsed.data);
    return Response.json(generatedDataReleaseSchema.parse(release), {
      status: 201,
    });
  } catch (error) {
    if (error instanceof DataReleaseValidationError) {
      return Response.json(
        { error: "validation_failed", issues: error.issues },
        { status: 409 },
      );
    }
    if (error instanceof DatabaseError && error.code === "23505") {
      return Response.json({ error: "already_exists" }, { status: 409 });
    }
    throw error;
  }
}
