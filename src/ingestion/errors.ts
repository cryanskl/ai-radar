export type IngestErrorKind =
  "cursor_gap" | "network" | "rate_limit" | "authentication" | "parsing";

export class RetryableIngestError extends Error {
  constructor(
    message: string,
    readonly kind: IngestErrorKind,
    readonly retryAfterAt?: Date,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "RetryableIngestError";
  }
}
