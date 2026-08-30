import {
  productListRequestSchema,
  publicProductListSchema,
} from "@/products/contracts";
import { listPublicProducts } from "@/products/service";

export async function GET(request: Request) {
  const parameters = new URL(request.url).searchParams;
  const parsed = productListRequestSchema.safeParse(
    Object.fromEntries([...parameters].filter(([, value]) => value !== "")),
  );
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const result = await listPublicProducts(parsed.data);
  if (result.status === "invalid_cursor") {
    return Response.json(
      {
        error: "invalid_request",
        issues: [{ path: "cursor", message: "Invalid Product cursor" }],
      },
      { status: 400 },
    );
  }
  return Response.json(publicProductListSchema.parse(result.response));
}
