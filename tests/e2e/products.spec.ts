import { expect, test } from "@playwright/test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
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

test("publishes sourced bilingual Product profiles, disclosures, relations and timelines without a global score", async ({
  context,
  page,
}) => {
  if (!application) throw new Error("Test application did not start");
  const applicationUrl = application.url;
  const profileUrl = `${applicationUrl}/api/v1/admin/product-profiles`;

  expect((await context.request.post(profileUrl, { data: {} })).status()).toBe(
    401,
  );
  const owner = await completeFakeGithubOAuth({
    applicationUrl,
    databaseUrl: application.databaseUrl,
    ownerGithubId: "34471145",
    profile: {
      avatar_url: "https://avatars.example.test/product-owner",
      email: "product-owner@example.test",
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

  const createEvidenceEvent = async ({
    publicId,
    eventType,
    sourceItemPublicId,
    title,
    occurredAt,
  }: {
    publicId: string;
    eventType: "announces" | "changes_price_of";
    sourceItemPublicId: string;
    title: string;
    occurredAt: string;
  }) => {
    const draft = await context.request.post(
      `${applicationUrl}/api/v1/admin/event-drafts`,
      {
        data: {
          source: {
            publicId: `product-official-source-${publicId}`,
            name: "Product official source",
            homepageUrl: "https://products.example.test/",
            tier: "A",
            accessStatus: "approved",
            acquisitionMethod: "manual",
            policyLastReviewedAt: "2026-08-01T00:00:00.000Z",
          },
          sourceItem: {
            publicId: sourceItemPublicId,
            externalId: sourceItemPublicId,
            externalIdVerifiedAt: occurredAt,
            isOriginalSource: true,
            originalUrl: `https://products.example.test/${sourceItemPublicId}`,
            canonicalUrl: `https://products.example.test/${sourceItemPublicId}`,
            originalTitle: title,
            originalLanguage: "en",
            publishedAt: occurredAt,
            publishedAtPrecision: "second",
            discoveredAt: occurredAt,
            rightsStatus: "open",
            rightsCheckedAt: occurredAt,
            attribution: "Product official source",
            licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
          },
          event: {
            publicId,
            eventType,
            factStatus: "confirmed",
            occurredAt,
            occurredAtPrecision: "second",
            lastVerifiedAt: occurredAt,
            rightsStatus: "open",
          },
          localizations: [
            {
              locale: "en",
              title,
              summary: "A verified Product update from the official source.",
              authorship: "human_authored",
              reviewStatus: "reviewed",
            },
            {
              locale: "zh",
              title: `${title}（中文）`,
              summary: "来自官方来源、经过核验的产品更新。",
              authorship: "human_authored",
              reviewStatus: "reviewed",
            },
          ],
        },
      },
    );
    expect(draft.status()).toBe(201);
    expect(
      (
        await context.request.post(
          `${applicationUrl}/api/v1/admin/events/${publicId}/publish`,
        )
      ).status(),
    ).toBe(200);
  };

  await createEvidenceEvent({
    publicId: "event-radar-studio-launch",
    eventType: "announces",
    sourceItemPublicId: "source-radar-studio-launch",
    title: "Radar Studio launches globally",
    occurredAt: "2026-08-01T08:00:00.000Z",
  });
  await createEvidenceEvent({
    publicId: "event-radar-studio-pricing",
    eventType: "changes_price_of",
    sourceItemPublicId: "source-radar-studio-pricing",
    title: "Radar Studio introduces a Pro subscription",
    occurredAt: "2026-08-30T08:00:00.000Z",
  });

  const createEntity = async ({
    publicId,
    type,
    officialName,
    enName,
    enSummary,
    zhName,
    zhSummary,
  }: {
    publicId: string;
    type:
      | "product"
      | "organization"
      | "model"
      | "repository"
      | "prompt"
      | "skill"
      | "guide";
    officialName: string;
    enName: string;
    enSummary: string;
    zhName: string;
    zhSummary: string;
  }) => {
    const response = await context.request.post(
      `${applicationUrl}/api/v1/admin/entities`,
      {
        data: {
          entity: {
            publicId,
            type,
            officialName,
            officialUrl: `https://${publicId}.example.test/`,
            lastVerifiedAt: "2026-08-30T08:00:00.000Z",
            rightsStatus: "open",
          },
          localizations: [
            {
              locale: "en",
              name: enName,
              summary: enSummary,
              authorship: "human_authored",
              reviewStatus: "reviewed",
            },
            {
              locale: "zh",
              name: zhName,
              summary: zhSummary,
              authorship: "human_authored",
              reviewStatus: "reviewed",
            },
          ],
          aliases: [],
          versions: [],
        },
      },
    );
    expect(response.status()).toBe(201);
  };

  await createEntity({
    publicId: "organization-radar-labs",
    type: "organization",
    officialName: "Radar Labs",
    enName: "Radar Labs",
    enSummary: "The organization that develops Radar Studio.",
    zhName: "雷达实验室",
    zhSummary: "开发 Radar Studio 的组织。",
  });
  await createEntity({
    publicId: "product-radar-studio",
    type: "product",
    officialName: "Radar Studio",
    enName: "Radar Studio",
    enSummary: "A bilingual workspace for AI developers.",
    zhName: "雷达工作室",
    zhSummary: "面向 AI 开发者的双语工作空间。",
  });
  for (const entity of [
    ["model-radar-core", "model", "Radar Core", "雷达核心模型"],
    [
      "repository-radar-studio",
      "repository",
      "radar-labs/studio",
      "Radar Studio 仓库",
    ],
    ["prompt-radar-review", "prompt", "Radar Review", "雷达审阅提示词"],
    ["skill-radar-sync", "skill", "Radar Sync", "雷达同步 Skill"],
    ["guide-radar-start", "guide", "Radar Start Guide", "雷达入门指南"],
  ] as const) {
    await createEntity({
      publicId: entity[0],
      type: entity[1],
      officialName: entity[2],
      enName: entity[2],
      enSummary: `${entity[2]} is related to Radar Studio.`,
      zhName: entity[3],
      zhSummary: `${entity[3]}与雷达工作室相关。`,
    });
  }
  const searchBeforeProductProfile = await context.request.get(
    `${applicationUrl}/api/v1/search?q=Radar%20Studio&locale=en&type=product`,
  );
  expect(searchBeforeProductProfile.status()).toBe(200);
  expect((await searchBeforeProductProfile.json()).items).toEqual([]);

  const invalidDisclosure = await context.request.post(profileUrl, {
    data: {
      productPublicId: "product-radar-studio",
      category: "developer_tool",
      platforms: ["web", "api"],
      audienceTypes: ["developers"],
      observations: [
        {
          publicId: "product-observation-invalid",
          sourceItemPublicId: "source-radar-studio-launch",
          effectiveAt: "2026-08-01T08:00:00.000Z",
          observedAt: "2026-08-01T08:00:00.000Z",
          changeKind: "launch",
          lifecycleStatus: "active",
          availabilityRegions: ["global"],
          pricingMode: "freemium",
          commercialRelationship: "vendor_submitted",
          commercialDisclosure: null,
          vendorReportedMetrics: [],
        },
      ],
    },
  });
  expect(invalidDisclosure.status()).toBe(400);

  const profile = await context.request.post(profileUrl, {
    data: {
      productPublicId: "product-radar-studio",
      category: "developer_tool",
      platforms: ["web", "api"],
      audienceTypes: ["developers", "researchers"],
      observations: [
        {
          publicId: "product-radar-studio-launch",
          sourceItemPublicId: "source-radar-studio-launch",
          effectiveAt: "2026-08-01T08:00:00.000Z",
          observedAt: "2026-08-01T08:00:00.000Z",
          changeKind: "launch",
          lifecycleStatus: "active",
          availabilityRegions: ["global"],
          pricingMode: "freemium",
          commercialRelationship: "none_disclosed",
          commercialDisclosure: null,
          vendorReportedMetrics: [],
        },
      ],
    },
  });
  expect(profile.status()).toBe(201);
  expect(await profile.json()).toEqual({
    productPublicId: "product-radar-studio",
    publicVisibility: true,
    observationPublicIds: ["product-radar-studio-launch"],
  });
  const searchBeforeProductOwnership = await context.request.get(
    `${applicationUrl}/api/v1/search?q=Radar%20Studio&locale=en&type=product`,
  );
  expect(searchBeforeProductOwnership.status()).toBe(200);
  expect((await searchBeforeProductOwnership.json()).items).toEqual([]);

  const createRelation = async ({
    publicId,
    subject,
    predicate,
    objectEntityPublicId,
    sourceItemPublicId,
  }: {
    publicId: string;
    subject:
      | { type: "entity"; publicId: string }
      | { type: "event"; publicId: string };
    predicate:
      | "ANNOUNCES"
      | "UPDATES"
      | "CHANGES_PRICE_OF"
      | "DEVELOPS"
      | "USES"
      | "IMPLEMENTS"
      | "WORKS_WITH"
      | "SUPPORTS"
      | "EXPLAINS";
    objectEntityPublicId: string;
    sourceItemPublicId: string;
  }) => {
    const response = await context.request.post(
      `${applicationUrl}/api/v1/admin/relations`,
      {
        data: {
          relation: {
            publicId,
            subject,
            predicate,
            objectEntityPublicId,
            validFrom: "2026-08-01T08:00:00.000Z",
            validTo: null,
            firstVerifiedAt: "2026-08-30T08:00:00.000Z",
            lastVerifiedAt: "2026-08-30T08:00:00.000Z",
            confidence: 100,
            reviewStatus: "reviewed",
            creationMethod: "editor",
            rightsStatus: "open",
          },
          evidenceSourceItemPublicIds: [sourceItemPublicId],
        },
      },
    );
    expect(response.status(), `${publicId}: ${await response.text()}`).toBe(
      201,
    );
  };

  const launchEvidence = "source-radar-studio-launch";
  for (const relation of [
    {
      publicId: "relation-radar-labs-develops-studio",
      subject: {
        type: "entity" as const,
        publicId: "organization-radar-labs",
      },
      predicate: "DEVELOPS" as const,
      objectEntityPublicId: "product-radar-studio",
    },
    {
      publicId: "relation-studio-uses-core",
      subject: {
        type: "entity" as const,
        publicId: "product-radar-studio",
      },
      predicate: "USES" as const,
      objectEntityPublicId: "model-radar-core",
    },
    {
      publicId: "relation-prompt-works-with-studio",
      subject: {
        type: "entity" as const,
        publicId: "prompt-radar-review",
      },
      predicate: "WORKS_WITH" as const,
      objectEntityPublicId: "product-radar-studio",
    },
    {
      publicId: "relation-skill-supports-studio",
      subject: {
        type: "entity" as const,
        publicId: "skill-radar-sync",
      },
      predicate: "SUPPORTS" as const,
      objectEntityPublicId: "product-radar-studio",
    },
    {
      publicId: "relation-guide-explains-studio",
      subject: {
        type: "entity" as const,
        publicId: "guide-radar-start",
      },
      predicate: "EXPLAINS" as const,
      objectEntityPublicId: "product-radar-studio",
    },
    {
      publicId: "relation-launch-announces-studio",
      subject: {
        type: "event" as const,
        publicId: "event-radar-studio-launch",
      },
      predicate: "ANNOUNCES" as const,
      objectEntityPublicId: "product-radar-studio",
    },
    {
      publicId: "relation-launch-announces-repository",
      subject: {
        type: "event" as const,
        publicId: "event-radar-studio-launch",
      },
      predicate: "ANNOUNCES" as const,
      objectEntityPublicId: "repository-radar-studio",
    },
  ]) {
    await createRelation({ ...relation, sourceItemPublicId: launchEvidence });
  }
  await createRelation({
    publicId: "relation-pricing-changes-studio",
    subject: {
      type: "event",
      publicId: "event-radar-studio-pricing",
    },
    predicate: "CHANGES_PRICE_OF",
    objectEntityPublicId: "product-radar-studio",
    sourceItemPublicId: "source-radar-studio-pricing",
  });

  const observationUrl = `${applicationUrl}/api/v1/admin/product-observations`;
  const pricingObservation = {
    productPublicId: "product-radar-studio",
    observations: [
      {
        publicId: "product-radar-studio-pricing",
        sourceItemPublicId: "source-radar-studio-pricing",
        effectiveAt: "2026-08-29T08:00:00.000Z",
        observedAt: "2026-08-30T08:00:00.000Z",
        changeKind: "pricing_change",
        lifecycleStatus: "active",
        availabilityRegions: ["global", "US", "SG"],
        pricingMode: "subscription",
        commercialRelationship: "vendor_submitted",
        commercialDisclosure:
          "Facts were submitted by Radar Labs; no paid placement.",
        vendorReportedMetrics: [
          {
            publicId: "product-metric-radar-users",
            metric: "users",
            value: "125000",
            unit: "accounts",
            periodEndedAt: "2026-08-29T23:59:59.000Z",
          },
        ],
      },
    ],
  };
  expect(
    (
      await context.request.post(observationUrl, {
        data: pricingObservation,
        headers: { Cookie: "next-auth.session-token=invalid" },
      })
    ).status(),
  ).toBe(401);
  const appendedObservation = await context.request.post(observationUrl, {
    data: pricingObservation,
  });
  expect(appendedObservation.status()).toBe(201);
  expect(await appendedObservation.json()).toEqual({
    productPublicId: "product-radar-studio",
    publicVisibility: true,
    observationPublicIds: ["product-radar-studio-pricing"],
  });

  const list = await context.request.get(
    `${applicationUrl}/api/v1/products?locale=en&category=developer_tool&platform=web&audience=developers&region=SG&pricingMode=subscription&lifecycle=active&updatedFrom=2026-08-29T00%3A00%3A00.000Z&updatedTo=2026-08-29T23%3A59%3A59.999Z`,
  );
  expect(list.status()).toBe(200);
  const listBody = await list.json();
  expect(listBody).toMatchObject({
    locale: "en",
    items: [
      {
        publicId: "product-radar-studio",
        name: "Radar Studio",
        category: "developer_tool",
        platforms: ["web", "api"],
        audienceTypes: ["developers", "researchers"],
        organization: {
          relationPublicId: "relation-radar-labs-develops-studio",
          publicId: "organization-radar-labs",
          name: "Radar Labs",
        },
        current: {
          lifecycleStatus: "active",
          availabilityRegions: ["global", "US", "SG"],
          pricingMode: "subscription",
          effectiveAt: "2026-08-29T08:00:00.000Z",
          observedAt: "2026-08-30T08:00:00.000Z",
        },
      },
    ],
    dataCutoff: "2026-08-30T08:00:00.000Z",
  });
  expect(JSON.stringify(listBody)).not.toContain('"score"');
  expect(
    (
      await context.request.get(
        `${applicationUrl}/api/v1/products?locale=en&view=global-ranking`,
      )
    ).status(),
  ).toBe(400);

  const detail = await context.request.get(
    `${applicationUrl}/api/v1/products/product-radar-studio?locale=en`,
  );
  expect(detail.status()).toBe(200);
  const detailBody = await detail.json();
  expect(detailBody).toMatchObject({
    publicId: "product-radar-studio",
    name: "Radar Studio",
    organization: {
      relationPublicId: "relation-radar-labs-develops-studio",
      publicId: "organization-radar-labs",
      name: "Radar Labs",
    },
    current: {
      pricingMode: "subscription",
      commercialRelationship: "vendor_submitted",
      commercialDisclosure:
        "Facts were submitted by Radar Labs; no paid placement.",
      vendorReportedMetrics: [
        {
          publicId: "product-metric-radar-users",
          metric: "users",
          value: "125000",
          unit: "accounts",
          provenance: "vendor_self_reported",
        },
      ],
      source: {
        sourceItemPublicId: "source-radar-studio-pricing",
        title: "Radar Studio introduces a Pro subscription",
      },
    },
    observations: [
      {
        changeKind: "launch",
        pricingMode: "freemium",
        effectiveAt: "2026-08-01T08:00:00.000Z",
        observedAt: "2026-08-01T08:00:00.000Z",
      },
      {
        changeKind: "pricing_change",
        pricingMode: "subscription",
        effectiveAt: "2026-08-29T08:00:00.000Z",
        observedAt: "2026-08-30T08:00:00.000Z",
      },
    ],
  });
  expect(
    detailBody.relatedEntities.map(({ type }: { type: string }) => type),
  ).toEqual(
    expect.arrayContaining([
      "organization",
      "model",
      "repository",
      "prompt",
      "skill",
      "guide",
    ]),
  );
  expect(detailBody.timeline).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: "event",
        eventPublicId: "event-radar-studio-pricing",
        predicate: "CHANGES_PRICE_OF",
      }),
      expect.objectContaining({
        type: "product_observation",
        observationPublicId: "product-radar-studio-pricing",
        changeKind: "pricing_change",
        occurredAt: "2026-08-29T08:00:00.000Z",
        observedAt: "2026-08-30T08:00:00.000Z",
        lifecycleStatus: "active",
        availabilityRegions: ["global", "US", "SG"],
        pricingMode: "subscription",
        commercialRelationship: "vendor_submitted",
        commercialDisclosure:
          "Facts were submitted by Radar Labs; no paid placement.",
        vendorReportedMetrics: [
          expect.objectContaining({
            publicId: "product-metric-radar-users",
            metric: "users",
            value: "125000",
          }),
        ],
      }),
    ]),
  );
  expect(JSON.stringify(detailBody)).not.toContain('"score"');

  const laterProductUpdate = await context.request.post(observationUrl, {
    data: {
      productPublicId: "product-radar-studio",
      observations: [
        {
          publicId: "product-radar-studio-update",
          sourceItemPublicId: "source-radar-studio-pricing",
          effectiveAt: "2026-08-30T10:00:00.000Z",
          observedAt: "2026-08-30T10:00:00.000Z",
          changeKind: "product_update",
          lifecycleStatus: "active",
          availabilityRegions: ["global", "US", "SG"],
          pricingMode: "subscription",
          commercialRelationship: "none_disclosed",
          commercialDisclosure: null,
          vendorReportedMetrics: [],
        },
      ],
    },
  });
  expect(laterProductUpdate.status()).toBe(201);

  await createEntity({
    publicId: "product-radar-lite",
    type: "product",
    officialName: "Radar Lite",
    enName: "Radar Lite",
    enSummary: "A smaller Product used to prove stable cursor pagination.",
    zhName: "雷达轻量版",
    zhSummary: "用于验证稳定游标分页的轻量产品。",
  });
  await createRelation({
    publicId: "relation-radar-labs-develops-lite",
    subject: {
      type: "entity",
      publicId: "organization-radar-labs",
    },
    predicate: "DEVELOPS",
    objectEntityPublicId: "product-radar-lite",
    sourceItemPublicId: launchEvidence,
  });
  expect(
    (
      await context.request.post(profileUrl, {
        data: {
          productPublicId: "product-radar-lite",
          category: "developer_tool",
          platforms: ["web"],
          audienceTypes: ["developers"],
          observations: [
            {
              publicId: "product-radar-lite-launch",
              sourceItemPublicId: "source-radar-studio-launch",
              effectiveAt: "2026-08-15T08:00:00.000Z",
              observedAt: "2026-08-15T08:00:00.000Z",
              changeKind: "launch",
              lifecycleStatus: "active",
              availabilityRegions: ["global"],
              pricingMode: "free",
              commercialRelationship: "none_disclosed",
              commercialDisclosure: null,
              vendorReportedMetrics: [],
            },
          ],
        },
      })
    ).status(),
  ).toBe(201);
  const futurePricing = await context.request.post(observationUrl, {
    data: {
      productPublicId: "product-radar-lite",
      observations: [
        {
          publicId: "product-radar-lite-future-pricing",
          sourceItemPublicId: "source-radar-studio-pricing",
          effectiveAt: "2026-09-15T08:00:00.000Z",
          observedAt: "2026-08-30T11:00:00.000Z",
          changeKind: "pricing_change",
          lifecycleStatus: "active",
          availabilityRegions: ["global"],
          pricingMode: "subscription",
          commercialRelationship: "none_disclosed",
          commercialDisclosure: null,
          vendorReportedMetrics: [],
        },
      ],
    },
  });
  expect(futurePricing.status()).toBe(201);
  const currentFreeProducts = await context.request.get(
    `${applicationUrl}/api/v1/products?locale=en&pricingMode=free`,
  );
  expect(currentFreeProducts.status()).toBe(200);
  expect(await currentFreeProducts.json()).toMatchObject({
    items: [
      {
        publicId: "product-radar-lite",
        current: {
          publicId: "product-radar-lite-launch",
          pricingMode: "free",
        },
      },
    ],
  });
  const liteDetail = await context.request.get(
    `${applicationUrl}/api/v1/products/product-radar-lite?locale=en`,
  );
  expect(liteDetail.status()).toBe(200);
  expect(await liteDetail.json()).toMatchObject({
    current: {
      publicId: "product-radar-lite-launch",
      pricingMode: "free",
    },
  });
  const firstPage = await context.request.get(
    `${applicationUrl}/api/v1/products?locale=en&limit=1`,
  );
  const firstPageBody = await firstPage.json();
  expect(firstPageBody).toMatchObject({
    resultSet: { capturedCount: 2, limit: 1000, truncated: false },
    items: [{ publicId: "product-radar-studio" }],
    nextCursor: expect.any(String),
  });
  const secondPage = await context.request.get(
    `${applicationUrl}/api/v1/products?locale=en&limit=1&cursor=${encodeURIComponent(firstPageBody.nextCursor)}`,
  );
  expect(await secondPage.json()).toMatchObject({
    dataCutoff: firstPageBody.dataCutoff,
    items: [{ publicId: "product-radar-lite" }],
    nextCursor: null,
  });
  expect(
    (
      await context.request.get(
        `${applicationUrl}/api/v1/products?locale=zh&limit=1&cursor=${encodeURIComponent(firstPageBody.nextCursor)}`,
      )
    ).status(),
  ).toBe(400);

  await createEntity({
    publicId: "product-radar-scheduled",
    type: "product",
    officialName: "Radar Scheduled",
    enName: "Radar Scheduled",
    enSummary: "A Product whose only verified state is not effective yet.",
    zhName: "雷达计划版",
    zhSummary: "唯一已核验状态尚未生效的产品。",
  });
  await createRelation({
    publicId: "relation-radar-labs-develops-scheduled",
    subject: {
      type: "entity",
      publicId: "organization-radar-labs",
    },
    predicate: "DEVELOPS",
    objectEntityPublicId: "product-radar-scheduled",
    sourceItemPublicId: launchEvidence,
  });
  expect(
    (
      await context.request.post(profileUrl, {
        data: {
          productPublicId: "product-radar-scheduled",
          category: "developer_tool",
          platforms: ["web"],
          audienceTypes: ["developers"],
          observations: [
            {
              publicId: "product-radar-scheduled-launch",
              sourceItemPublicId: "source-radar-studio-pricing",
              effectiveAt: "2026-09-15T08:00:00.000Z",
              observedAt: "2026-08-30T12:00:00.000Z",
              changeKind: "launch",
              lifecycleStatus: "active",
              availabilityRegions: ["global"],
              pricingMode: "free",
              commercialRelationship: "none_disclosed",
              commercialDisclosure: null,
              vendorReportedMetrics: [],
            },
          ],
        },
      })
    ).status(),
  ).toBe(201);
  const futureOnlySearch = await context.request.get(
    `${applicationUrl}/api/v1/search?q=Radar%20Scheduled&locale=en&type=product`,
  );
  expect(futureOnlySearch.status()).toBe(200);
  expect((await futureOnlySearch.json()).items).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ publicId: "product-radar-scheduled" }),
    ]),
  );
  expect(
    (
      await context.request.post(observationUrl, {
        data: {
          productPublicId: "product-radar-scheduled",
          observations: [
            {
              publicId: "product-radar-scheduled-current",
              sourceItemPublicId: "source-radar-studio-pricing",
              effectiveAt: "2026-09-16T08:00:00.000Z",
              observedAt: "2026-09-16T08:00:00.000Z",
              changeKind: "product_update",
              lifecycleStatus: "active",
              availabilityRegions: ["global"],
              pricingMode: "free",
              commercialRelationship: "none_disclosed",
              commercialDisclosure: null,
              vendorReportedMetrics: [],
            },
          ],
        },
      })
    ).status(),
  ).toBe(201);

  const search = await context.request.get(
    `${applicationUrl}/api/v1/search?q=Radar%20Studio&locale=en&type=product`,
  );
  expect(search.status()).toBe(200);
  expect((await search.json()).items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        entityType: "product",
        publicId: "product-radar-studio",
      }),
    ]),
  );

  await page.goto(`${applicationUrl}/en/search?q=Radar%20Studio&type=product`);
  await page.getByRole("link", { name: "Radar Studio" }).first().click();
  await expect(page).toHaveURL(/\/en\/products\/product-radar-studio(?:\?|$)/);
  await expect(page.getByText("Commercial disclosure").first()).toBeVisible();

  await page.goto(`${applicationUrl}/en/products`);
  await expect(page.getByRole("heading", { name: "Products" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Radar Studio" })).toBeVisible();
  await page.goto(`${applicationUrl}/en/products/product-radar-studio`);
  await expect(page.getByText("Vendor self-reported")).toBeVisible();
  await expect(page.getByText("Commercial disclosure").first()).toBeVisible();
  await expect(
    page.getByText("Facts were submitted by Radar Labs; no paid placement."),
  ).toBeVisible();
  await expect(page.getByText(/Users: 125000 accounts/)).toBeVisible();
  await expect(page.getByText("Pricing and update timeline")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "radar-labs/studio" }),
  ).toBeVisible();
  await page.goto(`${applicationUrl}/zh/products/product-radar-studio`);
  await expect(page.getByRole("heading", { name: "雷达工作室" })).toBeVisible();
  await expect(page.getByText("厂商自报")).toBeVisible();
  await expect(page.getByText("商业关系披露").first()).toBeVisible();
  await expect(page.getByText("订阅").first()).toBeVisible();
  await expect(page.getByText("价格变化").first()).toBeVisible();
  await expect(page.getByText("AI Radar 收录时间").first()).toBeVisible();
  await expect(page.getByText("subscription", { exact: true })).toHaveCount(0);

  const openApiResponse = await context.request.get(
    `${applicationUrl}/api/openapi.json`,
  );
  expect(openApiResponse.status()).toBe(200);
  const openApi = await openApiResponse.json();
  const listSchema =
    openApi.paths["/api/v1/products"].get.responses["200"].content[
      "application/json"
    ].schema;
  const detailSchema =
    openApi.paths["/api/v1/products/{publicId}"].get.responses["200"].content[
      "application/json"
    ].schema;
  const ajv = new Ajv2020({ strict: false });
  addFormats(ajv);
  expect(ajv.compile(listSchema)(listBody)).toBe(true);
  expect(ajv.compile(detailSchema)(detailBody)).toBe(true);

  const searchCursorBeforeOrganizationWithdrawal = await context.request.get(
    `${applicationUrl}/api/v1/search?q=Radar&locale=en&type=product&limit=1`,
  );
  const searchWithdrawalCursorBody =
    await searchCursorBeforeOrganizationWithdrawal.json();
  expect(searchWithdrawalCursorBody).toMatchObject({
    items: [expect.objectContaining({ entityType: "product" })],
    resultSet: { capturedCount: 3 },
    nextCursor: expect.any(String),
  });

  const cursorBeforeOrganizationWithdrawal = await context.request.get(
    `${applicationUrl}/api/v1/products?locale=en&limit=2`,
  );
  const withdrawalCursorBody = await cursorBeforeOrganizationWithdrawal.json();
  expect(withdrawalCursorBody.nextCursor).toEqual(expect.any(String));
  const withdrawal = await context.request.post(
    `${applicationUrl}/api/v1/admin/rights-decisions`,
    {
      data: {
        publicId: "rights-radar-labs-withdrawal",
        case: {
          publicId: "case-radar-labs-withdrawal",
          receivedAt: "2026-08-31T08:00:00.000Z",
          originalRequest: "Withdraw Radar Labs from public distribution.",
          evidenceSummary: "Verified Organization rights request.",
        },
        target: {
          type: "entity",
          publicId: "organization-radar-labs",
        },
        toStatus: "withdrawn",
        publicReasonCode: "rights_withdrawal",
        effectiveAt: "2026-08-31T08:00:00.000Z",
        internalNote: "Owner verified the Organization withdrawal request.",
      },
    },
  );
  expect(withdrawal.status(), await withdrawal.text()).toBe(201);
  const pageAfterOrganizationWithdrawal = await context.request.get(
    `${applicationUrl}/api/v1/products?locale=en&limit=1&cursor=${encodeURIComponent(withdrawalCursorBody.nextCursor)}`,
  );
  expect(pageAfterOrganizationWithdrawal.status()).toBe(200);
  expect(await pageAfterOrganizationWithdrawal.json()).toMatchObject({
    items: [],
    nextCursor: null,
  });
  const searchPageAfterOrganizationWithdrawal = await context.request.get(
    `${applicationUrl}/api/v1/search?q=Radar&locale=en&type=product&limit=1&cursor=${encodeURIComponent(searchWithdrawalCursorBody.nextCursor)}`,
  );
  expect(searchPageAfterOrganizationWithdrawal.status()).toBe(200);
  const filteredSearchPageBody =
    await searchPageAfterOrganizationWithdrawal.json();
  expect(filteredSearchPageBody).toMatchObject({
    items: [],
    nextCursor: expect.any(String),
  });
  expect(filteredSearchPageBody.nextCursor).not.toBe(
    searchWithdrawalCursorBody.nextCursor,
  );
  const finalFilteredSearchPage = await context.request.get(
    `${applicationUrl}/api/v1/search?q=Radar&locale=en&type=product&limit=1&cursor=${encodeURIComponent(filteredSearchPageBody.nextCursor)}`,
  );
  expect(finalFilteredSearchPage.status()).toBe(200);
  expect(await finalFilteredSearchPage.json()).toMatchObject({
    items: [],
    nextCursor: null,
  });
});
