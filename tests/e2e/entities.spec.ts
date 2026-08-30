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

test("Owner publishes distinct Entities, Versions and evidenced one-hop Relations", async ({
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
      avatar_url: "https://avatars.example.test/owner",
      email: "entity-owner@example.test",
      id: 34_471_145,
      login: "cryanskl",
      name: "AI Radar Owner",
    },
  });
  if (!owner.sessionToken)
    throw new Error("Owner OAuth did not create a session");

  const unauthorized = await context.request.post(
    `${applicationUrl}/api/v1/admin/entities`,
    { data: {} },
  );
  expect(unauthorized.status()).toBe(401);

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

  const eventDraft = await context.request.post(
    `${applicationUrl}/api/v1/admin/event-drafts`,
    {
      data: {
        source: {
          publicId: "openai-entity-fixture",
          name: "OpenAI",
          homepageUrl: "https://openai.com/",
          tier: "S",
          accessStatus: "approved",
          acquisitionMethod: "manual",
          policyLastReviewedAt: "2026-08-30T00:00:00.000Z",
        },
        sourceItem: {
          publicId: "source-model-alpha-announcement",
          externalId: "model-alpha-announcement",
          originalUrl: "https://openai.com/index/model-alpha/",
          canonicalUrl: "https://openai.com/index/model-alpha/",
          originalTitle: "Introducing Model Alpha",
          originalLanguage: "en",
          publishedAt: "2026-08-29T10:00:00.000Z",
          publishedAtPrecision: "second",
          discoveredAt: "2026-08-29T10:05:00.000Z",
          rightsStatus: "open",
          rightsCheckedAt: "2026-08-30T00:00:00.000Z",
          attribution: "OpenAI",
          licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
        },
        event: {
          publicId: "event-model-alpha-announcement",
          eventType: "announces",
          factStatus: "confirmed",
          occurredAt: "2026-08-29T10:00:00.000Z",
          occurredAtPrecision: "second",
          lastVerifiedAt: "2026-08-30T01:00:00.000Z",
          rightsStatus: "open",
        },
        localizations: [
          {
            locale: "en",
            title: "OpenAI announces Model Alpha",
            summary: "OpenAI announced the first Model Alpha release.",
            authorship: "human_authored",
            reviewStatus: "reviewed",
          },
          {
            locale: "zh",
            title: "OpenAI 发布 Alpha 模型",
            summary: "OpenAI 发布了首个 Alpha 模型版本。",
            authorship: "human_authored",
            reviewStatus: "reviewed",
          },
        ],
      },
    },
  );
  expect(eventDraft.status()).toBe(201);
  expect(
    (
      await context.request.post(
        `${applicationUrl}/api/v1/admin/events/event-model-alpha-announcement/publish`,
      )
    ).status(),
  ).toBe(200);

  const createEntity = async ({
    publicId,
    type,
    officialName,
    englishName,
    chineseName,
    aliases = [],
    versions = [],
  }: {
    publicId: string;
    type: string;
    officialName: string;
    englishName: string;
    chineseName: string;
    aliases?: Array<{
      publicId: string;
      locale: "en" | "zh";
      kind: "official" | "localized" | "historical";
      value: string;
    }>;
    versions?: Array<{
      publicId: string;
      versionLabel: string;
      releasedAt: string | null;
      releasedAtPrecision: "day" | "minute" | "second" | null;
    }>;
  }) => {
    const response = await context.request.post(
      `${applicationUrl}/api/v1/admin/entities`,
      {
        data: {
          entity: {
            publicId,
            type,
            officialName,
            officialUrl: `https://example.test/entities/${publicId}`,
            lastVerifiedAt: "2026-08-30T02:00:00.000Z",
            rightsStatus: "open",
          },
          localizations: [
            {
              locale: "en",
              name: englishName,
              summary: `${englishName} public profile.`,
              authorship: "human_authored",
              reviewStatus: "reviewed",
            },
            {
              locale: "zh",
              name: chineseName,
              summary: `${chineseName}公开档案。`,
              authorship: "human_authored",
              reviewStatus: "reviewed",
            },
          ],
          aliases,
          versions,
        },
      },
    );
    const body = await response.json();
    expect(response.status(), JSON.stringify(body)).toBe(201);
    return body;
  };

  const modelCreation = await createEntity({
    publicId: "model-alpha",
    type: "model",
    officialName: "Model Alpha",
    englishName: "Model Alpha",
    chineseName: "Alpha 模型",
    aliases: [
      {
        publicId: "alias-model-alpha-official",
        locale: "en",
        kind: "official",
        value: "Alpha",
      },
      {
        publicId: "alias-model-alpha-zh",
        locale: "zh",
        kind: "localized",
        value: "阿尔法模型",
      },
      {
        publicId: "alias-model-alpha-historical",
        locale: "en",
        kind: "historical",
        value: "Legacy Alpha",
      },
    ],
    versions: [
      {
        publicId: "model-alpha-v1",
        versionLabel: "v1",
        releasedAt: "2026-08-29T10:00:00.000Z",
        releasedAtPrecision: "second",
      },
      {
        publicId: "model-alpha-v2",
        versionLabel: "v2",
        releasedAt: null,
        releasedAtPrecision: null,
      },
    ],
  });
  await createEntity({
    publicId: "organization-openai",
    type: "organization",
    officialName: "OpenAI",
    englishName: "OpenAI",
    chineseName: "OpenAI",
    aliases: [
      {
        publicId: "alias-openai-alpha",
        locale: "en",
        kind: "historical",
        value: "Alpha",
      },
    ],
  });
  await createEntity({
    publicId: "event-model-alpha-announcement",
    type: "topic",
    officialName: "AI Agents",
    englishName: "AI Agents",
    chineseName: "AI 智能体",
  });

  const invalidRelation = await context.request.post(
    `${applicationUrl}/api/v1/admin/relations`,
    {
      data: {
        relation: {
          publicId: "relation-without-evidence",
          subject: { type: "entity", publicId: "model-alpha" },
          predicate: "TAGGED_WITH",
          objectEntityPublicId: "topic-agents",
          validFrom: null,
          validTo: null,
          firstVerifiedAt: "2026-08-30T02:00:00.000Z",
          lastVerifiedAt: "2026-08-30T02:00:00.000Z",
          confidence: 95,
          reviewStatus: "reviewed",
          creationMethod: "editor",
          rightsStatus: "open",
        },
        evidenceSourceItemPublicIds: [],
      },
    },
  );
  expect(invalidRelation.status()).toBe(400);

  for (const {
    publicId,
    evidenceSourceItemPublicIds,
    firstVerifiedAt,
    lastVerifiedAt,
  } of [
    {
      publicId: "relation-reversed-verification-time",
      evidenceSourceItemPublicIds: ["source-model-alpha-announcement"],
      firstVerifiedAt: "2026-08-30T03:00:00.000Z",
      lastVerifiedAt: "2026-08-30T02:00:00.000Z",
    },
    {
      publicId: "relation-missing-evidence",
      evidenceSourceItemPublicIds: ["missing-source-item"],
      firstVerifiedAt: "2026-08-30T02:00:00.000Z",
      lastVerifiedAt: "2026-08-30T02:00:00.000Z",
    },
  ]) {
    const invalidBoundaryRelation = await context.request.post(
      `${applicationUrl}/api/v1/admin/relations`,
      {
        data: {
          relation: {
            publicId,
            subject: { type: "entity", publicId: "model-alpha" },
            predicate: "TAGGED_WITH",
            objectEntityPublicId: "event-model-alpha-announcement",
            validFrom: null,
            validTo: null,
            firstVerifiedAt,
            lastVerifiedAt,
            confidence: 95,
            reviewStatus: "reviewed",
            creationMethod: "editor",
            rightsStatus: "open",
          },
          evidenceSourceItemPublicIds,
        },
      },
    );
    expect(invalidBoundaryRelation.status()).toBe(400);
  }

  const relationInputs = [
    {
      publicId: "relation-event-announces-model-alpha",
      subject: {
        type: "event" as const,
        publicId: "event-model-alpha-announcement",
      },
      predicate: "ANNOUNCES",
      objectEntityPublicId: "model-alpha",
      validFrom: "2026-08-29T10:00:00.000Z",
      validTo: null,
    },
    {
      publicId: "relation-openai-develops-model-alpha",
      subject: {
        type: "entity" as const,
        publicId: "organization-openai",
      },
      predicate: "DEVELOPS",
      objectEntityPublicId: "model-alpha",
      validFrom: null,
      validTo: null,
    },
    {
      publicId: "relation-model-alpha-tagged-agents",
      subject: { type: "entity" as const, publicId: "model-alpha" },
      predicate: "TAGGED_WITH",
      objectEntityPublicId: "event-model-alpha-announcement",
      validFrom: null,
      validTo: null,
    },
  ];
  const relationBodies = [];
  for (const relation of relationInputs) {
    const response = await context.request.post(
      `${applicationUrl}/api/v1/admin/relations`,
      {
        data: {
          relation: {
            ...relation,
            firstVerifiedAt: "2026-08-30T02:00:00.000Z",
            lastVerifiedAt: "2026-08-30T02:00:00.000Z",
            confidence: 95,
            reviewStatus: "reviewed",
            creationMethod: "editor",
            rightsStatus: "open",
          },
          evidenceSourceItemPublicIds: ["source-model-alpha-announcement"],
        },
      },
    );
    const body = await response.json();
    expect(response.status(), JSON.stringify(body)).toBe(201);
    relationBodies.push(body);
  }

  for (let index = 0; index < 20; index += 1) {
    const response = await context.request.post(
      `${applicationUrl}/api/v1/admin/relations`,
      {
        data: {
          relation: {
            ...relationInputs[2],
            publicId: `relation-overflow-${index}`,
            firstVerifiedAt: "2026-08-30T02:00:00.000Z",
            lastVerifiedAt:
              index === 18
                ? "2026-08-30T03:00:00.000Z"
                : "2026-08-30T02:00:00.000Z",
            confidence: index === 19 ? 100 : index === 18 ? 95 : 50,
            reviewStatus: "reviewed",
            creationMethod: "editor",
            rightsStatus: "open",
          },
          evidenceSourceItemPublicIds: ["source-model-alpha-announcement"],
        },
      },
    );
    expect(response.status(), JSON.stringify(await response.json())).toBe(201);
  }

  const entityResponse = await context.request.get(
    `${applicationUrl}/api/v1/entities/model-alpha?locale=en`,
  );
  expect(entityResponse.status()).toBe(200);
  const entityBody = await entityResponse.json();
  expect(entityBody).toMatchObject({
    publicId: "model-alpha",
    type: "model",
    localization: { locale: "en", name: "Model Alpha" },
    versions: [
      { publicId: "model-alpha-v1", versionLabel: "v1" },
      { publicId: "model-alpha-v2", versionLabel: "v2" },
    ],
  });
  expect(entityBody.outgoingRelations).toHaveLength(21);
  expect(entityBody.outgoingRelations[0]).toMatchObject({
    predicate: "TAGGED_WITH",
    direction: "outgoing",
    object: { publicId: "event-model-alpha-announcement" },
    confidence: 95,
    reviewStatus: "reviewed",
  });
  expect(entityBody.backlinks).toHaveLength(2);
  expect(
    entityBody.backlinks.map(
      (relation: { subject: { publicId: string } }) =>
        relation.subject.publicId,
    ),
  ).toEqual(["event-model-alpha-announcement", "organization-openai"]);
  expect(entityBody.timeline).toEqual([
    {
      eventPublicId: "event-model-alpha-announcement",
      occurredAt: "2026-08-29T10:00:00.000Z",
      occurredAtPrecision: "second",
      relationPublicId: "relation-event-announces-model-alpha",
      predicate: "ANNOUNCES",
      title: "OpenAI announces Model Alpha",
    },
  ]);
  expect(entityBody.graph.nodes.length).toBeLessThanOrEqual(20);
  expect(entityBody.graph.edges.length).toBeLessThanOrEqual(19);
  expect(entityBody.graph.truncated).toBe(true);
  expect(entityBody.graph.edges).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ relationPublicId: "relation-overflow-19" }),
      expect.objectContaining({ relationPublicId: "relation-overflow-18" }),
    ]),
  );
  expect(entityBody.graph.nodes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        nodeId: "event:event-model-alpha-announcement",
      }),
      expect.objectContaining({
        nodeId: "entity:event-model-alpha-announcement",
      }),
    ]),
  );

  const filteredEntityResponse = await context.request.get(
    `${applicationUrl}/api/v1/entities/model-alpha?locale=en&predicate=ANNOUNCES`,
  );
  expect(filteredEntityResponse.status()).toBe(200);
  expect(await filteredEntityResponse.json()).toMatchObject({
    outgoingRelations: [],
    backlinks: [{ predicate: "ANNOUNCES" }],
    graph: { edges: [{ predicate: "ANNOUNCES" }], truncated: false },
  });
  const invalidRelationTypeResponse = await context.request.get(
    `${applicationUrl}/api/v1/entities/model-alpha?locale=en&predicate=NOT_A_RELATION`,
  );
  expect(invalidRelationTypeResponse.status()).toBe(400);
  const invalidRelationTypeBody = await invalidRelationTypeResponse.json();

  for (const { alias, locale } of [
    { alias: "Legacy Alpha", locale: "en" },
    { alias: "阿尔法模型", locale: "zh" },
  ]) {
    const resolution = await context.request.get(
      `${applicationUrl}/api/v1/entities/resolve?alias=${encodeURIComponent(alias)}&locale=${locale}`,
    );
    expect(resolution.status()).toBe(200);
    expect(await resolution.json()).toMatchObject({
      publicId: "model-alpha",
      matchedAlias: alias,
    });
  }

  const ambiguousAlias = await context.request.get(
    `${applicationUrl}/api/v1/entities/resolve?alias=Alpha&locale=en`,
  );
  expect(ambiguousAlias.status()).toBe(409);
  const invalidEntityTypeResponse = await context.request.get(
    `${applicationUrl}/api/v1/entities/resolve?alias=Alpha&locale=en&type=not-an-entity`,
  );
  expect(invalidEntityTypeResponse.status()).toBe(400);
  const invalidEntityTypeBody = await invalidEntityTypeResponse.json();
  for (const { type, publicId } of [
    { type: "model", publicId: "model-alpha" },
    { type: "organization", publicId: "organization-openai" },
  ]) {
    const typedResolution = await context.request.get(
      `${applicationUrl}/api/v1/entities/resolve?alias=Alpha&locale=en&type=${type}`,
    );
    expect(typedResolution.status()).toBe(200);
    expect(await typedResolution.json()).toMatchObject({ publicId });
  }

  const version = await context.request.get(
    `${applicationUrl}/api/v1/entity-versions/model-alpha-v1?locale=en`,
  );
  expect(version.status()).toBe(200);
  expect(await version.json()).toEqual({
    publicId: "model-alpha-v1",
    entityPublicId: "model-alpha",
    entityName: "Model Alpha",
    versionLabel: "v1",
    releasedAt: "2026-08-29T10:00:00.000Z",
    releasedAtPrecision: "second",
    lastVerifiedAt: "2026-08-30T02:00:00.000Z",
  });

  const eventResponse = await context.request.get(
    `${applicationUrl}/api/v1/events/event-model-alpha-announcement?locale=en`,
  );
  expect(eventResponse.status()).toBe(200);
  expect(await eventResponse.json()).toMatchObject({
    entities: [
      {
        publicId: "model-alpha",
        type: "model",
        name: "Model Alpha",
        relationPublicId: "relation-event-announces-model-alpha",
        predicate: "ANNOUNCES",
      },
    ],
  });

  const contract = await (
    await context.request.get(`${applicationUrl}/api/openapi.json`)
  ).json();
  for (const path of [
    "/api/v1/admin/entities",
    "/api/v1/admin/relations",
    "/api/v1/entities/{publicId}",
    "/api/v1/entities/resolve",
    "/api/v1/entity-versions/{publicId}",
  ]) {
    expect(contract.paths).toHaveProperty(path);
  }
  const ajv = new Ajv2020({ strict: false });
  addFormats(ajv);
  for (const { body, schema } of [
    {
      body: modelCreation,
      schema:
        contract.paths["/api/v1/admin/entities"].post.responses["201"].content[
          "application/json"
        ].schema,
    },
    {
      body: relationBodies[0],
      schema:
        contract.paths["/api/v1/admin/relations"].post.responses["201"].content[
          "application/json"
        ].schema,
    },
    {
      body: entityBody,
      schema:
        contract.paths["/api/v1/entities/{publicId}"].get.responses["200"]
          .content["application/json"].schema,
    },
    {
      body: invalidEntityTypeBody,
      schema:
        contract.paths["/api/v1/entities/resolve"].get.responses["400"].content[
          "application/json"
        ].schema,
    },
    {
      body: invalidRelationTypeBody,
      schema:
        contract.paths["/api/v1/entities/{publicId}"].get.responses["400"]
          .content["application/json"].schema,
    },
  ]) {
    const validate = ajv.compile(schema);
    expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
  }
  expect(
    contract.paths["/api/v1/entities/resolve"].get.responses["400"].description,
  ).toContain("Entity type");
  expect(
    contract.paths["/api/v1/entities/{publicId}"].get.responses["400"]
      .description,
  ).toContain("Relation predicate");

  await page.goto(
    `${applicationUrl}/en/radar/events/event-model-alpha-announcement`,
  );
  await page.getByRole("link", { name: "Model Alpha", exact: true }).click();
  await expect(page).toHaveURL(`${applicationUrl}/en/entities/model-alpha`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Model Alpha" }),
  ).toBeVisible();
  await expect(
    page.getByText("v1 · 2026-08-29T10:00:00.000Z · model-alpha-v1"),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Outgoing relations" }),
  ).toBeVisible();
  await expect(page.getByText("TAGGED_WITH · AI Agents").first()).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Backlinks" }),
  ).toBeVisible();
  await expect(
    page.getByText("ANNOUNCES · OpenAI announces Model Alpha", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "One-hop graph for Model Alpha" }),
  ).toBeVisible();
  await expect(
    page.locator(
      'line[data-from-node-id="event:event-model-alpha-announcement"][data-to-node-id="entity:model-alpha"]',
    ),
  ).toHaveAttribute("marker-end", "url(#relation-arrow)");

  await page.goto(`${applicationUrl}/zh/entities/model-alpha`);
  await expect(page.getByText("模型 · 活跃")).toBeVisible();
  await expect(page.getByText(/Legacy Alpha · en · 历史名称/)).toBeVisible();
  await expect(page.getByText(/置信度: 95 · 已审核/).first()).toBeVisible();
  await expect(page.getByText(/有效期: 开放 – 开放/).first()).toBeVisible();
  await expect(page.getByText("最后核验").first()).toBeVisible();
  await expect(page.getByText("发布时间未知")).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Alpha 模型的一跳关系图" }),
  ).toBeVisible();

  const client = new Client({ connectionString: application.databaseUrl });
  await client.connect();
  const graphState = await client.query<{
    alias_count: string;
    audit_count: string;
    backlink_table_count: string;
    entity_count: string;
    evidence_count: string;
    relation_count: string;
    version_count: string;
  }>(
    `select
       (select count(*)::text from entities) as entity_count,
       (select count(*)::text from entity_versions) as version_count,
       (select count(*)::text from entity_aliases) as alias_count,
       (select count(*)::text from relations) as relation_count,
       (select count(*)::text from relation_evidence) as evidence_count,
       (select count(*)::text from owner_operation_audits) as audit_count,
       (select count(*)::text from information_schema.tables where table_schema = 'public' and table_name = 'backlinks') as backlink_table_count`,
  );
  await client.end();
  expect(graphState.rows[0]).toEqual({
    alias_count: "4",
    audit_count: "26",
    backlink_table_count: "0",
    entity_count: "3",
    evidence_count: "23",
    relation_count: "23",
    version_count: "2",
  });
});
