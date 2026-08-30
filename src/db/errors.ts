import { DatabaseError } from "pg";

export const isUniqueViolation = (error: unknown) =>
  error instanceof Error &&
  error.cause instanceof DatabaseError &&
  error.cause.code === "23505";
