import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";

process.env.TESTCONTAINERS_RYUK_DISABLED = "true";

export type TestApplication = {
  url: string;
  databaseUrl: string;
  restartWithUnreachableDatabase: () => Promise<void>;
  stop: () => Promise<void>;
};

type TestApplicationOptions = {
  publicApi?: {
    dataVersion: string;
    rateLimitRequests: number;
    rateLimitWindowSeconds: number;
  };
};

const getAvailablePort = async () => {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Could not allocate a test port");
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
};

const waitForHttp = async (url: string, child: ChildProcess) => {
  const deadline = Date.now() + 60_000;
  let lastError: unknown;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `Next.js exited before becoming ready with code ${child.exitCode}`,
      );
    }

    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) return;
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`Next.js did not become ready at ${url}`, {
    cause: lastError,
  });
};

export const startTestApplication = async (
  options: TestApplicationOptions = {},
): Promise<TestApplication> => {
  const databaseHostPort = await getAvailablePort();
  const database: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    "postgres:17-alpine",
  )
    .withExposedPorts({ container: 5432, host: databaseHostPort })
    .start();
  const databaseUrl = database.getConnectionUri();
  const migration = spawnSync("pnpm", ["db:migrate"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: "utf8",
  });

  if (migration.status !== 0) {
    await database.stop();
    throw new Error(
      `Database migration failed:\n${migration.stdout}\n${migration.stderr}`,
    );
  }

  const port = await getAvailablePort();
  const url = `http://127.0.0.1:${port}`;
  const startWeb = (webDatabaseUrl: string) =>
    spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "dev",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(port),
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DATABASE_URL: webDatabaseUrl,
          NEXTAUTH_URL: url,
          NEXTAUTH_SECRET: "test-secret-that-is-long-enough-for-the-test-suite",
          GITHUB_ID: "test-github-client-id",
          GITHUB_SECRET: "test-github-client-secret",
          OWNER_GITHUB_ID: "34471145",
          ASK_LLM_PROVIDER: "fake",
          EMAIL_PROVIDER: "fake",
          PUBLIC_ORIGIN: url,
          EMAIL_TOKEN_SECRET:
            "test-email-token-secret-with-at-least-32-characters",
          PUBLIC_DATA_VERSION:
            options.publicApi?.dataVersion ?? "public-alpha-test",
          PUBLIC_API_RATE_LIMIT_REQUESTS: String(
            options.publicApi?.rateLimitRequests ?? 1_000,
          ),
          PUBLIC_API_RATE_LIMIT_WINDOW_SECONDS: String(
            options.publicApi?.rateLimitWindowSeconds ?? 60,
          ),
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  let child = startWeb(databaseUrl);

  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);
  await waitForHttp(url, child);

  return {
    url,
    databaseUrl,
    restartWithUnreachableDatabase: async () => {
      child.kill("SIGTERM");
      await once(child, "exit");
      const unreachableDatabasePort = await getAvailablePort();
      child = startWeb(
        `postgresql://test:test@127.0.0.1:${unreachableDatabasePort}/unavailable`,
      );
      child.stdout.pipe(process.stdout);
      child.stderr.pipe(process.stderr);
      await waitForHttp(url, child);
    },
    stop: async () => {
      if (child.exitCode === null) {
        child.kill("SIGTERM");
        await once(child, "exit");
      }
      await database.stop();
    },
  };
};
