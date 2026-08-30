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
