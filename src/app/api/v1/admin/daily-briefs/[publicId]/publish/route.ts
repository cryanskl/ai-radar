import { getServerSession } from "next-auth";
import { authOptions } from "@/auth/options";
import { getEmailEnv } from "@/config/server-env";
import { dailyBriefPublishResponseSchema } from "@/daily-briefs/contracts";
import { getEmailProvider } from "@/daily-briefs/email-provider";
import { publishDailyBrief } from "@/daily-briefs/service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "owner") {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const env = getEmailEnv();
  const result = await publishDailyBrief(
    (await params).publicId,
    getEmailProvider(),
    { origin: env.PUBLIC_ORIGIN, tokenSecret: env.EMAIL_TOKEN_SECRET },
  );
  if (result.status === "not_found") {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  if (result.status === "not_publishable") {
    return Response.json({ error: "not_publishable" }, { status: 409 });
  }
  return Response.json(dailyBriefPublishResponseSchema.parse(result));
}
