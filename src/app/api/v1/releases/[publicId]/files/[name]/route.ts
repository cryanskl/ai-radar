import { getServerSession } from "next-auth";
import { authOptions } from "@/auth/options";
import { dataReleaseFileSchema } from "@/data-releases/contracts";
import {
  readDataReleaseFile,
  readGeneratedDataReleaseFile,
} from "@/data-releases/service";
import { publicApiNotFound } from "@/public-api/response";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ publicId: string; name: string }> },
) {
  const resolved = await params;
  const name = dataReleaseFileSchema.shape.name.safeParse(resolved.name);
  if (!name.success)
    return publicApiNotFound("Data Release file does not exist");
  let file = await readDataReleaseFile(resolved.publicId, name.data);
  if (!file) {
    const session = await getServerSession(authOptions);
    if (session?.user?.role === "owner") {
      file = await readGeneratedDataReleaseFile(resolved.publicId, name.data);
    }
  }
  if (!file) return publicApiNotFound("Data Release file does not exist");
  return new Response(file.content, {
    headers: {
      "Content-Type": `${file.media_type}; charset=utf-8`,
      "Content-Digest": `sha-256=:${Buffer.from(file.checksum_sha256, "hex").toString("base64")}:`,
      "X-Checksum-SHA256": file.checksum_sha256,
    },
  });
}
