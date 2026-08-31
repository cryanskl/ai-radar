import { getPublicApiEnv } from "@/config/server-env";
import {
  publicApiErrorResponseSchema,
  publicApiPaginationRequestSchema,
} from "./contracts";
import { decodePublicCursor, publicCursorRequestKey } from "./cursor";

export const emptyPublicCollection = () => ({
  dataVersion: getPublicApiEnv().PUBLIC_DATA_VERSION,
  items: [],
  nextCursor: null,
});

export const invalidPublicApiRequest = (
  error: "invalid_request" | "invalid_cursor",
  message: string,
) =>
  Response.json(publicApiErrorResponseSchema.parse({ error, message }), {
    status: 400,
  });

export const publicApiNotFound = (message: string) =>
  Response.json(
    publicApiErrorResponseSchema.parse({ error: "not_found", message }),
    { status: 404 },
  );

export const readPublicPageRequest = (
  request: Request,
  resource: string,
  filters: Record<string, unknown>,
) => {
  const parameters = new URL(request.url).searchParams;
  const pagination = publicApiPaginationRequestSchema.safeParse({
    limit: parameters.get("limit") ?? 20,
    cursor: parameters.get("cursor") ?? undefined,
  });
  if (!pagination.success) {
    return {
      success: false as const,
      response: invalidPublicApiRequest(
        "invalid_request",
        "Public API pagination is invalid",
      ),
    };
  }
  const requestKey = publicCursorRequestKey({ resource, ...filters });
  const position = pagination.data.cursor
    ? decodePublicCursor(pagination.data.cursor, resource, requestKey)
    : undefined;
  if (pagination.data.cursor && !position) {
    return {
      success: false as const,
      response: invalidPublicApiRequest(
        "invalid_cursor",
        "Cursor does not match this Public API request",
      ),
    };
  }
  return {
    success: true as const,
    data: { limit: pagination.data.limit, position, requestKey },
  };
};
