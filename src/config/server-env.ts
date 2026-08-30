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
