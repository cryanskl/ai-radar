import {
  askErrorResponseSchema,
  askRequestSchema,
  askResponseSchema,
} from "@/ask/contracts";
import { answerPublicQuestion } from "@/ask/service";

const invalidRequest = (issues: Array<{ path: string; message: string }>) =>
  Response.json(
    askErrorResponseSchema.parse({ error: "invalid_ask_request", issues }),
    { status: 400 },
  );

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return invalidRequest([{ path: "", message: "Request body must be JSON" }]);
  }
  const input = askRequestSchema.safeParse(body);
  if (!input.success) {
    return invalidRequest(
      input.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }

  return Response.json(
    askResponseSchema.parse(await answerPublicQuestion(input.data)),
  );
}
