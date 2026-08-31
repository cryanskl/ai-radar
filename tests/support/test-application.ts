import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";

process.env.TESTCONTAINERS_RYUK_DISABLED = "true";

export type TestApplication = {
  url: string;
  databaseUrl: string;
  restartWithUnreachableDatabase: () => Promise<void>;
  restoreDatabaseBackup: () => Promise<{
    databaseUrl: string;
    stop: () => Promise<void>;
  }>;
  stop: () => Promise<void>;
};

type TestApplicationOptions = {
  dataReleaseRemoteOrigin?: string;
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
  const database: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    "postgres:17-alpine",
  ).start();
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
          AI_RADAR_TEST_MODE: "true",
          DATA_RELEASE_REMOTE_TEST_ORIGIN:
            options.dataReleaseRemoteOrigin ?? "",
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
    restoreDatabaseBackup: async () => {
      const temporaryDirectory = await mkdtemp(
        join(tmpdir(), "ai-radar-recovery-"),
      );
      const backupPath = join(temporaryDirectory, "database.dump");
      const containerBackupPath = "/tmp/ai-radar-database.dump";
      let restored: StartedPostgreSqlContainer | undefined;
      try {
        const dump = await database.exec([
          "pg_dump",
          "--username=test",
          "--dbname=test",
          "--format=custom",
          `--file=${containerBackupPath}`,
        ]);
        if (dump.exitCode !== 0) {
          throw new Error(`PostgreSQL backup failed: ${dump.stderr}`);
        }

        const copyFromSource = spawnSync(
          "docker",
          ["cp", `${database.getId()}:${containerBackupPath}`, backupPath],
          { encoding: "utf8" },
        );
        if (copyFromSource.status !== 0) {
          throw new Error(
            `Could not copy PostgreSQL backup: ${copyFromSource.stderr}`,
          );
        }

        restored = await new PostgreSqlContainer("postgres:17-alpine")
          .withUsername("test")
          .withPassword("test")
          .withDatabase("test")
          .withStartupTimeout(30_000)
          .start();
        const copyToTarget = spawnSync(
          "docker",
          ["cp", backupPath, `${restored.getId()}:${containerBackupPath}`],
          { encoding: "utf8" },
        );
        if (copyToTarget.status !== 0) {
          throw new Error(
            `Could not stage PostgreSQL backup: ${copyToTarget.stderr}`,
          );
        }
        const restore = await restored.exec([
          "pg_restore",
          "--username=test",
          "--dbname=test",
          "--clean",
          "--if-exists",
          containerBackupPath,
        ]);
        if (restore.exitCode !== 0) {
          throw new Error(`PostgreSQL restore failed: ${restore.stderr}`);
        }
        const restoredDatabase = restored;
        return {
          databaseUrl: restoredDatabase.getConnectionUri(),
          stop: async () => {
            await restoredDatabase.stop();
          },
        };
      } catch (error) {
        if (restored) await restored.stop();
        throw error;
      } finally {
        await rm(temporaryDirectory, { recursive: true });
      }
    },
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
