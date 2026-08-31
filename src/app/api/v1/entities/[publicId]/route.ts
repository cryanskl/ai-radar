import {
  publicEntityResponseSchema,
  relationTypeSchema,
} from "@/entities/contracts";
import { getPublicEntity } from "@/entities/service";
import { localeSchema } from "@/events/contracts";
import { getPublicTombstone } from "@/operations/service";
import {
  invalidPublicApiRequest,
  publicApiNotFound,
} from "@/public-api/response";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  const url = new URL(request.url);
  const locale = localeSchema.safeParse(url.searchParams.get("locale") ?? "en");
  if (!locale.success) {
    return invalidPublicApiRequest(
      "invalid_request",
      "Public API locale is invalid",
    );
  }
  const requestedPredicate = url.searchParams.get("predicate");
  const predicate = requestedPredicate
    ? relationTypeSchema.safeParse(requestedPredicate)
    : undefined;
  if (predicate && !predicate.success) {
    return invalidPublicApiRequest(
      "invalid_request",
      "Public API Relation predicate is invalid",
    );
  }
  const entity = await getPublicEntity(
    (await params).publicId,
    locale.data,
    predicate?.data,
  );
  if (entity) return Response.json(publicEntityResponseSchema.parse(entity));
  const tombstone = await getPublicTombstone("entity", (await params).publicId);
  if (!tombstone) {
    return publicApiNotFound("Entity was not found");
  }
  return Response.json(publicEntityResponseSchema.parse(tombstone));
}
