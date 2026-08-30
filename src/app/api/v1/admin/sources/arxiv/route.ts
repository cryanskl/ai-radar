import { getServerSession } from "next-auth";
import { authOptions } from "@/auth/options";
import { arxivSourceConfigurationResponseSchema } from "@/ingestion/contracts";
import { configureArxivSource } from "@/ingestion/source-configuration";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "owner") {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  return Response.json(
    arxivSourceConfigurationResponseSchema.parse(await configureArxivSource()),
    { status: 201 },
  );
}
