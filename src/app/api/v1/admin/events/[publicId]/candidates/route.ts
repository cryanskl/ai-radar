import { getServerSession } from "next-auth";
import { authOptions } from "@/auth/options";
import { eventCandidatesResponseSchema } from "@/events/contracts";
import { retrieveEventCandidates } from "@/events/cluster-service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "owner") {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await retrieveEventCandidates((await params).publicId);
  if (!result) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json(eventCandidatesResponseSchema.parse(result));
}
