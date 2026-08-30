import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env") as typeof import("@next/env");

loadEnvConfig(process.cwd());

const { databasePool } = await import("../db/client");

await databasePool.query("select 1");
console.info("AI Radar Worker ready");

if (!process.argv.includes("--once")) {
  await new Promise<void>((resolve) => {
    process.once("SIGINT", resolve);
    process.once("SIGTERM", resolve);
  });
}

await databasePool.end();
