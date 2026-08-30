import {
  publicEntityResponseSchema,
  relationTypeSchema,
} from "@/entities/contracts";
import { getPublicEntity } from "@/entities/service";
import { localeSchema } from "@/events/contracts";
import { getPublicTombstone } from "@/operations/service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  const url = new URL(request.url);
  const locale = localeSchema.safeParse(url.searchParams.get("locale") ?? "en");
  if (!locale.success) {
    return Response.json({ error: "invalid_locale" }, { status: 400 });
  }
  const requestedPredicate = url.searchParams.get("predicate");
  const predicate = requestedPredicate
    ? relationTypeSchema.safeParse(requestedPredicate)
    : undefined;
  if (predicate && !predicate.success) {
    return Response.json({ error: "invalid_relation_type" }, { status: 400 });
  }
  const entity = await getPublicEntity(
    (await params).publicId,
    locale.data,
    predicate?.data,
  );
  if (entity) return Response.json(publicEntityResponseSchema.parse(entity));
  const tombstone = await getPublicTombstone("entity", (await params).publicId);
  if (!tombstone) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  return Response.json(publicEntityResponseSchema.parse(tombstone));
}
