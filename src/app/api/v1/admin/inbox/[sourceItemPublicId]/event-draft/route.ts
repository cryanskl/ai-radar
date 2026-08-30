import { getServerSession } from "next-auth";
import { authOptions } from "@/auth/options";
import { isUniqueViolation } from "@/db/errors";
import { eventDraftResponseSchema } from "@/events/contracts";
import { createEventDraftFromInbox } from "@/events/service";
import { inboxEventDraftRequestSchema } from "@/ingestion/contracts";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sourceItemPublicId: string }> },
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
  const parsed = inboxEventDraftRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await createEventDraftFromInbox(
      (await params).sourceItemPublicId,
      parsed.data,
    );
    if (result.status === "not_found") {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    if (result.status === "already_converted") {
      return Response.json({ error: "already_exists" }, { status: 409 });
    }
    return Response.json(
      eventDraftResponseSchema.parse({
        publicId: result.publicId,
        publicationState: result.publicationState,
        locales: result.locales,
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
