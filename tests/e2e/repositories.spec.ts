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

const startGithubFixtureServer = async () => {
  const repository = await readFile(
    new URL("../fixtures/github-repository.json", import.meta.url),
    "utf8",
  );
  const archivedRepository = {
    ...(JSON.parse(repository) as Record<string, unknown>),
    id: 9001,
    name: "archived-ai",
    full_name: "example/archived-ai",
    owner: { id: 9002, login: "example" },
    html_url: "https://github.com/example/archived-ai",
    description: "An archived fixture without a detected license.",
    archived: true,
    is_template: true,
    template_repository: {
      id: 8001,
      full_name: "example/template-origin",
      html_url: "https://github.com/example/template-origin",
    },
    license: null,
    language: "Python",
    topics: ["ai"],
    stargazers_count: 50,
    forks_count: 5,
    open_issues_count: 0,
    subscribers_count: 1,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2026-08-28T12:00:00Z",
    pushed_at: "2026-08-01T12:00:00Z",
  };
  const bodies = {
    search: await readFile(
      new URL("../fixtures/github-search.json", import.meta.url),
      "utf8",
    ),
    repository,
    archivedRepository: JSON.stringify(archivedRepository),
    languages: await readFile(
      new URL("../fixtures/github-languages.json", import.meta.url),
      "utf8",
    ),
    releases: await readFile(
      new URL("../fixtures/github-releases.json", import.meta.url),
      "utf8",
    ),
  };
  const requests: Array<{
    authorization?: string;
    url: string;
    version?: string;
  }> = [];
  const unavailableRepositories = new Set<string>();
  const repositoryRedirects = new Map<string, string>();
  let primaryFullName = "cryanskl/ai-radar";
  const server: Server = createServer((request, reply) => {
    requests.push({
      authorization: request.headers.authorization,
      url: request.url ?? "",
      version: request.headers["x-github-api-version"] as string | undefined,
    });
    const path = new URL(request.url ?? "/", "http://fixture.test").pathname;
    const repositoryFullName = path.match(/^\/repos\/([^/]+\/[^/]+)$/)?.[1];
    const redirectFullName = repositoryFullName
      ? repositoryRedirects.get(repositoryFullName)
      : undefined;
    if (redirectFullName) {
      reply.writeHead(301, { location: `/repos/${redirectFullName}` });
      reply.end();
      return;
    }
    if (repositoryFullName && unavailableRepositories.has(repositoryFullName)) {
      reply.writeHead(404, { "content-type": "application/json" });
      reply.end("{}");
      return;
    }
    const body =
      path === "/search/repositories"
        ? bodies.search
        : path === `/repos/${primaryFullName}`
          ? bodies.repository
          : path === "/repos/example/archived-ai"
            ? bodies.archivedRepository
            : path === `/repos/${primaryFullName}/languages`
              ? bodies.languages
              : path === "/repos/example/archived-ai/languages"
                ? JSON.stringify({ Python: 1000 })
                : path === `/repos/${primaryFullName}/releases`
                  ? bodies.releases
                  : path === "/repos/example/archived-ai/releases"
                    ? "[]"
                    : null;
    if (body === null) {
      reply.writeHead(404, { "content-type": "application/json" });
      reply.end("{}");
      return;
    }
    reply.writeHead(200, { "content-type": "application/json" });
    reply.end(body);
  });
  const port = await allocatePort();
  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  return {
    requests,
    setRepository(body: string) {
      bodies.repository = body;
    },
    renameRepository(from: string, to: string, body: string) {
      repositoryRedirects.set(from, to);
      primaryFullName = to;
      bodies.repository = body;
      bodies.releases = bodies.releases.replaceAll(from, to);
    },
    setRepositoryUnavailable(fullName: string) {
      unavailableRepositories.add(fullName);
    },
    stop: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
    url: `http://127.0.0.1:${port}`,
  };
};

