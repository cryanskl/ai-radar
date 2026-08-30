import { createRequire } from "node:module";
import { defineConfig } from "drizzle-kit";
import { getDatabaseEnv } from "./src/config/server-env";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env") as typeof import("@next/env");

loadEnvConfig(process.cwd());

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: getDatabaseEnv().DATABASE_URL,
  },
});
