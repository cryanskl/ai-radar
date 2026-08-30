import { publicCorrectionSchema } from "@/operations/contracts";
import { getPublicCorrection } from "@/operations/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  const correction = await getPublicCorrection((await params).publicId);
  if (!correction) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  return Response.json(publicCorrectionSchema.parse(correction));
}
