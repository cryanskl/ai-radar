import {
  emailConfirmationResponseSchema,
  emailTokenRequestSchema,
} from "@/daily-briefs/contracts";
import { confirmDailyBriefSubscription } from "@/daily-briefs/service";
import { getEmailEnv } from "@/config/server-env";

const confirm = async (input: unknown) => {
  const parsed = emailTokenRequestSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json({ status: "invalid_or_expired" }, { status: 400 });
  }
  return Response.json(
    emailConfirmationResponseSchema.parse(
      await confirmDailyBriefSubscription(
        parsed.data.token,
        getEmailEnv().EMAIL_TOKEN_SECRET,
      ),
    ),
  );
};

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) return confirm(null);
    throw error;
  }
  return confirm(body);
}
