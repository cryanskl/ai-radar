import { z } from "zod";
import {
  eventDraftRequestSchema,
  eventDraftResponseSchema,
  eventCandidatesResponseSchema,
  eventErrorResponseSchema,
  eventMergeRequestSchema,
  eventMergeResponseSchema,
  eventPublishResponseSchema,
  invalidEventRequestResponseSchema,
  publicEventListSchema,
  publicEventResponseSchema,
  eventSplitRequestSchema,
  eventSplitPreviewResponseSchema,
  eventSplitResponseSchema,
} from "@/events/contracts";
import {
  arxivSourceConfigurationResponseSchema,
  inboxEventDraftRequestSchema,
} from "@/ingestion/contracts";
import {
  aliasResolutionResponseSchema,
  entityCreateRequestSchema,
  entityCreateResponseSchema,
  entityErrorResponseSchema,
  entityTypeSchema,
  invalidEntityRequestResponseSchema,
  publicEntityResponseSchema,
  publicEntityVersionSchema,
  relationCreateRequestSchema,
  relationCreateResponseSchema,
  relationTypeSchema,
} from "@/entities/contracts";
import {
  correctionCreateRequestSchema,
  correctionCreateResponseSchema,
  editorialCaseReviewRequestSchema,
  editorialCaseReviewResponseSchema,
  editorialCaseTransitionRequestSchema,
  editorialCaseTransitionResponseSchema,
  entityMergeRequestSchema,
  entityMergeResponseSchema,
  invalidOperationRequestResponseSchema,
  operationErrorResponseSchema,
  publicCorrectionSchema,
  rightsDecisionCreateRequestSchema,
  rightsDecisionCreateResponseSchema,
} from "@/operations/contracts";
import { statusResponseSchema } from "./status";
import {
  searchErrorResponseSchema,
  searchResponseSchema,
} from "@/search/contracts";
import {
  invalidModelRequestResponseSchema,
  modelErrorResponseSchema,
  modelVersionProfileCreateRequestSchema,
  modelVersionProfileCreateResponseSchema,
  publicModelDetailSchema,
  publicModelListSchema,
  publicModelRecommendationSchema,
  publicModelVersionDetailSchema,
} from "@/models/contracts";
import {
  invalidPaperRequestResponseSchema,
  paperErrorResponseSchema,
  paperRevisionProfileCreateRequestSchema,
  paperRevisionProfileCreateResponseSchema,
  publicPaperDetailSchema,
  publicPaperListSchema,
} from "@/papers/contracts";

