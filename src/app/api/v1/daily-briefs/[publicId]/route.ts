import { localeSchema } from "@/events/contracts";
import { publishedDailyBriefSchema } from "@/daily-briefs/contracts";
import { getPublishedDailyBrief } from "@/daily-briefs/service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  const locale = localeSchema.safeParse(
    new URL(request.url).searchParams.get("locale") ?? "en",
  );
  if (!locale.success) {
    return Response.json({ error: "invalid_locale" }, { status: 400 });
  }
  const brief = await getPublishedDailyBrief(
    (await params).publicId,
    locale.data,
  );
  if (!brief) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json(publishedDailyBriefSchema.parse(brief));
}
