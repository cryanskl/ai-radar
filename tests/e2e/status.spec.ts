import { spawnSync } from "node:child_process";
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

test("reports application and PostgreSQL health through the public HTTP contract", async ({
  request,
}) => {
  if (!application) throw new Error("Test application did not start");
  const response = await request.get(`${application.url}/api/v1/status`);

  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({
    status: "ok",
    services: {
      application: "ok",
      database: "ok",
    },
  });
});

test("publishes an OpenAPI contract that accepts the real status response", async ({
  request,
}) => {
  if (!application) throw new Error("Test application did not start");
  const contractResponse = await request.get(
    `${application.url}/api/openapi.json`,
  );

  expect(contractResponse.status()).toBe(200);
  const contract = await contractResponse.json();
  expect(contract.openapi).toBe("3.1.0");
  expect(contract.paths).toHaveProperty("/api/v1/status.get.responses.200");

  const statusResponse = await request.get(`${application.url}/api/v1/status`);
  const statusBody = await statusResponse.json();
  const responseSchema =
    contract.paths["/api/v1/status"].get.responses["200"].content[
      "application/json"
    ].schema;
  const ajv = new Ajv2020({ strict: false });
  addFormats(ajv);
  const validateStatus = ajv.compile(responseSchema);
  expect(
    validateStatus(statusBody),
    JSON.stringify(validateStatus.errors),
  ).toBe(true);
});

test("applies the Owner session migration to an empty PostgreSQL database", async () => {
  if (!application) throw new Error("Test application did not start");
  const client = new Client({ connectionString: application.databaseUrl });
  await client.connect();

  const result = await client.query<{ table_name: string }>(
    "select table_name from information_schema.tables where table_schema = 'public' and table_name like 'auth_%' order by table_name",
  );

  await client.end();
  expect(result.rows.map((row) => row.table_name)).toEqual([
    "auth_accounts",
    "auth_sessions",
    "auth_users",
  ]);
});

test("starts the Worker against PostgreSQL from the documented entry point", async () => {
  if (!application) throw new Error("Test application did not start");
  const worker = spawnSync("pnpm", ["start:worker", "--", "--once"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: application.databaseUrl },
    encoding: "utf8",
  });

  expect(worker.status, worker.stderr).toBe(0);
  expect(worker.stdout).toContain("AI Radar Worker ready");
});

test("creates a database-backed Owner session only through the allowlisted GitHub OAuth callback", async ({
  context,
  page,
}) => {
  if (!application) throw new Error("Test application did not start");
  const allowed = await completeFakeGithubOAuth({
    applicationUrl: application.url,
    databaseUrl: application.databaseUrl,
    ownerGithubId: "34471145",
    profile: {
      avatar_url: "https://avatars.example.test/owner",
      email: "owner@example.test",
      id: 34_471_145,
      login: "renamed-owner",
      name: "AI Radar Owner",
    },
  });
  expect(allowed.sessionToken).toBeTruthy();

  const denied = await completeFakeGithubOAuth({
    applicationUrl: application.url,
    databaseUrl: application.databaseUrl,
    ownerGithubId: "34471145",
    profile: {
      avatar_url: "https://avatars.example.test/impersonator",
      email: "impersonator@example.test",
      id: 999,
      login: "cryanskl",
      name: "Impersonator",
    },
  });
  expect(denied.sessionToken).toBeUndefined();
  expect(denied.redirect).toContain("error=AccessDenied");

  const client = new Client({ connectionString: application.databaseUrl });
  await client.connect();
  const persisted = await client.query<{
    accounts: string;
    sessions: string;
    users: string;
  }>(
    "select (select count(*) from auth_users) as users, (select count(*) from auth_accounts) as accounts, (select count(*) from auth_sessions) as sessions",
  );
  await client.end();
  expect(persisted.rows[0]).toEqual({
    accounts: "1",
    sessions: "1",
    users: "1",
  });

  await context.addCookies([
    {
      name: "next-auth.session-token",
      value: allowed.sessionToken ?? "",
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
  await page.goto(`${application.url}/admin`);

  await expect(
    page.getByRole("heading", { level: 1, name: "Owner administration" }),
  ).toBeVisible();
});

test("keeps public reading anonymous and sends unauthenticated Owner access to GitHub sign-in", async ({
  page,
}) => {
  if (!application) throw new Error("Test application did not start");

  await page.goto(`${application.url}/en/status`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Service status" }),
  ).toBeVisible();

  await page.goto(`${application.url}/admin`);
  await expect(page).toHaveURL(/\/api\/auth\/signin/);
  await expect(
    page.getByRole("button", { name: "Sign in with GitHub" }),
  ).toBeVisible();
});

test("renders the live service status in English and Chinese", async ({
  page,
}) => {
  if (!application) throw new Error("Test application did not start");

  await page.goto(`${application.url}/en/status`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Service status" }),
  ).toBeVisible();
  await expect(page.getByText("Application", { exact: true })).toBeVisible();
  await expect(page.getByText("PostgreSQL", { exact: true })).toBeVisible();

  await page.goto(`${application.url}/zh/status`);
  await expect(
    page.getByRole("heading", { level: 1, name: "服务状态" }),
  ).toBeVisible();
  await expect(page.getByText("应用", { exact: true })).toBeVisible();
  await expect(page.getByText("PostgreSQL", { exact: true })).toBeVisible();
});

test("returns 503 and renders bilingual unavailable status when PostgreSQL is down", async ({
  page,
  request,
}) => {
  if (!application) throw new Error("Test application did not start");
  await application.restartWithUnreachableDatabase();

  const contractResponse = await request.get(
    `${application.url}/api/openapi.json`,
  );
  const contract = await contractResponse.json();
  const response = await request.get(`${application.url}/api/v1/status`);
  expect(response.status()).toBe(503);
  const responseBody = await response.json();
  expect(responseBody).toMatchObject({
    status: "degraded",
    services: { application: "ok", database: "error" },
  });
  const responseSchema =
    contract.paths["/api/v1/status"].get.responses["503"].content[
      "application/json"
    ].schema;
  const ajv = new Ajv2020({ strict: false });
  addFormats(ajv);
  const validateStatus = ajv.compile(responseSchema);
  expect(
    validateStatus(responseBody),
    JSON.stringify(validateStatus.errors),
  ).toBe(true);

  await page.goto(`${application.url}/en/status`);
  await expect(page.getByText("Unavailable", { exact: true })).toBeVisible();
  await page.goto(`${application.url}/zh/status`);
  await expect(page.getByText("暂不可用", { exact: true })).toBeVisible();
});