const statusSchema = z.toJSONSchema(statusResponseSchema);
const eventDraftRequest = z.toJSONSchema(eventDraftRequestSchema);
const eventDraftResponse = z.toJSONSchema(eventDraftResponseSchema);
const eventErrorResponse = z.toJSONSchema(eventErrorResponseSchema);
const invalidEventRequestResponse = z.toJSONSchema(
  invalidEventRequestResponseSchema,
);
const eventPublishResponse = z.toJSONSchema(eventPublishResponseSchema);
const publicEvent = z.toJSONSchema(publicEventResponseSchema);
const publicEventList = z.toJSONSchema(publicEventListSchema);
const eventCandidatesResponse = z.toJSONSchema(eventCandidatesResponseSchema);
const eventMergeRequest = z.toJSONSchema(eventMergeRequestSchema);
const eventMergeResponse = z.toJSONSchema(eventMergeResponseSchema);
const eventSplitRequest = z.toJSONSchema(eventSplitRequestSchema);
const eventSplitPreviewResponse = z.toJSONSchema(
  eventSplitPreviewResponseSchema,
);
const eventSplitResponse = z.toJSONSchema(eventSplitResponseSchema);
const arxivSourceConfigurationResponse = z.toJSONSchema(
  arxivSourceConfigurationResponseSchema,
);
const inboxEventDraftRequest = z.toJSONSchema(inboxEventDraftRequestSchema);
const entityCreateRequest = z.toJSONSchema(entityCreateRequestSchema);
const entityCreateResponse = z.toJSONSchema(entityCreateResponseSchema);
const relationCreateRequest = z.toJSONSchema(relationCreateRequestSchema);
const relationCreateResponse = z.toJSONSchema(relationCreateResponseSchema);
const publicEntity = z.toJSONSchema(publicEntityResponseSchema);
const publicEntityVersion = z.toJSONSchema(publicEntityVersionSchema);
const aliasResolutionResponse = z.toJSONSchema(aliasResolutionResponseSchema);
const entityErrorResponse = z.toJSONSchema(entityErrorResponseSchema);
const invalidEntityRequestResponse = z.toJSONSchema(
  invalidEntityRequestResponseSchema,
);
const paperRevisionProfileCreateRequest = z.toJSONSchema(
  paperRevisionProfileCreateRequestSchema,
);
const paperRevisionProfileCreateResponse = z.toJSONSchema(
  paperRevisionProfileCreateResponseSchema,
);
const publicPaperDetail = z.toJSONSchema(publicPaperDetailSchema);
const publicPaperList = z.toJSONSchema(publicPaperListSchema);
const paperErrorResponse = z.toJSONSchema(paperErrorResponseSchema);
const invalidPaperRequestResponse = z.toJSONSchema(
  invalidPaperRequestResponseSchema,
);
const entityType = z.toJSONSchema(entityTypeSchema);
const relationType = z.toJSONSchema(relationTypeSchema);
const correctionCreateRequest = z.toJSONSchema(correctionCreateRequestSchema);
const correctionCreateResponse = z.toJSONSchema(correctionCreateResponseSchema);
const editorialCaseReviewRequest = z.toJSONSchema(
  editorialCaseReviewRequestSchema,
);
const editorialCaseReviewResponse = z.toJSONSchema(
  editorialCaseReviewResponseSchema,
);
const editorialCaseTransitionRequest = z.toJSONSchema(
  editorialCaseTransitionRequestSchema,
);
const editorialCaseTransitionResponse = z.toJSONSchema(
  editorialCaseTransitionResponseSchema,
);
const rightsDecisionCreateRequest = z.toJSONSchema(
  rightsDecisionCreateRequestSchema,
);
const rightsDecisionCreateResponse = z.toJSONSchema(
  rightsDecisionCreateResponseSchema,
);
const entityMergeRequest = z.toJSONSchema(entityMergeRequestSchema);
const entityMergeResponse = z.toJSONSchema(entityMergeResponseSchema);
const publicCorrection = z.toJSONSchema(publicCorrectionSchema);
const operationErrorResponse = z.toJSONSchema(operationErrorResponseSchema);
const invalidOperationRequestResponse = z.toJSONSchema(
  invalidOperationRequestResponseSchema,
);
const searchResponse = z.toJSONSchema(searchResponseSchema);
const searchErrorResponse = z.toJSONSchema(searchErrorResponseSchema);
const modelVersionProfileCreateRequest = z.toJSONSchema(
  modelVersionProfileCreateRequestSchema,
);
const modelVersionProfileCreateResponse = z.toJSONSchema(
  modelVersionProfileCreateResponseSchema,
);
const publicModelList = z.toJSONSchema(publicModelListSchema);
const publicModelDetail = z.toJSONSchema(publicModelDetailSchema);
const publicModelVersionDetail = z.toJSONSchema(publicModelVersionDetailSchema);
const publicModelRecommendation = z.toJSONSchema(
  publicModelRecommendationSchema,
);
const modelErrorResponse = z.toJSONSchema(modelErrorResponseSchema);
const invalidModelRequestResponse = z.toJSONSchema(
  invalidModelRequestResponseSchema,
);

const localeParameter = {
  name: "locale",
  in: "query",
  required: false,
  schema: { type: "string", enum: ["en", "zh"], default: "en" },
} as const;

