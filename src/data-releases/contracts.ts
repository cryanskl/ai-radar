import { z } from "zod";

const publicIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const timestampSchema = z.iso.datetime({ offset: true });
const checksumSchema = z.string().regex(/^[a-f0-9]{64}$/);
const githubReleaseUrlSchema = z
  .url()
  .regex(
    /^https:\/\/github\.com\/cryanskl\/ai-radar\/releases\/tag\/[A-Za-z0-9._-]+$/,
  );

export const dataReleaseCreateRequestSchema = z
  .object({
    publicId: publicIdSchema,
    dataVersion: z.string().regex(/^public-[a-z0-9]+(?:-[a-z0-9]+)*$/),
    dataCutoff: timestampSchema,
    canonicalUrl: githubReleaseUrlSchema,
    license: z.string().min(1).max(100),
    attribution: z.string().min(1).max(500),
  })
  .strict();

export const dataReleaseValidationIssueSchema = z
  .object({
    code: z.enum([
      "rights_not_exportable",
      "missing_provenance",
      "missing_localization",
      "record_after_data_cutoff",
      "public_schema_violation",
      "privacy_violation",
    ]),
    recordType: z.enum(["event", "correction", "release"]),
    publicId: publicIdSchema,
  })
  .strict();

export const dataReleaseFileSchema = z
  .object({
    name: z.enum([
      "schema.json",
      "records.json",
      "corrections.json",
      "tombstones.json",
      "manifest.json",
    ]),
    mediaType: z.literal("application/json"),
    byteSize: z.number().int().nonnegative(),
    recordCount: z.number().int().nonnegative().nullable(),
    checksumSha256: checksumSchema,
    downloadUrl: z.string().startsWith("/api/v1/releases/"),
  })
  .strict();

export const dataReleaseMirrorSchema = z
  .object({
    status: z.literal("verified"),
    provider: z.enum(["feishu", "baidu"]),
    url: z.url().regex(/^https:\/\//),
    verifiedAt: timestampSchema,
  })
  .strict();

export const dataReleaseMirrorRequestSchema = z
  .object({
    provider: z.enum(["feishu", "baidu"]),
    url: z.url().regex(/^https:\/\//),
    files: z
      .array(
        z
          .object({
            name: dataReleaseFileSchema.shape.name,
            url: z.url().regex(/^https:\/\//),
          })
          .strict(),
      )
      .length(5),
  })
  .strict()
  .superRefine((value, context) => {
    const matchesProvider = (url: string) => {
      const hostname = new URL(url).hostname;
      return value.provider === "feishu"
        ? hostname === "feishu.cn" || hostname.endsWith(".feishu.cn")
        : hostname === "baidu.com" || hostname.endsWith(".baidu.com");
    };
    if (!matchesProvider(value.url)) {
      context.addIssue({
        code: "custom",
        path: ["url"],
        message: "Mirror URL does not match the declared provider",
      });
    }
    value.files.forEach((file, index) => {
      if (!matchesProvider(file.url)) {
        context.addIssue({
          code: "custom",
          path: ["files", index, "url"],
          message: "Mirror file URL does not match the declared provider",
        });
      }
    });
    const manifest = value.files.find(({ name }) => name === "manifest.json");
    if (manifest && value.url !== manifest.url) {
      context.addIssue({
        code: "custom",
        path: ["url"],
        message: "Mirror URL must be the verified manifest.json URL",
      });
    }
  });

export const generatedDataReleaseSchema = z
  .object({
    status: z.literal("generated"),
    publicId: publicIdSchema,
    dataVersion: z.string().regex(/^public-[a-z0-9]+(?:-[a-z0-9]+)*$/),
    schemaVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    dataCutoff: timestampSchema,
    generatedAt: timestampSchema,
    canonicalUrl: githubReleaseUrlSchema,
    checksumSha256: checksumSchema,
    license: z.string().min(1),
    attribution: z.string().min(1),
    files: z.array(dataReleaseFileSchema).length(5),
  })
  .strict();

export const dataReleasePublishResponseSchema = z
  .object({
    status: z.literal("published"),
    publicId: publicIdSchema,
    publishedAt: timestampSchema,
  })
  .strict();

export const publicDataReleaseDetailSchema = z
  .object({
    publicId: publicIdSchema,
    dataVersion: z.string().regex(/^public-[a-z0-9]+(?:-[a-z0-9]+)*$/),
    schemaVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    dataCutoff: timestampSchema,
    publishedAt: timestampSchema,
    canonicalUrl: githubReleaseUrlSchema,
    checksumSha256: checksumSchema,
    license: z.string().min(1),
    attribution: z.string().min(1),
    lastVerifiedAt: timestampSchema,
    files: z.array(dataReleaseFileSchema).length(5),
    mirror: dataReleaseMirrorSchema.nullable(),
  })
  .strict();

export const dataReleaseMirrorResponseSchema = dataReleaseMirrorSchema;
