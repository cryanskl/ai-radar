import { z } from "zod";
import { eventDraftRequestSchema } from "@/events/contracts";

export const arxivSourceConfigurationResponseSchema = z
  .object({
    sourcePublicId: z.literal("arxiv"),
    adapterKey: z.literal("arxiv_api"),
    minRequestIntervalMs: z.literal(3000),
    maxItemsPerRun: z.literal(25),
    retainRawPayload: z.literal(false),
  })
  .strict();

export const githubSourceConfigurationResponseSchema = z
  .object({
    sourcePublicId: z.literal("github"),
    adapterKey: z.literal("github_rest_api"),
    apiVersion: z.literal("2022-11-28"),
    minRequestIntervalMs: z.literal(60_000),
    maxItemsPerRun: z.literal(10),
    retainRawPayload: z.literal(false),
  })
  .strict();

export const inboxEventDraftRequestSchema = eventDraftRequestSchema.pick({
  event: true,
  localizations: true,
});

export type InboxEventDraftRequest = z.infer<
  typeof inboxEventDraftRequestSchema
>;
