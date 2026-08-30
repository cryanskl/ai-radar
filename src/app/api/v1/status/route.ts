import { readStatus } from "@/status/status";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = await readStatus();

  return Response.json(status, {
    status: status.status === "ok" ? 200 : 503,
  });
}
