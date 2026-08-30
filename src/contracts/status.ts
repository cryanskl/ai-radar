import { z } from "zod";

export const statusResponseSchema = z
  .object({
    status: z.enum(["ok", "degraded"]),
    services: z
      .object({
        application: z.literal("ok"),
        database: z.enum(["ok", "error"]),
      })
      .strict(),
    checkedAt: z.iso.datetime(),
  })
  .strict();

export type StatusResponse = z.infer<typeof statusResponseSchema>;
