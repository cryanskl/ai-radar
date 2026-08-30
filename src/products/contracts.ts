import { z } from "zod";
import { entityTypeSchema } from "@/entities/contracts";
import { localeSchema } from "@/events/contracts";

const publicIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const timestampSchema = z.iso.datetime({ offset: true });
const decimalSchema = z.string().regex(/^\d{1,20}(?:\.\d{1,4})?$/);
const dimensionSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/);

export const productLifecycleStatusSchema = z.enum([
  "beta",
  "active",
  "deprecated",
  "discontinued",
]);
export const productPricingModeSchema = z.enum([
  "free",
  "freemium",
  "subscription",
  "usage_based",
  "contact_sales",
  "open_source",
]);
export const productChangeKindSchema = z.enum([
  "launch",
  "product_update",
  "pricing_change",
  "availability_change",
]);
export const productCommercialRelationshipSchema = z.enum([
  "none_disclosed",
  "vendor_submitted",
  "affiliate",
  "sponsored",
]);
export const productVendorMetricSchema = z.enum([
  "users",
  "revenue",
  "adoption",
  "downloads",
]);

const vendorReportedMetricInputSchema = z
  .object({
    publicId: publicIdSchema,
    metric: productVendorMetricSchema,
    value: decimalSchema,
    unit: dimensionSchema,
    periodEndedAt: timestampSchema,
  })
  .strict();

const productObservationInputSchema = z
  .object({
    publicId: publicIdSchema,
    sourceItemPublicId: publicIdSchema,
    effectiveAt: timestampSchema,
    observedAt: timestampSchema,
    changeKind: productChangeKindSchema,
    lifecycleStatus: productLifecycleStatusSchema,
    availabilityRegions: z.array(z.string().trim().min(1)).min(1),
    pricingMode: productPricingModeSchema,
    commercialRelationship: productCommercialRelationshipSchema,
    commercialDisclosure: z.string().trim().min(1).nullable(),
    vendorReportedMetrics: z.array(vendorReportedMetricInputSchema),
  })
  .strict()
  .superRefine(({ commercialDisclosure, commercialRelationship }, context) => {
    if (
      commercialRelationship !== "none_disclosed" &&
      commercialDisclosure === null
    ) {
      context.addIssue({
        code: "custom",
        path: ["commercialDisclosure"],
        message: "commercial relationships require a disclosure",
      });
    }
    if (
      commercialRelationship === "none_disclosed" &&
      commercialDisclosure !== null
    ) {
      context.addIssue({
        code: "custom",
        path: ["commercialDisclosure"],
        message: "none_disclosed cannot include disclosure text",
      });
    }
  });

export const productProfileCreateRequestSchema = z
  .object({
    productPublicId: publicIdSchema,
    category: dimensionSchema,
    platforms: z.array(dimensionSchema).min(1),
    audienceTypes: z.array(dimensionSchema).min(1),
    observations: z.array(productObservationInputSchema).min(1),
  })
  .strict();

export const productProfileCreateResponseSchema = z
  .object({
    productPublicId: publicIdSchema,
    publicVisibility: z.boolean(),
    observationPublicIds: z.array(publicIdSchema).min(1),
  })
  .strict();

export const productObservationAppendRequestSchema = z
  .object({
    productPublicId: publicIdSchema,
    observations: z.array(productObservationInputSchema).min(1),
  })
  .strict();

export const productObservationAppendResponseSchema = z
  .object({
    productPublicId: publicIdSchema,
    publicVisibility: z.boolean(),
    observationPublicIds: z.array(publicIdSchema).min(1),
  })
  .strict();

export const productListRequestSchema = z
  .object({
    locale: localeSchema.default("en"),
    category: dimensionSchema.optional(),
    platform: dimensionSchema.optional(),
    audience: dimensionSchema.optional(),
    region: z.string().trim().min(1).optional(),
    pricingMode: productPricingModeSchema.optional(),
    lifecycle: productLifecycleStatusSchema.optional(),
    updatedFrom: timestampSchema.optional(),
    updatedTo: timestampSchema.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().min(1).max(4096).optional(),
  })
  .strict()
  .refine(
    ({ updatedFrom, updatedTo }) =>
      !updatedFrom ||
      !updatedTo ||
      Date.parse(updatedFrom) <= Date.parse(updatedTo),
    {
      path: ["updatedTo"],
      message: "updatedTo must not be before updatedFrom",
    },
  );

const sourceEvidenceSchema = z
  .object({
    sourceItemPublicId: publicIdSchema,
    title: z.string().min(1),
    url: z.url(),
  })
  .strict();

const vendorReportedMetricSchema = z
  .object({
    publicId: publicIdSchema,
    metric: productVendorMetricSchema,
    value: decimalSchema,
    unit: z.string().min(1),
    periodEndedAt: timestampSchema,
    provenance: z.literal("vendor_self_reported"),
  })
  .strict();

