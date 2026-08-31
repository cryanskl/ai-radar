import { expect, test } from "@playwright/test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { Client } from "pg";
import {
  startTestApplication,
  type TestApplication,
} from "../support/test-application";

let application: TestApplication | undefined;

const seedPublicApiRecords = async (databaseUrl: string) => {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`
      insert into sources (
        id, public_id, name, homepage_url, tier, access_status,
        acquisition_method, policy_last_reviewed_at
      ) values (
        gen_random_uuid(), 'source-public-api', 'Public API Source', 'https://source.example.test/',
        'S', 'approved', 'manual', '2026-08-31T00:00:00.000Z'
      );

      insert into source_items (
        id, public_id, source_id, external_id, is_original_source, original_url,
        canonical_url, original_title, original_language, published_at,
        published_at_precision, discovered_at, rights_status,
        rights_checked_at, attribution, license_url, public_visibility
      )
      select
        gen_random_uuid(), 'source-item-public-api-' || suffix, source.id, 'external-' || suffix,
        true, 'https://source.example.test/' || suffix,
        'https://source.example.test/' || suffix, 'Public source ' || suffix,
        'en', published_at, 'second', published_at, 'open',
        '2026-08-31T00:00:00.000Z', 'Public API Source',
        'https://creativecommons.org/licenses/by/4.0/', true
      from sources source
      cross join (values
        ('a', '2026-08-30T10:00:00.000Z'::timestamptz),
        ('b', '2026-08-30T11:00:00.000Z'::timestamptz)
      ) fixture(suffix, published_at)
      where source.public_id = 'source-public-api';

      insert into events (
        id, public_id, event_type, fact_status, publication_state, occurred_at,
        occurred_at_precision, discovered_at, last_verified_at, rights_status,
        public_visibility, first_published_at
      ) values
        (gen_random_uuid(), 'event-public-api-a', 'announces', 'corrected', 'published',
          '2026-08-30T10:00:00.000Z', 'second', '2026-08-30T10:01:00.000Z',
          '2026-08-31T01:00:00.000Z', 'open', true,
          '2026-08-31T01:00:00.000Z'),
        (gen_random_uuid(), 'event-public-api-b', 'announces', 'corrected', 'published',
          '2026-08-30T11:00:00.000Z', 'second', '2026-08-30T11:01:00.000Z',
          '2026-08-31T01:00:00.000Z', 'open', true,
          '2026-08-31T01:00:00.000Z');

      insert into event_sources (event_id, source_item_id, is_primary)
      select event.id, source_item.id, true
      from events event
      join source_items source_item
        on source_item.public_id = replace(event.public_id, 'event-', 'source-item-')
      where event.public_id in ('event-public-api-a', 'event-public-api-b');

      insert into localized_contents (
        id, event_id, locale, title, summary, authorship, review_status,
        public_visibility
      )
      select gen_random_uuid(), event.id, locale, title, summary, 'human_authored', 'reviewed', true
      from events event
      cross join (values
        ('en'::content_locale, 'Public API event', 'Public API event summary'),
        ('zh'::content_locale, '公开 API 事件', '公开 API 事件摘要')
      ) localization(locale, title, summary)
      where event.public_id in ('event-public-api-a', 'event-public-api-b');

      insert into entities (
        id, public_id, type, official_name, official_url, lifecycle_status,
        last_verified_at, rights_status, public_visibility
      ) values
        (gen_random_uuid(), 'model-public-api-a', 'model', 'Public API Model A',
          'https://models.example.test/a', 'active',
          '2026-08-31T01:00:00.000Z', 'open', true),
        (gen_random_uuid(), 'model-public-api-b', 'model', 'Public API Model B',
          'https://models.example.test/b', 'active',
          '2026-08-31T01:00:00.000Z', 'metadata_only', true),
        (gen_random_uuid(), 'organization-private-api', 'organization', 'PRIVATE INTERNAL NAME',
          'https://private.example.test/', 'active',
          '2026-08-31T01:00:00.000Z', 'internal_only', false);

      insert into entity_localized_contents (
        id, entity_id, locale, name, summary, authorship, review_status,
        public_visibility
      )
      select gen_random_uuid(), entity.id, locale,
        case when entity.public_visibility then entity.official_name else 'PRIVATE INTERNAL NAME' end,
        case when entity.public_visibility then 'Rights-cleared public summary' else 'PRIVATE SUMMARY' end,
        'human_authored', 'reviewed', entity.public_visibility
      from entities entity
      cross join (values ('en'::content_locale), ('zh'::content_locale)) locales(locale)
      where entity.public_id in (
        'model-public-api-a', 'model-public-api-b', 'organization-private-api'
      );

      insert into relations (
        id, public_id, subject_event_id, subject_entity_id, predicate,
        object_entity_id, first_verified_at, last_verified_at, confidence,
        review_status, creation_method, rights_status, public_visibility
      )
      select gen_random_uuid(), 'relation-public-api-a', event.id, null::uuid, 'ANNOUNCES'::relation_type, entity.id,
        '2026-08-31T01:00:00.000Z'::timestamptz, '2026-08-31T01:00:00.000Z'::timestamptz, 100,
        'reviewed'::relation_review_status, 'editor'::relation_creation_method, 'open'::rights_status, true
      from events event, entities entity
      where event.public_id = 'event-public-api-a'
        and entity.public_id = 'model-public-api-a'
      union all
      select gen_random_uuid(), 'relation-public-api-b', event.id, null::uuid, 'ANNOUNCES'::relation_type, entity.id,
        '2026-08-31T01:00:00.000Z'::timestamptz, '2026-08-31T01:00:00.000Z'::timestamptz, 100,
        'reviewed'::relation_review_status, 'editor'::relation_creation_method, 'metadata_only'::rights_status, true
      from events event, entities entity
      where event.public_id = 'event-public-api-b'
        and entity.public_id = 'model-public-api-b'
      union all
      select gen_random_uuid(), 'relation-private-api', null::uuid, private.id, 'DEVELOPS'::relation_type, public.id,
        '2026-08-31T01:00:00.000Z'::timestamptz, '2026-08-31T01:00:00.000Z'::timestamptz, 100,
        'reviewed'::relation_review_status, 'editor'::relation_creation_method, 'internal_only'::rights_status, false
      from entities private, entities public
      where private.public_id = 'organization-private-api'
        and public.public_id = 'model-public-api-a';

      insert into relation_evidence (relation_id, source_item_id)
      select relation.id, source_item.id
      from relations relation
      join source_items source_item on source_item.public_id = case
        when relation.public_id = 'relation-public-api-b'
          then 'source-item-public-api-b'
        else 'source-item-public-api-a'
      end
      where relation.public_id in (
        'relation-public-api-a', 'relation-public-api-b', 'relation-private-api'
      );

      insert into editorial_cases (
        id, public_id, kind, target_type, target_public_id, target_event_id,
        received_at, original_request, evidence_summary, status, decision,
        decided_at, previous_rights_status, actor_role, updated_at
      )
      select gen_random_uuid(), 'case-public-api-' || suffix, 'correction', 'event', event.public_id,
        event.id, '2026-08-31T01:00:00.000Z', 'Public correction request',
        'Public evidence summary', 'actioned', 'corrected',
        '2026-08-31T02:00:00.000Z', 'open', 'owner',
        '2026-08-31T02:00:00.000Z'
      from events event
      join (values ('a'), ('b')) fixture(suffix)
        on event.public_id = 'event-public-api-' || suffix;

      insert into corrections (
        id, public_id, case_id, target_type, target_public_id, target_event_id,
        reason_code, effective_at, replacement_version, internal_note,
        actor_role
      )
      select gen_random_uuid(), 'correction-public-api-' || suffix, editorial_case.id, 'event',
        event.public_id, event.id, 'factual_error',
        '2026-08-31T02:00:00.000Z', event.public_id || '@v2',
        'PRIVATE INTERNAL NOTE', 'owner'
      from events event
      join (values ('a'), ('b')) fixture(suffix)
        on event.public_id = 'event-public-api-' || suffix
      join editorial_cases editorial_case
        on editorial_case.public_id = 'case-public-api-' || suffix;

      insert into correction_changes (
        correction_id, field, previous_value, corrected_value
      )
      select correction.id, 'fact_status', 'confirmed', 'corrected'
      from corrections correction
      where correction.public_id in (
        'correction-public-api-a', 'correction-public-api-b'
      );

      insert into correction_evidence (correction_id, source_item_id)
      select correction.id, source_item.id
      from corrections correction
      join source_items source_item on source_item.public_id =
        replace(correction.public_id, 'correction-', 'source-item-')
      where correction.public_id in (
        'correction-public-api-a', 'correction-public-api-b'
      );

      insert into tombstones (
        id, object_public_id, object_type, status, public_reason_code,
        effective_at, case_reference_public_id
      ) values
        (gen_random_uuid(), 'event-public-api-review-a', 'event', 'reviewing', 'high_risk_review',
          '2026-08-31T03:00:00.000Z', 'case-public-api-review-a'),
        (gen_random_uuid(), 'model-public-api-review-b', 'entity', 'reviewing', 'high_risk_review',
          '2026-08-31T03:01:00.000Z', 'case-public-api-review-b');
    `);
  } finally {
    await client.end();
  }
};

