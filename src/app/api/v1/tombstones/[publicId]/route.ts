import { publicTombstoneSchema } from "@/public-api/contracts";
import { publicApiNotFound } from "@/public-api/response";
import { getPublicTombstoneRecord } from "@/public-api/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  const tombstone = await getPublicTombstoneRecord((await params).publicId);
  return tombstone
    ? Response.json(publicTombstoneSchema.parse(tombstone))
    : publicApiNotFound("Tombstone was not found");
}
