import { publicReleaseListSchema } from "@/public-api/contracts";
import {
  emptyPublicCollection,
  readPublicPageRequest,
} from "@/public-api/response";

export async function GET(request: Request) {
  const page = readPublicPageRequest(request, "releases", {});
  if (!page.success) return page.response;
  return Response.json(publicReleaseListSchema.parse(emptyPublicCollection()));
}
