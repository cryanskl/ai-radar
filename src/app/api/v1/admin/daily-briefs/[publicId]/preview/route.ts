import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/auth/options";
import { getEmailEnv } from "@/config/server-env";
import { dailyBriefPreviewSchema } from "@/daily-briefs/contracts";
import {
  renderDailyBriefEmail,
  renderDailyBriefRss,
} from "@/daily-briefs/rendering";
import { getDailyBriefPreview } from "@/daily-briefs/service";

const channelSchema = z.enum(["web", "rss", "email"]);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "owner") {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const channel = channelSchema.safeParse(
    new URL(request.url).searchParams.get("channel"),
  );
  if (!channel.success) {
    return Response.json({ error: "invalid_channel" }, { status: 400 });
  }
  const brief = await getDailyBriefPreview((await params).publicId);
  if (!brief) return Response.json({ error: "not_found" }, { status: 404 });
  const origin = getEmailEnv().PUBLIC_ORIGIN;
  if (channel.data === "rss") {
    return new Response(
      renderDailyBriefRss(brief, origin, new Date().toISOString()),
      {
        headers: { "content-type": "application/rss+xml; charset=utf-8" },
      },
    );
  }
  if (channel.data === "email") {
    return Response.json(
      renderDailyBriefEmail(brief, {
        briefUrl: `${origin}/${brief.locale}/briefs/${brief.publicId}`,
        unsubscribeUrl: `${origin}/api/v1/email-subscriptions/unsubscribe`,
      }),
    );
  }
  return Response.json(dailyBriefPreviewSchema.parse(brief));
}
