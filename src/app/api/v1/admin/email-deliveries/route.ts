import { getServerSession } from "next-auth";
import { authOptions } from "@/auth/options";
import { emailDeliveryListResponseSchema } from "@/daily-briefs/contracts";
import { listEmailDeliveries } from "@/daily-briefs/service";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "owner") {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return Response.json(
    emailDeliveryListResponseSchema.parse(await listEmailDeliveries()),
  );
}