const publicProductObservationSchema = z
  .object({
    publicId: publicIdSchema,
    effectiveAt: timestampSchema,
    observedAt: timestampSchema,
    changeKind: productChangeKindSchema,
    lifecycleStatus: productLifecycleStatusSchema,
    availabilityRegions: z.array(z.string().min(1)).min(1),
    pricingMode: productPricingModeSchema,
    commercialRelationship: productCommercialRelationshipSchema,
    commercialDisclosure: z.string().min(1).nullable(),
    vendorReportedMetrics: z.array(vendorReportedMetricSchema),
    source: sourceEvidenceSchema,
  })
  .strict();

const productOrganizationSchema = z
  .object({
    relationPublicId: publicIdSchema,
    publicId: publicIdSchema,
    name: z.string().min(1),
  })
  .strict();

export const publicProductListItemSchema = z
  .object({
    publicId: publicIdSchema,
    name: z.string().min(1),
    summary: z.string().min(1),
    officialUrl: z.url(),
    category: dimensionSchema,
    platforms: z.array(dimensionSchema).min(1),
    audienceTypes: z.array(dimensionSchema).min(1),
    organization: productOrganizationSchema,
    current: publicProductObservationSchema,
  })
  .strict();

export const publicProductListSchema = z
  .object({
    locale: localeSchema,
    methodology: z
      .object({
        publicId: z.literal("product-latest-observation"),
        version: z.literal("1.0.0"),
        kind: z.literal("chronological_update"),
        limitation: z.string().min(1),
      })
      .strict(),
    items: z.array(publicProductListItemSchema),
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

export const productListCursorSchema = z
  .object({
    version: z.literal(1),
    requestKey: z.string().min(1),
    dataCutoff: timestampSchema,
    snapshotId: z.uuid(),
    offset: z.number().int().positive(),
  })
  .strict();

const relatedEntitySchema = z
  .object({
    relationPublicId: publicIdSchema,
    publicId: publicIdSchema,
    name: z.string().min(1),
    type: entityTypeSchema,
    predicate: z.string().min(1),
    direction: z.enum(["outgoing", "incoming", "via_event"]),
    viaEventPublicId: publicIdSchema.nullable(),
  })
  .strict();

const productTimelineEntrySchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("product_observation"),
      observationPublicId: publicIdSchema,
      occurredAt: timestampSchema,
      observedAt: timestampSchema,
      changeKind: productChangeKindSchema,
      lifecycleStatus: productLifecycleStatusSchema,
      availabilityRegions: z.array(z.string().min(1)).min(1),
      pricingMode: productPricingModeSchema,
      commercialRelationship: productCommercialRelationshipSchema,
      commercialDisclosure: z.string().min(1).nullable(),
      vendorReportedMetrics: z.array(vendorReportedMetricSchema),
      title: z.string().min(1),
      source: sourceEvidenceSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("event"),
      eventPublicId: publicIdSchema,
      occurredAt: timestampSchema,
      predicate: z.string().min(1),
      title: z.string().min(1),
    })
    .strict(),
]);

export const publicProductDetailSchema = z
  .object({
    publicId: publicIdSchema,
    name: z.string().min(1),
    summary: z.string().min(1),
    officialUrl: z.url(),
    category: dimensionSchema,
    platforms: z.array(dimensionSchema).min(1),
    audienceTypes: z.array(dimensionSchema).min(1),
    organization: productOrganizationSchema,
    current: publicProductObservationSchema,
    observations: z.array(publicProductObservationSchema).min(1),
    relatedEntities: z.array(relatedEntitySchema),
    timeline: z.array(productTimelineEntrySchema),
    lastVerifiedAt: timestampSchema,
    dataCutoff: timestampSchema,
  })
  .strict();

export const productErrorResponseSchema = z
  .object({
    error: z.enum([
      "unauthorized",
      "invalid_json",
      "invalid_reference",
      "already_exists",
      "not_found",
      "invalid_locale",
    ]),
  })
  .strict();

export const invalidProductRequestResponseSchema = z
  .object({ error: z.literal("invalid_request"), issues: z.array(z.unknown()) })
  .strict();

export type ProductProfileCreateRequest = z.infer<
  typeof productProfileCreateRequestSchema
>;
export type ProductObservationAppendRequest = z.infer<
  typeof productObservationAppendRequestSchema
>;
export type ProductListRequest = z.infer<typeof productListRequestSchema>;
export type ProductListCursor = z.infer<typeof productListCursorSchema>;
export type PublicProductDetail = z.infer<typeof publicProductDetailSchema>;
export type PublicProductListItem = z.infer<typeof publicProductListItemSchema>;
