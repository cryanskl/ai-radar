import { z } from "zod";
import { localeSchema } from "@/events/contracts";

const publicIdSchema = z
  .string()
  .max(200)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const timestampSchema = z.iso.datetime({ offset: true });
const dailyBriefSectionSchema = z.enum([
  "key_developments",
  "models_research",
  "products_open_source",
  "prompts_skills_guides",
]);

export const dailyBriefCreateRequestSchema = z
  .object({
    publicId: publicIdSchema,
    editionPublicId: publicIdSchema,
    locale: localeSchema,
    briefDate: z.iso.date(),
    version: z.string().trim().min(1).max(40),
    dataCutoff: timestampSchema,
    title: z.string().trim().min(1).max(240),
    overview: z.string().trim().min(1).max(1200),
    coverageNote: z.string().trim().min(1).max(1200),
    whatToWatch: z.string().trim().min(1).max(1200),
    authorship: z.enum([
      "human_authored",
      "ai_translated",
      "official_translation",
    ]),
    reviewStatus: z.enum(["draft", "reviewed"]),
    items: z
      .array(
        z
          .object({
            eventPublicId: publicIdSchema,
            position: z.number().int().positive().max(20),
            section: dailyBriefSectionSchema,
            commentary: z.string().trim().min(1).max(1200),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict()
  .superRefine(({ items }, context) => {
    if (
      new Set(items.map(({ eventPublicId }) => eventPublicId)).size <
      items.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["items"],
        message: "Event references must be unique",
      });
    }
    const positions = items
      .map(({ position }) => position)
      .sort((a, b) => a - b);
    if (positions.some((position, index) => position !== index + 1)) {
      context.addIssue({
        code: "custom",
        path: ["items"],
        message: "Positions must be contiguous from 1",
      });
    }
  });

const publicBriefEventSchema = z
  .object({
    publicId: publicIdSchema,
    title: z.string().min(1),
    summary: z.string().min(1),
    occurredAt: timestampSchema,
    href: z.string().startsWith("/"),
    source: z
      .object({ title: z.string().min(1), url: z.url() })
      .strict()
      .nullable(),
  })
  .strict();

export const publishedDailyBriefSchema = z
  .object({
    publicId: publicIdSchema,
    editionPublicId: publicIdSchema,
    locale: localeSchema,
    briefDate: z.iso.date(),
    version: z.string().min(1),
    dataCutoff: timestampSchema,
    publishedAt: timestampSchema,
    title: z.string().min(1),
    overview: z.string().min(1),
    coverageNote: z.string().min(1),
    whatToWatch: z.string().min(1),
    correctionUrl: z.url(),
    items: z.array(
      z
        .object({
          position: z.number().int().positive(),
          section: dailyBriefSectionSchema,
          commentary: z.string().min(1),
          event: publicBriefEventSchema,
        })
        .strict(),
    ),
  })
  .strict();

export const dailyBriefDraftResponseSchema = z
  .object({
    publicId: publicIdSchema,
    editionPublicId: publicIdSchema,
    state: z.literal("draft"),
    locale: localeSchema,
    briefDate: z.iso.date(),
    version: z.string().min(1),
    dataCutoff: timestampSchema,
    reviewStatus: z.enum(["draft", "reviewed"]),
    itemCount: z.number().int().positive(),
  })
  .strict();

export const dailyBriefPublishResponseSchema = z
  .object({
    status: z.literal("published"),
    editionPublicId: publicIdSchema,
    briefs: z.array(publishedDailyBriefSchema).length(2),
    deliveries: z
      .object({
        accepted: z.number().int().nonnegative(),
        failed: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export const dailyBriefPreviewSchema = publishedDailyBriefSchema
  .omit({ publishedAt: true })
  .extend({
    state: z.enum(["draft", "published"]),
    publishedAt: timestampSchema.nullable(),
  })
  .strict();

export const dailyBriefListRequestSchema = z
  .object({ locale: localeSchema })
  .strict();

export const emailSubscriptionRequestSchema = z
  .object({
    email: z.email().max(320),
    locale: localeSchema,
    consent: z.literal(true),
  })
  .strict();

export const emailSubscriptionResponseSchema = z
  .object({ status: z.literal("confirmation_pending") })
  .strict();

export const emailTokenRequestSchema = z
  .object({ token: z.string().min(32).max(256) })
  .strict();

export const emailConfirmationResponseSchema = z
  .object({ status: z.enum(["confirmed", "invalid_or_expired"]) })
  .strict();

export const emailUnsubscribeResponseSchema = z
  .object({ status: z.literal("unsubscribed") })
  .strict();

export const emailDeliveryListResponseSchema = z
  .object({
    items: z.array(
      z
        .object({
          publicId: publicIdSchema,
          kind: z.enum(["confirmation", "daily_brief"]),
          briefPublicId: publicIdSchema.nullable(),
          provider: z.string().min(1),
          providerMessageId: z.string().nullable(),
          status: z.enum([
            "pending",
            "accepted",
            "delivered",
            "failed",
            "bounced",
          ]),
          failureReason: z.string().nullable(),
          updatedAt: timestampSchema,
        })
        .strict(),
    ),
  })
  .strict();

export const dailyBriefEmailPreviewSchema = z
  .object({
    subject: z.string().min(1),
    text: z.string().min(1),
    html: z.string().min(1),
  })
  .strict();

export const dailyBriefErrorResponseSchema = z
  .object({
    error: z.enum([
      "unauthorized",
      "invalid_json",
      "invalid_locale",
      "invalid_channel",
      "invalid_reference",
      "event_after_data_cutoff",
      "not_found",
      "not_publishable",
      "already_exists",
      "invalid_webhook",
      "delivery_not_ready",
    ]),
  })
  .strict();

export const invalidDailyBriefRequestResponseSchema = z
  .object({ error: z.literal("invalid_request"), issues: z.array(z.unknown()) })
  .strict();

export type DailyBriefCreateRequest = z.infer<
  typeof dailyBriefCreateRequestSchema
>;
export type PublishedDailyBriefContract = z.infer<
  typeof publishedDailyBriefSchema
>;
