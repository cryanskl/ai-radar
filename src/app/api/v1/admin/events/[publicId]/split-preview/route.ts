import { getServerSession } from "next-auth";
import { authOptions } from "@/auth/options";
import { previewEventSplit } from "@/events/cluster-service";
import { eventSplitPreviewResponseSchema } from "@/events/contracts";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "owner") {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await previewEventSplit((await params).publicId);
  if (result.status === "not_found") {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  if (result.status === "not_splittable") {
    return Response.json({ error: "not_splittable" }, { status: 409 });
  }
  return Response.json(
    eventSplitPreviewResponseSchema.parse({
      mergedEventPublicId: result.mergedEventPublicId,
      targetEventPublicId: result.targetEventPublicId,
      sourceItemPublicIdsToRestore: result.sourceItemPublicIdsToRestore,
      relationPublicIdsToRestore: result.relationPublicIdsToRestore,
      localizedContentLocalesToRestore: result.localizedContentLocalesToRestore,
      restoredRepresentativeSourceItemPublicId:
        result.restoredRepresentativeSourceItemPublicId,
      targetRepresentativeSourceItemPublicId:
        result.targetRepresentativeSourceItemPublicId,
      tombstoneStatusAfterSplit: result.tombstoneStatusAfterSplit,
    }),
  );
}
