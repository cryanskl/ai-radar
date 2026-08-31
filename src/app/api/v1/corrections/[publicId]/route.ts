import { publicCorrectionSchema } from "@/operations/contracts";
import { getPublicCorrection } from "@/operations/service";
import { publicApiNotFound } from "@/public-api/response";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  const correction = await getPublicCorrection((await params).publicId);
  if (!correction) {
    return publicApiNotFound("Correction was not found");
  }
  return Response.json(publicCorrectionSchema.parse(correction));
}
