import { createHash } from "node:crypto";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
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
let remoteServer: Server | undefined;
const remoteFiles = new Map<string, string>();
let githubApiFailure: "none" | "not-found" | "rate-limited" | "malformed" =
  "none";
let mirrorTransportFailure: "none" | "redirect" | "oversized" = "none";

const fileNames = [
  "schema.json",
  "records.json",
  "corrections.json",
  "tombstones.json",
  "manifest.json",
] as const;

test.beforeAll(async () => {
  remoteServer = createServer((request, response) => {
    const path = request.url ?? "/";
    if (
      path ===
      "/api.github.com/repos/cryanskl/ai-radar/releases/tags/data-public-alpha-1"
    ) {
      if (githubApiFailure === "not-found") {
        response.statusCode = 404;
        response.end("not found");
        return;
      }
      if (githubApiFailure === "rate-limited") {
        response.statusCode = 429;
        response.end("rate limited");
        return;
      }
      if (githubApiFailure === "malformed") {
        response.setHeader("content-type", "application/json");
        response.end("{not-json");
        return;
      }
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          html_url:
            "https://github.com/cryanskl/ai-radar/releases/tag/data-public-alpha-1",
          assets: fileNames.map((name) => ({
            name,
            browser_download_url: `https://github.com/cryanskl/ai-radar/releases/download/data-public-alpha-1/${name}`,
          })),
        }),
      );
      return;
    }
    if (
      path.endsWith("/manifest.json") &&
      path.startsWith("/example.feishu.cn/")
    ) {
      if (mirrorTransportFailure === "redirect") {
        response.statusCode = 302;
        response.setHeader(
          "location",
          "https://unverified.example.test/manifest.json",
        );
        response.end();
        return;
      }
      if (mirrorTransportFailure === "oversized") {
        response.setHeader("content-length", String(50 * 1024 * 1024 + 1));
        response.end("oversized");
        return;
      }
    }
    const name = path.split("/").at(-1);
    const content = name
      ? remoteFiles.get(`${path.split("/")[1]}:${name}`)
      : null;
    if (content === undefined || content === null) {
      response.statusCode = 404;
      response.end("not found");
      return;
    }
    response.setHeader("content-type", "application/json");
    response.end(content);
  });
  remoteServer.listen(0, "127.0.0.1");
  await once(remoteServer, "listening");
  const address = remoteServer.address();
  if (!address || typeof address === "string")
    throw new Error("Remote fixture server did not start");
  application = await startTestApplication({
    dataReleaseRemoteOrigin: `http://127.0.0.1:${address.port}`,
  });
});

test.afterAll(async () => {
  if (application) await application.stop();
  if (remoteServer) {
    remoteServer.close();
    await once(remoteServer, "close");
  }
});

