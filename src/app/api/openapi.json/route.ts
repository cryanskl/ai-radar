import { openApiDocument } from "@/contracts/openapi";

export const dynamic = "force-static";

export function GET() {
  return Response.json(openApiDocument);
}
