import { z } from "zod";

const publicIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const timestampSchema = z.iso.datetime({ offset: true });
const httpUrlSchema = z.url().regex(/^https?:\/\//);
const localeSchema = z.enum(["en", "zh"]);
const rightsStatusSchema = z.enum([
  "open",
  "attribution_required",
  "source_license",
  "metadata_only",
  "link_only",
  "permission_required",
  "internal_only",
  "withdrawn",
]);

const correctionLocalizationSchema = z
  .object({
    locale: localeSchema,
    title: z.string().trim().min(1),
    summary: z.string().trim().min(1),
  })
  .strict();
const entityCorrectionLocalizationSchema = z
  .object({
    locale: localeSchema,
    name: z.string().trim().min(1),
    summary: z.string().trim().min(1),
  })
  .strict();
const uniqueLocales = (values: Array<{ locale: "en" | "zh" }>) =>
  new Set(values.map(({ locale }) => locale)).size === values.length;
const newEditorialCaseSchema = z
  .object({
    publicId: publicIdSchema,
    receivedAt: timestampSchema,
    originalRequest: z.string().trim().min(1),
    evidenceSummary: z.string().trim().min(1),
  })
  .strict();
const existingEditorialCaseSchema = z
  .object({ publicId: publicIdSchema })
  .strict();
const editorialCaseReferenceSchema = z.union([
  newEditorialCaseSchema,
  existingEditorialCaseSchema,
]);

const correctionBase = {
  publicId: publicIdSchema,
  case: editorialCaseReferenceSchema,
  reasonCode: z.literal("factual_error"),
  effectiveAt: timestampSchema,
  replacementVersion: z.string().trim().min(1),
  evidenceSourceItemPublicIds: z.array(publicIdSchema).min(1),
  internalNote: z.string().trim().min(1),
};

const eventCorrectionRequestSchema = z
  .object({
    ...correctionBase,
    target: z
      .object({ type: z.literal("event"), publicId: publicIdSchema })
      .strict(),
    changes: z
      .object({
        occurredAt: timestampSchema.optional(),
        occurredAtPrecision: z.enum(["day", "minute", "second"]).optional(),
        localizations: z
          .array(correctionLocalizationSchema)
          .length(2)
          .refine(uniqueLocales, {
            message: "Localization locales must be unique",
          })
          .optional(),
      })
      .strict()
      .refine(
        ({ occurredAt, occurredAtPrecision, localizations }) =>
          (occurredAt !== undefined && occurredAtPrecision !== undefined) ||
          localizations !== undefined,
        { message: "At least one complete Event correction is required" },
      )
      .refine(
        ({ occurredAt, occurredAtPrecision }) =>
          (occurredAt === undefined) === (occurredAtPrecision === undefined),
        { message: "Event time and precision must change together" },
      ),
  })
  .strict();

const entityCorrectionRequestSchema = z
  .object({
    ...correctionBase,
    target: z
      .object({ type: z.literal("entity"), publicId: publicIdSchema })
      .strict(),
    changes: z
      .object({
        officialName: z.string().trim().min(1).optional(),
        officialUrl: httpUrlSchema.optional(),
        lastVerifiedAt: timestampSchema,
        localizations: z
          .array(entityCorrectionLocalizationSchema)
          .length(2)
          .refine(uniqueLocales, {
            message: "Localization locales must be unique",
          })
          .optional(),
      })
      .strict()
      .refine(
        ({ officialName, officialUrl, localizations }) =>
          officialName !== undefined ||
          officialUrl !== undefined ||
          localizations !== undefined,
        { message: "At least one Entity field must change" },
      ),
  })
  .strict();

export const correctionCreateRequestSchema = z
  .union([eventCorrectionRequestSchema, entityCorrectionRequestSchema])
  .superRefine(({ case: editorialCase, effectiveAt }, context) => {
    if (
      "receivedAt" in editorialCase &&
      new Date(editorialCase.receivedAt) > new Date(effectiveAt)
    ) {
      context.addIssue({
        code: "custom",
        message: "Case receivedAt must not be after effectiveAt",
        path: ["case", "receivedAt"],
      });
    }
  });

const correctionChangeSchema = z
  .object({
    field: z.string().min(1),
    previousValue: z.string(),
    correctedValue: z.string(),
  })
  .strict();
const correctionEvidenceSchema = z
  .object({
    sourceItemPublicId: publicIdSchema,
    originalTitle: z.string().min(1),
    originalUrl: httpUrlSchema,
  })
  .strict();

const publicCorrectionDetailsSchema = z
  .object({
    publicId: publicIdSchema,
    targetType: z.enum(["event", "entity"]),
    targetPublicId: publicIdSchema,
    casePublicId: publicIdSchema,
    reasonCode: z.literal("factual_error"),
    changes: z.array(correctionChangeSchema).min(1),
    evidence: z.array(correctionEvidenceSchema),
    effectiveAt: timestampSchema,
    replacementVersion: z.string().min(1),
  })
  .strict();
const publicRedactedCorrectionSchema = z
  .object({
    publicId: publicIdSchema,
    targetType: z.enum(["event", "entity"]),
    targetPublicId: publicIdSchema,
    casePublicId: publicIdSchema,
    reasonCode: z.literal("factual_error"),
    status: z.literal("redacted_due_to_rights"),
    effectiveAt: timestampSchema,
    replacementVersion: z.string().min(1),
  })
  .strict();
export const publicCorrectionSchema = z.union([
  publicCorrectionDetailsSchema,
  publicRedactedCorrectionSchema,
]);

export const correctionCreateResponseSchema = z
  .object({
    status: z.literal("corrected"),
    publicId: publicIdSchema,
    casePublicId: publicIdSchema,
    targetPublicId: publicIdSchema,
    changedFields: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const rightsDecisionCreateRequestSchema = z
  .object({
    publicId: publicIdSchema,
    case: editorialCaseReferenceSchema,
    target: z.discriminatedUnion("type", [
      z.object({ type: z.literal("event"), publicId: publicIdSchema }).strict(),
      z
        .object({ type: z.literal("entity"), publicId: publicIdSchema })
        .strict(),
      z
        .object({ type: z.literal("source_item"), publicId: publicIdSchema })
        .strict(),
    ]),
    toStatus: z.literal("withdrawn"),
    publicReasonCode: z.enum(["source_withdrawal", "rights_withdrawal"]),
    effectiveAt: timestampSchema,
    internalNote: z.string().trim().min(1),
  })
  .strict()
  .superRefine(({ target, publicReasonCode }, context) => {
    if (
      (target.type === "source_item") !==
      (publicReasonCode === "source_withdrawal")
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Source Items require source_withdrawal; Event and Entity require rights_withdrawal",
        path: ["publicReasonCode"],
      });
    }
  })
  .superRefine(({ case: editorialCase, effectiveAt }, context) => {
    if (
      "receivedAt" in editorialCase &&
      new Date(editorialCase.receivedAt) > new Date(effectiveAt)
    ) {
      context.addIssue({
        code: "custom",
        message: "Case receivedAt must not be after effectiveAt",
        path: ["case", "receivedAt"],
      });
    }
  });

export const publicRightsDecisionSchema = z
  .object({
    publicId: publicIdSchema,
    casePublicId: publicIdSchema,
    targetType: z.enum(["event", "entity", "source_item"]),
    targetPublicId: publicIdSchema,
    fromStatus: rightsStatusSchema,
    toStatus: z.literal("withdrawn"),
    reasonCode: z.enum(["source_withdrawal", "rights_withdrawal"]),
    effectiveAt: timestampSchema,
  })
  .strict();

export const rightsDecisionCreateResponseSchema = publicRightsDecisionSchema
  .extend({ status: z.literal("applied") })
  .strict();

export const entityMergeRequestSchema = z
  .object({
    targetEntityPublicId: publicIdSchema,
    sourceEntityPublicId: publicIdSchema,
    publicReasonCode: z.literal("duplicate_identity"),
    effectiveAt: timestampSchema,
    internalNote: z.string().trim().min(1),
  })
  .strict()
  .refine(
    ({ targetEntityPublicId, sourceEntityPublicId }) =>
      targetEntityPublicId !== sourceEntityPublicId,
    { message: "Source and target Entity must differ" },
  );

export const entityMergeResponseSchema = z
  .object({
    status: z.literal("merged"),
    sourceEntityPublicId: publicIdSchema,
    targetEntityPublicId: publicIdSchema,
  })
  .strict();

export const publicEntityMergedTombstoneSchema = z
  .object({
    publicId: publicIdSchema,
    objectType: z.literal("entity"),
    status: z.literal("merged_into"),
    targetEntityPublicId: publicIdSchema,
    reasonCode: z.literal("duplicate_identity"),
    effectiveAt: timestampSchema,
  })
  .strict();

export const publicWithdrawnTombstoneSchema = z
  .object({
    publicId: publicIdSchema,
    objectType: z.enum(["event", "entity"]),
    status: z.literal("withdrawn"),
    reasonCode: z.literal("rights_withdrawal"),
    effectiveAt: timestampSchema,
    caseReferencePublicId: publicIdSchema,
  })
  .strict();

export const publicSourceWithdrawnTombstoneSchema = z
  .object({
    publicId: publicIdSchema,
    objectType: z.literal("event"),
    status: z.literal("source_withdrawn"),
    reasonCode: z.literal("source_withdrawal"),
    effectiveAt: timestampSchema,
    caseReferencePublicId: publicIdSchema,
  })
  .strict();

export const editorialCaseReviewRequestSchema = z
  .object({
    case: newEditorialCaseSchema,
    kind: z.enum(["correction", "rights"]),
    priority: z.enum(["critical", "high"]),
    target: z.discriminatedUnion("type", [
      z.object({ type: z.literal("event"), publicId: publicIdSchema }).strict(),
      z
        .object({ type: z.literal("entity"), publicId: publicIdSchema })
        .strict(),
    ]),
    internalNote: z.string().trim().min(1),
  })
  .strict();

export const editorialCaseReviewResponseSchema = z
  .object({
    status: z.literal("reviewing"),
    casePublicId: publicIdSchema,
    targetType: z.enum(["event", "entity"]),
    targetPublicId: publicIdSchema,
    restrictedAt: timestampSchema,
  })
  .strict();

export const editorialCaseTransitionRequestSchema = z.discriminatedUnion(
  "transition",
  [
    z
      .object({
        transition: z.literal("reject"),
        occurredAt: timestampSchema,
        internalNote: z.string().trim().min(1),
      })
      .strict(),
    z
      .object({
        transition: z.literal("appeal"),
        occurredAt: timestampSchema,
        internalNote: z.string().trim().min(1),
      })
      .strict(),
    z
      .object({
        transition: z.literal("close"),
        occurredAt: timestampSchema,
        internalNote: z.string().trim().min(1),
      })
      .strict(),
  ],
);

export const editorialCaseTransitionResponseSchema = z
  .object({
    casePublicId: publicIdSchema,
    status: z.enum(["rejected", "appealed", "closed"]),
    targetType: z.enum(["event", "entity", "source_item"]),
    targetPublicId: publicIdSchema,
    occurredAt: timestampSchema,
  })
  .strict();

export const publicReviewingTombstoneSchema = z
  .object({
    publicId: publicIdSchema,
    objectType: z.enum(["event", "entity"]),
    status: z.literal("reviewing"),
    reasonCode: z.literal("high_risk_review"),
    effectiveAt: timestampSchema,
    caseReferencePublicId: publicIdSchema,
  })
  .strict();

export const invalidOperationRequestResponseSchema = z
  .object({
    error: z.literal("invalid_request"),
    issues: z.array(z.unknown()),
  })
  .strict();

export const operationErrorResponseSchema = z
  .object({
    error: z.enum([
      "unauthorized",
      "invalid_json",
      "not_found",
      "not_correctable",
      "not_mergeable",
      "already_exists",
    ]),
  })
  .strict();

export type CorrectionCreateRequest = z.infer<
  typeof correctionCreateRequestSchema
>;
export type EventCorrectionCreateRequest = z.infer<
  typeof eventCorrectionRequestSchema
>;
export type EntityCorrectionCreateRequest = z.infer<
  typeof entityCorrectionRequestSchema
>;
export type RightsDecisionCreateRequest = z.infer<
  typeof rightsDecisionCreateRequestSchema
>;
export type EntityMergeRequest = z.infer<typeof entityMergeRequestSchema>;
export type EditorialCaseReviewRequest = z.infer<
  typeof editorialCaseReviewRequestSchema
>;
export type EditorialCaseTransitionRequest = z.infer<
  typeof editorialCaseTransitionRequestSchema
>;
