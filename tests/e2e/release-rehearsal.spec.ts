import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
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

const readRecoveryFingerprint = async (databaseUrl: string) => {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const result = await client.query<{ fingerprint: unknown }>(`
    select jsonb_build_object(
      'events', (select coalesce(jsonb_agg(jsonb_build_array(public_id, rights_status, publication_state) order by public_id), '[]') from events),
      'entities', (select coalesce(jsonb_agg(jsonb_build_array(public_id, rights_status, lifecycle_status) order by public_id), '[]') from entities),
      'relations', (select coalesce(jsonb_agg(jsonb_build_array(public_id, rights_status, review_status) order by public_id), '[]') from relations),
      'source_items', (select coalesce(jsonb_agg(jsonb_build_array(public_id, rights_status, attribution) order by public_id), '[]') from source_items),
      'event_publication_audits', (select coalesce(jsonb_agg(jsonb_build_array(event_id, action, from_state, to_state) order by event_id, created_at), '[]') from event_publication_audits),
      'owner_operation_audits', (select coalesce(jsonb_agg(jsonb_build_array(action, target_type, target_public_id, public_visibility) order by action, target_type, target_public_id), '[]') from owner_operation_audits)
    ) as fingerprint
  `);
  await client.end();
  return result.rows[0].fingerprint;
};

