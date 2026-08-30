import { z } from "zod";
import { entityTypeSchema, relationTypeSchema } from "@/entities/contracts";
import {
  localeSchema,
  publicRightsStatusSchema,
  rightsStatusSchema,
} from "@/events/contracts";

const publicIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const timestampSchema = z.iso.datetime({ offset: true });
const dimensionSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/);
const localizationAuthorshipSchema = z.enum([
  "human_authored",
  "ai_translated",
  "official_translation",
]);

export const promptProvenanceSchema = z.enum([
  "ai_radar_original",
  "authorized_submission",
  "open_licensed",
  "written_permission",
  "external_link",
]);
export const promptValidationStatusSchema = z.enum([
  "current",
  "stale",
  "unvalidated",
]);

const authorSchema = z
  .object({ name: z.string().trim().min(1), url: z.url().nullable() })
  .strict();
const licenseSchema = z
  .object({ name: z.string().trim().min(1), url: z.url() })
  .strict();
const variableSchema = z
  .object({
    name: z.string().trim().min(1),
    description: z.string().trim().min(1),
    required: z.boolean(),
  })
  .strict();
const promptLocalizationInputSchema = z
  .object({
    locale: localeSchema,
    purpose: z.string().trim().min(1),
    variables: z.array(variableSchema),
    inputExample: z.string().trim().min(1),
    expectedOutputExample: z.string().trim().min(1),
    knownLimitations: z.array(z.string().trim().min(1)).min(1),
    authorship: localizationAuthorshipSchema,
    reviewStatus: z.literal("reviewed"),
  })
  .strict();
const validationLocalizationInputSchema = z
  .object({
    locale: localeSchema,
    staleReason: z.string().trim().min(1),
    authorship: localizationAuthorshipSchema,
    reviewStatus: z.literal("reviewed"),
  })
  .strict();
const validationInputSchema = z
  .object({
    publicId: publicIdSchema,
    sourceItemPublicId: publicIdSchema,
    status: promptValidationStatusSchema,
    validatedAt: timestampSchema,
    observedAt: timestampSchema,
    localizations: z.array(validationLocalizationInputSchema).max(2),
  })
  .strict()
  .superRefine(({ localizations, status }, context) => {
    const hasBothLocales =
      localizations.length === 2 &&
      new Set(localizations.map(({ locale }) => locale)).size === 2;
    if (status === "stale" && !hasBothLocales) {
      context.addIssue({
        code: "custom",
        path: ["localizations"],
        message:
          "stale validation requires reviewed English and Chinese reasons",
      });
    }
    if (status !== "stale" && localizations.length !== 0) {
      context.addIssue({
        code: "custom",
        path: ["localizations"],
        message: "only stale validation accepts localized reasons",
      });
    }
  });
const compatibilityInputSchema = z
  .object({
    publicId: publicIdSchema,
    targetEntityPublicId: publicIdSchema,
    targetVersionPublicId: publicIdSchema.nullable(),
    verifiedVersion: z.string().trim().min(1),
    validation: validationInputSchema,
  })
  .strict();

export const promptProfileCreateRequestSchema = z
  .object({
    promptPublicId: publicIdSchema,
    sourceItemPublicId: publicIdSchema,
    author: authorSchema,
    provenance: promptProvenanceSchema,
    task: dimensionSchema,
    inputTypes: z.array(dimensionSchema).min(1),
    rightsStatus: rightsStatusSchema,
    license: licenseSchema.nullable(),
    fullText: z.string().trim().min(1).nullable(),
    localizations: z
      .array(promptLocalizationInputSchema)
      .length(2)
      .refine(
        (localizations) =>
          new Set(localizations.map(({ locale }) => locale)).size === 2,
        { message: "English and Chinese Prompt localizations are required" },
      ),
    compatibilities: z.array(compatibilityInputSchema).min(1),
  })
  .strict()
  .superRefine(({ fullText, license, provenance, rightsStatus }, context) => {
    const redistributable = [
      "open",
      "attribution_required",
      "source_license",
    ].includes(rightsStatus);
    if (
      fullText !== null &&
      (provenance === "external_link" || !redistributable || license === null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["fullText"],
        message:
          "full Prompt text requires redistributable rights, an allowed provenance and a license",
      });
    }
    if (
      provenance === "external_link" &&
      !["metadata_only", "link_only"].includes(rightsStatus)
    ) {
      context.addIssue({
        code: "custom",
        path: ["rightsStatus"],
        message: "external links must remain metadata_only or link_only",
      });
    }
  });

export const promptProfileCreateResponseSchema = z
  .object({
    promptPublicId: publicIdSchema,
    publicVisibility: z.boolean(),
    compatibilityPublicIds: z.array(publicIdSchema).min(1),
  })
  .strict();

export const promptValidationAppendRequestSchema = z
  .object({
    compatibilityPublicId: publicIdSchema,
    observation: validationInputSchema,
  })
  .strict();
