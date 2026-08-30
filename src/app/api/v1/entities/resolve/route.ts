import {
  aliasResolutionResponseSchema,
  entityTypeSchema,
} from "@/entities/contracts";
import { resolvePublicEntityAlias } from "@/entities/service";
import { localeSchema } from "@/events/contracts";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const locale = localeSchema.safeParse(url.searchParams.get("locale") ?? "en");
  if (!locale.success) {
    return Response.json({ error: "invalid_locale" }, { status: 400 });
  }
  const alias = url.searchParams.get("alias")?.trim();
  if (!alias) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const requestedType = url.searchParams.get("type");
  const type = requestedType
    ? entityTypeSchema.safeParse(requestedType)
    : undefined;
  if (type && !type.success) {
    return Response.json({ error: "invalid_entity_type" }, { status: 400 });
  }

  const result = await resolvePublicEntityAlias(alias, locale.data, type?.data);
  if (result.status === "not_found") {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  if (result.status === "ambiguous") {
    return Response.json({ error: "ambiguous_alias" }, { status: 409 });
  }
  return Response.json(
    aliasResolutionResponseSchema.parse({
      publicId: result.publicId,
      type: result.type,
      matchedAlias: result.matchedAlias,
      aliasKind: result.aliasKind,
    }),
  );
}
