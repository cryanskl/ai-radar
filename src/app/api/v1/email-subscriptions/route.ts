import {
  emailSubscriptionRequestSchema,
  emailSubscriptionResponseSchema,
} from "@/daily-briefs/contracts";
import { getEmailProvider } from "@/daily-briefs/email-provider";
import { subscribeToDailyBrief } from "@/daily-briefs/service";
import { getEmailEnv } from "@/config/server-env";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: "invalid_json" }, { status: 400 });
    }
    throw error;
  }
  const parsed = emailSubscriptionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const env = getEmailEnv();
  const result = await subscribeToDailyBrief(parsed.data, getEmailProvider(), {
    origin: env.PUBLIC_ORIGIN,
    tokenSecret: env.EMAIL_TOKEN_SECRET,
  });
  return Response.json(emailSubscriptionResponseSchema.parse(result), {
    status: 202,
  });
}
