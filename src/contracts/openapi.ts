import { z } from "zod";
import {
  eventDraftRequestSchema,
  eventDraftResponseSchema,
  eventErrorResponseSchema,
  eventPublishResponseSchema,
  invalidEventRequestResponseSchema,
  publicEventListSchema,
  publicEventSchema,
} from "@/events/contracts";
import { statusResponseSchema } from "./status";

const statusSchema = z.toJSONSchema(statusResponseSchema);
const eventDraftRequest = z.toJSONSchema(eventDraftRequestSchema);
const eventDraftResponse = z.toJSONSchema(eventDraftResponseSchema);
const eventErrorResponse = z.toJSONSchema(eventErrorResponseSchema);
const invalidEventRequestResponse = z.toJSONSchema(
  invalidEventRequestResponseSchema,
);
const eventPublishResponse = z.toJSONSchema(eventPublishResponseSchema);
const publicEvent = z.toJSONSchema(publicEventSchema);
const publicEventList = z.toJSONSchema(publicEventListSchema);

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
  },
} as const;