test("publishes an immutable rights-cleared Data Release and verified mirror", async ({
  context,
  page,
}) => {
  if (!application) throw new Error("Test application did not start");
  const applicationUrl = application.url;
  const database = new Client({ connectionString: application.databaseUrl });
  await database.connect();

  await database.query(`
    insert into sources (
      id, public_id, name, homepage_url, tier, access_status,
      acquisition_method, policy_last_reviewed_at
    ) values
      (gen_random_uuid(), 'source-data-release', 'Release Source',
       'https://release-source.example.test/', 'S', 'approved', 'manual',
       '2026-08-31T00:00:00.000Z'),
      (gen_random_uuid(), 'source-data-release-private', 'Private Source',
       'https://private-source.example.test/', 'C', 'blocked', 'manual',
       '2026-08-31T00:00:00.000Z');

    insert into source_items (
      id, public_id, source_id, external_id, is_original_source, original_url,
      canonical_url, original_title, original_language, published_at,
      published_at_precision, discovered_at, rights_status, rights_checked_at,
      attribution, license_url, public_visibility
    )
    select gen_random_uuid(), 'source-item-data-release', id, 'release-1', true,
      'https://release-source.example.test/release-1',
      'https://release-source.example.test/release-1', 'Release source item',
      'en', '2026-08-31T08:00:00.000Z', 'second',
      '2026-08-31T08:01:00.000Z', 'open', '2026-08-31T08:02:00.000Z',
      'Release Source', 'https://creativecommons.org/licenses/by/4.0/', true
    from sources where public_id = 'source-data-release';

    insert into source_items (
      id, public_id, source_id, external_id, is_original_source, original_url,
      canonical_url, original_title, original_language, published_at,
      published_at_precision, discovered_at, rights_status, rights_checked_at,
      attribution, license_url, public_visibility
    )
    select gen_random_uuid(), 'source-item-data-release-schema-invalid', id,
      'release-schema-invalid', true,
      'https://release-source.example.test/release-schema-invalid',
      'https://release-source.example.test/release-schema-invalid',
      'Schema-invalid source item', 'en', '2026-08-31T08:00:00.000Z',
      'second', '2026-08-31T08:01:00.000Z', 'open',
      '2026-08-31T08:02:00.000Z', 'Release Source',
      'https://creativecommons.org/licenses/by/4.0/', true
    from sources where public_id = 'source-data-release';

    insert into source_items (
      id, public_id, source_id, external_id, is_original_source, original_url,
      canonical_url, original_title, original_language, published_at,
      published_at_precision, discovered_at, rights_status, rights_checked_at,
      attribution, license_url, public_visibility
    )
    select gen_random_uuid(), 'source-item-data-release-privacy', id,
      'release-privacy', true,
      'https://release-source.example.test/release-privacy',
      'https://release-source.example.test/release-privacy',
      'Privacy fixture source item', 'en', '2026-08-31T08:00:00.000Z',
      'second', '2026-08-31T08:01:00.000Z', 'open',
      '2026-08-31T08:02:00.000Z', 'Release Source',
      'https://creativecommons.org/licenses/by/4.0/', true
    from sources where public_id = 'source-data-release';

    insert into source_items (
      id, public_id, source_id, external_id, is_original_source, original_url,
      canonical_url, original_title, original_language, published_at,
      published_at_precision, discovered_at, rights_status, rights_checked_at,
      attribution, public_visibility
    )
    select gen_random_uuid(), 'source-item-data-release-permission', id,
      'release-permission', true,
      'https://release-source.example.test/release-permission',
      'https://release-source.example.test/release-permission',
      'Permission-required source item', 'en', '2026-08-31T08:00:00.000Z',
      'second', '2026-08-31T08:01:00.000Z', 'permission_required',
      '2026-08-31T08:02:00.000Z', 'Release Source', true
    from sources where public_id = 'source-data-release';

    insert into source_items (
      id, public_id, source_id, external_id, is_original_source, original_url,
      canonical_url, original_title, original_language, published_at,
      published_at_precision, discovered_at, rights_status, rights_checked_at,
      attribution, license_url, public_visibility
    )
    select gen_random_uuid(), 'source-item-data-release-after-cutoff', id,
      'release-after-cutoff', true,
      'https://release-source.example.test/release-after-cutoff',
      'https://release-source.example.test/release-after-cutoff',
      'After-cutoff source item', 'en', '2026-08-31T08:00:00.000Z',
      'second', '2026-08-31T08:01:00.000Z', 'open',
      '2026-08-31T08:02:00.000Z', 'Release Source',
      'https://creativecommons.org/licenses/by/4.0/', true
    from sources where public_id = 'source-data-release';

    insert into source_items (
      id, public_id, source_id, external_id, is_original_source, original_url,
      canonical_url, original_title, original_language, published_at,
      published_at_precision, discovered_at, rights_status, rights_checked_at,
      attribution, public_visibility
    )
    select gen_random_uuid(), 'source-item-data-release-private', id, 'private-1', true,
      'https://private-source.example.test/private-1',
      'https://private-source.example.test/private-1',
      'PRIVATE contact private-person@example.test', 'en',
      '2026-08-31T08:00:00.000Z', 'second',
      '2026-08-31T08:01:00.000Z', 'internal_only',
      '2026-08-31T08:02:00.000Z', 'PRIVATE ATTRIBUTION', false
    from sources where public_id = 'source-data-release-private';

    insert into events (
      id, public_id, event_type, fact_status, publication_state, occurred_at,
      occurred_at_precision, discovered_at, last_verified_at, rights_status,
      public_visibility, first_published_at
    ) values
      (gen_random_uuid(), 'event-data-release', 'announces', 'confirmed', 'published',
       '2026-08-31T08:00:00.000Z', 'second', '2026-08-31T08:01:00.000Z',
       '2026-08-31T08:03:00.000Z', 'open', true, '2026-08-31T08:04:00.000Z'),
      (gen_random_uuid(), 'event-data-release-missing-source', 'announces', 'confirmed', 'published',
       '2026-08-31T08:05:00.000Z', 'second', '2026-08-31T08:06:00.000Z',
       '2026-08-31T08:07:00.000Z', 'open', true, '2026-08-31T08:08:00.000Z'),
      (gen_random_uuid(), 'event-data-release-permission-required', 'announces', 'confirmed', 'published',
       '2026-08-31T08:05:00.000Z', 'second', '2026-08-31T08:06:00.000Z',
       '2026-08-31T08:07:00.000Z', 'permission_required', true,
       '2026-08-31T08:08:00.000Z'),
      (gen_random_uuid(), 'event-data-release-after-cutoff', 'announces', 'confirmed', 'published',
       '2026-08-31T08:05:00.000Z', 'second', '2026-08-31T08:06:00.000Z',
       '2026-08-31T08:07:00.000Z', 'open', true, '2026-08-31T08:08:00.000Z'),
      (gen_random_uuid(), 'event-data-release-schema-invalid', 'announces', 'confirmed', 'published',
       '2026-08-31T08:05:00.000Z', 'second', '2026-08-31T08:06:00.000Z',
       '2026-08-31T08:07:00.000Z', 'open', true, null),
      (gen_random_uuid(), 'event-data-release-privacy', 'announces', 'confirmed', 'published',
       '2026-08-31T08:05:00.000Z', 'second', '2026-08-31T08:06:00.000Z',
       '2026-08-31T08:07:00.000Z', 'open', true, '2026-08-31T08:08:00.000Z'),
      (gen_random_uuid(), 'event-data-release-private', 'announces', 'confirmed', 'published',
       '2026-08-31T08:10:00.000Z', 'second', '2026-08-31T08:11:00.000Z',
       '2026-08-31T08:12:00.000Z', 'internal_only', false,
       '2026-08-31T08:13:00.000Z');

    update events set updated_at = '2026-09-01T00:00:00.000Z'
    where public_id = 'event-data-release-after-cutoff';

    insert into event_sources (event_id, source_item_id, is_primary)
    select event.id, source_item.id, true
    from events event
    join source_items source_item on source_item.public_id = case event.public_id
      when 'event-data-release' then 'source-item-data-release'
      when 'event-data-release-permission-required' then 'source-item-data-release-permission'
      when 'event-data-release-after-cutoff' then 'source-item-data-release-after-cutoff'
      when 'event-data-release-schema-invalid' then 'source-item-data-release-schema-invalid'
      when 'event-data-release-privacy' then 'source-item-data-release-privacy'
      else 'source-item-data-release-private'
    end
    where event.public_id in (
      'event-data-release',
      'event-data-release-permission-required',
      'event-data-release-after-cutoff',
      'event-data-release-schema-invalid',
      'event-data-release-privacy',
      'event-data-release-private'
    );

    insert into localized_contents (
      id, event_id, locale, title, summary, authorship, review_status,
      public_visibility
    )
    select gen_random_uuid(), event.id, locale,
      case when event.public_id = 'event-data-release-private'
        then 'PRIVATE contact private-person@example.test'
        when event.public_id = 'event-data-release-privacy'
        then 'Contact sensitive-person@example.test'
        when locale = 'en' then 'Rights-cleared release event'
        else '通过权利检查的发行事件' end,
      case when event.public_id = 'event-data-release-private'
        then 'PRIVATE INTERNAL SUMMARY'
        when locale = 'en' then 'Public release summary'
        else '公开发行摘要' end,
      'human_authored', 'reviewed', event.public_visibility
    from events event
    cross join (values ('en'::content_locale), ('zh'::content_locale)) locales(locale)
    where event.public_id in (
      'event-data-release',
      'event-data-release-missing-source',
      'event-data-release-permission-required',
      'event-data-release-after-cutoff',
      'event-data-release-schema-invalid',
      'event-data-release-privacy',
      'event-data-release-private'
    );

    insert into editorial_cases (
      id, public_id, kind, target_type, target_public_id, target_event_id,
      received_at, original_request, evidence_summary, status, decision,
      decided_at, previous_rights_status, actor_role, updated_at
    )
    select gen_random_uuid(), 'case-data-release-correction', 'correction',
      'event', event.public_id, event.id, '2026-08-31T09:00:00.000Z',
      'PRIVATE REQUESTER EMAIL requester@example.test', 'Verified public correction',
      'actioned', 'corrected', '2026-08-31T09:05:00.000Z', 'open', 'owner',
      '2026-08-31T09:05:00.000Z'
    from events event where event.public_id = 'event-data-release';

    insert into editorial_cases (
      id, public_id, kind, target_type, target_public_id, target_event_id,
      received_at, original_request, evidence_summary, status, decision,
      decided_at, previous_rights_status, actor_role, updated_at
    )
    select gen_random_uuid(), 'case-data-release-redacted-correction', 'correction',
      'event', event.public_id, event.id, '2026-08-31T09:00:00.000Z',
      'Private rights request', 'Permission-required target', 'actioned',
      'corrected', '2026-08-31T09:05:00.000Z', 'permission_required', 'owner',
      '2026-08-31T09:05:00.000Z'
    from events event
    where event.public_id = 'event-data-release-permission-required';

    insert into corrections (
      id, public_id, case_id, target_type, target_public_id, target_event_id,
      reason_code, effective_at, replacement_version, internal_note, actor_role
    )
    select gen_random_uuid(), 'correction-data-release', editorial_case.id,
      'event', event.public_id, event.id, 'factual_error',
      '2026-08-31T09:05:00.000Z', 'event-data-release@v2',
      'PRIVATE INTERNAL CORRECTION NOTE', 'owner'
    from editorial_cases editorial_case
    join events event on event.public_id = editorial_case.target_public_id
    where editorial_case.public_id = 'case-data-release-correction';

    insert into corrections (
      id, public_id, case_id, target_type, target_public_id, target_event_id,
      reason_code, effective_at, replacement_version, internal_note, actor_role
    )
    select gen_random_uuid(), 'correction-data-release-redacted', editorial_case.id,
      'event', event.public_id, event.id, 'factual_error',
      '2026-08-31T09:05:00.000Z', 'event-data-release-permission-required@v2',
      'Private correction note', 'owner'
    from editorial_cases editorial_case
    join events event on event.public_id = editorial_case.target_public_id
    where editorial_case.public_id = 'case-data-release-redacted-correction';

    insert into correction_changes (correction_id, field, previous_value, corrected_value)
    select id, 'fact_status', 'confirmed', 'corrected'
    from corrections where public_id = 'correction-data-release';

    insert into correction_changes (correction_id, field, previous_value, corrected_value)
    select id, 'summary', 'PRIVATE WITHDRAWN EXPRESSION', 'PRIVATE REPLACEMENT'
    from corrections where public_id = 'correction-data-release-redacted';

    insert into correction_evidence (correction_id, source_item_id)
    select correction.id, source_item.id
    from corrections correction, source_items source_item
    where correction.public_id = 'correction-data-release'
      and source_item.public_id = 'source-item-data-release';

    insert into correction_evidence (correction_id, source_item_id)
    select correction.id, source_item.id
    from corrections correction, source_items source_item
    where correction.public_id = 'correction-data-release-redacted'
      and source_item.public_id = 'source-item-data-release-permission';

    insert into tombstones (
      id, object_public_id, object_type, status, public_reason_code,
      effective_at, case_reference_public_id
    ) values (
      gen_random_uuid(), 'event-data-release-reviewing', 'event', 'reviewing',
      'high_risk_review', '2026-08-31T09:10:00.000Z',
      'case-data-release-reviewing'
    );

    update sources set updated_at = '2026-08-31T10:00:00.000Z'
    where public_id like 'source-data-release%';
    update source_items set updated_at = '2026-08-31T10:00:00.000Z'
    where public_id like 'source-item-data-release%';
    update events set updated_at = case
      when public_id = 'event-data-release-after-cutoff'
        then '2026-09-01T00:00:00.000Z'::timestamptz
      else '2026-08-31T10:00:00.000Z'::timestamptz end
    where public_id like 'event-data-release%';
    update localized_contents set updated_at = '2026-08-31T10:00:00.000Z'
    where event_id in (
      select id from events where public_id like 'event-data-release%'
    );
    update corrections set created_at = '2026-08-31T09:05:00.000Z'
    where public_id like 'correction-data-release%';
    update event_sources set created_at = '2026-08-31T09:00:00.000Z';
    update correction_changes set created_at = '2026-08-31T09:05:00.000Z';
    update correction_evidence set created_at = '2026-08-31T09:05:00.000Z';
    update tombstones set created_at = '2026-08-31T09:10:00.000Z'
    where object_public_id = 'event-data-release-reviewing';
  `);

  const adminUrl = `${applicationUrl}/api/v1/admin/data-releases`;
  const request = {
    publicId: "data-release-public-alpha-1",
    dataVersion: "public-alpha-release-1",
    dataCutoff: "2026-08-31T12:00:00.000Z",
    canonicalUrl:
      "https://github.com/cryanskl/ai-radar/releases/tag/data-public-alpha-1",
    license: "CC-BY-4.0",
    attribution: "AI Radar and the named source publishers",
  };

  expect(
    (await context.request.post(adminUrl, { data: request })).status(),
  ).toBe(401);

  const owner = await completeFakeGithubOAuth({
    applicationUrl,
    databaseUrl: application.databaseUrl,
    ownerGithubId: "34471145",
    profile: {
      avatar_url: "https://avatars.example.test/data-release-owner",
      email: "data-release-owner@example.test",
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

  const invalidRelease = await context.request.post(adminUrl, {
    data: request,
  });
  expect(invalidRelease.status()).toBe(409);
  expect(await invalidRelease.json()).toMatchObject({
    error: "validation_failed",
    issues: [
      {
        code: "record_after_data_cutoff",
        publicId: "event-data-release-after-cutoff",
      },
      {
        code: "missing_provenance",
        publicId: "event-data-release-missing-source",
      },
      {
        code: "rights_not_exportable",
        publicId: "event-data-release-permission-required",
      },
      {
        code: "public_schema_violation",
        publicId: "event-data-release-schema-invalid",
      },
    ],
  });

  await database.query(
    `update events set public_visibility = false
     where public_id in (
       'event-data-release-missing-source',
       'event-data-release-permission-required',
       'event-data-release-after-cutoff',
       'event-data-release-schema-invalid'
     )`,
  );

  await database.query(`
    update event_sources set created_at = '2026-08-31T13:00:00.000Z'
    where event_id = (
      select id from events where public_id = 'event-data-release'
    );
    update correction_changes set created_at = '2026-08-31T13:00:00.000Z'
    where correction_id = (
      select id from corrections where public_id = 'correction-data-release'
    );
  `);
  const relationshipAfterCutoff = await context.request.post(adminUrl, {
    data: request,
  });
  expect(relationshipAfterCutoff.status()).toBe(409);
  expect(await relationshipAfterCutoff.json()).toMatchObject({
    error: "validation_failed",
    issues: [
      {
        code: "record_after_data_cutoff",
        publicId: "correction-data-release",
        recordType: "correction",
      },
      {
        code: "record_after_data_cutoff",
        publicId: "event-data-release",
        recordType: "event",
      },
    ],
  });
  await database.query(`
    update event_sources set created_at = '2026-08-31T09:00:00.000Z';
    update correction_changes set created_at = '2026-08-31T09:05:00.000Z';
  `);

  const privacyBlocked = await context.request.post(adminUrl, {
    data: request,
  });
  expect(privacyBlocked.status()).toBe(409);
  expect(await privacyBlocked.json()).toMatchObject({
    error: "validation_failed",
    issues: [
      {
        code: "privacy_violation",
        publicId: request.publicId,
      },
    ],
  });
  await database.query(
    "update events set public_visibility = false where public_id = 'event-data-release-privacy'",
  );

  const generatedRelease = await context.request.post(adminUrl, {
    data: request,
  });
  expect(generatedRelease.status()).toBe(201);
  const release = (await generatedRelease.json()) as {
    status: string;
    publicId: string;
    checksumSha256: string;
    files: Array<{
      name: string;
      byteSize: number;
      recordCount: number | null;
      checksumSha256: string;
    }>;
  };
  expect(release.status).toBe("generated");
  expect(release.publicId).toBe(request.publicId);
  expect(release.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(release.files.map(({ name }) => name)).toEqual([
    "schema.json",
    "records.json",
    "corrections.json",
    "tombstones.json",
    "manifest.json",
  ]);

  expect(
    (
      await context.request.get(
        `${applicationUrl}/api/v1/releases/${request.publicId}`,
      )
    ).status(),
  ).toBe(404);
  expect(
    await (
      await context.request.get(`${applicationUrl}/api/v1/releases?limit=1`)
    ).json(),
  ).toMatchObject({ items: [] });
  await page.goto(`${applicationUrl}/en/trust`);
  await expect(
    page.getByText("No Data Release has been published yet."),
  ).toBeVisible();
  expect(
    (
      await fetch(
        `${applicationUrl}/api/v1/releases/${request.publicId}/files/schema.json`,
      )
    ).status,
  ).toBe(404);

  await expect(
    database.query(
      "update data_releases set attribution = 'rewritten' where public_id = 'data-release-public-alpha-1'",
    ),
  ).rejects.toThrow("Data Release artifacts are immutable");

  await database.query(`
    insert into data_releases (
      id, public_id, data_version, schema_version, data_cutoff,
      canonical_url, manifest_sha256, license, attribution
    ) values (
      gen_random_uuid(), 'data-release-incomplete', 'public-incomplete', '1.0.0',
      '2026-08-31T12:00:00.000Z',
      'https://github.com/cryanskl/ai-radar/releases/tag/data-incomplete',
      repeat('0', 64), 'CC-BY-4.0', 'AI Radar'
    )
  `);
  await expect(
    database.query(`
      insert into data_release_publications (
        release_id, canonical_verified_at, published_at
      )
      select id, now(), now() from data_releases
      where public_id = 'data-release-incomplete'
    `),
  ).rejects.toThrow("Data Release publication requires exactly five files");
  await expect(
    database.query(`
      insert into data_release_files (
        release_id, name, media_type, byte_size, record_count,
        checksum_sha256, content
      )
      select id, 'extra.json', 'application/json', 3, null, repeat('0', 64), '{}'
      from data_releases where public_id = 'data-release-public-alpha-1'
    `),
  ).rejects.toThrow("invalid input value for enum data_release_file_name");

  const downloaded = new Map<string, string>();
  for (const file of release.files) {
    const response = await context.request.get(
      `${applicationUrl}/api/v1/releases/${request.publicId}/files/${file.name}`,
    );
    expect(response.status()).toBe(200);
    const content = await response.text();
    downloaded.set(file.name, content);
    expect(response.headers()["x-checksum-sha256"]).toBe(file.checksumSha256);
    expect(response.headers()["content-digest"]).toBe(
      `sha-256=:${Buffer.from(file.checksumSha256, "hex").toString("base64")}:`,
    );
    expect(Buffer.byteLength(content)).toBe(file.byteSize);
    expect(createHash("sha256").update(content).digest("hex")).toBe(
      file.checksumSha256,
    );
  }

  const allArtifactText = [...downloaded.values()].join("\n");
  expect(allArtifactText).toContain("event-data-release");
  expect(allArtifactText).toContain("correction-data-release");
  expect(allArtifactText).toContain("correction-data-release-redacted");
  expect(allArtifactText).toContain("redacted_due_to_rights");
  expect(allArtifactText).toContain("event-data-release-reviewing");
  expect(allArtifactText).not.toContain("event-data-release-private");
  expect(allArtifactText).not.toContain("PRIVATE");
  expect(allArtifactText).not.toContain("private-person@example.test");
  expect(allArtifactText).not.toContain("requester@example.test");
  expect(allArtifactText).not.toContain("internalNote");

  const schema = JSON.parse(downloaded.get("schema.json") ?? "null") as {
    $id: string;
  };
  const ajv = new Ajv2020({ strict: false });
  addFormats(ajv);
  ajv.addSchema(schema);
  for (const [name, definition] of [
    ["records.json", "recordsFile"],
    ["corrections.json", "correctionsFile"],
    ["tombstones.json", "tombstonesFile"],
  ] as const) {
    const validate = ajv.getSchema(`${schema.$id}#/$defs/${definition}`);
    expect(validate).toBeDefined();
    expect(validate?.(JSON.parse(downloaded.get(name) ?? "null"))).toBe(true);
  }

  const records = JSON.parse(downloaded.get("records.json") ?? "null") as {
    events: Array<Record<string, unknown> & { localizations: unknown[] }>;
  };
  expect(records.events).toHaveLength(1);
  expect(records.events[0]).not.toHaveProperty("locale");
  expect(records.events[0].localizations).toHaveLength(2);

  const manifest = JSON.parse(downloaded.get("manifest.json") ?? "null") as {
    dataVersion: string;
    files: Array<{ name: string; checksumSha256: string }>;
    recordCounts: Record<string, number>;
  };
  expect(manifest.dataVersion).toBe(request.dataVersion);
  expect(manifest.files).toHaveLength(4);
  expect(manifest.recordCounts).toMatchObject({
    events: 1,
    corrections: 2,
    tombstones: 1,
  });

  for (const file of release.files) {
    remoteFiles.set(
      `github.com:${file.name}`,
      file.name === "records.json"
        ? '{"corrupted":true}\n'
        : (downloaded.get(file.name) ?? ""),
    );
  }
  const publishUrl = `${adminUrl}/${request.publicId}/publish`;
  githubApiFailure = "not-found";
  const missingCanonical = await context.request.post(publishUrl);
  expect(missingCanonical.status()).toBe(409);
  expect(await missingCanonical.json()).toEqual({
    error: "canonical_not_found",
  });
  githubApiFailure = "rate-limited";
  const rateLimitedCanonical = await context.request.post(publishUrl);
  expect(rateLimitedCanonical.status()).toBe(502);
  expect(await rateLimitedCanonical.json()).toEqual({
    error: "remote_fetch_failed",
  });
  githubApiFailure = "malformed";
  const malformedCanonical = await context.request.post(publishUrl);
  expect(malformedCanonical.status()).toBe(502);
  expect(await malformedCanonical.json()).toEqual({
    error: "remote_fetch_failed",
  });
  githubApiFailure = "none";
  const rejectedPublication = await context.request.post(publishUrl);
  expect(rejectedPublication.status()).toBe(409);
  expect(await rejectedPublication.json()).toEqual({
    error: "canonical_checksum_mismatch",
  });
  expect(
    (
      await context.request.get(
        `${applicationUrl}/api/v1/releases/${request.publicId}`,
      )
    ).status(),
  ).toBe(404);

  for (const file of release.files) {
    remoteFiles.set(`github.com:${file.name}`, downloaded.get(file.name) ?? "");
  }
  const publication = await context.request.post(publishUrl);
  expect(publication.status()).toBe(200);
  expect(await publication.json()).toMatchObject({
    status: "published",
    publicId: request.publicId,
  });
  await expect(
    database.query(`
      update data_release_publications set published_at = now()
      where release_id = (
        select id from data_releases
        where public_id = 'data-release-public-alpha-1'
      )
    `),
  ).rejects.toThrow("Data Release artifacts are immutable");

  expect(
    (await context.request.post(adminUrl, { data: request })).status(),
  ).toBe(409);

  const mirrorUrl = `${adminUrl}/${request.publicId}/mirror`;
  for (const file of release.files) {
    remoteFiles.set(
      `example.feishu.cn:${file.name}`,
      file.name === "records.json"
        ? '{"corrupted":true}\n'
        : (downloaded.get(file.name) ?? ""),
    );
  }
  const mismatchedMirror = await context.request.post(mirrorUrl, {
    data: {
      provider: "feishu",
      url: "https://example.feishu.cn/file/data-release-public-alpha-1/manifest.json",
      files: release.files.map((file) => ({
        name: file.name,
        url: `https://example.feishu.cn/file/data-release-public-alpha-1/${file.name}`,
      })),
    },
  });
  expect(mismatchedMirror.status()).toBe(409);
  expect(await mismatchedMirror.json()).toEqual({ error: "checksum_mismatch" });

  const unrelatedMirrorLanding = await context.request.post(mirrorUrl, {
    data: {
      provider: "feishu",
      url: "https://example.feishu.cn/file/data-release-public-alpha-1",
      files: release.files.map(({ name }) => ({
        name,
        url: `https://example.feishu.cn/file/data-release-public-alpha-1/${name}`,
      })),
    },
  });
  expect(unrelatedMirrorLanding.status()).toBe(400);
  expect(await unrelatedMirrorLanding.json()).toMatchObject({
    error: "invalid_request",
  });

  const detailBeforeMirror = await context.request.get(
    `${applicationUrl}/api/v1/releases/${request.publicId}`,
  );
  expect(await detailBeforeMirror.json()).toMatchObject({ mirror: null });

  for (const file of release.files) {
    remoteFiles.set(
      `example.feishu.cn:${file.name}`,
      downloaded.get(file.name) ?? "",
    );
  }
  const exactMirrorRequest = {
    provider: "feishu",
    url: "https://example.feishu.cn/file/data-release-public-alpha-1/manifest.json",
    files: release.files.map(({ name }) => ({
      name,
      url: `https://example.feishu.cn/file/data-release-public-alpha-1/${name}`,
    })),
  } as const;
  mirrorTransportFailure = "redirect";
  const redirectedMirror = await context.request.post(mirrorUrl, {
    data: exactMirrorRequest,
  });
  expect(redirectedMirror.status()).toBe(502);
  expect(await redirectedMirror.json()).toEqual({
    error: "remote_fetch_failed",
  });
  mirrorTransportFailure = "oversized";
  const oversizedMirror = await context.request.post(mirrorUrl, {
    data: exactMirrorRequest,
  });
  expect(oversizedMirror.status()).toBe(502);
  expect(await oversizedMirror.json()).toEqual({
    error: "remote_fetch_failed",
  });
  mirrorTransportFailure = "none";
  const verifiedMirror = await context.request.post(mirrorUrl, {
    data: exactMirrorRequest,
  });
  expect(verifiedMirror.status()).toBe(200);
  expect(await verifiedMirror.json()).toMatchObject({
    status: "verified",
    provider: "feishu",
  });

  const releaseDetail = await context.request.get(
    `${applicationUrl}/api/v1/releases/${request.publicId}`,
  );
  expect(releaseDetail.status()).toBe(200);
  expect(await releaseDetail.json()).toMatchObject({
    publicId: request.publicId,
    canonicalUrl: request.canonicalUrl,
    mirror: {
      status: "verified",
      provider: "feishu",
      url: "https://example.feishu.cn/file/data-release-public-alpha-1/manifest.json",
    },
  });

  const releaseList = await context.request.get(
    `${applicationUrl}/api/v1/releases?limit=1`,
  );
  expect(releaseList.status()).toBe(200);
  expect(await releaseList.json()).toMatchObject({
    items: [{ publicId: request.publicId }],
  });

  const openApi = (await (
    await context.request.get(`${applicationUrl}/api/openapi.json`)
  ).json()) as {
    paths: Record<
      string,
      {
        get?: {
          responses?: Record<
            string,
            {
              headers?: Record<string, unknown>;
              content?: Record<string, { schema?: Record<string, unknown> }>;
            }
          >;
        };
      }
    >;
  };
  expect(openApi.paths).toHaveProperty("/api/v1/admin/data-releases");
  expect(openApi.paths).toHaveProperty(
    "/api/v1/admin/data-releases/{publicId}/publish",
  );
  expect(openApi.paths).toHaveProperty(
    "/api/v1/admin/data-releases/{publicId}/mirror",
  );
  expect(openApi.paths).toHaveProperty(
    "/api/v1/releases/{publicId}/files/{name}",
  );
  const fileDownload =
    openApi.paths["/api/v1/releases/{publicId}/files/{name}"].get?.responses?.[
      "200"
    ];
  expect(fileDownload?.headers).toHaveProperty("Content-Digest");
  expect(fileDownload?.headers).toHaveProperty("X-Checksum-SHA256");
  expect(fileDownload?.content?.["application/json"].schema).toMatchObject({
    oneOf: [{ type: "object" }, { type: "array" }],
  });

  await page.goto(`${applicationUrl}/en/trust`);
  await expect(
    page.getByRole("heading", { name: "Trust Center" }),
  ).toBeVisible();
  for (const heading of [
    "Editorial Policy",
    "Source Policy",
    "Translation Policy",
    "Deduplication Policy",
    "Ranking Methodology",
    "AI-generated Content Policy",
    "Dataset License",
    "Commercial Disclosure",
    "Corrections",
    "Takedown",
    "Coverage",
    "Known Limitations",
    "Service and Data Status",
  ]) {
    await expect(page.getByText(heading, { exact: true })).toBeVisible();
  }
  await expect(page.getByText(request.publicId, { exact: true })).toBeVisible();

  await page.goto(`${applicationUrl}/zh/trust`);
  await expect(page.getByRole("heading", { name: "信任中心" })).toBeVisible();
  for (const heading of [
    "编辑政策",
    "来源政策",
    "翻译政策",
    "去重政策",
    "排名方法",
    "AI 内容政策",
    "数据许可",
    "商业关系披露",
    "更正记录",
    "下架流程",
    "覆盖范围",
    "已知限制",
    "服务与数据状态",
  ]) {
    await expect(page.getByText(heading, { exact: true })).toBeVisible();
  }

  await database.end();
});
