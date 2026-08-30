import { getServerSession } from "next-auth";
import { authOptions } from "@/auth/options";
import { githubSourceConfigurationResponseSchema } from "@/ingestion/contracts";
import { configureGithubSource } from "@/ingestion/source-configuration";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "owner") {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  return Response.json(
    githubSourceConfigurationResponseSchema.parse(
      await configureGithubSource(),
    ),
    { status: 201 },
  );
}
