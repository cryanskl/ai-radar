import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const emailTokenPayloadSchema = z.discriminatedUnion("purpose", [
  z.object({
    purpose: z.literal("confirm"),
    subscriptionId: z.uuid(),
    consentVersion: z.uuid(),
  }),
  z.object({
    purpose: z.literal("unsubscribe"),
    subscriptionId: z.uuid(),
  }),
]);

export type EmailTokenPayload = z.infer<typeof emailTokenPayloadSchema>;

const sign = (payload: string, secret: string) =>
  createHmac("sha256", secret).update(payload).digest("base64url");

export const createEmailToken = (
  payload: EmailTokenPayload,
  secret: string,
) => {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded, secret)}`;
};

export const verifyEmailToken = (
  token: string,
  expectedPurpose: EmailTokenPayload["purpose"],
  secret: string,
) => {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;

  const expectedSignature = sign(payload, secret);
  const receivedBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expectedSignature);
  if (
    receivedBytes.length !== expectedBytes.length ||
    !timingSafeEqual(receivedBytes, expectedBytes)
  ) {
    return null;
  }

  const decoded: unknown = JSON.parse(
    Buffer.from(payload, "base64url").toString("utf8"),
  );
  const parsed = emailTokenPayloadSchema.safeParse(decoded);
  if (!parsed.success || parsed.data.purpose !== expectedPurpose) return null;
  return parsed.data;
};
