import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { createServer as createTcpServer } from "node:net";
import { expect, test } from "@playwright/test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { Client } from "pg";
import { completeFakeGithubOAuth } from "../support/github-oauth";
import {
  startTestApplication,
  type TestApplication,
} from "../support/test-application";

let application: TestApplication | undefined;

test.beforeAll(async () => {
  application = await startTestApplication();
});

test.afterAll(async () => {
  if (application) await application.stop();
});

const allocatePort = async () => {
  const server = createTcpServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Could not allocate fixture port");
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
};

const startArxivFixtureServer = async () => {
  const requests: Array<{ url: string; userAgent?: string }> = [];
  const successBody = await readFile(
    new URL("../fixtures/arxiv-feed.xml", import.meta.url),
    "utf8",
  );
  let response: {
    body: string;
    delayMs: number;
    headers: Record<string, string>;
    status: number;
  } = {
    body: successBody,
    delayMs: 1000,
    headers: { "content-type": "application/atom+xml" },
    status: 200,
  };
  const server: Server = createServer((request, reply) => {
    requests.push({
      url: request.url ?? "",
      userAgent: request.headers["user-agent"],
    });
    setTimeout(() => {
      reply.writeHead(response.status, response.headers);
      reply.end(response.body);
    }, response.delayMs);
  });
  const port = await allocatePort();
  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  return {
    requests,
    successBody,
    setResponse(next: typeof response) {
      response = next;
    },
    stop: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
    url: `http://127.0.0.1:${port}/api/query`,
  };
};

