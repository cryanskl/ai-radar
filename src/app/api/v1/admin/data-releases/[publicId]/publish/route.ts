import { getServerSession } from "next-auth";
import { authOptions } from "@/auth/options";
import { dataReleasePublishResponseSchema } from "@/data-releases/contracts";
import { DataReleaseRemoteError } from "@/data-releases/remote";
import { publishDataRelease } from "@/data-releases/service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "owner") {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await publishDataRelease((await params).publicId);
    if (result.status === "not_found") {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    return Response.json(dataReleasePublishResponseSchema.parse(result));
  } catch (error) {
    if (error instanceof DataReleaseRemoteError) {
      const status =
        error.code === "canonical_not_found" ||
        error.code === "canonical_checksum_mismatch"
          ? 409
          : 502;
      return Response.json({ error: error.code }, { status });
    }
    throw error;
  }
}
