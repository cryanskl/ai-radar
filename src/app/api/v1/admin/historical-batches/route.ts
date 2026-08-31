import { getServerSession } from "next-auth";
import { authOptions } from "@/auth/options";
import {
  historicalBackfillReportSchema,
  historicalBackfillRequestSchema,
} from "@/historical-backfills/contracts";
import { runHistoricalBackfill } from "@/historical-backfills/service";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "owner") {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: "invalid_json" }, { status: 400 });
    }
    throw error;
  }
  const parsed = historicalBackfillRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const result = await runHistoricalBackfill(parsed.data);
  if (result.status === "conflict") {
    return Response.json({ error: "batch_content_conflict" }, { status: 409 });
  }
  if (result.status === "version_conflict") {
    return Response.json({ error: "batch_version_conflict" }, { status: 409 });
  }
  if (!result.report) {
    throw new Error("Historical backfill finished without a report");
  }
  return Response.json(historicalBackfillReportSchema.parse(result.report), {
    status: result.status === "created" ? 201 : 200,
  });
}
