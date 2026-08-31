import { localeSchema } from "@/events/contracts";
import { publicRelationSchema } from "@/public-api/contracts";
import {
  invalidPublicApiRequest,
  publicApiNotFound,
} from "@/public-api/response";
import { getPublicRelation } from "@/public-api/service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  const locale = localeSchema.safeParse(
    new URL(request.url).searchParams.get("locale") ?? "en",
  );
  if (!locale.success) {
    return invalidPublicApiRequest("invalid_request", "Locale is invalid");
  }
  const relation = await getPublicRelation(
    (await params).publicId,
    locale.data,
  );
  return relation
    ? Response.json(publicRelationSchema.parse(relation))
    : publicApiNotFound("Relation was not found");
}
