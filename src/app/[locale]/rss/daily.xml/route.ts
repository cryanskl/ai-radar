import { notFound } from "next/navigation";
import { getEmailEnv } from "@/config/server-env";
import { renderDailyBriefRss } from "@/daily-briefs/rendering";
import { getLatestPublishedDailyBrief } from "@/daily-briefs/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale } = await params;
  if (locale !== "en" && locale !== "zh") notFound();
  const brief = await getLatestPublishedDailyBrief(locale);
  if (!brief) return new Response(null, { status: 404 });
  return new Response(renderDailyBriefRss(brief, getEmailEnv().PUBLIC_ORIGIN), {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
