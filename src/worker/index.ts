import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env") as typeof import("@next/env");

loadEnvConfig(process.cwd());

const { databasePool } = await import("../db/client");

try {
  await databasePool.query("select 1");
  console.info("AI Radar Worker ready");

  const sourceIndex = process.argv.indexOf("--source");
  const source = sourceIndex === -1 ? undefined : process.argv[sourceIndex + 1];
  if (source === "arxiv") {
    const { runArxivIngest } = await import("../ingestion/service");
    const configuredNow = process.env.INGEST_NOW;
    if (configuredNow && process.env.NODE_ENV !== "test") {
      throw new Error("INGEST_NOW overrides are only allowed in tests");
    }
    const result = await runArxivIngest(
      configuredNow ? new Date(configuredNow) : new Date(),
    );
    console.info("arXiv ingest", result);
  } else if (source === "github") {
    const { runGithubIngest } = await import("../ingestion/service");
    const configuredNow = process.env.INGEST_NOW;
    if (configuredNow && process.env.NODE_ENV !== "test") {
      throw new Error("INGEST_NOW overrides are only allowed in tests");
    }
    const result = await runGithubIngest(
      configuredNow ? new Date(configuredNow) : new Date(),
    );
    console.info("GitHub ingest", result);
  } else if (source) {
    throw new Error(`Unknown Source adapter: ${source}`);
  }

  if (!process.argv.includes("--once")) {
    await new Promise<void>((resolve) => {
      process.once("SIGINT", resolve);
      process.once("SIGTERM", resolve);
    });
  }
} finally {
  await databasePool.end();
}
