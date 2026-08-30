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

test("Owner creates a rights-classified bilingual Event draft through HTTP", async ({
  context,
  page,
}) => {
  if (!application) throw new Error("Test application did not start");
  const anonymousCreate = await context.request.post(
    `${application.url}/api/v1/admin/event-drafts`,
    { data: {} },
  );
  expect(anonymousCreate.status()).toBe(401);
  const anonymousCreateBody = await anonymousCreate.json();

  const owner = await completeFakeGithubOAuth({
    applicationUrl: application.url,
    databaseUrl: application.databaseUrl,
    ownerGithubId: "34471145",
    profile: {
      avatar_url: "https://avatars.example.test/owner",
      email: "event-owner@example.test",
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

  const eventDraftInput = {
    source: {
      publicId: "openai",
      name: "OpenAI",
      homepageUrl: "https://openai.com/",
      tier: "S",
      accessStatus: "approved_limited",
      acquisitionMethod: "manual",
      policyLastReviewedAt: "2026-08-30T06:50:00.000Z",
    },
    sourceItem: {
      publicId: "source-item-openai-chatgpt-2022-11-30",
      externalId: "https://openai.com/index/chatgpt/",
      originalUrl: "https://openai.com/index/chatgpt/",
      canonicalUrl: "https://openai.com/index/chatgpt/",
      originalTitle: "Introducing ChatGPT",
      originalLanguage: "en",
      publishedAt: "2022-11-30T00:00:00.000Z",
      publishedAtPrecision: "day",
      discoveredAt: "2026-08-30T06:50:00.000Z",
      rightsStatus: "metadata_only",
      rightsCheckedAt: "2026-08-30T06:50:00.000Z",
      attribution: "OpenAI",
      licenseUrl: null,
    },
    event: {
      publicId: "event-chatgpt-launch-2022-11-30",
      eventType: "announces",
      factStatus: "confirmed",
      occurredAt: "2022-11-30T00:00:00.000Z",
      occurredAtPrecision: "day",
      lastVerifiedAt: "2026-08-30T06:50:00.000Z",
      rightsStatus: "metadata_only",
    },
    localizations: [
      {
        locale: "en",
        title: "OpenAI introduces ChatGPT as a research preview",
        summary:
          "OpenAI introduced ChatGPT as a free research preview for gathering feedback on a conversational model.",
        authorship: "human_authored",
        reviewStatus: "reviewed",
      },
      {
        locale: "zh",
        title: "OpenAI 推出 ChatGPT 研究预览版",
        summary:
          "OpenAI 推出免费的 ChatGPT 研究预览版，用于收集用户对对话模型能力与局限的反馈。",
        authorship: "human_authored",
        reviewStatus: "reviewed",
      },
    ],
  };
  const unsafeUrlDraft = await context.request.post(
    `${application.url}/api/v1/admin/event-drafts`,
    {
      data: {
        ...eventDraftInput,
        sourceItem: {
          ...eventDraftInput.sourceItem,
          originalUrl: "javascript:alert(1)",
        },
      },
    },
  );
  expect(unsafeUrlDraft.status()).toBe(400);

  const response = await context.request.post(
    `${application.url}/api/v1/admin/event-drafts`,
    { data: eventDraftInput },
  );

  expect(response.status()).toBe(201);
  const draftBody = await response.json();
  expect(draftBody).toMatchObject({
    publicId: "event-chatgpt-launch-2022-11-30",
    publicationState: "ready",
    locales: ["en", "zh"],
  });
  const duplicateDraft = await context.request.post(
    `${application.url}/api/v1/admin/event-drafts`,
    { data: eventDraftInput },
  );
  expect(duplicateDraft.status()).toBe(409);
  const duplicateDraftBody = await duplicateDraft.json();
  expect(duplicateDraftBody).toEqual({ error: "already_exists" });

  const publicDraft = await context.request.get(
    `${application.url}/api/v1/events/event-chatgpt-launch-2022-11-30`,
  );
  expect(publicDraft.status()).toBe(404);

  const restrictedPublicId = "event-restricted-source-2022-11-30";
  const restrictedDraft = await context.request.post(
    `${application.url}/api/v1/admin/event-drafts`,
    {
      data: {
        ...eventDraftInput,
        source: {
          ...eventDraftInput.source,
          publicId: "restricted-source",
          accessStatus: "permission_pending",
        },
        sourceItem: {
          ...eventDraftInput.sourceItem,
          publicId: "source-item-restricted-2022-11-30",
          rightsStatus: "permission_required",
        },
        event: {
          ...eventDraftInput.event,
          publicId: restrictedPublicId,
          rightsStatus: "permission_required",
        },
      },
    },
  );
  expect(restrictedDraft.status()).toBe(201);
  expect(await restrictedDraft.json()).toMatchObject({
    publicId: restrictedPublicId,
    publicationState: "verifying",
  });
  const restrictedPublish = await context.request.post(
    `${application.url}/api/v1/admin/events/${restrictedPublicId}/publish`,
  );
  expect(restrictedPublish.status()).toBe(409);
  const restrictedPublishBody = await restrictedPublish.json();
  expect(
    (
      await context.request.get(
        `${application.url}/api/v1/events/${restrictedPublicId}`,
      )
    ).status(),
  ).toBe(404);

  const withdrawnPublicId = "event-withdrawn-2022-11-30";
  const withdrawnDraft = await context.request.post(
    `${application.url}/api/v1/admin/event-drafts`,
    {
      data: {
        ...eventDraftInput,
        source: {
          ...eventDraftInput.source,
          publicId: "withdrawn-source",
        },
        sourceItem: {
          ...eventDraftInput.sourceItem,
          publicId: "source-item-withdrawn-2022-11-30",
        },
        event: {
          ...eventDraftInput.event,
          publicId: withdrawnPublicId,
          factStatus: "withdrawn",
        },
      },
    },
  );
  expect(withdrawnDraft.status()).toBe(201);
  expect(await withdrawnDraft.json()).toMatchObject({
    publicId: withdrawnPublicId,
    publicationState: "withdrawn",
  });
  expect(
    (
      await context.request.post(
        `${application.url}/api/v1/admin/events/${withdrawnPublicId}/publish`,
      )
    ).status(),
  ).toBe(409);

  await page.goto(
    `${application.url}/admin/events/event-chatgpt-launch-2022-11-30`,
  );
  await expect(
    page.getByRole("heading", { level: 1, name: "Event publication preview" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      level: 2,
      name: "OpenAI introduces ChatGPT as a research preview",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      level: 2,
      name: "OpenAI 推出 ChatGPT 研究预览版",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Introducing ChatGPT" }),
  ).toHaveAttribute("href", "https://openai.com/index/chatgpt/");

  await page.getByRole("button", { name: "Publish event" }).click();
  await expect(page.getByText("Publication state: published")).toBeVisible();
  const publishResponse = await context.request.post(
    `${application.url}/api/v1/admin/events/event-chatgpt-launch-2022-11-30/publish`,
  );
  const publishBody = await publishResponse.json();

  const englishResponse = await context.request.get(
    `${application.url}/api/v1/events/event-chatgpt-launch-2022-11-30?locale=en`,
  );
  expect(englishResponse.status()).toBe(200);
  const englishEvent = await englishResponse.json();
  expect(englishEvent).toMatchObject({
    publicId: "event-chatgpt-launch-2022-11-30",
    eventType: "announces",
    factStatus: "confirmed",
    publicationState: "published",
    occurredAt: "2022-11-30T00:00:00.000Z",
    occurredAtPrecision: "day",
    discoveredAt: "2026-08-30T06:50:00.000Z",
    lastVerifiedAt: "2026-08-30T06:50:00.000Z",
    rightsStatus: "metadata_only",
    localization: {
      locale: "en",
      title: "OpenAI introduces ChatGPT as a research preview",
    },
    sources: [
      {
        name: "OpenAI",
        tier: "S",
        originalTitle: "Introducing ChatGPT",
        originalUrl: "https://openai.com/index/chatgpt/",
        publishedAt: "2022-11-30T00:00:00.000Z",
        publishedAtPrecision: "day",
        rightsStatus: "metadata_only",
      },
    ],
  });

  const chineseResponse = await context.request.get(
    `${application.url}/api/v1/events/event-chatgpt-launch-2022-11-30?locale=zh`,
  );
  expect(chineseResponse.status()).toBe(200);
  const chineseEvent = await chineseResponse.json();
  expect(chineseEvent.localization).toMatchObject({
    locale: "zh",
    title: "OpenAI 推出 ChatGPT 研究预览版",
  });
  expect({ ...chineseEvent, localization: undefined }).toEqual({
    ...englishEvent,
    localization: undefined,
  });

  const radarResponse = await context.request.get(
    `${application.url}/api/v1/events?locale=en`,
  );
  expect(radarResponse.status()).toBe(200);
  const radarBody = await radarResponse.json();
  expect(radarBody).toMatchObject({
    items: [{ publicId: "event-chatgpt-launch-2022-11-30" }],
  });

  const contractResponse = await context.request.get(
    `${application.url}/api/openapi.json`,
  );
  const contract = await contractResponse.json();
  expect(contract.paths).toHaveProperty("/api/v1/admin/event-drafts.post");
  expect(contract.paths).toHaveProperty(
    "/api/v1/admin/events/{publicId}/publish.post",
  );
  expect(contract.paths).toHaveProperty("/api/v1/events.get");
  expect(contract.paths).toHaveProperty("/api/v1/events/{publicId}.get");
  expect(
    contract.paths["/api/v1/admin/event-drafts"].post.responses,
  ).toHaveProperty("401");
  expect(
    contract.paths["/api/v1/admin/events/{publicId}/publish"].post.responses,
  ).toHaveProperty("409");
  const ajv = new Ajv2020({ strict: false });
  addFormats(ajv);
  const contractExamples = [
    {
      body: draftBody,
      schema:
        contract.paths["/api/v1/admin/event-drafts"].post.responses["201"]
          .content["application/json"].schema,
    },
    {
      body: publishBody,
      schema:
        contract.paths["/api/v1/admin/events/{publicId}/publish"].post
          .responses["200"].content["application/json"].schema,
    },
    {
      body: englishEvent,
      schema:
        contract.paths["/api/v1/events/{publicId}"].get.responses["200"]
          .content["application/json"].schema,
    },
    {
      body: radarBody,
      schema:
        contract.paths["/api/v1/events"].get.responses["200"].content[
          "application/json"
        ].schema,
    },
    {
      body: anonymousCreateBody,
      schema:
        contract.paths["/api/v1/admin/event-drafts"].post.responses["401"]
          .content["application/json"].schema,
    },
    {
      body: duplicateDraftBody,
      schema:
        contract.paths["/api/v1/admin/event-drafts"].post.responses["409"]
          .content["application/json"].schema,
    },
    {
      body: restrictedPublishBody,
      schema:
        contract.paths["/api/v1/admin/events/{publicId}/publish"].post
          .responses["409"].content["application/json"].schema,
    },
  ];
  for (const example of contractExamples) {
    const validate = ajv.compile(example.schema);
    expect(validate(example.body), JSON.stringify(validate.errors)).toBe(true);
  }

  await page.goto(`${application.url}/en/radar`);
  await expect(
    page.getByRole("heading", { level: 1, name: "AI Radar" }),
  ).toBeVisible();
  await page
    .getByRole("link", {
      name: "OpenAI introduces ChatGPT as a research preview",
    })
    .click();
  await expect(page).toHaveURL(
    `${application.url}/en/radar/events/event-chatgpt-launch-2022-11-30`,
  );
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "OpenAI introduces ChatGPT as a research preview",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Occurred: 2022-11-30", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Source published: 2022-11-30", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Discovered: 2026-08-30T06:50:00.000Z", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Last verified: 2026-08-30T06:50:00.000Z", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Rights: Metadata only", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Localization: Human-authored · Reviewed", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Source rights: Metadata only", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Attribution: OpenAI", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Introducing ChatGPT" }),
  ).toHaveAttribute("href", "https://openai.com/index/chatgpt/");

  await page.goto(`${application.url}/zh/radar`);
  await expect(
    page.getByRole("heading", { level: 1, name: "AI 雷达" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "OpenAI 推出 ChatGPT 研究预览版" })
    .click();
  await expect(page).toHaveURL(
    `${application.url}/zh/radar/events/event-chatgpt-launch-2022-11-30`,
  );
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "OpenAI 推出 ChatGPT 研究预览版",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("发生时间：2022-11-30", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("来源发布时间：2022-11-30", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("本站发现时间：2026-08-30T06:50:00.000Z", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("最后核验时间：2026-08-30T06:50:00.000Z", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("权利：仅元数据", { exact: true })).toBeVisible();
  await expect(
    page.getByText("本地化：人工撰写 · 已审核", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("来源权利：仅元数据", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("署名：OpenAI", { exact: true })).toBeVisible();

  const client = new Client({ connectionString: application.databaseUrl });
  await client.connect();
  const persisted = await client.query<{
    all_public: boolean;
    audit_count: string;
    event_rights: string;
    locale_count: string;
    publication_state: string;
    source_item_count: string;
  }>(
    `select
       e.publication_state::text,
       e.rights_status::text as event_rights,
       count(distinct lc.locale)::text as locale_count,
       count(distinct si.id)::text as source_item_count,
       (select count(*)::text from event_publication_audits a where a.event_id = e.id) as audit_count,
       bool_and(e.public_visibility and lc.public_visibility and si.public_visibility) as all_public
     from events e
     join localized_contents lc on lc.event_id = e.id
     join event_sources es on es.event_id = e.id
     join source_items si on si.id = es.source_item_id
     where e.public_id = $1
     group by e.id`,
    ["event-chatgpt-launch-2022-11-30"],
  );
  await client.end();
  expect(persisted.rows[0]).toEqual({
    all_public: true,
    audit_count: "1",
    event_rights: "metadata_only",
    locale_count: "2",
    publication_state: "published",
    source_item_count: "1",
  });
});
