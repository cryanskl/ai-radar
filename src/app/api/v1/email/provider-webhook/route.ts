import {
  getEmailProvider,
  InvalidEmailWebhookError,
} from "@/daily-briefs/email-provider";
import { recordEmailProviderEvent } from "@/daily-briefs/service";

export async function POST(request: Request) {
  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");
  if (!id || !timestamp || !signature) {
    return Response.json({ error: "invalid_webhook" }, { status: 400 });
  }
  const payload = await request.text();
  const provider = getEmailProvider();
  let event;
  try {
    event = provider.verifyWebhook(payload, {
      id,
      timestamp,
      signature,
    });
  } catch (error) {
    if (error instanceof InvalidEmailWebhookError) {
      return Response.json({ error: "invalid_webhook" }, { status: 400 });
    }
    throw error;
  }
  if (event) {
    const result = await recordEmailProviderEvent(event);
    if (result.status === "unknown_delivery") {
      return Response.json({ error: "delivery_not_ready" }, { status: 503 });
    }
  }
  return new Response(null, { status: 204 });
}
