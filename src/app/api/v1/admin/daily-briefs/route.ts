import { getServerSession } from "next-auth";
import { authOptions } from "@/auth/options";
import {
  dailyBriefCreateRequestSchema,
  dailyBriefDraftResponseSchema,
} from "@/daily-briefs/contracts";
import { createDailyBrief } from "@/daily-briefs/service";
import { isUniqueViolation } from "@/db/errors";

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
  const parsed = dailyBriefCreateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    const result = await createDailyBrief(parsed.data);
    if (result.status === "invalid_reference") {
      return Response.json({ error: result.status }, { status: 400 });
    }
    if (result.status === "event_after_data_cutoff") {
      return Response.json({ error: result.status }, { status: 409 });
    }
    return Response.json(
      dailyBriefDraftResponseSchema.parse({
        publicId: result.publicId,
        editionPublicId: result.editionPublicId,
        state: result.state,
        locale: result.locale,
        briefDate: result.briefDate,
        version: result.version,
        dataCutoff: result.dataCutoff,
        reviewStatus: result.reviewStatus,
        itemCount: result.itemCount,
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
