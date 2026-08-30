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

test("publishes versioned bilingual Paper profiles from rights-safe arXiv metadata", async ({
  context,
  page,
}) => {
  if (!application) throw new Error("Test application did not start");
  const applicationUrl = application.url;
  const profileUrl = `${applicationUrl}/api/v1/admin/paper-revision-profiles`;

  expect((await context.request.post(profileUrl, { data: {} })).status()).toBe(
    401,
  );
  const owner = await completeFakeGithubOAuth({
    applicationUrl,
    databaseUrl: application.databaseUrl,
    ownerGithubId: "34471145",
    profile: {
      avatar_url: "https://avatars.example.test/paper-owner",
      email: "paper-owner@example.test",
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
  expect(
    (
      await context.request.post(`${applicationUrl}/api/v1/admin/sources/arxiv`)
    ).status(),
  ).toBe(201);

  const createEvidenceEvent = async ({
    eventPublicId,
    sourceItemPublicId,
    externalId,
    title,
    publishedAt,
  }: {
    eventPublicId: string;
    sourceItemPublicId: string;
    externalId: string;
    title: string;
    publishedAt: string;
  }) => {
    const draft = await context.request.post(
      `${applicationUrl}/api/v1/admin/event-drafts`,
      {
        data: {
          source: {
            publicId: `event-evidence-${externalId.replaceAll(".", "-")}`,
            name: "Fixture event evidence",
            homepageUrl: "https://evidence.example.test/",
            tier: "A",
            accessStatus: "approved",
            acquisitionMethod: "manual",
            policyLastReviewedAt: "2026-08-30T00:00:00.000Z",
          },
          sourceItem: {
            publicId: sourceItemPublicId,
            externalId,
            externalIdVerifiedAt: "2026-08-30T08:00:00.000Z",
            isOriginalSource: true,
            originalUrl: `https://evidence.example.test/${externalId}`,
            canonicalUrl: `https://evidence.example.test/${externalId}`,
            originalTitle: title,
            originalLanguage: "en",
            publishedAt,
            publishedAtPrecision: "second",
            discoveredAt: "2026-08-30T08:01:00.000Z",
            rightsStatus: "open",
            rightsCheckedAt: "2026-08-30T08:00:00.000Z",
            attribution: "Fixture event evidence",
            licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
          },
          event: {
            publicId: eventPublicId,
            eventType: "announces",
            factStatus: "confirmed",
            occurredAt: publishedAt,
            occurredAtPrecision: "second",
            lastVerifiedAt: "2026-08-30T08:02:00.000Z",
            rightsStatus: "open",
          },
          localizations: [
            {
              locale: "en",
              title: `${title} revision announced`,
              summary: "A versioned arXiv Paper revision entered AI Radar.",
              authorship: "human_authored",
              reviewStatus: "reviewed",
            },
            {
              locale: "zh",
              title: `${title} 修订版发布`,
              summary: "一个带版本的 arXiv 论文修订进入 AI Radar。",
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
          `${applicationUrl}/api/v1/admin/events/${eventPublicId}/publish`,
        )
      ).status(),
    ).toBe(200);
  };

  await createEvidenceEvent({
    eventPublicId: "event-paper-fixture-v1",
    sourceItemPublicId: "event-evidence-paper-v1",
    externalId: "2608.12345v1",
    title: "A Fixture Paper for AI Radar",
    publishedAt: "2026-08-20T10:00:00.000Z",
  });
  await createEvidenceEvent({
    eventPublicId: "event-paper-fixture-v2",
    sourceItemPublicId: "event-evidence-paper-v2",
    externalId: "2608.12345v2",
    title: "A Fixture Paper for AI Radar, Revised",
    publishedAt: "2026-08-29T10:00:00.000Z",
  });

  const fixtureDatabase = new Client({
    connectionString: application.databaseUrl,
  });
  await fixtureDatabase.connect();
  for (const paperSource of [
    {
      publicId: "arxiv-2608-12345v1",
      externalId: "2608.12345v1",
      title: "A Fixture Paper for AI Radar",
      publishedAt: "2026-08-20T10:00:00.000Z",
      authors: [{ name: "Example Author" }],
    },
    {
      publicId: "arxiv-2608-12345v2",
      externalId: "2608.12345v2",
      title: "A Fixture Paper for AI Radar, Revised",
      publishedAt: "2026-08-29T10:00:00.000Z",
      authors: [{ name: "Example Author" }],
    },
    {
      publicId: "arxiv-2608-99999v2",
      externalId: "2608.99999v2",
      title: "A Different Fixture Paper",
      publishedAt: "2026-08-29T10:00:00.000Z",
      authors: [{ name: "Example Author" }],
    },
    {
      publicId: "arxiv-2608-54321v1",
      externalId: "2608.54321v1",
      title: "Another Public Paper",
      publishedAt: "2026-08-21T10:00:00.000Z",
      authors: [{ name: "Another Author" }],
    },
  ]) {
    await fixtureDatabase.query(
      `with inserted as (
         insert into source_items (
           id, public_id, source_id, external_id, external_id_verified_at,
           is_original_source, original_url, canonical_url, original_title,
           original_language, published_at, published_at_precision,
           discovered_at, rights_status, rights_checked_at, attribution,
           license_url, public_visibility
         )
         select gen_random_uuid(), $1, source.id, $2, $3, true,
           'https://arxiv.org/abs/' || $2,
           'https://arxiv.org/abs/' || $2, $4, 'en', $3, 'second', $3,
           'open', $3, 'arXiv descriptive metadata',
           'https://creativecommons.org/publicdomain/zero/1.0/', true
         from sources source where source.public_id = 'arxiv'
         returning id
       )
       insert into arxiv_source_item_metadata (source_item_id, authors)
       select id, $5::jsonb from inserted`,
      [
        paperSource.publicId,
        paperSource.externalId,
        paperSource.publishedAt,
        paperSource.title,
        JSON.stringify(paperSource.authors),
      ],
    );
  }
  await fixtureDatabase.query(
    `insert into sources (
       id, public_id, name, homepage_url, tier, access_status,
       acquisition_method, policy_last_reviewed_at
     ) values (
       gen_random_uuid(), 'paper-resource-evidence', 'Paper resource evidence',
       'https://resources.example.test/', 'A', 'approved', 'manual',
       '2026-08-30T00:00:00.000Z'
     )`,
  );
  for (const resource of [
    ["source-paper-code", "https://repository-paper-code.example.test/"],
    ["source-paper-dataset", "https://datasets.example.test/paper-fixture"],
    ["source-paper-product", "https://product-paper-demo.example.test/"],
  ] as const) {
    await fixtureDatabase.query(
      `insert into source_items (
         id, public_id, source_id, external_id, is_original_source,
         original_url, canonical_url, original_title, original_language,
         published_at, published_at_precision, discovered_at, rights_status,
         rights_checked_at, attribution, license_url, public_visibility
       )
       select gen_random_uuid(), $1, source.id, $1, true, $2, $2, $1, 'en',
         '2026-08-30T08:00:00.000Z', 'second',
         '2026-08-30T08:00:00.000Z', 'open',
         '2026-08-30T08:00:00.000Z', 'Fixture resource evidence',
         'https://creativecommons.org/publicdomain/zero/1.0/', true
       from sources source where source.public_id = 'paper-resource-evidence'`,
      [...resource],
    );
  }
  await fixtureDatabase.end();

  const createEntity = async (data: unknown) => {
    const response = await context.request.post(
      `${applicationUrl}/api/v1/admin/entities`,
      { data },
    );
    expect(response.status()).toBe(201);
  };
  await createEntity({
    entity: {
      publicId: "paper-ai-radar-fixture",
      type: "paper",
      officialName: "A Fixture Paper for AI Radar",
      officialUrl: "https://arxiv.org/abs/2608.12345",
      lastVerifiedAt: "2026-08-30T08:02:00.000Z",
      rightsStatus: "metadata_only",
    },
    localizations: [
      {
        locale: "en",
        name: "A Fixture Paper for AI Radar",
        summary: "An AI Radar authored guide to the fixture research.",
        authorship: "human_authored",
        reviewStatus: "reviewed",
      },
      {
        locale: "zh",
        name: "AI Radar 示例论文",
        summary: "AI Radar 对该示例研究撰写的独立导读。",
        authorship: "human_authored",
        reviewStatus: "reviewed",
      },
    ],
    aliases: [
      {
        publicId: "alias-paper-arxiv-base",
        locale: "en",
        kind: "official",
        value: "2608.12345",
      },
      {
        publicId: "alias-paper-arxiv-v2",
        locale: "en",
        kind: "official",
        value: "2608.12345v2",
      },
    ],
    versions: [
      {
        publicId: "paper-ai-radar-fixture-v1",
        versionLabel: "v1",
        releasedAt: "2026-08-20T10:00:00.000Z",
        releasedAtPrecision: "second",
      },
      {
        publicId: "paper-ai-radar-fixture-v2",
        versionLabel: "v2",
        releasedAt: "2026-08-29T10:00:00.000Z",
        releasedAtPrecision: "second",
      },
    ],
  });
  await createEntity({
    entity: {
      publicId: "paper-another-public",
      type: "paper",
      officialName: "Another Public Paper",
      officialUrl: "https://arxiv.org/abs/2608.54321",
      lastVerifiedAt: "2026-08-30T08:02:00.000Z",
      rightsStatus: "metadata_only",
    },
    localizations: [
      {
        locale: "en",
        name: "Another Public Paper",
        summary: "A second Paper makes stable cursor pagination observable.",
        authorship: "human_authored",
        reviewStatus: "reviewed",
      },
      {
        locale: "zh",
        name: "另一篇公开论文",
        summary: "第二篇论文用于验证稳定游标分页。",
        authorship: "human_authored",
        reviewStatus: "reviewed",
      },
    ],
    aliases: [],
    versions: [
      {
        publicId: "paper-another-public-v1",
        versionLabel: "v1",
        releasedAt: "2026-08-21T10:00:00.000Z",
        releasedAtPrecision: "second",
      },
    ],
  });
  for (const entity of [
    ["repository-paper-code", "repository", "Paper Code"],
    ["model-paper-output", "model", "Paper Model"],
    ["product-paper-demo", "product", "Paper Product"],
  ] as const) {
    await createEntity({
      entity: {
        publicId: entity[0],
        type: entity[1],
        officialName: entity[2],
        officialUrl: `https://${entity[0]}.example.test/`,
        lastVerifiedAt: "2026-08-30T08:02:00.000Z",
        rightsStatus: "open",
      },
      localizations: [
        {
          locale: "en",
          name: entity[2],
          summary: `${entity[2]} is linked to the fixture Paper.`,
          authorship: "human_authored",
          reviewStatus: "reviewed",
        },
        {
          locale: "zh",
          name: `${entity[2]} 中文`,
          summary: `${entity[2]} 与示例论文关联。`,
          authorship: "human_authored",
          reviewStatus: "reviewed",
        },
      ],
      aliases: [],
      versions: [],
    });
  }

  const revisionInput = (revision: "v1" | "v2") => ({
    familyPublicId: "paper-ai-radar-fixture",
    versionPublicId: `paper-ai-radar-fixture-${revision}`,
    sourceItemPublicId: `arxiv-2608-12345${revision}`,
    arxivId: "2608.12345",
    arxivVersion: revision,
    title:
      revision === "v1"
        ? "A Fixture Paper for AI Radar"
        : "A Fixture Paper for AI Radar, Revised",
    authors: [
      {
        name: "Example Author",
        institutions: ["Example AI Institute"],
      },
    ],
    topics: ["agents", "evaluation"],
    fullTextRightsStatus: "link_only",
    fullTextLicenseUrl: null,
    guidance: [
      {
        locale: "en",
        claimedContributions: ["The source claims a reproducible agent loop."],
        limitations: ["The source evaluates only one benchmark family."],
        inference: ["AI Radar infers that broader validation is still needed."],
        authorship: "human_authored",
        reviewStatus: "reviewed",
      },
      {
        locale: "zh",
        claimedContributions: ["原文声称提出了可复现的智能体循环。"],
        limitations: ["原文只评估了一个基准系列。"],
        inference: ["AI Radar 推断仍需更广泛验证。"],
        authorship: "human_authored",
        reviewStatus: "reviewed",
      },
    ],
    resourceLinks:
      revision === "v2"
        ? [
            {
              publicId: "paper-resource-code",
              kind: "code",
              label: "Official code",
              url: "https://repository-paper-code.example.test/",
              evidenceSourceItemPublicId: "source-paper-code",
            },
            {
              publicId: "paper-resource-dataset",
              kind: "dataset",
              label: "Evaluation dataset",
              url: "https://datasets.example.test/paper-fixture",
              evidenceSourceItemPublicId: "source-paper-dataset",
            },
            {
              publicId: "paper-resource-product",
              kind: "product",
              label: "Product implementation",
              url: "https://product-paper-demo.example.test/",
              evidenceSourceItemPublicId: "source-paper-product",
            },
          ]
        : [],
  });

  const invalidRevision = await context.request.post(profileUrl, {
    data: { ...revisionInput("v1"), arxivVersion: "v2" },
  });
  expect(invalidRevision.status()).toBe(400);
  const nonArxivMetadataSource = await context.request.post(profileUrl, {
    data: {
      ...revisionInput("v1"),
      sourceItemPublicId: "event-evidence-paper-v1",
    },
  });
  expect(nonArxivMetadataSource.status()).toBe(400);
  const mismatchedVersionNode = await context.request.post(profileUrl, {
    data: {
      ...revisionInput("v1"),
      versionPublicId: "paper-ai-radar-fixture-v2",
    },
  });
  expect(mismatchedVersionNode.status()).toBe(400);
  const reusableFullTextWithoutLicense = await context.request.post(
    profileUrl,
    {
      data: {
        ...revisionInput("v1"),
        fullTextRightsStatus: "open",
        fullTextLicenseUrl: null,
      },
    },
  );
  expect(reusableFullTextWithoutLicense.status()).toBe(400);
  const invalidResourceEvidence = await context.request.post(profileUrl, {
    data: {
      ...revisionInput("v1"),
      resourceLinks: [
        {
          publicId: "paper-resource-invalid",
          kind: "code",
          label: "Invalid evidence binding",
          url: "https://not-the-evidenced-resource.example.test/",
          evidenceSourceItemPublicId: "source-paper-code",
        },
      ],
    },
  });
  expect(invalidResourceEvidence.status()).toBe(400);
  const atomicityDatabase = new Client({
    connectionString: application.databaseUrl,
  });
  await atomicityDatabase.connect();
  const identityAfterRejectedRequest = await atomicityDatabase.query<{
    identity_count: string;
  }>(
    `select count(*)::text as identity_count
     from paper_identities identity
     join entities family on family.id = identity.entity_id
     where family.public_id = 'paper-ai-radar-fixture'`,
  );
  await atomicityDatabase.end();
  expect(identityAfterRejectedRequest.rows[0].identity_count).toBe("0");
  const createdProfiles: unknown[] = [];
  for (const revision of ["v1"] as const) {
    const response = await context.request.post(profileUrl, {
      data: revisionInput(revision),
    });
    expect(response.status()).toBe(201);
    createdProfiles.push(await response.json());
  }
  const differentPaperSameFamily = await context.request.post(profileUrl, {
    data: {
      ...revisionInput("v2"),
      sourceItemPublicId: "arxiv-2608-99999v2",
      arxivId: "2608.99999",
      title: "A Different Fixture Paper",
    },
  });
  expect(differentPaperSameFamily.status()).toBe(400);
  const secondRevision = await context.request.post(profileUrl, {
    data: revisionInput("v2"),
  });
  expect(secondRevision.status()).toBe(201);
  createdProfiles.push(await secondRevision.json());
  const anotherPaperProfile = await context.request.post(profileUrl, {
    data: {
      familyPublicId: "paper-another-public",
      versionPublicId: "paper-another-public-v1",
      sourceItemPublicId: "arxiv-2608-54321v1",
      arxivId: "2608.54321",
      arxivVersion: "v1",
      title: "Another Public Paper",
      authors: [
        { name: "Another Author", institutions: ["Another Institute"] },
      ],
      topics: ["reasoning"],
      fullTextRightsStatus: "link_only",
      fullTextLicenseUrl: null,
      guidance: [
        {
          locale: "en",
          claimedContributions: ["The source claims another contribution."],
          limitations: ["The source remains a fixture."],
          inference: ["AI Radar makes no quality inference."],
          authorship: "human_authored",
          reviewStatus: "reviewed",
        },
        {
          locale: "zh",
          claimedContributions: ["原文声称另一项贡献。"],
          limitations: ["该来源仍是夹具。"],
          inference: ["AI Radar 不作质量推断。"],
          authorship: "human_authored",
          reviewStatus: "reviewed",
        },
      ],
      resourceLinks: [],
    },
  });
  expect(anotherPaperProfile.status()).toBe(201);
  createdProfiles.push(await anotherPaperProfile.json());

  const createRelation = async (data: unknown) => {
    const response = await context.request.post(
      `${applicationUrl}/api/v1/admin/relations`,
      { data },
    );
    expect(response.status()).toBe(201);
  };
  await createRelation({
    relation: {
      publicId: "relation-repository-implements-paper",
      subject: { type: "entity", publicId: "repository-paper-code" },
      predicate: "IMPLEMENTS",
      objectEntityPublicId: "paper-ai-radar-fixture",
      validFrom: "2026-08-29T10:00:00.000Z",
      validTo: null,
      firstVerifiedAt: "2026-08-30T08:02:00.000Z",
      lastVerifiedAt: "2026-08-30T08:02:00.000Z",
      confidence: 95,
      reviewStatus: "reviewed",
      creationMethod: "editor",
      rightsStatus: "open",
    },
    evidenceSourceItemPublicIds: ["arxiv-2608-12345v2"],
  });
  await createRelation({
    relation: {
      publicId: "relation-paper-introduces-model",
      subject: { type: "entity", publicId: "paper-ai-radar-fixture" },
      predicate: "INTRODUCES",
      objectEntityPublicId: "model-paper-output",
      validFrom: "2026-08-20T10:00:00.000Z",
      validTo: null,
      firstVerifiedAt: "2026-08-30T08:02:00.000Z",
      lastVerifiedAt: "2026-08-31T08:02:00.000Z",
      confidence: 90,
      reviewStatus: "reviewed",
      creationMethod: "editor",
      rightsStatus: "open",
    },
    evidenceSourceItemPublicIds: ["arxiv-2608-12345v1"],
  });
  await createRelation({
    relation: {
      publicId: "relation-event-announces-paper",
      subject: { type: "event", publicId: "event-paper-fixture-v2" },
      predicate: "ANNOUNCES",
      objectEntityPublicId: "paper-ai-radar-fixture",
      validFrom: "2026-08-29T10:00:00.000Z",
      validTo: null,
      firstVerifiedAt: "2026-08-30T08:02:00.000Z",
      lastVerifiedAt: "2026-08-30T08:02:00.000Z",
      confidence: 95,
      reviewStatus: "reviewed",
      creationMethod: "editor",
      rightsStatus: "open",
    },
    evidenceSourceItemPublicIds: ["event-evidence-paper-v2"],
  });

  const latest = await context.request.get(
    `${applicationUrl}/api/v1/papers?locale=en&view=latest&limit=1`,
  );
  expect(latest.status()).toBe(200);
  const latestBody = await latest.json();
  expect(latestBody).toMatchObject({
    view: "latest",
    rankingState: "available",
    methodology: { kind: "chronological" },
    dataCutoff: "2026-08-31T08:02:00.000Z",
    resultSet: { capturedCount: 2, limit: 1000, truncated: false },
    emptyState: null,
  });
  expect(latestBody.items[0]).toMatchObject({
    publicId: "paper-ai-radar-fixture",
    latestRevision: { arxivVersion: "v2" },
  });
  expect(latestBody.nextCursor).toEqual(expect.any(String));
  const withoutCode = await context.request.get(
    `${applicationUrl}/api/v1/papers?locale=en&view=latest&hasCode=false`,
  );
  expect((await withoutCode.json()).items).toMatchObject([
    { publicId: "paper-another-public" },
  ]);
  const publishedBeforeLatestRevision = await context.request.get(
    `${applicationUrl}/api/v1/papers?locale=en&view=latest&publishedTo=2026-08-25T00%3A00%3A00.000Z`,
  );
  expect((await publishedBeforeLatestRevision.json()).items).toMatchObject([
    { publicId: "paper-another-public" },
  ]);

  const rightsSnapshot = await context.request.get(
    `${applicationUrl}/api/v1/papers?locale=en&view=latest&limit=1`,
  );
  const rightsSnapshotBody = await rightsSnapshot.json();
  const rightsWithdrawalDatabase = new Client({
    connectionString: application.databaseUrl,
  });
  await rightsWithdrawalDatabase.connect();
  await rightsWithdrawalDatabase.query(
    `update source_items set public_visibility = false
     where public_id = 'arxiv-2608-54321v1'`,
  );
  const withdrawnSnapshotPage = await context.request.get(
    `${applicationUrl}/api/v1/papers?locale=en&view=latest&limit=1&cursor=${encodeURIComponent(rightsSnapshotBody.nextCursor)}`,
  );
  expect(await withdrawnSnapshotPage.json()).toMatchObject({
    nextCursor: null,
    items: [],
  });
  await rightsWithdrawalDatabase.query(
    `update source_items set public_visibility = true
     where public_id = 'arxiv-2608-54321v1'`,
  );
  await rightsWithdrawalDatabase.end();

  const snapshotMutationDatabase = new Client({
    connectionString: application.databaseUrl,
  });
  await snapshotMutationDatabase.connect();
  await snapshotMutationDatabase.query(
    `with arxiv as (
       select id from sources where public_id = 'arxiv'
     ), inserted_source as (
       insert into source_items (
         id, public_id, source_id, external_id, external_id_verified_at,
         is_original_source, original_url, canonical_url, original_title,
         original_language, published_at, published_at_precision,
         discovered_at, rights_status, rights_checked_at, attribution,
         license_url, public_visibility
       )
       select gen_random_uuid(), 'arxiv-2608-54321v2', arxiv.id,
         '2608.54321v2', '2026-08-30T09:00:00.000Z', true,
         'https://arxiv.org/abs/2608.54321v2',
         'https://arxiv.org/abs/2608.54321v2',
         'Another Public Paper, Revised', 'en',
         '2026-08-30T09:00:00.000Z', 'second',
         '2026-08-30T09:00:00.000Z', 'open',
         '2026-08-30T09:00:00.000Z', 'arXiv descriptive metadata',
         'https://creativecommons.org/publicdomain/zero/1.0/', true
       from arxiv
       returning id
     ), inserted_metadata as (
       insert into arxiv_source_item_metadata (source_item_id, authors)
       select id, '[{"name":"Another Author"}]'::jsonb
       from inserted_source
     ), inserted_version as (
       insert into entity_versions (
         id, entity_id, public_id, version_label, released_at,
         released_at_precision, last_verified_at, public_visibility
       )
       select gen_random_uuid(), family.id, 'paper-another-public-v2', 'v2',
         '2026-08-30T09:00:00.000Z', 'second',
         '2026-08-30T09:00:00.000Z', true
       from entities family where family.public_id = 'paper-another-public'
       returning id
     ), inserted_profile as (
       insert into paper_revision_profiles (
         id, paper_identity_id, entity_version_id, metadata_source_item_id,
         arxiv_version, title, authors, topics, metadata_license_url,
         full_text_rights_status, full_text_license_url, pdf_packaged,
         public_visibility
       )
       select gen_random_uuid(), identity.id, inserted_version.id,
         inserted_source.id, 'v2', 'Another Public Paper, Revised',
         '[{"name":"Another Author","institutions":["Another Institute"]}]'::jsonb,
         array['reasoning'],
         'https://creativecommons.org/publicdomain/zero/1.0/',
         'link_only', null, false, true
       from paper_identities identity
       join entities family on family.id = identity.entity_id
       cross join inserted_version
       cross join inserted_source
       where family.public_id = 'paper-another-public'
       returning id
     )
     insert into paper_revision_guidance (
       id, paper_revision_profile_id, locale, claimed_contributions,
       limitations, inference, authorship, review_status, public_visibility
     )
     select gen_random_uuid(), inserted_profile.id, locale,
       array['The source claims a revised contribution.'],
       array['The source remains a fixture.'],
       array['AI Radar makes no quality inference.'],
       'human_authored', 'reviewed', true
     from inserted_profile cross join unnest(array['en', 'zh']::content_locale[]) locale`,
  );
  await snapshotMutationDatabase.end();
  const nextLatest = await context.request.get(
    `${applicationUrl}/api/v1/papers?locale=en&view=latest&limit=1&cursor=${encodeURIComponent(latestBody.nextCursor)}`,
  );
  expect(await nextLatest.json()).toMatchObject({
    nextCursor: null,
    resultSet: { capturedCount: 2, limit: 1000, truncated: false },
    items: [
      {
        publicId: "paper-another-public",
        latestRevision: { arxivVersion: "v1" },
      },
    ],
  });
  const refreshedLatest = await context.request.get(
    `${applicationUrl}/api/v1/papers?locale=en&view=latest&limit=1`,
  );
  expect((await refreshedLatest.json()).items[0]).toMatchObject({
    publicId: "paper-another-public",
    latestRevision: { arxivVersion: "v2" },
  });
  expect(
    (
      await context.request.get(
        `${applicationUrl}/api/v1/papers?locale=en&view=latest&limit=1&topic=agents&cursor=${encodeURIComponent(latestBody.nextCursor)}`,
      )
    ).status(),
  ).toBe(400);
  const filtered = await context.request.get(
    `${applicationUrl}/api/v1/papers?locale=en&view=latest&topic=agents&author=Example%20Author&institution=Example%20AI%20Institute&publishedFrom=2026-08-28T00%3A00%3A00.000Z&publishedTo=2026-08-30T00%3A00%3A00.000Z&hasCode=true&relatedModelPublicId=model-paper-output`,
  );
  expect(await filtered.json()).toMatchObject({
    items: [{ publicId: "paper-ai-radar-fixture" }],
  });
  const evidenceWithdrawalDatabase = new Client({
    connectionString: application.databaseUrl,
  });
  await evidenceWithdrawalDatabase.connect();
  await evidenceWithdrawalDatabase.query(
    `update source_items set public_visibility = false
     where public_id = 'source-paper-code'`,
  );
  expect(
    (
      await context.request.get(
        `${applicationUrl}/api/v1/papers?locale=en&view=latest&hasCode=true`,
      )
    ).json(),
  ).resolves.toMatchObject({ items: [] });
  await evidenceWithdrawalDatabase.query(
    `update source_items set public_visibility = true
     where public_id = 'source-paper-code'`,
  );
  await evidenceWithdrawalDatabase.end();
  const trending = await context.request.get(
    `${applicationUrl}/api/v1/papers?locale=en&view=trending`,
  );
  expect(await trending.json()).toMatchObject({
    view: "trending",
    rankingState: "insufficient_evidence",
    methodology: { kind: "attention" },
    emptyState: "insufficient_evidence",
    items: [],
  });
  const featured = await context.request.get(
    `${applicationUrl}/api/v1/papers?locale=en&view=featured`,
  );
  expect(await featured.json()).toMatchObject({
    view: "featured",
    rankingState: "available",
    methodology: { kind: "editorial" },
    emptyState: "no_editorial_selections",
    items: [],
  });

  const detail = await context.request.get(
    `${applicationUrl}/api/v1/papers/paper-ai-radar-fixture?locale=en`,
  );
  expect(detail.status()).toBe(200);
  const detailBody = await detail.json();
  expect(detailBody).toMatchObject({
    publicId: "paper-ai-radar-fixture",
    arxivId: "2608.12345",
    metadataRights: {
      status: "open",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    },
    pdfPackaged: false,
    dataCutoff: "2026-08-31T08:02:00.000Z",
    revisions: [
      { arxivVersion: "v1", title: "A Fixture Paper for AI Radar" },
      {
        arxivVersion: "v2",
        title: "A Fixture Paper for AI Radar, Revised",
        fullTextRightsStatus: "link_only",
        fullTextLicenseUrl: null,
        authors: [
          {
            name: "Example Author",
            institutions: ["Example AI Institute"],
          },
        ],
        guidance: {
          claimedContributions: [
            "The source claims a reproducible agent loop.",
          ],
          limitations: ["The source evaluates only one benchmark family."],
          inference: [
            "AI Radar infers that broader validation is still needed.",
          ],
        },
        resourceLinks: [
          { kind: "code", evidenceSourceItemPublicId: "source-paper-code" },
          {
            kind: "dataset",
            evidenceSourceItemPublicId: "source-paper-dataset",
          },
          {
            kind: "product",
            evidenceSourceItemPublicId: "source-paper-product",
          },
        ],
      },
    ],
    relatedEntities: expect.arrayContaining([
      expect.objectContaining({
        publicId: "repository-paper-code",
        confidence: 95,
        evidence: [
          expect.objectContaining({
            sourceItemPublicId: "arxiv-2608-12345v2",
          }),
        ],
      }),
      expect.objectContaining({
        publicId: "model-paper-output",
        confidence: 90,
        lastVerifiedAt: "2026-08-31T08:02:00.000Z",
      }),
    ]),
    relatedEvents: [
      expect.objectContaining({
        eventPublicId: "event-paper-fixture-v2",
        confidence: 95,
        evidence: [
          expect.objectContaining({
            sourceItemPublicId: "event-evidence-paper-v2",
          }),
        ],
      }),
    ],
  });
  expect(JSON.stringify(detailBody)).not.toContain("/pdf/");

  const search = await context.request.get(
    `${applicationUrl}/api/v1/search?q=2608.12345v2&locale=en&type=paper`,
  );
  expect((await search.json()).items[0]).toMatchObject({
    publicId: "paper-ai-radar-fixture",
    entityType: "paper",
  });

  await page.goto(`${applicationUrl}/en/papers?view=trending`);
  await expect(
    page.getByText("Trending measures recent attention, not academic quality."),
  ).toBeVisible();
  await page.goto(`${applicationUrl}/en/papers?view=latest&limit=1`);
  await expect(
    page.getByRole("group", { name: "Paper filters" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Next page" })).toBeVisible();
  await expect(page.getByText("Data cutoff", { exact: false })).toBeVisible();
  await page.goto(`${applicationUrl}/en/papers?view=trending`);
  await expect(
    page.getByText(
      "Trending is unavailable until sufficient attention evidence exists.",
    ),
  ).toBeVisible();
  await page.goto(`${applicationUrl}/en/papers?view=featured`);
  await expect(
    page.getByText(
      "Featured is an editorial selection, not an algorithmic ranking.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText("No Papers have been selected by editors yet."),
  ).toBeVisible();
  await page.goto(`${applicationUrl}/zh/papers/paper-ai-radar-fixture`);
  await expect(
    page.getByRole("heading", { name: "AI Radar 示例论文", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("原文声称贡献", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("原文限制", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("AI Radar 推断", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("不打包论文 PDF", { exact: true })).toBeVisible();
  await expect(
    page.getByText("发布时间", { exact: false }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("最后核验", { exact: false }).first(),
  ).toBeVisible();
  await expect(page.getByText("证据", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("数据截止时间", { exact: false })).toBeVisible();

  const openApi = await (
    await context.request.get(`${applicationUrl}/api/openapi.json`)
  ).json();
  const ajv = new Ajv2020({ strict: false });
  addFormats(ajv);
  for (const [path, body] of [
    ["/api/v1/papers", latestBody],
    ["/api/v1/papers/{publicId}", detailBody],
  ] as const) {
    const validate = ajv.compile(
      openApi.paths[path].get.responses["200"].content["application/json"]
        .schema,
    );
    expect(validate(body), ajv.errorsText(validate.errors)).toBe(true);
  }
  const validateProfile = ajv.compile(
    openApi.paths["/api/v1/admin/paper-revision-profiles"].post.responses["201"]
      .content["application/json"].schema,
  );
  for (const body of createdProfiles) {
    expect(validateProfile(body), ajv.errorsText(validateProfile.errors)).toBe(
      true,
    );
  }
});
