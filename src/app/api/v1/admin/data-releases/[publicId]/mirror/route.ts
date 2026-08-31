import { getServerSession } from "next-auth";
import { authOptions } from "@/auth/options";
import {
  dataReleaseMirrorRequestSchema,
  dataReleaseMirrorResponseSchema,
} from "@/data-releases/contracts";
import { verifyDataReleaseMirror } from "@/data-releases/service";
import { DataReleaseRemoteError } from "@/data-releases/remote";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
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
  const parsed = dataReleaseMirrorRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    const result = await verifyDataReleaseMirror(
      (await params).publicId,
      parsed.data,
    );
    if (result.status === "not_found") {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    return Response.json(dataReleaseMirrorResponseSchema.parse(result));
  } catch (error) {
    if (error instanceof DataReleaseRemoteError) {
      const status = error.code === "checksum_mismatch" ? 409 : 502;
      return Response.json({ error: error.code }, { status });
    }
    throw error;
  }
}
