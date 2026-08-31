import { createHash } from "node:crypto";
import { z } from "zod";

const publicCursorSchema = z
  .object({
    version: z.literal(1),
    resource: z.string().min(1),
    requestKey: z.string().regex(/^[a-f0-9]{64}$/),
    position: z.record(z.string(), z.string().min(1)),
  })
  .strict();

export const publicCursorRequestKey = (filters: Record<string, unknown>) =>
  createHash("sha256").update(JSON.stringify(filters)).digest("hex");

export const encodePublicCursor = (
  resource: string,
  requestKey: string,
  position: Record<string, string>,
) =>
  Buffer.from(
    JSON.stringify({ version: 1, resource, requestKey, position }),
  ).toString("base64url");

export const decodePublicCursor = (
  value: string,
  resource: string,
  requestKey: string,
) => {
  try {
    const parsed = publicCursorSchema.parse(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8")),
    );
    if (parsed.resource !== resource || parsed.requestKey !== requestKey) {
      return null;
    }
    return parsed.position;
  } catch {
    return null;
  }
};