const runArxivWorker = async ({
  apiUrl,
  databaseUrl,
  now,
}: {
  apiUrl: string;
  databaseUrl: string;
  now: string;
}) => {
  const child = spawn(
    "pnpm",
    ["exec", "tsx", "src/worker/index.ts", "--once", "--source", "arxiv"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ARXIV_API_URL: apiUrl,
        DATABASE_URL: databaseUrl,
        INGEST_NOW: now,
        NODE_ENV: "test",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  const [exitCode] = (await once(child, "exit")) as [number];
  return { exitCode, output };
};

test("Worker ingests arXiv idempotently, exposes failures, and feeds publication", async ({
  context,
  page,
}) => {
  if (!application) throw new Error("Test application did not start");
  const owner = await completeFakeGithubOAuth({
    applicationUrl: application.url,
    databaseUrl: application.databaseUrl,
    ownerGithubId: "34471145",
    profile: {
      avatar_url: "https://avatars.example.test/owner",
      email: "ingest-owner@example.test",
      id: 34_471_145,
      login: "cryanskl",
      name: "AI Radar Owner",
    },
  });
  if (!owner.sessionToken)
    throw new Error("Owner OAuth did not create a session");
  await context.addCookies([
    {
      name: "next-auth.session-token",
      value: owner.sessionToken,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);

  const configuration = await context.request.post(
    `${application.url}/api/v1/admin/sources/arxiv`,
  );
  expect(configuration.status()).toBe(201);
  const configurationBody = await configuration.json();
  expect(configurationBody).toEqual({
    sourcePublicId: "arxiv",
    adapterKey: "arxiv_api",
    minRequestIntervalMs: 3000,
    maxItemsPerRun: 25,
    retainRawPayload: false,
  });

  const fixture = await startArxivFixtureServer();
  const concurrentWorkers = await Promise.all([
    runArxivWorker({
      apiUrl: fixture.url,
      databaseUrl: application.databaseUrl,
      now: "2026-08-30T08:00:00.000Z",
    }),
    runArxivWorker({
      apiUrl: fixture.url,
      databaseUrl: application.databaseUrl,
      now: "2026-08-30T08:00:00.000Z",
    }),
  ]);
  for (const worker of concurrentWorkers) {
    expect(worker.exitCode, worker.output).toBe(0);
  }
  expect(concurrentWorkers.map(({ output }) => output).join("\n")).toContain(
    "busy",
  );
  expect(fixture.requests).toHaveLength(1);
  const tooEarly = await runArxivWorker({
    apiUrl: fixture.url,
    databaseUrl: application.databaseUrl,
    now: "2026-08-30T08:00:02.000Z",
  });
  expect(tooEarly.exitCode, tooEarly.output).toBe(0);
  expect(tooEarly.output).toContain("not_due");
  expect(fixture.requests).toHaveLength(1);
  const replay = await runArxivWorker({
    apiUrl: fixture.url,
    databaseUrl: application.databaseUrl,
    now: "2026-08-30T08:00:03.000Z",
  });
  expect(replay.exitCode, replay.output).toBe(0);
  expect(fixture.requests).toHaveLength(2);
  expect(fixture.requests[0].userAgent).toContain("AI-Radar/0.1");
  const requested = new URL(fixture.requests[0].url, fixture.url);
  expect(requested.searchParams.get("max_results")).toBe("25");
  expect(requested.searchParams.get("sortBy")).toBe("submittedDate");

  fixture.setResponse({
    body: fixture.successBody.replaceAll("2608.12345v1", "2608.99999v1"),
    delayMs: 0,
    headers: { "content-type": "application/atom+xml" },
    status: 200,
  });
  const cursorGap = await runArxivWorker({
    apiUrl: fixture.url,
    databaseUrl: application.databaseUrl,
    now: "2026-08-30T08:00:06.000Z",
  });
  expect(cursorGap.exitCode).not.toBe(0);

  const requestsBeforeRedirect = fixture.requests.length;
  fixture.setResponse({
    body: "redirecting",
    delayMs: 0,
    headers: { location: `${fixture.url}/redirect-target` },
    status: 302,
  });
  const networkFailure = await runArxivWorker({
    apiUrl: fixture.url,
    databaseUrl: application.databaseUrl,
    now: "2026-08-30T08:00:09.000Z",
  });
  expect(networkFailure.exitCode).not.toBe(0);
  expect(fixture.requests).toHaveLength(requestsBeforeRedirect + 1);

  fixture.setResponse({
    body: "rate limited",
    delayMs: 0,
    headers: { "content-type": "text/plain" },
    status: 429,
  });
  expect(
    (
      await runArxivWorker({
        apiUrl: fixture.url,
        databaseUrl: application.databaseUrl,
        now: "2026-08-30T08:00:12.000Z",
      })
    ).exitCode,
  ).not.toBe(0);

  fixture.setResponse({
    body: "forbidden",
    delayMs: 0,
    headers: { "content-type": "text/plain" },
    status: 403,
  });
  expect(
    (
      await runArxivWorker({
        apiUrl: fixture.url,
        databaseUrl: application.databaseUrl,
        now: "2026-08-30T08:00:15.000Z",
      })
    ).exitCode,
  ).not.toBe(0);

  fixture.setResponse({
    body: "<feed><entry>",
    delayMs: 0,
    headers: { "content-type": "application/atom+xml" },
    status: 200,
  });
  expect(
    (
      await runArxivWorker({
        apiUrl: fixture.url,
        databaseUrl: application.databaseUrl,
        now: "2026-08-30T08:00:18.000Z",
      })
    ).exitCode,
  ).not.toBe(0);
  await fixture.stop();

  await page.goto(`${application.url}/admin/inbox`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Owner Inbox" }),
  ).toBeVisible();
  await expect(
    page.getByText("A Fixture Paper for AI Radar Ingestion"),
  ).toBeVisible();
  await expect(page.getByText("New candidates: 1")).toBeVisible();
  await expect(page.getByText("Source health: degraded")).toBeVisible();
  await expect(page.getByText("Source lag: 68418 seconds")).toBeVisible();
  for (const kind of [
    "cursor_gap",
    "network",
    "rate_limit",
    "authentication",
    "parsing",
  ]) {
    await expect(page.getByText(`retryable_failure · ${kind}`)).toBeVisible();
  }

  const client = new Client({ connectionString: application.databaseUrl });
  await client.connect();
  const ingestionState = await client.query<{
    cursor_value: string;
    inbox_count: string;
    source_item_count: string;
    succeeded_created_counts: number[];
    default_license_url: string;
    default_rights_status: string;
    lag_seconds: number;
    rate_retry_after: Date;
    terms_url: string;
    policy_evidence_version: string;
    allowed_fields: string[];
    prohibited_fields: string[];
    public_display_scope: string;
    export_scope: string;
  }>(
    `select
       (select cursor_value from source_cursors) as cursor_value,
       (select count(*)::text from source_items si join sources s on s.id = si.source_id where s.public_id = 'arxiv') as source_item_count,
       (select count(*)::text from inbox_items) as inbox_count,
       (select array_agg(created_count order by started_at) from ingest_runs where status = 'succeeded') as succeeded_created_counts,
       (select default_rights_status::text from source_policies) as default_rights_status,
       (select default_license_url from source_policies) as default_license_url,
       (select lag_seconds from source_health) as lag_seconds,
       (select retry_after_at from ingest_runs where error_kind = 'rate_limit') as rate_retry_after,
       (select terms_url from source_policies) as terms_url,
       (select policy_evidence_version from source_policies) as policy_evidence_version,
       (select allowed_fields from source_policies) as allowed_fields,
       (select prohibited_fields from source_policies) as prohibited_fields,
       (select public_display_scope from source_policies) as public_display_scope,
       (select export_scope from source_policies) as export_scope`,
  );
  await client.end();
  expect(ingestionState.rows[0]).toEqual({
    cursor_value: "2608.12345v1",
    inbox_count: "1",
    source_item_count: "1",
    succeeded_created_counts: [1, 0],
    default_rights_status: "open",
    default_license_url: "https://creativecommons.org/publicdomain/zero/1.0/",
    lag_seconds: 68418,
    rate_retry_after: new Date("2026-08-30T08:00:15.000Z"),
    terms_url: "https://info.arxiv.org/help/api/tou.html",
    policy_evidence_version: "arxiv-api-tou-accessed-2026-08-30",
    allowed_fields: ["arxiv_id", "title", "abstract_url", "published_at"],
    prohibited_fields: ["abstract_text", "pdf", "source_files"],
    public_display_scope: "metadata_and_ai_radar_authored_summary",
    export_scope: "cc0_descriptive_metadata_only",
  });

  const promotionInput = {
    event: {
      publicId: "",
      eventType: "announces",
      factStatus: "confirmed",
      occurredAt: "2026-08-29T13:00:00.000Z",
      occurredAtPrecision: "second",
      lastVerifiedAt: "2026-08-30T08:02:00.000Z",
      rightsStatus: "open",
    },
    localizations: [
      {
        locale: "en",
        title: "Fixture paper enters the AI Radar review path",
        summary: "AI Radar records the paper metadata for review.",
        authorship: "human_authored",
        reviewStatus: "reviewed",
      },
      {
        locale: "zh",
        title: "示例论文进入 AI Radar 审核流程",
        summary: "AI Radar 记录该论文的元数据并进入审核。",
        authorship: "human_authored",
        reviewStatus: "reviewed",
      },
    ],
  };
  const promotionUrl = `${application.url}/api/v1/admin/inbox/arxiv-2608-12345v1/event-draft`;
  const promotionResponses = await Promise.all(
    ["a", "b"].map((suffix) =>
      context.request.post(promotionUrl, {
        data: {
          ...promotionInput,
          event: {
            ...promotionInput.event,
            publicId: `event-arxiv-fixture-paper-${suffix}-2026-08-29`,
          },
        },
      }),
    ),
  );
  expect(
    promotionResponses.map((response) => response.status()).sort(),
  ).toEqual([201, 409]);
  const promotion = promotionResponses.find(
    (response) => response.status() === 201,
  );
  if (!promotion) throw new Error("Concurrent promotion produced no winner");
  const promotionBody = await promotion.json();
  expect(promotionBody).toMatchObject({ publicationState: "ready" });
  const winningPublicId = promotionBody.publicId as string;

  const promotionClient = new Client({
    connectionString: application.databaseUrl,
  });
  await promotionClient.connect();
  const linkedEvents = await promotionClient.query<{ count: string }>(
    `select count(*)::text as count
     from event_sources es
     join source_items si on si.id = es.source_item_id
     where si.public_id = 'arxiv-2608-12345v1'`,
  );
  await promotionClient.end();
  expect(linkedEvents.rows[0].count).toBe("1");

  const contract = await (
    await context.request.get(`${application.url}/api/openapi.json`)
  ).json();
  expect(contract.paths).toHaveProperty("/api/v1/admin/sources/arxiv.post");
  expect(contract.paths).toHaveProperty(
    "/api/v1/admin/inbox/{sourceItemPublicId}/event-draft.post",
  );
  const ajv = new Ajv2020({ strict: false });
  addFormats(ajv);
  for (const { body, schema } of [
    {
      body: configurationBody,
      schema:
        contract.paths["/api/v1/admin/sources/arxiv"].post.responses["201"]
          .content["application/json"].schema,
    },
    {
      body: promotionBody,
      schema:
        contract.paths["/api/v1/admin/inbox/{sourceItemPublicId}/event-draft"]
          .post.responses["201"].content["application/json"].schema,
    },
  ]) {
    const validate = ajv.compile(schema);
    expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
  }

  await page.goto(`${application.url}/admin/events/${winningPublicId}`);
  await page.getByRole("button", { name: "Publish event" }).click();
  await expect(page.getByText("Publication state: published")).toBeVisible();
  await page.goto(`${application.url}/en/radar/events/${winningPublicId}`);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Fixture paper enters the AI Radar review path",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "A Fixture Paper for AI Radar Ingestion" }),
  ).toHaveAttribute("href", "https://arxiv.org/abs/2608.12345v1");
  await expect(
    page.getByRole("link", {
      name: "https://creativecommons.org/publicdomain/zero/1.0/",
    }),
  ).toHaveAttribute(
    "href",
    "https://creativecommons.org/publicdomain/zero/1.0/",
  );
});