const runGithubWorker = async ({
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
    ["exec", "tsx", "src/worker/index.ts", "--once", "--source", "github"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        GITHUB_API_TOKEN: "fixture-api-token",
        GITHUB_API_URL: apiUrl,
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

test("ingests rights-safe GitHub Repository metadata and exposes Repository discovery", async ({
  context,
  page,
}) => {
  if (!application) throw new Error("Test application did not start");
  const testApplication = application;
  const configurationUrl = `${application.url}/api/v1/admin/sources/github`;
  expect((await context.request.post(configurationUrl)).status()).toBe(401);
  const owner = await completeFakeGithubOAuth({
    applicationUrl: application.url,
    databaseUrl: application.databaseUrl,
    ownerGithubId: "34471145",
    profile: {
      avatar_url: "https://avatars.example.test/github-owner",
      email: "github-owner@example.test",
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
  const configuration = await context.request.post(configurationUrl);
  expect(configuration.status()).toBe(201);
  expect(await configuration.json()).toEqual({
    sourcePublicId: "github",
    adapterKey: "github_rest_api",
    apiVersion: "2022-11-28",
    minRequestIntervalMs: 60_000,
    maxItemsPerRun: 10,
    retainRawPayload: false,
  });

  const fixture = await startGithubFixtureServer();
  const firstRun = await runGithubWorker({
    apiUrl: fixture.url,
    databaseUrl: application.databaseUrl,
    now: "2026-08-30T15:10:00.000Z",
  });
  expect(firstRun.exitCode, firstRun.output).toBe(0);
  expect(fixture.requests).toHaveLength(4);
  expect(
    fixture.requests.every(
      ({ authorization }) => authorization === "Bearer fixture-api-token",
    ),
  ).toBe(true);
  expect(
    fixture.requests.every(({ version }) => version === "2022-11-28"),
  ).toBe(true);

  const database = new Client({ connectionString: application.databaseUrl });
  await database.connect();
  const ingested = await database.query<{
    external_id: string;
    full_name: string;
    languages: unknown;
    license_status: string;
    releases: unknown;
    retain_raw_payload: boolean;
    rights_status: string;
    source_item_public_id: string;
  }>(
    `select item.public_id as source_item_public_id, item.external_id,
       metadata.full_name, metadata.languages,
       metadata.license_status, metadata.releases,
       policy.retain_raw_payload, item.rights_status::text
     from source_items item
     join github_source_item_metadata metadata on metadata.source_item_id = item.id
     join source_policies policy on policy.source_id = item.source_id`,
  );
  expect(ingested.rows).toEqual([
    expect.objectContaining({
      external_id: "repository:1351105824:2026-08-30T15:10:00.000Z",
      full_name: "cryanskl/ai-radar",
      license_status: "detected",
      retain_raw_payload: false,
      rights_status: "metadata_only",
    }),
  ]);
  expect(ingested.rows[0].languages).toEqual(
    expect.arrayContaining([expect.objectContaining({ name: "TypeScript" })]),
  );
  expect(ingested.rows[0].releases).toEqual([
    expect.objectContaining({ tagName: "v0.1.0" }),
  ]);
  expect(JSON.stringify(ingested.rows[0])).not.toContain("README");

  const createEntity = async (data: unknown) => {
    const response = await context.request.post(
      `${testApplication.url}/api/v1/admin/entities`,
      { data },
    );
    expect(response.status()).toBe(201);
  };
  await createEntity({
    entity: {
      publicId: "repository-ai-radar",
      type: "repository",
      officialName: "cryanskl/ai-radar",
      officialUrl: "https://github.com/cryanskl/ai-radar",
      lastVerifiedAt: "2026-08-30T15:10:00.000Z",
      rightsStatus: "metadata_only",
    },
    localizations: [
      {
        locale: "en",
        name: "AI Radar",
        summary: "An open bilingual map of global AI.",
        authorship: "human_authored",
        reviewStatus: "reviewed",
      },
      {
        locale: "zh",
        name: "AI Radar",
        summary: "一个开源的全球 AI 双语地图。",
        authorship: "human_authored",
        reviewStatus: "reviewed",
      },
    ],
    aliases: [
      {
        publicId: "alias-repository-ai-radar-full-name",
        locale: "en",
        kind: "official",
        value: "cryanskl/ai-radar",
      },
    ],
    versions: [],
  });
  const profileUrl = `${application.url}/api/v1/admin/repository-observations`;
  expect((await context.request.post(profileUrl, { data: {} })).status()).toBe(
    400,
  );
  const firstProfile = await context.request.post(profileUrl, {
    data: {
      familyPublicId: "repository-ai-radar",
      sourceItemPublicId: ingested.rows[0].source_item_public_id,
    },
  });
  expect(firstProfile.status()).toBe(201);
  expect(await firstProfile.json()).toMatchObject({
    familyPublicId: "repository-ai-radar",
    githubRepositoryId: 1351105824,
    observedAt: "2026-08-30T15:10:00.000Z",
    publicVisibility: true,
  });

  const firstRising = await context.request.get(
    `${application.url}/api/v1/repositories?locale=en&view=rising`,
  );
  expect(await firstRising.json()).toMatchObject({
    view: "rising",
    rankingState: "insufficient_evidence",
    methodology: {
      publicId: "github-rising",
      version: "1.0.0",
      kind: "source_normalized_growth",
      windowDays: 7,
    },
    items: [],
  });

  await database.query(
    `with github as (
       select id from sources where public_id = 'github'
     ), inserted as (
       insert into source_items (
         id, public_id, source_id, external_id, is_original_source,
         original_url, canonical_url, original_title, original_language,
         published_at, published_at_precision, discovered_at, rights_status,
         rights_checked_at, attribution, public_visibility
       )
       select gen_random_uuid(), 'github-repository-9001-2026-08-28', github.id,
         'repository:9001:2026-08-28T12:00:00.000Z', true,
         'https://github.com/example/archived-ai',
         'https://github.com/example/archived-ai', 'example/archived-ai', 'en',
         '2026-08-28T12:00:00.000Z', 'second',
         '2026-08-28T12:00:00.000Z', 'metadata_only',
         '2026-08-30T15:05:00.000Z', 'GitHub REST API', false
       from github returning id
     )
     insert into github_source_item_metadata (
       source_item_id, github_repository_id, github_owner_id, owner_login,
       name, full_name, url, description, topics, primary_language, languages,
       license_status, license_spdx_id, license_name, stars, forks,
       open_issues, subscribers, lifecycle_state, fork, mirror_url, template,
       repository_created_at, repository_updated_at, pushed_at, observed_at,
       releases
     )
     select id, 9001, 9002, 'example', 'archived-ai',
       'example/archived-ai', 'https://github.com/example/archived-ai',
       'An archived fixture without a detected license.', array['ai'],
       'Python', '[{"name":"Python","bytes":1000}]'::jsonb,
       'missing', null, null, 50, 5, 0, 1, 'archived', false, null, false,
       '2025-01-01T00:00:00.000Z', '2026-08-28T12:00:00.000Z',
       '2026-08-01T12:00:00.000Z', '2026-08-28T12:00:00.000Z', '[]'::jsonb
     from inserted`,
  );
  await createEntity({
    entity: {
      publicId: "repository-archived-ai",
      type: "repository",
      officialName: "example/archived-ai",
      officialUrl: "https://github.com/example/archived-ai",
      lastVerifiedAt: "2026-08-28T12:00:00.000Z",
      rightsStatus: "metadata_only",
    },
    localizations: [
      {
        locale: "en",
        name: "Archived AI",
        summary: "An archived Repository fixture.",
        authorship: "human_authored",
        reviewStatus: "reviewed",
      },
      {
        locale: "zh",
        name: "已归档 AI",
        summary: "一个已归档的仓库夹具。",
        authorship: "human_authored",
        reviewStatus: "reviewed",
      },
    ],
    aliases: [],
    versions: [],
  });
  const archivedProfile = await context.request.post(profileUrl, {
    data: {
      familyPublicId: "repository-archived-ai",
      sourceItemPublicId: "github-repository-9001-2026-08-28",
    },
  });
  expect(archivedProfile.status()).toBe(201);

  const updatedRepository = JSON.parse(
    await readFile(
      new URL("../fixtures/github-repository.json", import.meta.url),
      "utf8",
    ),
  ) as Record<string, unknown>;
  fixture.setRepository(
    JSON.stringify({
      ...updatedRepository,
      archived: true,
      updated_at: "2026-09-02T15:00:46Z",
    }),
  );
  const archivedTransition = await runGithubWorker({
    apiUrl: fixture.url,
    databaseUrl: application.databaseUrl,
    now: "2026-09-02T15:10:00.000Z",
  });
  expect(archivedTransition.exitCode, archivedTransition.output).toBe(0);
  const archivedTransitionDetail = await context.request.get(
    `${application.url}/api/v1/repositories/repository-ai-radar?locale=en`,
  );
  expect(await archivedTransitionDetail.json()).toMatchObject({
    lifecycleState: "archived",
    observations: [
      { observedAt: "2026-08-30T15:10:00.000Z" },
      { observedAt: "2026-09-02T15:10:00.000Z" },
    ],
  });

  updatedRepository.stargazers_count = 220;
  updatedRepository.forks_count = 20;
  updatedRepository.archived = false;
  updatedRepository.updated_at = "2026-09-06T15:00:46Z";
  updatedRepository.pushed_at = "2026-09-06T14:59:31Z";
  fixture.setRepository(JSON.stringify(updatedRepository));
  const secondRun = await runGithubWorker({
    apiUrl: fixture.url,
    databaseUrl: application.databaseUrl,
    now: "2026-09-06T15:10:00.000Z",
  });
  expect(secondRun.exitCode, secondRun.output).toBe(0);
  const latestSource = await database.query<{ public_id: string }>(
    `select item.public_id
     from source_items item
     join github_source_item_metadata metadata on metadata.source_item_id = item.id
     where metadata.github_repository_id = 1351105824
     order by metadata.observed_at desc limit 1`,
  );
  const automaticObservation = await database.query<{
    public_visibility: boolean;
  }>(
    `select observation.public_visibility
     from repository_observations observation
     join source_items item on item.id = observation.metadata_source_item_id
     where item.public_id = $1`,
    [latestSource.rows[0].public_id],
  );
  expect(automaticObservation.rows).toEqual([{ public_visibility: true }]);

  await createEntity({
    entity: {
      publicId: "model-repository-output",
      type: "model",
      officialName: "Repository Output Model",
      officialUrl: "https://models.example.test/repository-output",
      lastVerifiedAt: "2026-09-06T15:10:00.000Z",
      rightsStatus: "open",
    },
    localizations: [
      {
        locale: "en",
        name: "Repository Output Model",
        summary: "A model implemented by the Repository fixture.",
        authorship: "human_authored",
        reviewStatus: "reviewed",
      },
      {
        locale: "zh",
        name: "仓库输出模型",
        summary: "由仓库夹具实现的模型。",
        authorship: "human_authored",
        reviewStatus: "reviewed",
      },
    ],
    aliases: [],
    versions: [],
  });
  const relation = await context.request.post(
    `${application.url}/api/v1/admin/relations`,
    {
      data: {
        relation: {
          publicId: "relation-repository-implements-model",
          subject: { type: "entity", publicId: "repository-ai-radar" },
          predicate: "IMPLEMENTS",
          objectEntityPublicId: "model-repository-output",
          validFrom: "2026-08-29T13:00:00.000Z",
          validTo: null,
          firstVerifiedAt: "2026-09-06T15:10:00.000Z",
          lastVerifiedAt: "2026-09-06T15:10:00.000Z",
          confidence: 95,
          reviewStatus: "reviewed",
          creationMethod: "editor",
          rightsStatus: "metadata_only",
        },
        evidenceSourceItemPublicIds: [latestSource.rows[0].public_id],
      },
    },
  );
  expect(relation.status()).toBe(201);

  const rising = await context.request.get(
    `${application.url}/api/v1/repositories?locale=en&view=rising`,
  );
  const risingBody = await rising.json();
  expect(risingBody).toMatchObject({
    view: "rising",
    rankingState: "available",
    methodology: {
      publicId: "github-rising",
      version: "1.0.0",
      kind: "source_normalized_growth",
      windowDays: 7,
    },
    dataCutoff: "2026-09-06T15:10:00.000Z",
    items: [
      {
        publicId: "repository-ai-radar",
        fullName: "cryanskl/ai-radar",
        latestMetrics: { stars: 220, forks: 20 },
        rising: {
          starDelta: 100,
          forkDelta: 8,
          windowStart: "2026-08-30T15:10:00.000Z",
          windowEnd: "2026-09-06T15:10:00.000Z",
        },
      },
    ],
  });
  expect(JSON.stringify(risingBody)).not.toContain("README");

  const missingLicense = await context.request.get(
    `${application.url}/api/v1/repositories?locale=en&view=new&license=missing&lifecycle=archived`,
  );
  expect(await missingLicense.json()).toMatchObject({
    items: [
      {
        publicId: "repository-archived-ai",
        license: {
          status: "missing",
          reuseNotice: "no_license_do_not_assume_reuse",
        },
        lifecycleState: "archived",
      },
    ],
  });
  const archivedDetail = await context.request.get(
    `${application.url}/api/v1/repositories/repository-archived-ai?locale=en`,
  );
  expect(await archivedDetail.json()).toMatchObject({
    template: true,
    templateRepository: {
      githubRepositoryId: 8001,
      fullName: "example/template-origin",
      url: "https://github.com/example/template-origin",
    },
  });
  const firstNewPage = await context.request.get(
    `${application.url}/api/v1/repositories?locale=en&view=new&limit=1`,
  );
  const firstNewPageBody = await firstNewPage.json();
  expect(firstNewPageBody.items).toHaveLength(1);
  expect(firstNewPageBody.nextCursor).toEqual(expect.any(String));
  const secondNewPage = await context.request.get(
    `${application.url}/api/v1/repositories?locale=en&view=new&limit=1&cursor=${encodeURIComponent(firstNewPageBody.nextCursor)}`,
  );
  const secondNewPageBody = await secondNewPage.json();
  expect(secondNewPageBody.items).toHaveLength(1);
  expect(secondNewPageBody.items[0].publicId).not.toBe(
    firstNewPageBody.items[0].publicId,
  );
  expect(secondNewPageBody.dataCutoff).toBe(firstNewPageBody.dataCutoff);
  expect(secondNewPageBody.nextCursor).toBeNull();
  const withdrawalSnapshot = await (
    await context.request.get(
      `${application.url}/api/v1/repositories?locale=en&view=new&limit=1`,
    )
  ).json();
  await database.query(
    `update entities set public_visibility = false
     where public_id = 'repository-archived-ai'`,
  );
  const withdrawnSecondPage = await context.request.get(
    `${application.url}/api/v1/repositories?locale=en&view=new&limit=1&cursor=${encodeURIComponent(withdrawalSnapshot.nextCursor)}`,
  );
  expect(await withdrawnSecondPage.json()).toMatchObject({
    items: [],
    nextCursor: null,
  });
  await database.query(
    `update entities set public_visibility = true
     where public_id = 'repository-archived-ai'`,
  );
  const released = await context.request.get(
    `${application.url}/api/v1/repositories?locale=en&view=recently_released`,
  );
  expect(await released.json()).toMatchObject({
    items: [
      {
        publicId: "repository-ai-radar",
        latestRelease: { tagName: "v0.1.0" },
      },
    ],
  });
  const featured = await context.request.get(
    `${application.url}/api/v1/repositories?locale=en&view=featured`,
  );
  expect(await featured.json()).toMatchObject({
    view: "featured",
    rankingState: "available",
    emptyState: "no_editorial_selections",
    items: [],
  });

  const detail = await context.request.get(
    `${application.url}/api/v1/repositories/repository-ai-radar?locale=en`,
  );
  expect(detail.status()).toBe(200);
  const detailBody = await detail.json();
  expect(detailBody).toMatchObject({
    publicId: "repository-ai-radar",
    githubRepositoryId: 1351105824,
    fullName: "cryanskl/ai-radar",
    officialUrl: "https://github.com/cryanskl/ai-radar",
    license: {
      status: "detected",
      spdxId: "Apache-2.0",
      reuseNotice: "declared_license_review_terms",
    },
    lifecycleState: "active",
    parentRepository: null,
    sourceRepository: null,
    templateRepository: null,
    observations: [
      { observedAt: "2026-08-30T15:10:00.000Z", stars: 120 },
      { observedAt: "2026-09-02T15:10:00.000Z", stars: 120 },
      { observedAt: "2026-09-06T15:10:00.000Z", stars: 220 },
    ],
    releases: [{ tagName: "v0.1.0" }],
    relatedEntities: [
      expect.objectContaining({
        publicId: "model-repository-output",
        predicate: "IMPLEMENTS",
        evidence: [
          expect.objectContaining({
            sourceItemPublicId: latestSource.rows[0].public_id,
          }),
        ],
      }),
    ],
  });
  expect(JSON.stringify(detailBody)).not.toContain("README");

  const search = await context.request.get(
    `${application.url}/api/v1/search?q=cryanskl%2Fai-radar&locale=en&type=repository`,
  );
  expect((await search.json()).items[0]).toMatchObject({
    publicId: "repository-ai-radar",
    entityType: "repository",
  });

  await page.goto(`${application.url}/en/github?view=rising`);
  await expect(
    page.getByRole("heading", { name: "GitHub Repositories" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Rising measures recent source-normalized growth, not code quality.",
    ),
  ).toBeVisible();
  await expect(page.getByText("+100 stars", { exact: false })).toBeVisible();
  await expect(
    page.getByText("github-rising v1.0.0", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Window: 7 days", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Detected · Active", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Latest release: v0.1.0", { exact: true }),
  ).toBeVisible();
  await page.goto(`${application.url}/zh/github/repository-archived-ai`);
  await expect(
    page.getByText("未检测到许可证，不要假设可以复制或商用。", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("已归档", { exact: true })).toBeVisible();
  await expect(
    page.getByText("描述: An archived fixture without a detected license.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("主题: ai", { exact: true })).toBeVisible();
  await expect(page.getByText("语言: Python", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "example/template-origin" }),
  ).toBeVisible();

  const openApi = await (
    await context.request.get(`${application.url}/api/openapi.json`)
  ).json();
  const ajv = new Ajv2020({ strict: false });
  addFormats(ajv);
  for (const [path, body] of [
    ["/api/v1/repositories", risingBody],
    ["/api/v1/repositories/{publicId}", detailBody],
  ] as const) {
    const validate = ajv.compile(
      openApi.paths[path].get.responses["200"].content["application/json"]
        .schema,
    );
    expect(validate(body), ajv.errorsText(validate.errors)).toBe(true);
  }

  const renamedRepository = {
    ...updatedRepository,
    full_name: "newowner/ai-radar",
    owner: { id: 34471145, login: "newowner" },
    html_url: "https://github.com/newowner/ai-radar",
    updated_at: "2026-09-10T15:00:46Z",
    pushed_at: "2026-09-10T14:59:31Z",
  };
  fixture.renameRepository(
    "cryanskl/ai-radar",
    "newowner/ai-radar",
    JSON.stringify(renamedRepository),
  );
  const renameTransition = await runGithubWorker({
    apiUrl: fixture.url,
    databaseUrl: application.databaseUrl,
    now: "2026-09-10T15:10:00.000Z",
  });
  expect(renameTransition.exitCode, renameTransition.output).toBe(0);
  const renamed = await context.request.get(
    `${application.url}/api/v1/repositories/repository-ai-radar?locale=en`,
  );
  expect(await renamed.json()).toMatchObject({
    githubRepositoryId: 1351105824,
    fullName: "newowner/ai-radar",
    officialUrl: "https://github.com/newowner/ai-radar",
    lifecycleState: "active",
  });
  const renamedEntity = await database.query<{
    official_name: string;
    official_url: string;
  }>(
    `select official_name, official_url from entities
     where public_id = 'repository-ai-radar'`,
  );
  expect(renamedEntity.rows).toEqual([
    {
      official_name: "newowner/ai-radar",
      official_url: "https://github.com/newowner/ai-radar",
    },
  ]);
  const renamedSearch = await context.request.get(
    `${application.url}/api/v1/search?q=newowner%2Fai-radar&locale=en&type=repository`,
  );
  expect((await renamedSearch.json()).items[0]).toMatchObject({
    publicId: "repository-ai-radar",
    entityType: "repository",
  });

  const privateRequestStart = fixture.requests.length;
  fixture.setRepository(
    JSON.stringify({
      ...renamedRepository,
      private: true,
      visibility: "private",
    }),
  );
  const privateTransition = await runGithubWorker({
    apiUrl: fixture.url,
    databaseUrl: application.databaseUrl,
    now: "2026-09-11T15:10:00.000Z",
  });
  expect(privateTransition.exitCode, privateTransition.output).toBe(0);
  const privateRequests = fixture.requests
    .slice(privateRequestStart)
    .map(({ url }) => url)
    .filter((url) => url.includes("newowner/ai-radar"));
  expect(privateRequests).toEqual(["/repos/newowner/ai-radar"]);
  const privateDetail = await context.request.get(
    `${application.url}/api/v1/repositories/repository-ai-radar?locale=en`,
  );
  expect(await privateDetail.json()).toMatchObject({
    fullName: "newowner/ai-radar",
    lifecycleState: "unavailable",
  });

  fixture.setRepository(JSON.stringify(renamedRepository));
  const publicAgainTransition = await runGithubWorker({
    apiUrl: fixture.url,
    databaseUrl: application.databaseUrl,
    now: "2026-09-12T15:10:00.000Z",
  });
  expect(publicAgainTransition.exitCode, publicAgainTransition.output).toBe(0);
  const publicAgain = await context.request.get(
    `${application.url}/api/v1/repositories/repository-ai-radar?locale=en`,
  );
  expect(await publicAgain.json()).toMatchObject({
    fullName: "newowner/ai-radar",
    lifecycleState: "active",
  });

  fixture.setRepositoryUnavailable("newowner/ai-radar");
  const unavailableTransition = await runGithubWorker({
    apiUrl: fixture.url,
    databaseUrl: application.databaseUrl,
    now: "2026-09-13T15:10:00.000Z",
  });
  expect(unavailableTransition.exitCode, unavailableTransition.output).toBe(0);
  const unavailable = await context.request.get(
    `${application.url}/api/v1/repositories/repository-ai-radar?locale=en`,
  );
  expect(await unavailable.json()).toMatchObject({
    lifecycleState: "unavailable",
    observations: [
      { observedAt: "2026-08-30T15:10:00.000Z" },
      { observedAt: "2026-09-02T15:10:00.000Z" },
      { observedAt: "2026-09-06T15:10:00.000Z" },
      { observedAt: "2026-09-10T15:10:00.000Z" },
      { observedAt: "2026-09-11T15:10:00.000Z" },
      { observedAt: "2026-09-12T15:10:00.000Z" },
      { observedAt: "2026-09-13T15:10:00.000Z" },
    ],
  });
  await page.goto(`${application.url}/en/github/repository-ai-radar`);
  await expect(page.getByText("Unavailable", { exact: true })).toBeVisible();
  await database.end();
  await fixture.stop();
});
