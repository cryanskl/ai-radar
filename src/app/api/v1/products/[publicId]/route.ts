import { localeSchema } from "@/events/contracts";
import { publicProductDetailSchema } from "@/products/contracts";
import { getPublicProduct } from "@/products/service";

export async function GET(
  request: Request,
  context: { params: Promise<{ publicId: string }> },
) {
  const locale = localeSchema.safeParse(
    new URL(request.url).searchParams.get("locale") ?? "en",
  );
  if (!locale.success) {
    return Response.json({ error: "invalid_locale" }, { status: 400 });
  }
  const { publicId } = await context.params;
  const product = await getPublicProduct(publicId, locale.data);
  if (!product) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  return Response.json(publicProductDetailSchema.parse(product));
}
