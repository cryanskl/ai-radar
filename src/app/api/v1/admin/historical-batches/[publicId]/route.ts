import { getServerSession } from "next-auth";
import { authOptions } from "@/auth/options";
import { historicalBackfillReportSchema } from "@/historical-backfills/contracts";
import { getHistoricalBackfill } from "@/historical-backfills/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "owner") {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const report = await getHistoricalBackfill((await params).publicId);
  if (!report) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  return Response.json(historicalBackfillReportSchema.parse(report));
}
