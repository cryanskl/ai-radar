import { z } from "zod";

const databaseEnvSchema = z.object({
  DATABASE_URL: z.url(),
});

const authEnvSchema = z.object({
  GITHUB_ID: z.string().min(1),
  GITHUB_SECRET: z.string().min(1),
  NEXTAUTH_SECRET: z.string().min(32),
  OWNER_GITHUB_ID: z.string().regex(/^\d+$/),
});

const askLlmEnvSchema = z.discriminatedUnion("ASK_LLM_PROVIDER", [
  z.object({ ASK_LLM_PROVIDER: z.literal("fake") }),
  z.object({
    ASK_LLM_PROVIDER: z.literal("openai"),
    OPENAI_API_KEY: z.string().min(1),
    ASK_LLM_MODEL: z.string().min(1),
  }),
]);

const emailEnvSchema = z.discriminatedUnion("EMAIL_PROVIDER", [
  z.object({
    EMAIL_PROVIDER: z.literal("fake"),
    PUBLIC_ORIGIN: z.url(),
    EMAIL_TOKEN_SECRET: z.string().min(32),
  }),
  z.object({
    EMAIL_PROVIDER: z.literal("resend"),
    PUBLIC_ORIGIN: z.url(),
    EMAIL_TOKEN_SECRET: z.string().min(32),
    RESEND_API_KEY: z.string().min(1),
    RESEND_FROM: z.string().min(1),
    RESEND_WEBHOOK_SECRET: z.string().min(1),
  }),
]);

const publicApiEnvSchema = z.object({
  PUBLIC_DATA_VERSION: z
    .string()
    .regex(/^public-[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .default("public-alpha-unreleased"),
  PUBLIC_API_RATE_LIMIT_REQUESTS: z.coerce
    .number()
    .int()
    .positive()
    .default(60),
  PUBLIC_API_RATE_LIMIT_WINDOW_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(60),
});

export const getDatabaseEnv = () =>
  databaseEnvSchema.parse({
    DATABASE_URL: process.env.DATABASE_URL,
  });

export const getAuthEnv = () =>
  authEnvSchema.parse({
    GITHUB_ID: process.env.GITHUB_ID,
    GITHUB_SECRET: process.env.GITHUB_SECRET,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    OWNER_GITHUB_ID: process.env.OWNER_GITHUB_ID,
  });

export const getAskLlmEnv = () =>
  askLlmEnvSchema.parse({
    ASK_LLM_PROVIDER: process.env.ASK_LLM_PROVIDER,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ASK_LLM_MODEL: process.env.ASK_LLM_MODEL,
  });

export const getEmailEnv = () =>
  emailEnvSchema.parse({
    EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
    PUBLIC_ORIGIN: process.env.PUBLIC_ORIGIN,
    EMAIL_TOKEN_SECRET: process.env.EMAIL_TOKEN_SECRET,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM: process.env.RESEND_FROM,
    RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET,
  });

export const getPublicApiEnv = () =>
  publicApiEnvSchema.parse({
    PUBLIC_DATA_VERSION: process.env.PUBLIC_DATA_VERSION,
    PUBLIC_API_RATE_LIMIT_REQUESTS: process.env.PUBLIC_API_RATE_LIMIT_REQUESTS,
    PUBLIC_API_RATE_LIMIT_WINDOW_SECONDS:
      process.env.PUBLIC_API_RATE_LIMIT_WINDOW_SECONDS,
  });