const startArxivFixture = async () => {
  const body = await readFile(
    new URL("../fixtures/arxiv-attention-paper.xml", import.meta.url),
    "utf8",
  );
  let status = 200;
  const server: Server = createServer((_request, response) => {
    response.writeHead(status, {
      "content-type": status === 200 ? "application/atom+xml" : "text/plain",
    });
    response.end(status === 200 ? body : "upstream unavailable");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Could not read fixture port");
  return {
    fail() {
      status = 503;
    },
    stop: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
    url: `http://127.0.0.1:${address.port}/api/query`,
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

test("restores release-critical PostgreSQL facts and audits into an isolated database", async ({
  context,
}) => {
  if (!application) throw new Error("Test application did not start");
  const owner = await completeFakeGithubOAuth({
    applicationUrl: application.url,
    databaseUrl: application.databaseUrl,
    ownerGithubId: "34471145",
    profile: {
      avatar_url: "https://avatars.example.test/release-owner",
      email: "release-owner@example.test",
      id: 34_471_145,
      login: "cryanskl",
      name: "AI Radar Release Owner",
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

  const manifest = JSON.parse(
    await readFile(
      new URL(
        "../../data/historical-batches/chatgpt-research-preview-v1.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const imported = await context.request.post(
    `${application.url}/api/v1/admin/historical-batches`,
    { data: manifest },
  );
  expect(imported.status(), await imported.text()).toBe(201);

  const before = await readRecoveryFingerprint(application.databaseUrl);
  const restored = await application.restoreDatabaseBackup();
  try {
    expect(await readRecoveryFingerprint(restored.databaseUrl)).toEqual(before);
  } finally {
    await restored.stop();
  }
});

test("rehearses one real sourced Event across every Public Alpha output", async ({
  context,
  page,
}) => {
  if (!application) throw new Error("Test application did not start");
  const applicationUrl = application.url;
  const owner = await completeFakeGithubOAuth({
    applicationUrl,
    databaseUrl: application.databaseUrl,
    ownerGithubId: "34471145",
    profile: {
      avatar_url: "https://avatars.example.test/rehearsal-owner",
      email: "rehearsal-owner@example.test",
      id: 34_471_145,
      login: "cryanskl",
      name: "AI Radar Rehearsal Owner",
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

  expect(
    (
      await context.request.post(`${applicationUrl}/api/v1/admin/sources/arxiv`)
    ).status(),
  ).toBe(201);
  const fixture = await startArxivFixture();
  const successfulRun = await runArxivWorker({
    apiUrl: fixture.url,
    databaseUrl: application.databaseUrl,
    now: "2026-08-31T01:00:00.000Z",
  });
  expect(successfulRun.exitCode, successfulRun.output).toBe(0);
  fixture.fail();
  const failedRun = await runArxivWorker({
    apiUrl: fixture.url,
    databaseUrl: application.databaseUrl,
    now: "2026-08-31T01:00:03.000Z",
  });
  await fixture.stop();
  expect(failedRun.exitCode, failedRun.output).not.toBe(0);

  const database = new Client({ connectionString: application.databaseUrl });
  await database.connect();
  const ingestion = await database.query<{
    failed_runs: string;
    source_items: string;
    source_status: string;
    succeeded_runs: string;
  }>(`
    select
      (select count(*)::text from source_items where public_id = 'arxiv-1706-03762v7') as source_items,
      (select count(*)::text from ingest_runs where status = 'succeeded') as succeeded_runs,
      (select count(*)::text from ingest_runs where status = 'retryable_failure') as failed_runs,
      (select status::text from source_health health join sources source on source.id = health.source_id where source.public_id = 'arxiv') as source_status
  `);
  expect(ingestion.rows[0]).toEqual({
    source_items: "1",
    succeeded_runs: "1",
    failed_runs: "1",
    source_status: "degraded",
  });
  await database.end();

  const eventPublicId = "event-release-rehearsal-attention-paper";
  const promoted = await context.request.post(
    `${applicationUrl}/api/v1/admin/inbox/arxiv-1706-03762v7/event-draft`,
    {
      data: {
        event: {
          publicId: eventPublicId,
          eventType: "announces",
          factStatus: "confirmed",
          occurredAt: "2017-06-12T17:57:34.000Z",
          occurredAtPrecision: "second",
          lastVerifiedAt: "2026-08-31T01:10:00.000Z",
          rightsStatus: "open",
        },
        localizations: [
          {
            locale: "en",
            title: "Attention Is All You Need enters the public record",
            summary:
              "AI Radar records the official arXiv metadata for the Transformer paper.",
            authorship: "human_authored",
            reviewStatus: "reviewed",
          },
          {
            locale: "zh",
            title: "《Attention Is All You Need》进入公开记录",
            summary: "AI Radar 记录 Transformer 论文的官方 arXiv 元数据。",
            authorship: "human_authored",
            reviewStatus: "reviewed",
          },
        ],
      },
    },
  );
  expect(promoted.status(), await promoted.text()).toBe(201);
  expect(
    (
      await context.request.post(
        `${applicationUrl}/api/v1/admin/events/${eventPublicId}/publish`,
      )
    ).status(),
  ).toBe(200);

  const secondSourceEventPublicId =
    "event-release-rehearsal-attention-google-research";
  const secondSourceItemPublicId = "google-research-attention-paper";
  const secondSourceDraft = await context.request.post(
    `${applicationUrl}/api/v1/admin/event-drafts`,
    {
      data: {
        source: {
          publicId: "google-research",
          name: "Google Research",
          homepageUrl: "https://research.google/",
          tier: "S",
          accessStatus: "approved",
          acquisitionMethod: "manual",
          policyLastReviewedAt: "2026-08-31T01:12:00.000Z",
        },
        sourceItem: {
          publicId: secondSourceItemPublicId,
          externalId: "attention-is-all-you-need",
          externalIdVerifiedAt: "2026-08-31T01:12:00.000Z",
          isOriginalSource: true,
          originalUrl:
            "https://research.google/pubs/attention-is-all-you-need/",
          canonicalUrl:
            "https://research.google/pubs/attention-is-all-you-need/",
          originalTitle: "Attention is All You Need",
          originalLanguage: "en",
          publishedAt: "2017-12-04T00:00:00.000Z",
          publishedAtPrecision: "day",
          discoveredAt: "2026-08-31T01:12:00.000Z",
          rightsStatus: "metadata_only",
          rightsCheckedAt: "2026-08-31T01:12:00.000Z",
          attribution: "Google Research",
          licenseUrl: null,
        },
        event: {
          publicId: secondSourceEventPublicId,
          eventType: "announces",
          factStatus: "confirmed",
          occurredAt: "2017-06-12T17:57:34.000Z",
          occurredAtPrecision: "second",
          lastVerifiedAt: "2026-08-31T01:12:00.000Z",
          rightsStatus: "open",
        },
        localizations: [
          {
            locale: "en",
            title: "Google Research lists Attention Is All You Need",
            summary:
              "An independent official publication page identifies the same Transformer paper.",
            authorship: "human_authored",
            reviewStatus: "reviewed",
          },
          {
            locale: "zh",
            title: "Google Research 收录《Attention Is All You Need》",
            summary: "独立的官方出版页面指向同一篇 Transformer 论文。",
            authorship: "human_authored",
            reviewStatus: "reviewed",
          },
        ],
      },
    },
  );
  expect(secondSourceDraft.status(), await secondSourceDraft.text()).toBe(201);
  expect(
    (
      await context.request.post(
        `${applicationUrl}/api/v1/admin/events/${secondSourceEventPublicId}/publish`,
      )
    ).status(),
  ).toBe(200);
  const consolidation = await context.request.post(
    `${applicationUrl}/api/v1/admin/events/merge`,
    {
      data: {
        targetEventPublicId: eventPublicId,
        sourceEventPublicId: secondSourceEventPublicId,
        publicReasonCode: "duplicate_coverage",
        internalNote:
          "The official arXiv and Google Research records identify the same paper publication.",
      },
    },
  );
  expect(consolidation.status(), await consolidation.text()).toBe(200);
  expect(await consolidation.json()).toMatchObject({
    status: "merged",
    sourceEventPublicId: secondSourceEventPublicId,
    targetEventPublicId: eventPublicId,
    sourceCount: 2,
  });
  const mergedTombstone = await context.request.get(
    `${applicationUrl}/api/v1/events/${secondSourceEventPublicId}?locale=en`,
  );
  expect(await mergedTombstone.json()).toMatchObject({
    status: "merged_into",
    targetEventPublicId: eventPublicId,
  });

  const paperPublicId = "paper-release-rehearsal-attention";
  const entity = await context.request.post(
    `${applicationUrl}/api/v1/admin/entities`,
    {
      data: {
        entity: {
          publicId: paperPublicId,
          type: "paper",
          officialName: "Attention Is All You Need",
          officialUrl: "https://arxiv.org/abs/1706.03762",
          lastVerifiedAt: "2026-08-31T01:10:00.000Z",
          rightsStatus: "metadata_only",
        },
        localizations: [
          {
            locale: "en",
            name: "Attention Is All You Need",
            summary: "The paper that introduced the Transformer architecture.",
            authorship: "human_authored",
            reviewStatus: "reviewed",
          },
          {
            locale: "zh",
            name: "Attention Is All You Need",
            summary: "提出 Transformer 架构的论文。",
            authorship: "human_authored",
            reviewStatus: "reviewed",
          },
        ],
        aliases: [
          {
            publicId: "alias-release-rehearsal-arxiv-id",
            locale: "en",
            kind: "official",
            value: "1706.03762v7",
          },
        ],
        versions: [
          {
            publicId: "paper-release-rehearsal-attention-v7",
            versionLabel: "v7",
            releasedAt: "2017-06-12T17:57:34.000Z",
            releasedAtPrecision: "second",
          },
        ],
      },
    },
  );
  expect(entity.status(), await entity.text()).toBe(201);
  const paperProfile = await context.request.post(
    `${applicationUrl}/api/v1/admin/paper-revision-profiles`,
    {
      data: {
        familyPublicId: paperPublicId,
        versionPublicId: "paper-release-rehearsal-attention-v7",
        sourceItemPublicId: "arxiv-1706-03762v7",
        arxivId: "1706.03762",
        arxivVersion: "v7",
        title: "Attention Is All You Need",
        authors: [
          "Ashish Vaswani",
          "Noam Shazeer",
          "Niki Parmar",
          "Jakob Uszkoreit",
          "Llion Jones",
          "Aidan N. Gomez",
          "Lukasz Kaiser",
          "Illia Polosukhin",
        ].map((name) => ({ name, institutions: [] })),
        topics: ["transformers", "natural-language-processing"],
        fullTextRightsStatus: "link_only",
        fullTextLicenseUrl: null,
        guidance: [
          {
            locale: "en",
            claimedContributions: [
              "The source identifies the Transformer architecture.",
            ],
            limitations: [
              "AI Radar does not redistribute the paper full text.",
            ],
            inference: [
              "This profile records provenance, not a quality ranking.",
            ],
            authorship: "human_authored",
            reviewStatus: "reviewed",
          },
          {
            locale: "zh",
            claimedContributions: ["来源记录了 Transformer 架构。"],
            limitations: ["AI Radar 不重新分发论文全文。"],
            inference: ["此档案记录溯源，不代表质量排名。"],
            authorship: "human_authored",
            reviewStatus: "reviewed",
          },
        ],
        resourceLinks: [],
      },
    },
  );
  expect(paperProfile.status(), await paperProfile.text()).toBe(201);
  const relationPublicId = "relation-release-event-announces-attention-paper";
  const relation = await context.request.post(
    `${applicationUrl}/api/v1/admin/relations`,
    {
      data: {
        relation: {
          publicId: relationPublicId,
          subject: { type: "event", publicId: eventPublicId },
          predicate: "ANNOUNCES",
          objectEntityPublicId: paperPublicId,
          validFrom: "2017-06-12T17:57:34.000Z",
          validTo: null,
          firstVerifiedAt: "2026-08-31T01:10:00.000Z",
          lastVerifiedAt: "2026-08-31T01:10:00.000Z",
          confidence: 100,
          reviewStatus: "reviewed",
          creationMethod: "editor",
          rightsStatus: "open",
        },
        evidenceSourceItemPublicIds: ["arxiv-1706-03762v7"],
      },
    },
  );
  expect(relation.status(), await relation.text()).toBe(201);

  await page.goto(`${applicationUrl}/en/radar`);
  const radarEvent = page.getByRole("article").filter({
    has: page.getByRole("link", {
      name: "Attention Is All You Need enters the public record",
    }),
  });
  await expect(radarEvent).toContainText("2 sources");
  await page.goto(`${applicationUrl}/en/papers/${paperPublicId}`);
  await expect(
    page.getByRole("heading", {
      name: "Attention Is All You Need",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "Attention Is All You Need enters the public record",
    }),
  ).toBeVisible();

  for (const [locale, query] of [
    ["en", "Attention Is All You Need"],
    ["zh", "进入公开记录"],
  ] as const) {
    const search = await context.request.get(
      `${applicationUrl}/api/v1/search?q=${encodeURIComponent(query)}&locale=${locale}`,
    );
    expect(search.status()).toBe(200);
    expect(JSON.stringify(await search.json())).toContain(eventPublicId);
  }
  const ask = await context.request.post(`${applicationUrl}/api/v1/ask`, {
    data: {
      question: "Attention Is All You Need enters the public record",
      locale: "en",
    },
  });
  expect(ask.status(), await ask.text()).toBe(200);
  expect(await ask.json()).toMatchObject({
    status: "answered",
    claims: [
      {
        citations: [expect.objectContaining({ publicId: eventPublicId })],
      },
    ],
  });

  const editionPublicId = "daily-brief-edition-release-rehearsal";
  const briefInput = (locale: "en" | "zh") => ({
    publicId: `daily-brief-${locale}-release-rehearsal`,
    editionPublicId,
    locale,
    briefDate: "2026-08-31",
    version: "1.0",
    dataCutoff: "2026-08-31T02:00:00.000Z",
    title:
      locale === "en"
        ? "Public Alpha release rehearsal"
        : "Public Alpha 发布演练",
    overview:
      locale === "en"
        ? "One sourced Event traverses every public output."
        : "一条有来源的事件贯穿全部公开出口。",
    coverageNote:
      locale === "en"
        ? "English and Chinese sources; global Events."
        : "以中英文来源为主，事件面向全球。",
    whatToWatch:
      locale === "en" ? "Watch correction propagation." : "关注更正传播。",
    authorship: "human_authored",
    reviewStatus: "reviewed",
    items: [
      {
        eventPublicId,
        position: 1,
        section: "models_research",
        commentary:
          locale === "en"
            ? "Official arXiv metadata is linked."
            : "已关联官方 arXiv 元数据。",
      },
    ],
  });
  const enBrief = briefInput("en");
  const zhBrief = briefInput("zh");
  for (const input of [enBrief, zhBrief]) {
    const created = await context.request.post(
      `${applicationUrl}/api/v1/admin/daily-briefs`,
      { data: input },
    );
    expect(created.status(), await created.text()).toBe(201);
  }
  const briefPublication = await context.request.post(
    `${applicationUrl}/api/v1/admin/daily-briefs/${enBrief.publicId}/publish`,
  );
  expect(briefPublication.status(), await briefPublication.text()).toBe(200);
  const rss = await context.request.get(`${applicationUrl}/en/rss/daily.xml`);
  expect(rss.status()).toBe(200);
  expect(await rss.text()).toContain(eventPublicId);

  const correctionPublicId = "correction-release-rehearsal-attention";
  const correction = await context.request.post(
    `${applicationUrl}/api/v1/admin/corrections`,
    {
      data: {
        publicId: correctionPublicId,
        case: {
          publicId: "case-release-rehearsal-attention",
          receivedAt: "2026-08-31T02:10:00.000Z",
          originalRequest:
            "Clarify that this is an AI Radar publication record.",
          evidenceSummary:
            "The official arXiv record confirms the paper metadata.",
        },
        target: { type: "event", publicId: eventPublicId },
        reasonCode: "factual_error",
        effectiveAt: "2026-08-31T02:15:00.000Z",
        replacementVersion: `${eventPublicId}@2026-08-31T02:15:00.000Z`,
        evidenceSourceItemPublicIds: ["arxiv-1706-03762v7"],
        changes: {
          localizations: [
            {
              locale: "en",
              title:
                "AI Radar corrects the Attention Is All You Need publication record",
              summary:
                "The corrected record distinguishes the paper publication from AI Radar ingestion.",
            },
            {
              locale: "zh",
              title: "AI Radar 更正《Attention Is All You Need》公开记录",
              summary: "更正后的记录区分论文发布与 AI Radar 收录时间。",
            },
          ],
        },
        internalNote: "Release rehearsal correction verified against arXiv.",
      },
    },
  );
  expect(correction.status(), await correction.text()).toBe(201);

  const eventApi = await context.request.get(
    `${applicationUrl}/api/v1/events/${eventPublicId}?locale=en`,
  );
  expect(eventApi.status()).toBe(200);
  expect(eventApi.headers()["x-ai-radar-data-version"]).toBe(
    "public-alpha-test",
  );
  expect(await eventApi.json()).toMatchObject({
    publicId: eventPublicId,
    factStatus: "corrected",
    localization: {
      title:
        "AI Radar corrects the Attention Is All You Need publication record",
    },
    corrections: [{ publicId: correctionPublicId }],
  });
  const eventsApi = await context.request.get(
    `${applicationUrl}/api/v1/events?locale=en&limit=50`,
  );
  expect(eventsApi.status()).toBe(200);
  expect(await eventsApi.json()).toMatchObject({
    dataVersion: "public-alpha-test",
    items: expect.arrayContaining([
      expect.objectContaining({ publicId: eventPublicId }),
    ]),
  });
  await page.goto(`${applicationUrl}/en/radar/events/${eventPublicId}`);
  await expect(
    page.getByRole("heading", {
      name: "AI Radar corrects the Attention Is All You Need publication record",
    }),
  ).toBeVisible();
  const corrections = page
    .getByRole("heading", { name: "Corrections" })
    .locator("..")
    .locator("article");
  await expect(corrections).toContainText(correctionPublicId);

  const correctedSearch = await context.request.get(
    `${applicationUrl}/api/v1/search?q=${encodeURIComponent("corrects the Attention")}&locale=en`,
  );
  expect(JSON.stringify(await correctedSearch.json())).toContain(eventPublicId);
  const correctedAsk = await context.request.post(
    `${applicationUrl}/api/v1/ask`,
    {
      data: {
        question: "corrects the Attention publication record",
        locale: "en",
      },
    },
  );
  expect(JSON.stringify(await correctedAsk.json())).toContain(eventPublicId);

  const release = await context.request.post(
    `${applicationUrl}/api/v1/admin/data-releases`,
    {
      data: {
        publicId: "data-release-rehearsal-v1",
        dataVersion: "public-release-rehearsal-v1",
        dataCutoff: "2026-09-01T00:00:00.000Z",
        canonicalUrl:
          "https://github.com/cryanskl/ai-radar/releases/tag/data-release-rehearsal-v1",
        license: "CC-BY-4.0",
        attribution: "AI Radar and the named source publishers",
      },
    },
  );
  expect(release.status(), await release.text()).toBe(201);
  const releaseDatabase = new Client({
    connectionString: application.databaseUrl,
  });
  await releaseDatabase.connect();
  const releaseFiles = await releaseDatabase.query<{
    content: string;
    name: string;
  }>(`
    select file.name::text, file.content
    from data_release_files file
    join data_releases release on release.id = file.release_id
    where release.public_id = 'data-release-rehearsal-v1'
      and file.name in ('records.json', 'corrections.json')
    order by file.name
  `);
  const byName = new Map(
    releaseFiles.rows.map(({ name, content }) => [name, JSON.parse(content)]),
  );
  expect(JSON.stringify(byName.get("records.json"))).toContain(eventPublicId);
  expect(JSON.stringify(byName.get("corrections.json"))).toContain(
    correctionPublicId,
  );
  await releaseDatabase.end();
});
