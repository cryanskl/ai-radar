import { z } from "zod";
import { localeSchema, publicRightsStatusSchema } from "@/events/contracts";

const publicIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const timestampSchema = z.iso.datetime({ offset: true });
const httpUrlSchema = z.url().regex(/^https?:\/\//);

const authorSchema = z
  .object({ name: z.string().trim().min(1), url: httpUrlSchema.nullable() })
  .strict();
const licenseSchema = z
  .object({ name: z.string().trim().min(1), url: httpUrlSchema })
  .strict();
const dependencySchema = z
  .object({
    name: z.string().trim().min(1),
    versionConstraint: z.string().trim().min(1),
    required: z.boolean(),
  })
  .strict();
const permissionSchema = z
  .object({
    name: z.string().trim().min(1),
    required: z.boolean(),
  })
  .strict();
const externalApiSchema = z
  .object({
    name: z.string().trim().min(1),
    apiKeyRequired: z.boolean(),
  })
  .strict();
const installationMethodSchema = z.enum([
  "manual",
  "package_manager",
  "marketplace",
  "repository",
]);
const maintenanceStatusSchema = z.enum([
  "maintained",
  "limited",
  "unmaintained",
  "archived",
]);
const securityReviewStatusSchema = z.enum([
  "not_reviewed",
  "metadata_reviewed",
  "manual_reviewed",
  "issues_found",
]);
const securityReviewInputSchema = z
  .object({
    status: securityReviewStatusSchema,
    checksPerformed: z.array(z.string().trim().min(1)),
    reviewedAt: timestampSchema.nullable(),
  })
  .strict()
  .refine(
    ({ status, checksPerformed, reviewedAt }) =>
      status === "not_reviewed"
        ? checksPerformed.length === 0 && reviewedAt === null
        : checksPerformed.length > 0 && reviewedAt !== null,
    {
      message:
        "Reviewed security states require performed checks and a review time",
    },
  );

const skillVersionLocalizationSchema = z
  .object({
    locale: localeSchema,
    permissionReasons: z.array(
      z
        .object({
          name: z.string().trim().min(1),
          reason: z.string().trim().min(1),
        })
        .strict(),
    ),
    externalApiPurposes: z.array(
      z
        .object({
          name: z.string().trim().min(1),
          purpose: z.string().trim().min(1),
        })
        .strict(),
    ),
    securityCheckDescriptions: z.array(
      z
        .object({
          check: z.string().trim().min(1),
          description: z.string().trim().min(1),
        })
        .strict(),
    ),
    authorship: z.enum([
      "human_authored",
      "ai_translated",
      "official_translation",
    ]),
    reviewStatus: z.literal("reviewed"),
  })
  .strict();

const hasSameNames = (actual: string[], expected: string[]) =>
  actual.length === new Set(actual).size &&
  actual.length === expected.length &&
  actual.every((name) => expected.includes(name));

const skillVersionInputSchema = z
  .object({
    entityVersionPublicId: publicIdSchema,
    sourceItemPublicId: publicIdSchema,
    author: authorSchema,
    documentation: z
      .object({
        rightsStatus: publicRightsStatusSchema,
        license: licenseSchema,
      })
      .strict(),
    repository: z
      .object({
        rightsStatus: publicRightsStatusSchema,
        license: licenseSchema,
      })
      .strict(),
    supportedPlatforms: z.array(z.string().trim().min(1)).min(1),
    dependencies: z.array(dependencySchema),
    permissions: z.array(permissionSchema),
    externalApis: z.array(externalApiSchema),
    installationMethod: installationMethodSchema,
    maintenanceStatus: maintenanceStatusSchema,
    securityReview: securityReviewInputSchema,
    localizations: z
      .array(skillVersionLocalizationSchema)
      .length(2)
      .refine(
        (localizations) =>
          new Set(localizations.map(({ locale }) => locale)).size === 2 &&
          localizations.some(({ locale }) => locale === "en") &&
          localizations.some(({ locale }) => locale === "zh"),
        { message: "Each Skill version requires reviewed en and zh content" },
      ),
  })
  .strict()
  .superRefine((version, context) => {
    const permissionNames = version.permissions.map(({ name }) => name);
    const externalApiNames = version.externalApis.map(({ name }) => name);
    const securityChecks = version.securityReview.checksPerformed;
    version.localizations.forEach((localization, index) => {
      if (
        !hasSameNames(
          localization.permissionReasons.map(({ name }) => name),
          permissionNames,
        )
      ) {
        context.addIssue({
          code: "custom",
          path: ["localizations", index, "permissionReasons"],
          message: "Localized permission reasons must match permission names",
        });
      }
      if (
        !hasSameNames(
          localization.externalApiPurposes.map(({ name }) => name),
          externalApiNames,
        )
      ) {
        context.addIssue({
          code: "custom",
          path: ["localizations", index, "externalApiPurposes"],
          message: "Localized API purposes must match external API names",
        });
      }
      if (
        !hasSameNames(
          localization.securityCheckDescriptions.map(({ check }) => check),
          securityChecks,
        )
      ) {
        context.addIssue({
          code: "custom",
          path: ["localizations", index, "securityCheckDescriptions"],
          message: "Localized security descriptions must match check IDs",
        });
      }
    });
  });

export const skillProfileCreateRequestSchema = z
  .object({
    skillPublicId: publicIdSchema,
    sourceItemPublicId: publicIdSchema,
    author: authorSchema,
    task: z.string().trim().min(1),
    rightsStatus: publicRightsStatusSchema,
    officialInstallationUrl: httpUrlSchema,
    versions: z
      .array(skillVersionInputSchema)
      .min(1)
      .refine(
        (versions) =>
          new Set(
            versions.map(({ entityVersionPublicId }) => entityVersionPublicId),
          ).size === versions.length,
        { message: "Each Skill version can be described only once" },
      ),
  })
  .strict();

export const skillProfileCreateResponseSchema = z
  .object({
    status: z.literal("created"),
    skillPublicId: publicIdSchema,
    publicVisibility: z.literal(true),
    versionPublicIds: z.array(publicIdSchema).min(1),
  })
  .strict();

export const skillListRequestSchema = z
  .object({
    locale: localeSchema.default("en"),
    platform: z.string().trim().min(1).optional(),
    permission: z.string().trim().min(1).optional(),
    task: z.string().trim().min(1).optional(),
    installationMethod: installationMethodSchema.optional(),
    license: z.string().trim().min(1).optional(),
    rightsStatus: publicRightsStatusSchema.optional(),
  })
  .strict();

const publicSecurityReviewSchema = z
  .object({
    status: securityReviewStatusSchema,
    checksPerformed: z.array(
      z
        .object({
          id: z.string().min(1),
          description: z.string().min(1),
        })
        .strict(),
    ),
    reviewedAt: timestampSchema.nullable(),
    limitation: z.string().min(1),
  })
  .strict();

const publicSkillVersionSchema = z
  .object({
    versionPublicId: publicIdSchema,
    version: z.string().min(1),
    releasedAt: timestampSchema.nullable(),
    author: authorSchema,
    documentation: z
      .object({
        rightsStatus: publicRightsStatusSchema,
        license: licenseSchema,
      })
      .strict(),
    repository: z
      .object({
        rightsStatus: publicRightsStatusSchema,
        license: licenseSchema,
      })
      .strict(),
    supportedPlatforms: z.array(z.string().min(1)).min(1),
    dependencies: z.array(dependencySchema),
    permissions: z.array(
      permissionSchema.extend({ reason: z.string().min(1) }).strict(),
    ),
    externalApis: z.array(
      externalApiSchema.extend({ purpose: z.string().min(1) }).strict(),
    ),
    installationMethod: installationMethodSchema,
    maintenanceStatus: maintenanceStatusSchema,
    securityReview: publicSecurityReviewSchema,
    localization: z
      .object({
        locale: localeSchema,
        authorship: z.enum([
          "human_authored",
          "ai_translated",
          "official_translation",
        ]),
        reviewStatus: z.literal("reviewed"),
        lastLocalizedAt: timestampSchema,
      })
      .strict(),
    source: z
      .object({
        sourceItemPublicId: publicIdSchema,
        title: z.string().min(1),
        url: httpUrlSchema,
        attribution: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export const publicSkillListItemSchema = z
  .object({
    publicId: publicIdSchema,
    name: z.string().min(1),
    summary: z.string().min(1),
    author: authorSchema,
    task: z.string().min(1),
    rightsStatus: publicRightsStatusSchema,
    lastVerifiedAt: timestampSchema,
    currentVersion: publicSkillVersionSchema,
  })
  .strict();

export const publicSkillListSchema = z
  .object({
    locale: localeSchema,
    methodology: z
      .object({
        publicId: z.literal("skill-permission-aware-discovery"),
        version: z.literal("1.0.0"),
        kind: z.literal("filtered_discovery"),
        limitation: z.string().min(1),
      })
      .strict(),
    items: z.array(publicSkillListItemSchema),
    dataCutoff: timestampSchema.nullable(),
  })
  .strict();

const publicSkillRelationSchema = z
  .object({
    publicId: publicIdSchema,
    predicate: z.literal("SUPPORTS"),
    direction: z.literal("outgoing"),
    target: z
      .object({
        publicId: publicIdSchema,
        type: z.literal("product"),
        name: z.string().min(1),
      })
      .strict(),
    evidence: z
      .array(
        z
          .object({
            sourceItemPublicId: publicIdSchema,
            title: z.string().min(1),
            url: httpUrlSchema,
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export const publicSkillDetailSchema = z
  .object({
    publicId: publicIdSchema,
    name: z.string().min(1),
    summary: z.string().min(1),
    officialUrl: httpUrlSchema,
    author: authorSchema,
    task: z.string().min(1),
    rightsStatus: publicRightsStatusSchema,
    officialInstallationUrl: httpUrlSchema,
    installationAction: z.literal("external_link_only"),
    apiKeyCollection: z.literal("never"),
    lastVerifiedAt: timestampSchema,
    source: z
      .object({
        sourceItemPublicId: publicIdSchema,
        title: z.string().min(1),
        url: httpUrlSchema,
        attribution: z.string().min(1),
      })
      .strict(),
    versions: z.array(publicSkillVersionSchema).min(1),
    relations: z.array(publicSkillRelationSchema).min(1),
  })
  .strict();

export const skillErrorResponseSchema = z
  .object({
    error: z.enum([
      "unauthorized",
      "invalid_json",
      "invalid_reference",
      "not_found",
      "already_exists",
    ]),
  })
  .strict();

export const invalidSkillRequestResponseSchema = z
  .object({
    error: z.literal("invalid_request"),
    issues: z.array(z.unknown()).min(1),
  })
  .strict();

export type SkillProfileCreateRequest = z.infer<
  typeof skillProfileCreateRequestSchema
>;
export type SkillListRequest = z.infer<typeof skillListRequestSchema>;
export type PublicSkillVersion = z.infer<typeof publicSkillVersionSchema>;
