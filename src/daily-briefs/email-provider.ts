import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Resend, type WebhookEventPayload } from "resend";
import { z } from "zod";
import { getEmailEnv } from "@/config/server-env";

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
  deliveryPublicId: string;
  briefPublicId: string | null;
};

export type EmailProviderEvent = {
  providerEventId: string;
  messageId: string;
  type: "delivered" | "failed" | "bounced";
  occurredAt: string;
  failureReason: string | null;
};

export type EmailProvider = {
  name: "fake" | "resend";
  send: (message: EmailMessage) => Promise<{ messageId: string }>;
  verifyWebhook: (
    payload: string,
    headers: { id: string; timestamp: string; signature: string },
  ) => EmailProviderEvent | null;
};

export class InvalidEmailWebhookError extends Error {}

const fakeWebhookSecret = "ai-radar-fake-webhook-secret";

export const signFakeEmailWebhook = (
  payload: string,
  headers: { id: string; timestamp: string },
) =>
  createHmac("sha256", fakeWebhookSecret)
    .update(`${headers.id}.${headers.timestamp}.${payload}`)
    .digest("hex");

export const fakeEmailMessageId = (message: EmailMessage) =>
  `fake-${createHash("sha256").update(JSON.stringify(message)).digest("hex").slice(0, 24)}`;

const fakeWebhookDataSchema = z
  .object({
    email_id: z.string().min(1),
    created_at: z.iso.datetime({ offset: true }),
    message_id: z.string().min(1),
    from: z.string().min(1),
    to: z.array(z.email()).min(1),
    subject: z.string(),
  })
  .passthrough();

const fakeWebhookSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("email.delivered"),
      created_at: z.iso.datetime({ offset: true }),
      data: fakeWebhookDataSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("email.failed"),
      created_at: z.iso.datetime({ offset: true }),
      data: fakeWebhookDataSchema.extend({
        failed: z.object({ reason: z.string().min(1) }).strict(),
      }),
    })
    .strict(),
  z
    .object({
      type: z.literal("email.bounced"),
      created_at: z.iso.datetime({ offset: true }),
      data: fakeWebhookDataSchema.extend({
        bounce: z
          .object({
            message: z.string().min(1),
            type: z.string().min(1),
            subType: z.string().min(1),
          })
          .strict(),
      }),
    })
    .strict(),
]);

const normalizeVerifiedEvent = (
  providerEventId: string,
  event: WebhookEventPayload,
): EmailProviderEvent | null => {
  if (
    event.type !== "email.delivered" &&
    event.type !== "email.failed" &&
    event.type !== "email.bounced"
  ) {
    return null;
  }
  return {
    providerEventId,
    messageId: event.data.email_id,
    type: event.type.replace("email.", "") as EmailProviderEvent["type"],
    occurredAt: event.created_at,
    failureReason:
      event.type === "email.failed"
        ? event.data.failed.reason
        : event.type === "email.bounced"
          ? event.data.bounce.message
          : null,
  };
};

export class FakeEmailProvider implements EmailProvider {
  readonly name = "fake" as const;

  async send(message: EmailMessage) {
    if (message.to.endsWith("@fail.example.test")) {
      throw new Error("fake_provider_rejected");
    }
    return {
      messageId: fakeEmailMessageId(message),
    };
  }

  verifyWebhook(
    payload: string,
    headers: { id: string; timestamp: string; signature: string },
  ) {
    const expected = Buffer.from(
      signFakeEmailWebhook(payload, {
        id: headers.id,
        timestamp: headers.timestamp,
      }),
    );
    const received = Buffer.from(headers.signature);
    if (
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    ) {
      throw new InvalidEmailWebhookError("invalid_webhook_signature");
    }
    let event: z.infer<typeof fakeWebhookSchema>;
    try {
      event = fakeWebhookSchema.parse(JSON.parse(payload));
    } catch {
      throw new InvalidEmailWebhookError("invalid_webhook_payload");
    }
    return normalizeVerifiedEvent(headers.id, event);
  }
}

class ResendEmailProvider implements EmailProvider {
  readonly name = "resend" as const;
  readonly #resend: Resend;
  readonly #from: string;
  readonly #webhookSecret: string;

  constructor(apiKey: string, from: string, webhookSecret: string) {
    this.#resend = new Resend(apiKey);
    this.#from = from;
    this.#webhookSecret = webhookSecret;
  }

  async send(message: EmailMessage) {
    const response = await this.#resend.emails.send(
      {
        from: this.#from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        tags: [
          { name: "delivery_id", value: message.deliveryPublicId },
          ...(message.briefPublicId
            ? [{ name: "brief_id", value: message.briefPublicId }]
            : []),
        ],
      },
      { idempotencyKey: message.idempotencyKey },
    );
    if (response.error) throw new Error(response.error.message);
    return { messageId: response.data.id };
  }

  verifyWebhook(
    payload: string,
    headers: { id: string; timestamp: string; signature: string },
  ) {
    let event: WebhookEventPayload;
    try {
      event = this.#resend.webhooks.verify({
        payload,
        headers,
        webhookSecret: this.#webhookSecret,
      });
    } catch {
      throw new InvalidEmailWebhookError("invalid_webhook_signature");
    }
    return normalizeVerifiedEvent(headers.id, event);
  }
}

export const getEmailProvider = (): EmailProvider => {
  const env = getEmailEnv();
  return env.EMAIL_PROVIDER === "fake"
    ? new FakeEmailProvider()
    : new ResendEmailProvider(
        env.RESEND_API_KEY,
        env.RESEND_FROM,
        env.RESEND_WEBHOOK_SECRET,
      );
};