test.beforeAll(async () => {
  application = await startTestApplication({
    publicApi: {
      dataVersion: "public-alpha-test-1",
      rateLimitRequests: 3,
      rateLimitWindowSeconds: 60,
    },
  });
});

test.afterAll(async () => {
  if (application) await application.stop();
});

test("exposes a versioned, bounded and rate-limited read-only Public API contract", async ({
  context,
}) => {
  if (!application) throw new Error("Test application did not start");
  await seedPublicApiRecords(application.databaseUrl);
  const applicationUrl = application.url;

  const publicCollections = [
    "/api/v1/events?locale=en&limit=1",
    "/api/v1/entities?locale=en&limit=1",
    "/api/v1/relations?locale=en&limit=1",
    "/api/v1/search?q=public-api&locale=en&limit=1",
    "/api/v1/rankings?locale=en&limit=1",
    "/api/v1/corrections?limit=1",
    "/api/v1/tombstones?limit=1",
    "/api/v1/releases?limit=1",
  ];

  const publicBodies = new Map<string, unknown>();
  for (const [index, path] of publicCollections.entries()) {
    const response = await context.request.get(`${applicationUrl}${path}`, {
      headers: { "x-forwarded-for": `198.51.100.${index + 1}` },
    });
    expect(response.status(), path).toBe(200);
    expect(response.headers()["x-ai-radar-data-version"], path).toBe(
      "public-alpha-test-1",
    );
    expect(response.headers()["x-ratelimit-limit"], path).toBe("3");
    const body = await response.json();
    expect(body, path).toMatchObject({
      dataVersion: "public-alpha-test-1",
    });
    expect(body, path).toHaveProperty("nextCursor");
    publicBodies.set(path.split("?")[0], body);
  }

  const readPage = async (
    path: string,
    identity: string,
  ): Promise<{
    items: Array<Record<string, unknown>>;
    nextCursor: string | null;
  }> => {
    const response = await context.request.get(`${applicationUrl}${path}`, {
      headers: { "x-forwarded-for": identity },
    });
    expect(response.status(), path).toBe(200);
    return response.json();
  };

  const firstEvents = await readPage(
    "/api/v1/events?locale=en&limit=1",
    "198.51.100.20",
  );
  expect(firstEvents.items.map(({ publicId }) => publicId)).toEqual([
    "event-public-api-b",
  ]);
  expect(firstEvents.nextCursor).not.toBeNull();
  const secondEvents = await readPage(
    `/api/v1/events?locale=en&limit=1&cursor=${encodeURIComponent(firstEvents.nextCursor!)}`,
    "198.51.100.20",
  );
  expect(secondEvents.items.map(({ publicId }) => publicId)).toEqual([
    "event-public-api-a",
  ]);
  expect(secondEvents.nextCursor).toBeNull();

  const database = new Client({ connectionString: application.databaseUrl });
  await database.connect();
  await database.query(`
    insert into source_items (
      id, public_id, source_id, external_id, is_original_source, original_url,
      canonical_url, original_title, original_language, published_at,
      published_at_precision, discovered_at, rights_status,
      rights_checked_at, attribution, license_url, public_visibility
    )
    select gen_random_uuid(), 'source-item-public-api-c', source.id, 'external-c',
      true, 'https://source.example.test/c', 'https://source.example.test/c',
      'Public source c', 'en', '2026-08-30T09:00:00.000Z', 'second',
      '2026-08-30T09:00:00.000Z', 'open', '2026-08-31T00:00:00.000Z',
      'Public API Source', 'https://creativecommons.org/licenses/by/4.0/', true
    from sources source where source.public_id = 'source-public-api';

    insert into events (
      id, public_id, event_type, fact_status, publication_state, occurred_at,
      occurred_at_precision, discovered_at, last_verified_at, rights_status,
      public_visibility, first_published_at
    ) values (
      gen_random_uuid(), 'event-public-api-c', 'announces', 'confirmed', 'published',
      '2026-08-30T09:00:00.000Z', 'second', '2026-08-30T09:01:00.000Z',
      '2026-08-31T01:00:00.000Z', 'open', true,
      '2026-08-31T01:00:00.000Z'
    );

    insert into event_sources (event_id, source_item_id, is_primary)
    select event.id, source_item.id, true
    from events event, source_items source_item
    where event.public_id = 'event-public-api-c'
      and source_item.public_id = 'source-item-public-api-c';

    insert into localized_contents (
      id, event_id, locale, title, summary, authorship, review_status,
      public_visibility
    )
    select gen_random_uuid(), event.id, 'en', 'Public API event c',
      'Public API event c summary', 'human_authored', 'reviewed', true
    from events event where event.public_id = 'event-public-api-c';

    update source_items set rights_status = 'permission_required'
    where public_id in ('source-item-public-api-a', 'source-item-public-api-b');
  `);
  const pageAfterRestrictedCandidate = await readPage(
    "/api/v1/events?locale=en&limit=1",
    "198.51.100.21",
  );
  expect(
    pageAfterRestrictedCandidate.items.map(({ publicId }) => publicId),
  ).toEqual(["event-public-api-c"]);
  expect(pageAfterRestrictedCandidate.nextCursor).toBeNull();
  await database.query(`
    update source_items set rights_status = 'open'
    where public_id in ('source-item-public-api-a', 'source-item-public-api-b');
    delete from events where public_id = 'event-public-api-c';
    delete from source_items where public_id = 'source-item-public-api-c';
  `);

  for (const [resource, expected] of [
    ["entities?locale=en", ["model-public-api-a", "model-public-api-b"]],
    ["relations?locale=en", ["relation-public-api-a", "relation-public-api-b"]],
    ["corrections", ["correction-public-api-a", "correction-public-api-b"]],
    ["tombstones", ["event-public-api-review-a", "model-public-api-review-b"]],
  ] as const) {
    const identity = `198.51.100.${30 + expected[0].length}`;
    const separator = resource.includes("?") ? "&" : "?";
    const first = await readPage(
      `/api/v1/${resource}${separator}limit=1`,
      identity,
    );
    expect(first.items.map(({ publicId }) => publicId)).toEqual([expected[0]]);
    expect(first.nextCursor).not.toBeNull();
    const second = await readPage(
      `/api/v1/${resource}${separator}limit=1&cursor=${encodeURIComponent(first.nextCursor!)}`,
      identity,
    );
    expect(second.items.map(({ publicId }) => publicId)).toEqual([expected[1]]);
    expect(second.nextCursor).toBeNull();
    expect(JSON.stringify([first, second])).not.toContain("PRIVATE");
  }

  const mismatchedCursor = await context.request.get(
    `${application.url}/api/v1/entities?locale=zh&limit=1&cursor=${encodeURIComponent(
      (await readPage("/api/v1/entities?locale=en&limit=1", "198.51.100.80"))
        .nextCursor!,
    )}`,
    { headers: { "x-forwarded-for": "198.51.100.80" } },
  );
  expect(mismatchedCursor.status()).toBe(400);
  expect(await mismatchedCursor.json()).toEqual({
    error: "invalid_cursor",
    message: "Cursor does not match this Public API request",
  });

  for (const [path, expectedPublicId] of [
    ["/api/v1/events/event-public-api-a?locale=en", "event-public-api-a"],
    ["/api/v1/entities/model-public-api-a?locale=en", "model-public-api-a"],
    [
      "/api/v1/relations/relation-public-api-a?locale=en",
      "relation-public-api-a",
    ],
    ["/api/v1/corrections/correction-public-api-a", "correction-public-api-a"],
    [
      "/api/v1/tombstones/event-public-api-review-a",
      "event-public-api-review-a",
    ],
  ] as const) {
    const response = await context.request.get(`${applicationUrl}${path}`, {
      headers: { "x-forwarded-for": `192.0.2.${expectedPublicId.length}` },
    });
    expect(response.status(), path).toBe(200);
    expect(response.headers()["x-ai-radar-data-version"], path).toBe(
      "public-alpha-test-1",
    );
    const body = await response.json();
    expect(body, path).toMatchObject({
      publicId: expectedPublicId,
    });
    if (expectedPublicId === "relation-public-api-a") {
      expect(body).toMatchObject({
        validFrom: null,
        validTo: null,
        confidence: 100,
        reviewStatus: "reviewed",
        evidence: [
          {
            rightsStatus: "open",
            attribution: "Public API Source",
            licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
            rightsCheckedAt: "2026-08-31T00:00:00.000Z",
          },
        ],
      });
    }
    if (expectedPublicId === "model-public-api-a") {
      expect(body.backlinks[0].evidence[0]).toMatchObject({
        rightsStatus: "open",
        attribution: "Public API Source",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
        rightsCheckedAt: "2026-08-31T00:00:00.000Z",
      });
    }
    if (expectedPublicId === "correction-public-api-a") {
      expect(body).toMatchObject({
        lastVerifiedAt: "2026-08-31T02:00:00.000Z",
        evidence: [
          {
            rightsStatus: "open",
            attribution: "Public API Source",
            licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
            rightsCheckedAt: "2026-08-31T00:00:00.000Z",
          },
        ],
      });
    }
  }

  let restrictedRequest = 1;
  for (const rightsStatus of [
    "permission_required",
    "internal_only",
    "withdrawn",
  ]) {
    await database.query(
      `update source_items
       set rights_status = $1
       where public_id = 'source-item-public-api-a'`,
      [rightsStatus],
    );
    for (const path of [
      "/api/v1/events/event-public-api-a?locale=en",
      "/api/v1/relations/relation-public-api-a?locale=en",
    ]) {
      const response = await context.request.get(`${applicationUrl}${path}`, {
        headers: {
          "x-forwarded-for": `203.0.113.${restrictedRequest++}`,
        },
      });
      expect(response.status(), `${rightsStatus} ${path}`).toBe(404);
    }
    const redactedCorrection = await context.request.get(
      `${applicationUrl}/api/v1/corrections/correction-public-api-a`,
      {
        headers: {
          "x-forwarded-for": `203.0.113.${restrictedRequest++}`,
        },
      },
    );
    expect(redactedCorrection.status()).toBe(200);
    expect(await redactedCorrection.json()).toMatchObject({
      publicId: "correction-public-api-a",
      status: "redacted_due_to_rights",
    });
  }

  await database.query(
    `update source_items set rights_status = 'open'
     where public_id = 'source-item-public-api-a';
     update sources set access_status = 'permission_pending'
     where public_id = 'source-public-api'`,
  );
  for (const path of [
    "/api/v1/events?locale=en&limit=50",
    "/api/v1/relations?locale=en&limit=50",
  ]) {
    const response = await context.request.get(`${applicationUrl}${path}`, {
      headers: {
        "x-forwarded-for": `203.0.113.${restrictedRequest++}`,
      },
    });
    expect(response.status(), path).toBe(200);
    expect(JSON.stringify(await response.json()), path).not.toContain(
      "public-api-a",
    );
  }
  const sourceRestrictedCorrection = await context.request.get(
    `${applicationUrl}/api/v1/corrections/correction-public-api-a`,
    {
      headers: { "x-forwarded-for": `203.0.113.${restrictedRequest++}` },
    },
  );
  expect(await sourceRestrictedCorrection.json()).toMatchObject({
    status: "redacted_due_to_rights",
  });

  await database.query(`
    update sources set access_status = 'approved'
    where public_id = 'source-public-api';

    insert into sources (
      id, public_id, name, homepage_url, tier, access_status,
      acquisition_method, policy_last_reviewed_at
    ) values (
      gen_random_uuid(), 'source-public-api-pending', 'Pending Public API Source',
      'https://pending-source.example.test/', 'A', 'permission_pending',
      'manual', '2026-08-31T00:00:00.000Z'
    );

    insert into source_items (
      id, public_id, source_id, external_id, is_original_source, original_url,
      canonical_url, original_title, original_language, published_at,
      published_at_precision, discovered_at, rights_status,
      rights_checked_at, attribution, license_url, public_visibility
    )
    select gen_random_uuid(), 'source-item-public-api-pending', source.id,
      'external-pending', false, 'https://pending-source.example.test/evidence',
      'https://pending-source.example.test/evidence', 'Pending relation evidence',
      'en', '2026-08-30T09:00:00.000Z', 'second',
      '2026-08-30T09:00:00.000Z', 'open', '2026-08-31T00:00:00.000Z',
      'Pending Public API Source', null, true
    from sources source where source.public_id = 'source-public-api-pending';

    insert into relation_evidence (relation_id, source_item_id)
    select relation.id, source_item.id
    from relations relation, source_items source_item
    where relation.public_id = 'relation-public-api-a'
      and source_item.public_id = 'source-item-public-api-pending';
  `);
  const mixedEvidenceRelation = await context.request.get(
    `${applicationUrl}/api/v1/relations/relation-public-api-a?locale=en`,
    {
      headers: { "x-forwarded-for": `203.0.113.${restrictedRequest++}` },
    },
  );
  expect(mixedEvidenceRelation.status()).toBe(200);
  const mixedEvidenceRelationBody = await mixedEvidenceRelation.json();
  expect(mixedEvidenceRelationBody.evidence).toHaveLength(1);
  expect(JSON.stringify(mixedEvidenceRelationBody)).not.toContain(
    "source-item-public-api-pending",
  );
  const mixedEvidenceRelations = await context.request.get(
    `${applicationUrl}/api/v1/relations?locale=en&limit=50`,
    {
      headers: { "x-forwarded-for": `203.0.113.${restrictedRequest++}` },
    },
  );
  const mixedEvidenceRelationsBody = await mixedEvidenceRelations.json();
  expect(JSON.stringify(mixedEvidenceRelationsBody)).toContain(
    "relation-public-api-a",
  );
  expect(JSON.stringify(mixedEvidenceRelationsBody)).not.toContain(
    "source-item-public-api-pending",
  );
  const mixedEvidenceEntity = await context.request.get(
    `${applicationUrl}/api/v1/entities/model-public-api-a?locale=en`,
    {
      headers: { "x-forwarded-for": `203.0.113.${restrictedRequest++}` },
    },
  );
  expect(mixedEvidenceEntity.status()).toBe(200);
  const mixedEvidenceEntityBody = await mixedEvidenceEntity.json();
  expect(mixedEvidenceEntityBody.backlinks).toEqual([
    expect.objectContaining({
      publicId: "relation-public-api-a",
      evidence: [
        expect.objectContaining({
          sourceItemPublicId: "source-item-public-api-a",
        }),
      ],
    }),
  ]);
  expect(JSON.stringify(mixedEvidenceEntityBody)).not.toContain(
    "source-item-public-api-pending",
  );
  const mixedEvidenceEvent = await context.request.get(
    `${applicationUrl}/api/v1/events/event-public-api-a?locale=en`,
    {
      headers: { "x-forwarded-for": `203.0.113.${restrictedRequest++}` },
    },
  );
  expect((await mixedEvidenceEvent.json()).entities).toEqual([
    expect.objectContaining({
      publicId: "model-public-api-a",
      relationPublicId: "relation-public-api-a",
    }),
  ]);
  await database.query(`
    delete from relation_evidence
    where source_item_id = (
      select id from source_items
      where public_id = 'source-item-public-api-pending'
    );
    delete from source_items where public_id = 'source-item-public-api-pending';
    delete from sources where public_id = 'source-public-api-pending';
  `);

  await database.query(
    `update entities set rights_status = 'permission_required'
     where public_id = 'model-public-api-a'`,
  );
  for (const path of [
    "/api/v1/entities/model-public-api-a?locale=en",
    "/api/v1/relations/relation-public-api-a?locale=en",
  ]) {
    const response = await context.request.get(`${applicationUrl}${path}`, {
      headers: {
        "x-forwarded-for": `203.0.113.${restrictedRequest++}`,
      },
    });
    expect(response.status(), path).toBe(404);
  }
  const eventWithRestrictedEntity = await context.request.get(
    `${applicationUrl}/api/v1/events/event-public-api-a?locale=en`,
    {
      headers: { "x-forwarded-for": `203.0.113.${restrictedRequest++}` },
    },
  );
  expect(eventWithRestrictedEntity.status()).toBe(200);
  expect(await eventWithRestrictedEntity.json()).toMatchObject({
    entities: [],
  });
  await database.end();

  const missingRelease = await context.request.get(
    `${applicationUrl}/api/v1/releases/public-alpha-test-1`,
    { headers: { "x-forwarded-for": "192.0.2.90" } },
  );
  expect(missingRelease.status()).toBe(404);
  expect(await missingRelease.json()).toEqual({
    error: "not_found",
    message: "Public Data Release does not exist",
  });

  const invalidLimit = await context.request.get(
    `${applicationUrl}/api/v1/relations?locale=en&limit=51`,
    { headers: { "x-forwarded-for": "192.0.2.91" } },
  );
  expect(invalidLimit.status()).toBe(400);
  expect(await invalidLimit.json()).toEqual({
    error: "invalid_request",
    message: "Public API pagination is invalid",
  });

  for (const [path, expected] of [
    [
      "/api/v1/search?locale=en",
      {
        error: "invalid_request",
        message: "Public API Search request is invalid",
      },
    ],
    [
      "/api/v1/rankings?locale=en&limit=51",
      {
        error: "invalid_request",
        message: "Public API Ranking request is invalid",
      },
    ],
    [
      "/api/v1/events/missing-public-event?locale=en",
      { error: "not_found", message: "Event was not found" },
    ],
    [
      "/api/v1/entities/missing-public-entity?locale=en",
      { error: "not_found", message: "Entity was not found" },
    ],
    [
      "/api/v1/corrections/missing-public-correction",
      { error: "not_found", message: "Correction was not found" },
    ],
    [
      "/api/v1/rankings/missing-public-ranking?locale=en",
      { error: "not_found", message: "Ranking was not found" },
    ],
  ] as const) {
    const response = await context.request.get(`${applicationUrl}${path}`, {
      headers: { "x-forwarded-for": `192.0.2.${path.length}` },
    });
    expect(response.status(), path).toBe(
      expected.error === "not_found" ? 404 : 400,
    );
    expect(await response.json(), path).toEqual(expected);
  }

  const writeAttempt = await context.request.post(
    `${applicationUrl}/api/v1/relations`,
    { data: {} },
  );
  expect(writeAttempt.status()).toBe(405);
  expect(writeAttempt.headers()).not.toHaveProperty("x-ratelimit-limit");

  const ownerBoundary = await context.request.get(
    `${applicationUrl}/api/v1/admin/email-deliveries`,
  );
  expect(ownerBoundary.status()).toBe(401);
  expect(ownerBoundary.headers()).not.toHaveProperty("x-ratelimit-limit");

  const similarPrivatePath = await context.request.get(
    `${applicationUrl}/api/v1/relations-private`,
  );
  expect(similarPrivatePath.status()).toBe(404);
  expect(similarPrivatePath.headers()).not.toHaveProperty("x-ratelimit-limit");

  const rateLimitedIdentity = { "x-forwarded-for": "198.18.0.10" };
  for (let requestNumber = 1; requestNumber <= 3; requestNumber += 1) {
    const response = await context.request.get(
      `${application.url}/api/v1/releases?limit=1`,
      { headers: rateLimitedIdentity },
    );
    expect(response.status()).toBe(200);
    expect(response.headers()["x-ratelimit-remaining"]).toBe(
      String(3 - requestNumber),
    );
  }
  const rejected = await context.request.get(
    `${application.url}/api/v1/releases?limit=1`,
    { headers: rateLimitedIdentity },
  );
  expect(rejected.status()).toBe(429);
  expect(rejected.headers()["retry-after"]).toMatch(/^\d+$/);
  expect(rejected.headers()["cache-control"]).toBe("no-store");
  expect(await rejected.json()).toEqual({
    error: "rate_limit_exceeded",
    message: "Public API rate limit exceeded",
  });

  const openApiResponse = await context.request.get(
    `${application.url}/api/openapi.json`,
  );
  expect(openApiResponse.status()).toBe(200);
  const openApi = await openApiResponse.json();
  expect(openApi.openapi).toBe("3.1.0");
  expect(openApi.info.license).toMatchObject({
    name: "CC BY 4.0 for AI Radar-owned data",
  });
  expect(openApi.info.description).toContain(
    "Record-level rights and license fields take precedence",
  );

  const ajv = new Ajv2020({ strict: false });
  addFormats(ajv);
  for (const path of publicCollections.map((path) => path.split("?")[0])) {
    const operation = openApi.paths[path].get;
    expect(operation.responses).toHaveProperty("429");
    expect(operation.responses["200"].headers).toHaveProperty(
      "X-AI-Radar-Data-Version",
    );
    const successContent =
      operation.responses["200"].content["application/json"];
    expect(successContent).toHaveProperty("example");
    expect(
      ajv.compile(successContent.schema)(successContent.example),
      `${path} OpenAPI example`,
    ).toBe(true);
    if (path !== "/api/v1/releases") {
      const records =
        path === "/api/v1/rankings"
          ? successContent.example.definitions
          : successContent.example.items;
      expect(records.length, path).toBeGreaterThan(0);
    }
    expect(
      ajv.compile(
        operation.responses["429"].content["application/json"].schema,
      )({
        error: "rate_limit_exceeded",
        message: "Public API rate limit exceeded",
      }),
      path,
    ).toBe(true);
    expect(
      ajv.compile(
        operation.responses["200"].content["application/json"].schema,
      )(publicBodies.get(path)),
      `${path} real response`,
    ).toBe(true);
  }

  for (const path of [
    "/api/v1/relations",
    "/api/v1/corrections",
    "/api/v1/tombstones",
    "/api/v1/releases",
  ]) {
    expect(openApi.paths[path]).toEqual({ get: expect.any(Object) });
  }

  for (const path of [
    "/api/v1/events/{publicId}",
    "/api/v1/entities/{publicId}",
    "/api/v1/relations/{publicId}",
    "/api/v1/corrections/{publicId}",
    "/api/v1/tombstones/{publicId}",
    "/api/v1/releases/{publicId}",
    "/api/v1/rankings/{publicId}",
    "/api/v1/status",
  ]) {
    const operation = openApi.paths[path].get;
    expect(operation.responses).toHaveProperty("429");
    expect(operation.responses["200"].headers).toHaveProperty(
      "X-AI-Radar-Data-Version",
    );
    if (path !== "/api/v1/releases/{publicId}") {
      const successContent =
        operation.responses["200"].content["application/json"];
      expect(successContent).toHaveProperty("example");
      expect(
        ajv.compile(successContent.schema)(successContent.example),
        `${path} OpenAPI example`,
      ).toBe(true);
    }
  }
});
