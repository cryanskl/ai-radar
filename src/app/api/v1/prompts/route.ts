import {
  promptListRequestSchema,
  publicPromptListSchema,
} from "@/prompts/contracts";
import { listPublicPrompts } from "@/prompts/service";

export async function GET(request: Request) {
  const parameters = new URL(request.url).searchParams;
  const parsed = promptListRequestSchema.safeParse(
    Object.fromEntries([...parameters].filter(([, value]) => value !== "")),
  );
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const result = await listPublicPrompts(parsed.data);
  if (result.status === "invalid_cursor") {
    return Response.json(
      {
        error: "invalid_request",
        issues: [{ path: "cursor", message: "Invalid Prompt cursor" }],
      },
      { status: 400 },
    );
  }
  return Response.json(publicPromptListSchema.parse(result.response));
}