const eventError = (description: string) => ({
  description,
  content: { "application/json": { schema: eventErrorResponse } },
});
const entityError = (description: string) => ({
  description,
  content: { "application/json": { schema: entityErrorResponse } },
});
const operationError = (description: string) => ({
  description,
  content: { "application/json": { schema: operationErrorResponse } },
});
const modelError = (description: string) => ({
  description,
  content: { "application/json": { schema: modelErrorResponse } },
});
const paperError = (description: string) => ({
  description,
  content: { "application/json": { schema: paperErrorResponse } },
});

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "AI Radar Public API",
    version: "1.0.0-alpha.1",
    description: "Versioned, rights-aware public contracts for AI Radar.",
  },
  components: {
    securitySchemes: {
      ownerSession: {
        type: "apiKey",
        in: "cookie",
        name: "next-auth.session-token",
      },
    },
  },
  paths: {
    "/api/v1/search": {
      get: {
        summary: "Search public Events and Entities without an LLM",
        parameters: [
          {
            name: "q",
            in: "query",
            required: true,
            schema: { type: "string", minLength: 1, maxLength: 200 },
          },
          localeParameter,
          {
            name: "type",
            in: "query",
            required: false,
            schema: {
              type: "string",
              enum: [
                "all",
                "event",
                "model",
                "paper",
                "product",
                "repository",
                "prompt",
                "skill",
                "guide",
                "organization",
                "person",
                "benchmark",
                "topic",
              ],
              default: "all",
            },
          },
          {
            name: "from",
            in: "query",
            required: false,
            schema: { type: "string", format: "date-time" },
          },
          {
            name: "to",
            in: "query",
            required: false,
            schema: { type: "string", format: "date-time" },
          },
          {
            name: "topic",
            in: "query",
            required: false,
            schema: { type: "string" },
          },
          {
            name: "organization",
            in: "query",
            required: false,
            schema: { type: "string" },
          },
          {
            name: "signalLanguage",
            in: "query",
            required: false,
            description:
              "Filters source signals, not the language used to present the shared fact.",
            schema: {
              type: "string",
              enum: ["all", "en", "zh"],
              default: "all",
            },
          },
          {
            name: "sort",
            in: "query",
            required: false,
            description:
              "Uses relevance by default. Trending returns Insufficient Evidence until verified trend observations exist.",
            schema: {
              type: "string",
              enum: ["relevance", "latest", "trending"],
              default: "relevance",
            },
          },
          {
            name: "limit",
            in: "query",
            required: false,
            schema: {
              type: "integer",
              minimum: 1,
              maximum: 50,
              default: 20,
            },
          },
          {
            name: "cursor",
            in: "query",
            required: false,
            description:
              "Opaque, expiring cursor bound to an immutable result order, the query, filters and data cutoff.",
            schema: { type: "string" },
          },
        ],
        responses: {
          200: {
            description:
              "Deterministically ranked public Event and Entity results. The immutable cursor snapshot captures at most 1,000 ordered identities and reports truncation explicitly.",
            content: { "application/json": { schema: searchResponse } },
          },
          400: {
            description: "The Search query or filter is invalid.",
            content: { "application/json": { schema: searchErrorResponse } },
          },
        },
      },
    },
    "/api/v1/status": {
      get: {
        summary: "Read public application and database health",
        responses: {
          200: {
            description: "AI Radar and PostgreSQL are operational.",
            content: { "application/json": { schema: statusSchema } },
          },
          503: {
            description: "AI Radar is reachable but PostgreSQL is unavailable.",
            content: { "application/json": { schema: statusSchema } },
          },
        },
      },
    },
    "/api/v1/models": {
      get: {
        summary: "Browse public Model families and their latest exact version",
        parameters: [
          localeParameter,
          {
            name: "provider",
            in: "query",
            required: false,
            schema: { type: "string" },
          },
          {
            name: "modality",
            in: "query",
            required: false,
            schema: {
              type: "string",
              enum: ["text", "image", "audio", "video"],
            },
          },
          {
            name: "access",
            in: "query",
            required: false,
            schema: {
              type: "string",
              enum: ["hosted_api", "open_weights", "self_hosted"],
            },
          },
          {
            name: "region",
            in: "query",
            required: false,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: {
            description:
              "Public Model families with exact latest-version configuration and evidence sufficiency.",
            content: { "application/json": { schema: publicModelList } },
          },
          400: {
            description: "The Model list filters are invalid.",
            content: {
              "application/json": { schema: invalidModelRequestResponse },
            },
          },
        },
      },
    },
    "/api/v1/models/{publicId}": {
      get: {
        summary: "Read one Model family with exact version facts",
        parameters: [
          {
            name: "publicId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          localeParameter,
        ],
        responses: {
          200: {
            description:
              "The Model family, exact versions, separated Price Records, sourced Benchmark Runs, related Entities and timeline.",
            content: { "application/json": { schema: publicModelDetail } },
          },
          400: modelError("The requested locale is invalid."),
          404: modelError("The Model family is not public."),
        },
      },
    },
    "/api/v1/model-recommendations": {
      get: {
        summary:
          "Compare exact Model Versions under explicit quality, cost, latency and deployment constraints",
        parameters: [
          localeParameter,
          {
            name: "task",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "benchmarkPublicId",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "benchmarkVersion",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "scoreUnit",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "qualityThreshold",
            in: "query",
            required: true,
            schema: {
              type: "string",
              pattern: "^-?\\d{1,12}(?:\\.\\d{1,8})?$",
            },
          },
          {
            name: "qualityDirection",
            in: "query",
            required: true,
            schema: { type: "string", enum: ["at_least", "at_most"] },
          },
          {
            name: "priceCategory",
            in: "query",
            required: true,
            schema: {
              type: "string",
              enum: [
                "input_tokens",
                "output_tokens",
                "cached_input_tokens",
                "cached_output_tokens",
                "batch_input_tokens",
                "batch_output_tokens",
                "image",
                "audio",
                "video",
              ],
            },
          },
          {
            name: "priceUnit",
            in: "query",
            required: true,
            schema: {
              type: "string",
              enum: [
                "per_million_tokens",
                "per_image",
                "per_minute",
                "per_second",
              ],
            },
          },
          {
            name: "currency",
            in: "query",
            required: true,
            schema: { type: "string", pattern: "^[A-Z]{3}$" },
          },
          {
            name: "region",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "maximumUnitPrice",
            in: "query",
            required: true,
            schema: {
              type: "string",
              pattern: "^\\d{1,12}(?:\\.\\d{1,8})?$",
            },
          },
          {
            name: "deployment",
            in: "query",
            required: true,
            schema: {
              type: "string",
              enum: ["hosted_api", "open_weights", "self_hosted"],
            },
          },
          {
            name: "requireOpenWeights",
            in: "query",
            required: true,
            schema: { type: "string", enum: ["true", "false"] },
          },
          {
            name: "maximumLatencyMs",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1 },
          },
          {
            name: "latencyBenchmarkPublicId",
            in: "query",
            required: false,
            schema: { type: "string" },
          },
          {
            name: "latencyBenchmarkVersion",
            in: "query",
            required: false,
            schema: { type: "string" },
          },
          {
            name: "versions",
            in: "query",
            required: false,
            description:
              "One to four comma-separated exact Model Version public IDs.",
            schema: { type: "string" },
          },
        ],
        responses: {
          200: {
            description:
              "A bounded recommendation, Not Comparable result or Insufficient Evidence result with exact supporting records and Data Cutoff.",
            content: {
              "application/json": { schema: publicModelRecommendation },
            },
          },
          400: {
            description: "The Model recommendation constraints are invalid.",
            content: {
              "application/json": { schema: invalidModelRequestResponse },
            },
          },
        },
      },
    },
    "/api/v1/model-versions/{publicId}": {
      get: {
        summary: "Read one exact Model Version",
        parameters: [
          {
            name: "publicId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          localeParameter,
        ],
        responses: {
          200: {
            description:
              "One exact Model Version with configuration, predecessor, successor, separated prices and Benchmark evidence.",
            content: {
              "application/json": { schema: publicModelVersionDetail },
            },
          },
          400: modelError("The requested locale is invalid."),
          404: modelError("The Model Version is not public."),
        },
      },
    },
    "/api/v1/papers": {
      get: {
        summary:
          "Browse versioned public Papers without claiming academic quality",
        parameters: [
          localeParameter,
          {
            name: "view",
            in: "query",
            required: false,
            schema: {
              type: "string",
              enum: ["latest", "trending", "featured"],
              default: "latest",
            },
          },
          {
            name: "topic",
            in: "query",
            required: false,
            schema: { type: "string" },
          },
          {
            name: "author",
            in: "query",
            required: false,
            schema: { type: "string" },
          },
          {
            name: "institution",
            in: "query",
            required: false,
            schema: { type: "string" },
          },
          {
            name: "publishedFrom",
            in: "query",
            required: false,
            schema: { type: "string", format: "date-time" },
          },
          {
            name: "publishedTo",
            in: "query",
            required: false,
            schema: { type: "string", format: "date-time" },
          },
          {
            name: "hasCode",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["true", "false"] },
          },
          {
            name: "relatedModelPublicId",
            in: "query",
            required: false,
            schema: { type: "string" },
          },
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1, maximum: 50, default: 20 },
          },
          {
            name: "cursor",
            in: "query",
            required: false,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: {
            description:
              "Latest is chronological, Trending returns explicit Insufficient Evidence until attention signals qualify, and Featured is a distinct editorial view that may have no selections. Latest snapshots freeze at most 1,000 Paper cards and report truncation explicitly.",
            content: { "application/json": { schema: publicPaperList } },
          },
          400: {
            description: "The Paper list filters are invalid.",
            content: {
              "application/json": { schema: invalidPaperRequestResponse },
            },
          },
        },
      },
    },
    "/api/v1/papers/{publicId}": {
      get: {
        summary:
          "Read one Paper identity with preserved revisions, rights and bilingual guidance",
        parameters: [
          {
            name: "publicId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          localeParameter,
        ],
        responses: {
          200: {
            description:
              "A Paper profile with separate metadata and full-text rights, no packaged PDF, revision history and evidenced links.",
            content: { "application/json": { schema: publicPaperDetail } },
          },
          400: paperError("The requested locale is invalid."),
          404: paperError("The Paper family is not public."),
        },
      },
    },
    "/api/v1/admin/paper-revision-profiles": {
      post: {
        summary:
          "Attach one rights-separated arXiv revision profile to an exact Paper Version",
        security: [{ ownerSession: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: paperRevisionProfileCreateRequest },
          },
        },
        responses: {
          201: {
            description:
              "The immutable Paper revision, bilingual guidance and evidenced resources were created.",
            content: {
              "application/json": {
                schema: paperRevisionProfileCreateResponse,
              },
            },
          },
          400: {
            description:
              "The Paper revision profile or an arXiv identity reference is invalid.",
            content: {
              "application/json": {
                schema: {
                  oneOf: [paperErrorResponse, invalidPaperRequestResponse],
                },
              },
            },
          },
          401: paperError("An authenticated Owner session is required."),
          409: paperError(
            "The Paper revision profile or resource ID already exists.",
          ),
        },
      },
    },
    "/api/v1/admin/event-drafts": {
      post: {
        summary: "Create a sourced bilingual Event draft",
        security: [{ ownerSession: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: eventDraftRequest } },
        },
        responses: {
          201: {
            description:
              "Source, Source Item, Event and Localized Content were created with the derived publication state.",
            content: { "application/json": { schema: eventDraftResponse } },
          },
          400: {
            description: "The request body is invalid JSON or Event data.",
            content: {
              "application/json": {
                schema: {
                  oneOf: [eventErrorResponse, invalidEventRequestResponse],
                },
              },
            },
          },
          401: eventError("An authenticated Owner session is required."),
          409: eventError("A Source, Source Item or Event ID already exists."),
        },
      },
    },
    "/api/v1/admin/sources/arxiv": {
      post: {
        summary: "Configure the reviewed arXiv production Source policy",
        security: [{ ownerSession: [] }],
        responses: {
          201: {
            description:
              "The arXiv Source, retrieval policy, cursor and health state are configured.",
            content: {
              "application/json": {
                schema: arxivSourceConfigurationResponse,
              },
            },
          },
          401: eventError("An authenticated Owner session is required."),
        },
      },
    },
    "/api/v1/admin/entities": {
      post: {
        summary: "Create a stable bilingual Entity with Aliases and Versions",
        security: [{ ownerSession: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: entityCreateRequest } },
        },
        responses: {
          201: {
            description:
              "The Entity, Localized Content, Aliases and Entity Versions were created.",
            content: { "application/json": { schema: entityCreateResponse } },
          },
          400: {
            description: "The Entity request is invalid.",
            content: {
              "application/json": {
                schema: {
                  oneOf: [entityErrorResponse, invalidEntityRequestResponse],
                },
              },
            },
          },
          401: entityError("An authenticated Owner session is required."),
          409: entityError("An Entity, Alias or Version ID already exists."),
        },
      },
    },
    "/api/v1/admin/model-version-profiles": {
      post: {
        summary:
          "Attach configuration, Price Records and Benchmark Runs to an exact Model Version",
        security: [{ ownerSession: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: modelVersionProfileCreateRequest },
          },
        },
        responses: {
          201: {
            description:
              "The exact Model Version profile and its rights-cleared evidence records were created.",
            content: {
              "application/json": { schema: modelVersionProfileCreateResponse },
            },
          },
          400: {
            description:
              "The Model Version profile or an Evidence reference is invalid.",
            content: {
              "application/json": {
                schema: {
                  oneOf: [modelErrorResponse, invalidModelRequestResponse],
                },
              },
            },
          },
          401: modelError("An authenticated Owner session is required."),
          409: modelError(
            "The Model Version profile, Price Record or Benchmark Run already exists.",
          ),
        },
      },
    },
    "/api/v1/admin/entities/merge": {
      post: {
        summary: "Merge one stable Entity identity into another",
        security: [{ ownerSession: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: entityMergeRequest } },
        },
        responses: {
          200: {
            description:
              "Aliases, Versions, Relations and Correction projections moved to the target; the source stable ID now resolves as a Tombstone.",
            content: { "application/json": { schema: entityMergeResponse } },
          },
          400: {
            description: "The Entity merge request is invalid.",
            content: {
              "application/json": {
                schema: {
                  oneOf: [
                    operationErrorResponse,
                    invalidOperationRequestResponse,
                  ],
                },
              },
            },
          },
          401: operationError("An authenticated Owner session is required."),
          404: operationError("The source or target Entity does not exist."),
          409: operationError(
            "The Entity identities cannot be merged in their current state.",
          ),
        },
      },
    },
    "/api/v1/admin/corrections": {
      post: {
        summary: "Apply an evidenced factual Correction",
        security: [{ ownerSession: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: correctionCreateRequest } },
        },
        responses: {
          201: {
            description:
              "The current public Event or Entity was corrected and an evidenced public Correction history record was created.",
            content: {
              "application/json": { schema: correctionCreateResponse },
            },
          },
          400: {
            description: "The Correction request is invalid.",
            content: {
              "application/json": {
                schema: {
                  oneOf: [
                    operationErrorResponse,
                    invalidOperationRequestResponse,
                  ],
                },
              },
            },
          },
          401: operationError("An authenticated Owner session is required."),
          404: operationError("The Correction target does not exist."),
          409: operationError(
            "The target or Evidence cannot support this Correction.",
          ),
        },
      },
    },
    "/api/v1/admin/editorial-cases/restrict": {
      post: {
        summary: "Temporarily restrict a high-risk Event or Entity for review",
        security: [{ ownerSession: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: editorialCaseReviewRequest },
          },
        },
        responses: {
          201: {
            description:
              "The case is reviewing, protected expression is hidden and the stable public ID resolves to a review Tombstone.",
            content: {
              "application/json": { schema: editorialCaseReviewResponse },
            },
          },
          400: {
            description: "The editorial case request is invalid.",
            content: {
              "application/json": {
                schema: {
                  oneOf: [
                    operationErrorResponse,
                    invalidOperationRequestResponse,
                  ],
                },
              },
            },
          },
          401: operationError("An authenticated Owner session is required."),
          404: operationError("The review target does not exist."),
          409: operationError(
            "The target cannot enter review in its current state.",
          ),
        },
      },
    },
    "/api/v1/admin/editorial-cases/{publicId}": {
      patch: {
        summary: "Reject, appeal or close an audited editorial case",
        security: [{ ownerSession: [] }],
        parameters: [
          {
            name: "publicId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: editorialCaseTransitionRequest },
          },
        },
        responses: {
          200: {
            description:
              "The case transition was audited; rejected temporary restrictions restore the prior public record.",
            content: {
              "application/json": { schema: editorialCaseTransitionResponse },
            },
          },
          400: {
            description: "The case transition request is invalid.",
            content: {
              "application/json": {
                schema: {
                  oneOf: [
                    operationErrorResponse,
                    invalidOperationRequestResponse,
                  ],
                },
              },
            },
          },
          401: operationError("An authenticated Owner session is required."),
          404: operationError("The editorial case does not exist."),
          409: operationError(
            "The case cannot make this transition in its current state.",
          ),
        },
      },
    },
    "/api/v1/admin/rights-decisions": {
      post: {
        summary: "Apply an audited Rights withdrawal decision",
        security: [{ ownerSession: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: rightsDecisionCreateRequest },
          },
        },
        responses: {
          201: {
            description:
              "Restricted expression was removed from public projections and the durable Rights decision or Tombstone was recorded.",
            content: {
              "application/json": { schema: rightsDecisionCreateResponse },
            },
          },
          400: {
            description: "The Rights decision request is invalid.",
            content: {
              "application/json": {
                schema: {
                  oneOf: [
                    operationErrorResponse,
                    invalidOperationRequestResponse,
                  ],
                },
              },
            },
          },
          401: operationError("An authenticated Owner session is required."),
          404: operationError("The Rights decision target does not exist."),
          409: operationError(
            "The target cannot receive this Rights decision in its current state.",
          ),
        },
      },
    },
    "/api/v1/admin/relations": {
      post: {
        summary: "Create a directed, reviewed and evidenced Relation",
        security: [{ ownerSession: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: relationCreateRequest } },
        },
        responses: {
          201: {
            description:
              "The directed Relation and Evidence links were created.",
            content: { "application/json": { schema: relationCreateResponse } },
          },
          400: {
            description:
              "The Relation request, vocabulary pairing, or required public Evidence is invalid.",
            content: {
              "application/json": {
                schema: {
                  oneOf: [entityErrorResponse, invalidEntityRequestResponse],
                },
              },
            },
          },
          401: entityError("An authenticated Owner session is required."),
          404: entityError("The Relation subject or object was not found."),
          409: entityError("The Relation ID already exists."),
        },
      },
    },
    "/api/v1/admin/inbox/{sourceItemPublicId}/event-draft": {
      post: {
        summary: "Convert one ingested Source Item into an Event draft",
        security: [{ ownerSession: [] }],
        parameters: [
          {
            name: "sourceItemPublicId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: inboxEventDraftRequest } },
        },
        responses: {
          201: {
            description:
              "The Inbox candidate was linked to a bilingual Event draft.",
            content: { "application/json": { schema: eventDraftResponse } },
          },
          400: {
            description: "The request body is invalid JSON or Event data.",
            content: {
              "application/json": {
                schema: {
                  oneOf: [eventErrorResponse, invalidEventRequestResponse],
                },
              },
            },
          },
          401: eventError("An authenticated Owner session is required."),
          404: eventError("The Source Item is not in the Inbox."),
          409: eventError("The Source Item or Event was already converted."),
        },
      },
    },
    "/api/v1/admin/events/{publicId}/candidates": {
      get: {
        summary: "Retrieve evidenced clustering candidates for one Event",
        security: [{ ownerSession: [] }],
        parameters: [
          {
            name: "publicId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: {
            description:
              "Candidates derived from verified identifiers, canonical URLs, time proximity and shared Entities.",
            content: {
              "application/json": { schema: eventCandidatesResponse },
            },
          },
          401: eventError("An authenticated Owner session is required."),
          404: eventError("The Event does not exist."),
        },
      },
    },
    "/api/v1/admin/events/merge": {
      post: {
        summary: "Merge one reviewed Event into another",
        security: [{ ownerSession: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: eventMergeRequest } },
        },
        responses: {
          200: {
            description:
              "Sources and Relations moved to the target; the source ID now resolves as a Tombstone.",
            content: { "application/json": { schema: eventMergeResponse } },
          },
          400: {
            description: "The merge request is invalid JSON or Event data.",
            content: {
              "application/json": {
                schema: {
                  oneOf: [eventErrorResponse, invalidEventRequestResponse],
                },
              },
            },
          },
          401: eventError("An authenticated Owner session is required."),
          404: eventError("The source or target Event does not exist."),
          409: eventError(
            "The Events cannot be merged in their current state.",
          ),
        },
      },
    },
    "/api/v1/admin/events/split": {
      post: {
        summary: "Split a previously merged Event back out",
        security: [{ ownerSession: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: eventSplitRequest } },
        },
        responses: {
          200: {
            description:
              "The original Sources and Relations were restored to the merged Event identity.",
            content: { "application/json": { schema: eventSplitResponse } },
          },
          400: {
            description: "The split request is invalid JSON or Event data.",
            content: {
              "application/json": {
                schema: {
                  oneOf: [eventErrorResponse, invalidEventRequestResponse],
                },
              },
            },
          },
          401: eventError("An authenticated Owner session is required."),
          404: eventError("The merged Event does not exist."),
          409: eventError("The Event does not have an active merge to split."),
        },
      },
    },
    "/api/v1/admin/events/{publicId}/split-preview": {
      get: {
        summary: "Preview the impact of splitting a merged Event",
        security: [{ ownerSession: [] }],
        parameters: [
          {
            name: "publicId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: {
            description:
              "Sources, Relations, localizations, representatives and Tombstone state that the split will restore.",
            content: {
              "application/json": { schema: eventSplitPreviewResponse },
            },
          },
          401: eventError("An authenticated Owner session is required."),
          404: eventError("The merged Event does not exist."),
          409: eventError(
            "The Event does not have an active merge to preview.",
          ),
        },
      },
    },
    "/api/v1/admin/events/{publicId}/publish": {
      post: {
        summary: "Publish a reviewed, rights-cleared bilingual Event",
        security: [{ ownerSession: [] }],
        parameters: [
          {
            name: "publicId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: {
            description: "The Event and its public projection are published.",
            content: { "application/json": { schema: eventPublishResponse } },
          },
          401: eventError("An authenticated Owner session is required."),
          404: eventError("The Event does not exist."),
          409: eventError(
            "The Event has incomplete review or non-public rights.",
          ),
        },
      },
    },
    "/api/v1/events": {
      get: {
        summary: "List published Event records for Radar",
        parameters: [localeParameter],
        responses: {
          200: {
            description: "Published Events in occurrence-time order.",
            content: { "application/json": { schema: publicEventList } },
          },
          400: eventError("The requested locale is invalid."),
        },
      },
    },
    "/api/v1/events/{publicId}": {
      get: {
        summary: "Read one published Event with rights-safe provenance",
        parameters: [
          {
            name: "publicId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          localeParameter,
        ],
        responses: {
          200: {
            description: "One published Event using the selected localization.",
            content: { "application/json": { schema: publicEvent } },
          },
          400: eventError("The requested locale is invalid."),
          404: eventError("The Event is not published."),
        },
      },
    },
    "/api/v1/corrections/{publicId}": {
      get: {
        summary: "Read one evidenced public Correction history record",
        parameters: [
          {
            name: "publicId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: {
            description:
              "The changed fields, public Evidence, effective time and replacement version for one Correction.",
            content: { "application/json": { schema: publicCorrection } },
          },
          404: operationError("The Correction does not exist."),
        },
      },
    },
    "/api/v1/entities/resolve": {
      get: {
        summary: "Resolve an exact reviewed bilingual or historical Alias",
        parameters: [
          {
            name: "alias",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
          localeParameter,
          {
            name: "type",
            in: "query",
            required: false,
            schema: entityType,
          },
        ],
        responses: {
          200: {
            description: "The exact Alias resolved to one public Entity.",
            content: {
              "application/json": { schema: aliasResolutionResponse },
            },
          },
          400: entityError("The requested locale or Entity type is invalid."),
          404: entityError("The Alias does not resolve to a public Entity."),
          409: entityError("The Alias is ambiguous without an Entity type."),
        },
      },
    },
    "/api/v1/entities/{publicId}": {
      get: {
        summary: "Read a bilingual Entity graph projection",
        parameters: [
          {
            name: "publicId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          localeParameter,
          {
            name: "predicate",
            in: "query",
            required: false,
            schema: relationType,
          },
        ],
        responses: {
          200: {
            description:
              "The Entity, Versions, Aliases, Relations, Backlinks, timeline and bounded one-hop graph.",
            content: { "application/json": { schema: publicEntity } },
          },
          400: entityError(
            "The requested locale or Relation predicate is invalid.",
          ),
          404: entityError("The Entity is not public."),
        },
      },
    },
    "/api/v1/entity-versions/{publicId}": {
      get: {
        summary: "Read one stable Entity Version identity",
        parameters: [
          {
            name: "publicId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          localeParameter,
        ],
        responses: {
          200: {
            description: "One Entity Version and its parent Entity identity.",
            content: { "application/json": { schema: publicEntityVersion } },
          },
          400: entityError("The requested locale is invalid."),
          404: entityError("The Entity Version is not public."),
        },
      },
    },
  },
} as const;
