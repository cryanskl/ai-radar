import { localeSchema } from "@/events/contracts";
import { publicPromptDetailSchema } from "@/prompts/contracts";
import { getPublicPrompt } from "@/prompts/service";

export async function GET(
  request: Request,
  context: RouteContext<"/api/v1/prompts/[publicId]">,
) {
  const locale = localeSchema.safeParse(
    new URL(request.url).searchParams.get("locale") ?? "en",
  );
  if (!locale.success) {
    return Response.json(
      {
        error: "invalid_request",
        issues: [{ path: ["locale"], message: "Invalid locale" }],
      },
      { status: 400 },
    );
  }
  const { publicId } = await context.params;
  const prompt = await getPublicPrompt(publicId, locale.data);
  if (!prompt) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json(publicPromptDetailSchema.parse(prompt));
}
