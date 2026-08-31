import { publicDataReleaseDetailSchema } from "@/data-releases/contracts";
import { getPublicDataRelease } from "@/data-releases/service";
import { publicApiNotFound } from "@/public-api/response";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  const release = await getPublicDataRelease((await params).publicId);
  return release
    ? Response.json(publicDataReleaseDetailSchema.parse(release))
    : publicApiNotFound("Public Data Release does not exist");
}
