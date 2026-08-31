import {
  emailTokenRequestSchema,
  emailUnsubscribeResponseSchema,
} from "@/daily-briefs/contracts";
import { unsubscribeFromDailyBrief } from "@/daily-briefs/service";
import { getEmailEnv } from "@/config/server-env";

const unsubscribe = async (input: unknown) => {
  const parsed = emailTokenRequestSchema.safeParse(input);
  const result = parsed.success
    ? await unsubscribeFromDailyBrief(
        parsed.data.token,
        getEmailEnv().EMAIL_TOKEN_SECRET,
      )
    : { status: "unsubscribed" as const };
  return Response.json(emailUnsubscribeResponseSchema.parse(result));
};

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) return unsubscribe(null);
    throw error;
  }
  return unsubscribe(body);
}
