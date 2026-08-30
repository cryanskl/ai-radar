import { getServerSession } from "next-auth";
import { authOptions } from "@/auth/options";
import { eventPublishResponseSchema } from "@/events/contracts";
import { publishEvent } from "@/events/service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "owner") {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await publishEvent((await params).publicId);
  if (result.status === "not_found") {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  if (result.status === "not_publishable") {
    return Response.json({ error: "not_publishable" }, { status: 409 });
  }
  return Response.json(eventPublishResponseSchema.parse(result));
}