export const promptValidationAppendResponseSchema = z
  .object({
    compatibilityPublicId: publicIdSchema,
    observationPublicId: publicIdSchema,
    status: promptValidationStatusSchema,
  })
  .strict();

export const promptListRequestSchema = z
  .object({
    locale: localeSchema.default("en"),
    task: dimensionSchema.optional(),
    model: publicIdSchema.optional(),
    tool: publicIdSchema.optional(),
    rightsStatus: publicRightsStatusSchema.optional(),
    validation: promptValidationStatusSchema.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().min(1).max(4096).optional(),
  })
  .strict();

const publicValidationSchema = z
  .object({
    publicId: publicIdSchema,
    status: promptValidationStatusSchema,
    validatedAt: timestampSchema,
    observedAt: timestampSchema,
    staleReason: z.string().min(1).nullable(),
    sourceItemPublicId: publicIdSchema,
  })
  .strict();
const publicCompatibilitySchema = z
  .object({
    publicId: publicIdSchema,
    target: z
      .object({
        publicId: publicIdSchema,
        type: z.enum(["model", "product"]),
        name: z.string().min(1),
        versionPublicId: publicIdSchema.nullable(),
        version: z.string().min(1),
      })
      .strict(),
    currentValidation: publicValidationSchema,
  })
  .strict();
const sourceSchema = z
  .object({
    sourceItemPublicId: publicIdSchema,
    title: z.string().min(1),
    url: z.url(),
    attribution: z.string().min(1),
  })
  .strict();

const publicLocalizationSchema = z
  .object({
    locale: localeSchema,
    authorship: localizationAuthorshipSchema,
    reviewStatus: z.literal("reviewed"),
    lastLocalizedAt: timestampSchema,
  })
  .strict();

export const publicPromptListItemSchema = z
  .object({
    publicId: publicIdSchema,
    name: z.string().min(1),
    summary: z.string().min(1),
    task: dimensionSchema,
    inputTypes: z.array(dimensionSchema).min(1),
    author: authorSchema,
    provenance: promptProvenanceSchema,
    rightsStatus: publicRightsStatusSchema,
    contentMode: z.enum(["full_text", "metadata_only", "link_only"]),
    lastVerifiedAt: timestampSchema,
    compatibilities: z.array(publicCompatibilitySchema).min(1),
  })
  .strict();

export const publicPromptListSchema = z
  .object({
    locale: localeSchema,
    methodology: z
      .object({
        publicId: z.literal("prompt-task-fit"),
        version: z.literal("1.0.0"),
        kind: z.literal("filtered_discovery"),
        limitation: z.string().min(1),
      })
      .strict(),
    items: z.array(publicPromptListItemSchema),
    dataCutoff: timestampSchema.nullable(),
    resultSet: z
      .object({
        capturedCount: z.number().int().nonnegative(),
        limit: z.literal(1000),
        truncated: z.boolean(),
      })
      .strict(),
    nextCursor: z.string().nullable(),
  })
  .strict();

const publicRelationSchema = z
  .object({
    publicId: publicIdSchema,
    predicate: relationTypeSchema,
    direction: z.enum(["outgoing", "incoming"]),
    target: z
      .object({
        publicId: publicIdSchema,
        type: entityTypeSchema,
        name: z.string().min(1),
      })
      .strict(),
    evidenceSourceItemPublicIds: z.array(publicIdSchema).min(1),
  })
  .strict();

export const publicPromptDetailSchema = publicPromptListItemSchema
  .extend({
    officialUrl: z.url(),
    license: licenseSchema.nullable(),
    fullText: z.string().min(1).nullable(),
    purpose: z.string().min(1),
    variables: z.array(variableSchema),
    inputExample: z.string().min(1),
    expectedOutputExample: z.string().min(1),
    knownLimitations: z.array(z.string().min(1)).min(1),
    localization: publicLocalizationSchema,
    originalSource: sourceSchema,
    relations: z.array(publicRelationSchema).min(1),
  })
  .strict();

export const promptErrorResponseSchema = z
  .object({
    error: z.enum([
      "unauthorized",
      "invalid_json",
      "invalid_reference",
      "already_exists",
      "not_found",
    ]),
  })
  .strict();

export const invalidPromptRequestResponseSchema = z
  .object({ error: z.literal("invalid_request"), issues: z.array(z.unknown()) })
  .strict();

export const promptListCursorSchema = z
  .object({
    version: z.literal(1),
    requestKey: z.string().min(1),
    dataCutoff: timestampSchema,
    snapshotId: z.uuid(),
    offset: z.number().int().positive(),
  })
  .strict();

export type PromptProfileCreateRequest = z.infer<
  typeof promptProfileCreateRequestSchema
>;
export type PromptValidationAppendRequest = z.infer<
  typeof promptValidationAppendRequestSchema
>;
export type PromptListRequest = z.infer<typeof promptListRequestSchema>;
export type PublicPromptListItem = z.infer<typeof publicPromptListItemSchema>;
