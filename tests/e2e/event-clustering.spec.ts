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

test("Owner retrieves, merges and splits evidenced Event clusters without losing identity", async ({
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
      email: "cluster-owner@example.test",
      id: 34_471_145,
      login: "cryanskl",
      name: "AI Radar Owner",
    },
  });
  if (!owner.sessionToken)
    throw new Error("Owner OAuth did not create a session");

  const unauthorized = await context.request.post(
    `${applicationUrl}/api/v1/admin/events/merge`,
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

  const entityResponse = await context.request.post(
    `${applicationUrl}/api/v1/admin/entities`,
    {
      data: {
        entity: {
          publicId: "model-alpha",
          type: "model",
          officialName: "Model Alpha",
          officialUrl: "https://example.test/model-alpha",
          lastVerifiedAt: "2026-08-30T11:00:00.000Z",
          rightsStatus: "open",
        },
        localizations: [
          {
            locale: "en",
            name: "Model Alpha",
            summary: "Model Alpha public profile.",
            authorship: "human_authored",
            reviewStatus: "reviewed",
          },
          {
            locale: "zh",
            name: "Alpha 模型",
            summary: "Alpha 模型公开档案。",
            authorship: "human_authored",
            reviewStatus: "reviewed",
          },
        ],
        aliases: [],
        versions: [],
      },
    },
  );
  expect(entityResponse.status()).toBe(201);

  const createAndPublishEvent = async ({
    eventPublicId,
    sourcePublicId,
    sourceItemPublicId,
    occurredAt,
    canonicalUrl,
    isOriginalSource,
  }: {
    eventPublicId: string;
    sourcePublicId: string;
    sourceItemPublicId: string;
    occurredAt: string;
    canonicalUrl: string;
    isOriginalSource: boolean;
  }) => {
    const draft = await context.request.post(
      `${applicationUrl}/api/v1/admin/event-drafts`,
      {
        data: {
          source: {
            publicId: sourcePublicId,
            name: sourcePublicId === "official-source" ? "Official" : "Wire",
            homepageUrl: `https://${sourcePublicId}.example.test/`,
            tier: sourcePublicId === "official-source" ? "S" : "A",
            accessStatus: "approved",
            acquisitionMethod: "manual",
            policyLastReviewedAt: "2026-08-30T00:00:00.000Z",
          },
          sourceItem: {
            publicId: sourceItemPublicId,
            externalId: "model-alpha-price-change",
            externalIdVerifiedAt: "2026-08-30T11:00:00.000Z",
            isOriginalSource,
            originalUrl: `https://${sourcePublicId}.example.test/${sourceItemPublicId}`,
            canonicalUrl,
            originalTitle: "Model Alpha price changes",
            originalLanguage: "en",
            publishedAt: occurredAt,
            publishedAtPrecision: "second",
            discoveredAt: occurredAt,
            rightsStatus: "open",
            rightsCheckedAt: "2026-08-30T11:00:00.000Z",
            attribution: sourcePublicId,
            licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
          },
          event: {
            publicId: eventPublicId,
            eventType: "changes_price_of",
            factStatus: "confirmed",
            occurredAt,
            occurredAtPrecision: "second",
            lastVerifiedAt: "2026-08-30T11:00:00.000Z",
            rightsStatus: "open",
          },
          localizations: [
            {
              locale: "en",
              title: "Model Alpha price changes",
              summary: "A source reported a Model Alpha price change.",
              authorship: "human_authored",
              reviewStatus: "reviewed",
            },
            {
              locale: "zh",
              title: "Alpha 模型价格变化",
              summary: "一个来源报道了 Alpha 模型价格变化。",
              authorship: "human_authored",
              reviewStatus: "reviewed",
            },
          ],
        },
      },
    );
    expect(draft.status(), JSON.stringify(await draft.json())).toBe(201);
    const publication = await context.request.post(
      `${applicationUrl}/api/v1/admin/events/${eventPublicId}/publish`,
    );
    expect(publication.status()).toBe(200);
  };

  await createAndPublishEvent({
    eventPublicId: "event-price-official",
    sourcePublicId: "official-source",
    sourceItemPublicId: "source-price-official",
    occurredAt: "2026-08-30T10:00:00.000Z",
    canonicalUrl: "https://vendor.example.test/model-alpha-price-change",
    isOriginalSource: true,
  });
  await createAndPublishEvent({
    eventPublicId: "event-price-wire",
    sourcePublicId: "wire-source",
    sourceItemPublicId: "source-price-wire",
    occurredAt: "2026-08-30T10:20:00.000Z",
    canonicalUrl: "https://vendor.example.test/model-alpha-price-change",
    isOriginalSource: false,
  });

  for (const { eventPublicId, relationPublicId, sourceItemPublicId } of [
    {
      eventPublicId: "event-price-official",
      relationPublicId: "relation-price-official-model-alpha",
      sourceItemPublicId: "source-price-official",
    },
    {
      eventPublicId: "event-price-wire",
      relationPublicId: "relation-price-wire-model-alpha",
      sourceItemPublicId: "source-price-wire",
    },
  ]) {
    const relationResponse = await context.request.post(
      `${applicationUrl}/api/v1/admin/relations`,
      {
        data: {
          relation: {
            publicId: relationPublicId,
            subject: { type: "event", publicId: eventPublicId },
            predicate: "CHANGES_PRICE_OF",
            objectEntityPublicId: "model-alpha",
            validFrom: null,
            validTo: null,
            firstVerifiedAt: "2026-08-30T11:00:00.000Z",
            lastVerifiedAt: "2026-08-30T11:00:00.000Z",
            confidence: 90,
            reviewStatus: "reviewed",
            creationMethod: "editor",
            rightsStatus: "open",
          },
          evidenceSourceItemPublicIds: [sourceItemPublicId],
        },
      },
    );
    expect(relationResponse.status()).toBe(201);
  }

  const candidatesResponse = await context.request.get(
    `${applicationUrl}/api/v1/admin/events/event-price-official/candidates`,
  );
  expect(candidatesResponse.status()).toBe(200);
  expect(await candidatesResponse.json()).toEqual({
    eventPublicId: "event-price-official",
    candidates: [
      {
        eventPublicId: "event-price-wire",
        confidence: 100,
        highImpact: true,
        requiresOwnerReview: true,
        signals: {
          verifiedExternalIds: ["model-alpha-price-change"],
          canonicalUrls: [
            "https://vendor.example.test/model-alpha-price-change",
          ],
          timeDistanceMinutes: 20,
          sharedEntityPublicIds: ["model-alpha"],
        },
        mergePreview: {
          sourceItemPublicIdsToMove: ["source-price-wire"],
          relationPublicIdsToMove: ["relation-price-wire-model-alpha"],
          localizedContentLocalesPreserved: ["en", "zh"],
          representativeSourceItemPublicId: "source-price-official",
          tombstone: {
            publicId: "event-price-wire",
            status: "merged_into",
            targetEventPublicId: "event-price-official",
          },
        },
      },
    ],
  });
  expect(
    (
      await context.request.get(
        `${applicationUrl}/api/v1/events/event-price-wire?locale=en`,
      )
    ).status(),
  ).toBe(200);

  const invalidMergeResponse = await context.request.post(
    `${applicationUrl}/api/v1/admin/events/merge`,
    { data: {} },
  );
  expect(invalidMergeResponse.status()).toBe(400);
  const invalidMergeBody = await invalidMergeResponse.json();
  const invalidSplitResponse = await context.request.post(
    `${applicationUrl}/api/v1/admin/events/split`,
    { data: {} },
  );
  expect(invalidSplitResponse.status()).toBe(400);
  const invalidSplitBody = await invalidSplitResponse.json();

  const concurrentMerges = await Promise.all([
    context.request.post(`${applicationUrl}/api/v1/admin/events/merge`, {
      data: {
        targetEventPublicId: "event-price-official",
        sourceEventPublicId: "event-price-wire",
        publicReasonCode: "duplicate_coverage",
        internalNote: "Concurrency check B into A.",
      },
    }),
    context.request.post(`${applicationUrl}/api/v1/admin/events/merge`, {
      data: {
        targetEventPublicId: "event-price-wire",
        sourceEventPublicId: "event-price-official",
        publicReasonCode: "duplicate_coverage",
        internalNote: "Concurrency check A into B.",
      },
    }),
  ]);
  expect(concurrentMerges.map((response) => response.status()).sort()).toEqual([
    200, 409,
  ]);
  const successfulConcurrentMerge = concurrentMerges.find(
    (response) => response.status() === 200,
  );
  if (!successfulConcurrentMerge) throw new Error("No merge succeeded");
  const concurrentMergeBody = await successfulConcurrentMerge.json();
  const concurrentTombstone = await (
    await context.request.get(
      `${applicationUrl}/api/v1/events/${concurrentMergeBody.sourceEventPublicId}?locale=en`,
    )
  ).json();
  expect(concurrentTombstone).toMatchObject({
    status: "merged_into",
    targetEventPublicId: concurrentMergeBody.targetEventPublicId,
  });
  const concurrentSplit = await context.request.post(
    `${applicationUrl}/api/v1/admin/events/split`,
    {
      data: {
        mergedEventPublicId: concurrentMergeBody.sourceEventPublicId,
        internalNote: "Restore after concurrency check.",
      },
    },
  );
  expect(concurrentSplit.status()).toBe(200);

  const mergeResponse = await context.request.post(
    `${applicationUrl}/api/v1/admin/events/merge`,
    {
      data: {
        targetEventPublicId: "event-price-official",
        sourceEventPublicId: "event-price-wire",
        publicReasonCode: "duplicate_coverage",
        internalNote: "Independent sources describe the same price change.",
      },
    },
  );
  expect(mergeResponse.status()).toBe(200);
  const mergeBody = await mergeResponse.json();
  expect(mergeBody).toEqual({
    status: "merged",
    sourceEventPublicId: "event-price-wire",
    targetEventPublicId: "event-price-official",
    sourceCount: 2,
  });

  const mergedTarget = await (
    await context.request.get(
      `${applicationUrl}/api/v1/events/event-price-official?locale=en`,
    )
  ).json();
  expect(mergedTarget.sources).toHaveLength(2);
  expect(mergedTarget.sources[0]).toMatchObject({
    sourceItemPublicId: "source-price-official",
    isPrimary: true,
    isOriginalSource: true,
  });
  expect(mergedTarget.entities).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        relationPublicId: "relation-price-official-model-alpha",
      }),
      expect.objectContaining({
        relationPublicId: "relation-price-wire-model-alpha",
      }),
    ]),
  );
  const tombstoneResponse = await context.request.get(
    `${applicationUrl}/api/v1/events/event-price-wire?locale=en`,
  );
  expect(tombstoneResponse.status()).toBe(200);
  expect(await tombstoneResponse.json()).toMatchObject({
    publicId: "event-price-wire",
    status: "merged_into",
    targetEventPublicId: "event-price-official",
    reasonCode: "duplicate_coverage",
  });
  const mergedList = await (
    await context.request.get(`${applicationUrl}/api/v1/events?locale=en`)
  ).json();
  expect(mergedList.items).toHaveLength(1);
  expect(mergedList.items[0].publicId).toBe("event-price-official");

  await page.goto(`${applicationUrl}/en/radar/events/event-price-wire`);
  await expect(
    page.getByRole("heading", { name: "Event merged" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "event-price-official", exact: true })
    .click();
  await expect(page).toHaveURL(
    `${applicationUrl}/en/radar/events/event-price-official`,
  );
  await expect(page.getByText("2 independent sources")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Official" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Wire" })).toBeVisible();
  await expect(page.getByText("Representative source")).toBeVisible();

  const splitPreviewResponse = await context.request.get(
    `${applicationUrl}/api/v1/admin/events/event-price-wire/split-preview`,
  );
  expect(splitPreviewResponse.status()).toBe(200);
  expect(await splitPreviewResponse.json()).toEqual({
    mergedEventPublicId: "event-price-wire",
    targetEventPublicId: "event-price-official",
    sourceItemPublicIdsToRestore: ["source-price-wire"],
    relationPublicIdsToRestore: ["relation-price-wire-model-alpha"],
    localizedContentLocalesToRestore: ["en", "zh"],
    restoredRepresentativeSourceItemPublicId: "source-price-wire",
    targetRepresentativeSourceItemPublicId: "source-price-official",
    tombstoneStatusAfterSplit: "removed",
  });

  const splitResponse = await context.request.post(
    `${applicationUrl}/api/v1/admin/events/split`,
    {
      data: {
        mergedEventPublicId: "event-price-wire",
        internalNote: "The reports describe distinct price changes.",
      },
    },
  );
  expect(splitResponse.status()).toBe(200);
  const splitBody = await splitResponse.json();
  expect(splitBody).toEqual({
    status: "split",
    restoredEventPublicId: "event-price-wire",
    targetEventPublicId: "event-price-official",
  });

  const cutoffClient = new Client({
    connectionString: application.databaseUrl,
  });
  await cutoffClient.connect();
  const splitTiming = await cutoffClient.query<{
    merged_at: Date;
    split_at: Date;
    restored_link_created_at: Date;
    target_updated_at: Date;
  }>(`
    select merge.merged_at, merge.split_at,
      restored_link.created_at as restored_link_created_at,
      target.updated_at as target_updated_at
    from event_merges merge
    join events source on source.id = merge.source_event_id
    join events target on target.id = merge.target_event_id
    join event_sources restored_link on restored_link.event_id = source.id
    where source.public_id = 'event-price-wire'
      and target.public_id = 'event-price-official'
    order by merge.merged_at desc
    limit 1
  `);
  await cutoffClient.end();
  const timing = splitTiming.rows[0];
  expect(timing.restored_link_created_at).toEqual(timing.split_at);
  expect(timing.target_updated_at).toEqual(timing.split_at);
  const historicalCutoff = new Date(
    (timing.merged_at.getTime() + timing.split_at.getTime()) / 2,
  ).toISOString();
  const historicalRelease = await context.request.post(
    `${applicationUrl}/api/v1/admin/data-releases`,
    {
      data: {
        publicId: "data-release-cluster-history-check",
        dataVersion: "public-cluster-history-check",
        dataCutoff: historicalCutoff,
        canonicalUrl:
          "https://github.com/cryanskl/ai-radar/releases/tag/cluster-history-check",
        license: "CC-BY-4.0",
        attribution: "AI Radar and the named source publishers",
      },
    },
  );
  expect(historicalRelease.status()).toBe(409);
  expect(await historicalRelease.json()).toMatchObject({
    error: "validation_failed",
    issues: expect.arrayContaining([
      {
        code: "record_after_data_cutoff",
        recordType: "event",
        publicId: "event-price-official",
      },
      {
        code: "record_after_data_cutoff",
        recordType: "event",
        publicId: "event-price-wire",
      },
    ]),
  });

  for (const { eventPublicId, sourceItemPublicId, relationPublicId } of [
    {
      eventPublicId: "event-price-official",
      sourceItemPublicId: "source-price-official",
      relationPublicId: "relation-price-official-model-alpha",
    },
    {
      eventPublicId: "event-price-wire",
      sourceItemPublicId: "source-price-wire",
      relationPublicId: "relation-price-wire-model-alpha",
    },
  ]) {
    const response = await context.request.get(
      `${applicationUrl}/api/v1/events/${eventPublicId}?locale=en`,
    );
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.publicationState).toBe("published");
    expect(body.sources).toEqual([
      expect.objectContaining({ sourceItemPublicId, isPrimary: true }),
    ]);
    expect(body.entities).toEqual([
      expect.objectContaining({ relationPublicId }),
    ]);
  }
  const splitList = await (
    await context.request.get(`${applicationUrl}/api/v1/events?locale=en`)
  ).json();
  expect(
    splitList.items
      .map(({ publicId }: { publicId: string }) => publicId)
      .sort(),
  ).toEqual(["event-price-official", "event-price-wire"]);
  for (const { eventPublicId, sourceName } of [
    { eventPublicId: "event-price-official", sourceName: "Official" },
    { eventPublicId: "event-price-wire", sourceName: "Wire" },
  ]) {
    await page.goto(`${applicationUrl}/en/radar/events/${eventPublicId}`);
    await expect(
      page.getByRole("heading", { name: "Model Alpha price changes" }),
    ).toBeVisible();
    await expect(page.getByText("1 independent source")).toBeVisible();
    await expect(page.getByRole("heading", { name: sourceName })).toBeVisible();
    await expect(page.getByText("Representative source")).toBeVisible();
  }

  const contract = await (
    await context.request.get(`${applicationUrl}/api/openapi.json`)
  ).json();
  for (const path of [
    "/api/v1/admin/events/{publicId}/candidates",
    "/api/v1/admin/events/{publicId}/split-preview",
    "/api/v1/admin/events/merge",
    "/api/v1/admin/events/split",
  ]) {
    expect(contract.paths).toHaveProperty(path);
  }
  const ajv = new Ajv2020({ strict: false });
  addFormats(ajv);
  for (const { body, schema } of [
    {
      body: mergeBody,
      schema:
        contract.paths["/api/v1/admin/events/merge"].post.responses["200"]
          .content["application/json"].schema,
    },
    {
      body: splitBody,
      schema:
        contract.paths["/api/v1/admin/events/split"].post.responses["200"]
          .content["application/json"].schema,
    },
    {
      body: invalidMergeBody,
      schema:
        contract.paths["/api/v1/admin/events/merge"].post.responses["400"]
          .content["application/json"].schema,
    },
    {
      body: invalidSplitBody,
      schema:
        contract.paths["/api/v1/admin/events/split"].post.responses["400"]
          .content["application/json"].schema,
    },
  ]) {
    const validate = ajv.compile(schema);
    expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
  }

  const client = new Client({ connectionString: application.databaseUrl });
  await client.connect();
  const state = await client.query<{
    audit_actions: string[];
    active_merge_count: string;
    merge_history_count: string;
    source_links: string;
    wire_relation_owner: string;
  }>(
    `select
       (select array_agg(action order by created_at) from event_cluster_audits) as audit_actions,
       (select count(*)::text from event_merges where status = 'active') as active_merge_count,
       (select count(*)::text from event_merges) as merge_history_count,
       (select count(*)::text from event_sources) as source_links,
       (select e.public_id from relations r join events e on e.id = r.subject_event_id where r.public_id = 'relation-price-wire-model-alpha') as wire_relation_owner`,
  );
  await client.end();
  expect(state.rows[0]).toEqual({
    active_merge_count: "0",
    audit_actions: ["merge", "split", "merge", "split"],
    merge_history_count: "2",
    source_links: "2",
    wire_relation_owner: "event-price-wire",
  });
});
