import { expect, test, type APIRequestContext } from "@playwright/test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { randomUUID } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import { Client } from "pg";
import {
  fakeEmailMessageId,
  signFakeEmailWebhook,
} from "../../src/daily-briefs/email-provider";
import {
  renderDailyBriefEmail,
  renderSubscriptionConfirmationEmail,
} from "../../src/daily-briefs/rendering";
import { createEmailToken } from "../../src/daily-briefs/tokens";
import { completeFakeGithubOAuth } from "../support/github-oauth";
import {
  startTestApplication,
  type TestApplication,
} from "../support/test-application";

const tokenSecret = "test-email-token-secret-with-at-least-32-characters";

let application: TestApplication | undefined;

test.beforeAll(async () => {
  application = await startTestApplication();
});

test.afterAll(async () => {
  if (application) await application.stop();
});

test("publishes one frozen bilingual edition to web, RSS and consented email", async ({
  context,
  page,
}) => {
  if (!application) throw new Error("Test application did not start");
  const applicationUrl = application.url;
  const database = new Client({ connectionString: application.databaseUrl });
  await database.connect();
  const adminBriefsUrl = `${applicationUrl}/api/v1/admin/daily-briefs`;

  expect(
    (await context.request.post(adminBriefsUrl, { data: {} })).status(),
  ).toBe(401);

  const owner = await completeFakeGithubOAuth({
    applicationUrl,
    databaseUrl: application.databaseUrl,
    ownerGithubId: "34471145",
    profile: {
      avatar_url: "https://avatars.example.test/brief-owner",
      email: "brief-owner@example.test",
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

  const publishEvent = async (key: string, position: number) => {
    const eventPublicId = `event-brief-${key}`;
    const draft = await context.request.post(
      `${applicationUrl}/api/v1/admin/event-drafts`,
      {
        data: {
          source: {
            publicId: `source-brief-${key}`,
            name: `Brief ${key} source`,
            homepageUrl: `https://brief-${key}.example.test/`,
            tier: "A",
            accessStatus: "approved",
            acquisitionMethod: "manual",
            policyLastReviewedAt: "2026-08-01T00:00:00.000Z",
          },
          sourceItem: {
            publicId: `source-item-brief-${key}`,
            externalId: `brief-${key}`,
            externalIdVerifiedAt: "2026-08-31T07:00:00.000Z",
            isOriginalSource: true,
            originalUrl: `https://brief-${key}.example.test/release?a=1&b=2`,
            canonicalUrl: `https://brief-${key}.example.test/release`,
            originalTitle: `Brief ${key} original`,
            originalLanguage: "en",
            publishedAt: `2026-08-31T0${position}:00:00.000Z`,
            publishedAtPrecision: "second",
            discoveredAt: `2026-08-31T0${position}:10:00.000Z`,
            rightsStatus: "open",
            rightsCheckedAt: `2026-08-31T0${position}:15:00.000Z`,
            attribution: `Brief ${key} authors`,
            licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
          },
          event: {
            publicId: eventPublicId,
            eventType: "updates",
            factStatus: "confirmed",
            occurredAt: `2026-08-31T0${position}:00:00.000Z`,
            occurredAtPrecision: "second",
            lastVerifiedAt: `2026-08-31T0${position}:15:00.000Z`,
            rightsStatus: "open",
          },
          localizations: [
            {
              locale: "en",
              title: `Brief ${key} & update`,
              summary: `Verified English summary for ${key}.`,
              authorship: "human_authored",
              reviewStatus: "reviewed",
            },
            {
              locale: "zh",
              title: `简报 ${key} 更新`,
              summary: `${key} 的已核验中文摘要。`,
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
    return eventPublicId;
  };

  const alpha = await publishEvent("alpha", 6);
  const beta = await publishEvent("beta", 7);
  const gamma = await publishEvent("gamma", 8);
  const alternateSourceId = randomUUID();
  const alternateSourceItemId = randomUUID();
  await database.query(
    `insert into sources
      (id, public_id, name, homepage_url, tier, access_status, acquisition_method, policy_last_reviewed_at)
     values
      ($1, 'source-brief-gamma-alternate', 'Brief gamma alternate source',
       'https://brief-gamma-alternate.example.test/', 'A', 'approved', 'manual',
       '2026-08-01T00:00:00.000Z')`,
    [alternateSourceId],
  );
  await database.query(
    `insert into source_items
      (id, public_id, source_id, external_id, external_id_verified_at,
       is_original_source, original_url, canonical_url, original_title,
       original_language, published_at, published_at_precision, discovered_at,
       rights_status, rights_checked_at, attribution, public_visibility)
     values
      ($1, 'source-item-brief-gamma-alternate', $2, 'brief-gamma-alternate',
       '2026-08-31T08:00:00.000Z', false,
       'https://brief-gamma-alternate.example.test/report',
       'https://brief-gamma-alternate.example.test/report',
       'Brief gamma alternate report', 'en', '2026-08-31T08:00:00.000Z',
       'second', '2026-08-31T08:10:00.000Z', 'open',
       '2026-08-31T08:15:00.000Z', 'Brief gamma alternate authors', true)`,
    [alternateSourceItemId, alternateSourceId],
  );
  await database.query(
    `insert into event_sources (event_id, source_item_id, is_primary)
     select id, $1, false from events where public_id = $2`,
    [alternateSourceItemId, gamma],
  );

  const invalidConsent = await context.request.post(
    `${applicationUrl}/api/v1/email-subscriptions`,
    { data: { email: "reader@example.test", locale: "en", consent: false } },
  );
  expect(invalidConsent.status()).toBe(400);
  const subscription = await context.request.post(
    `${applicationUrl}/api/v1/email-subscriptions`,
    { data: { email: "reader@example.test", locale: "en", consent: true } },
  );
  expect(subscription.status()).toBe(202);
  expect(await subscription.json()).toEqual({
    status: "confirmation_pending",
  });

  const confirmation = await database.query<{
    id: string;
    consent_version: string;
    delivery_public_id: string;
    idempotency_key: string;
    provider_message_id: string;
  }>(
    `select s.id,
            s.consent_version,
            d.public_id as delivery_public_id,
            d.idempotency_key,
            d.provider_message_id
       from email_subscriptions s
       join email_deliveries d on d.subscription_id = s.id
      where s.email = 'reader@example.test'
        and s.locale = 'en'
        and d.kind = 'confirmation'`,
  );
  const reader = confirmation.rows[0];
  if (!reader) throw new Error("Confirmation delivery was not created");
  const confirmationToken = createEmailToken(
    {
      purpose: "confirm",
      subscriptionId: reader.id,
      consentVersion: reader.consent_version,
    },
    tokenSecret,
  );
  const confirmationUrl = `${applicationUrl}/en/email/confirm#token=${encodeURIComponent(confirmationToken)}`;
  const confirmationContent = renderSubscriptionConfirmationEmail(
    "en",
    confirmationUrl,
  );
  expect(reader.provider_message_id).toBe(
    fakeEmailMessageId({
      to: "reader@example.test",
      ...confirmationContent,
      briefPublicId: null,
      idempotencyKey: reader.idempotency_key,
      deliveryPublicId: reader.delivery_public_id,
    }),
  );
  expect(confirmationContent.text).toContain(
    "never included in public content",
  );
  expect(new URL(confirmationUrl).search).toBe("");
  expect(new URL(confirmationUrl).hash).toContain("#token=");
  await page.goto(confirmationUrl);
  await expect(
    page.getByText("Your Daily Brief subscription is confirmed."),
  ).toBeVisible();
  const repeatedConfirmation = await context.request.post(
    `${applicationUrl}/api/v1/email-subscriptions/confirm`,
    { data: { token: confirmationToken } },
  );
  expect(repeatedConfirmation.status()).toBe(200);
  expect(await repeatedConfirmation.json()).toEqual({ status: "confirmed" });

  const failedSubscriptionId = randomUUID();
  const zhSubscriptionId = randomUUID();
  await database.query(
    `insert into email_subscriptions
      (id, email, locale, state, consent_version, consented_at, confirmed_at)
     values
      ($1, 'delivery@fail.example.test', 'en', 'confirmed', $2, now(), now()),
      ($3, 'zh-reader@example.test', 'zh', 'confirmed', $4, now(), now())`,
    [failedSubscriptionId, randomUUID(), zhSubscriptionId, randomUUID()],
  );

  const makeBrief = (
    locale: "en" | "zh",
    options: {
      editionPublicId?: string;
      publicId?: string;
      version?: string;
      eventIds?: string[];
    } = {},
  ) => {
    const version = options.version ?? "1.0";
    const eventIds = options.eventIds ?? [alpha, beta];
    return {
      publicId: options.publicId ?? `daily-brief-${locale}-2026-08-31-v1`,
      editionPublicId:
        options.editionPublicId ?? "daily-brief-edition-2026-08-31-v1",
      locale,
      briefDate: "2026-08-31",
      version,
      dataCutoff: "2026-08-31T09:00:00.000Z",
      title: locale === "en" ? "Global AI Brief & Today" : "全球 AI 每日简报",
      overview:
        locale === "en"
          ? "Two verified changes in one frozen Brief."
          : "一份冻结简报中的两项已核验变化。",
      coverageNote:
        locale === "en"
          ? "Global public AI changes verified before 09:00 UTC."
          : "覆盖 UTC 09:00 前已核验的全球公开 AI 变化。",
      whatToWatch:
        locale === "en" ? "Watch tomorrow's releases." : "关注明日发布。",
      authorship: "human_authored",
      reviewStatus: "reviewed",
      items: eventIds.map((eventPublicId, index) => ({
        eventPublicId,
        position: index + 1,
        section: index === 0 ? "key_developments" : "models_research",
        commentary:
          locale === "en"
            ? index === 0
              ? "Alpha came first."
              : "Beta followed."
            : index === 0
              ? "Alpha 首先发布。"
              : "Beta 随后更新。",
      })),
    };
  };

  const englishInput = makeBrief("en");
  const englishCreated = await context.request.post(adminBriefsUrl, {
    data: englishInput,
  });
  expect(englishCreated.status()).toBe(201);
  expect(await englishCreated.json()).toMatchObject({
    publicId: englishInput.publicId,
    editionPublicId: englishInput.editionPublicId,
    state: "draft",
    locale: "en",
    itemCount: 2,
  });
  expect(
    (
      await context.request.post(
        `${adminBriefsUrl}/${englishInput.publicId}/publish`,
      )
    ).status(),
  ).toBe(409);

  const chineseInput = makeBrief("zh");
  expect(
    (
      await context.request.post(adminBriefsUrl, { data: chineseInput })
    ).status(),
  ).toBe(201);

  for (const input of [englishInput, chineseInput]) {
    expect(
      (
        await context.request.get(
          `${applicationUrl}/api/v1/daily-briefs/${input.publicId}?locale=${input.locale}`,
        )
      ).status(),
    ).toBe(404);
    const webPreview = await context.request.get(
      `${adminBriefsUrl}/${input.publicId}/preview?channel=web`,
    );
    expect(webPreview.status()).toBe(200);
    expect(await webPreview.json()).toMatchObject({
      publicId: input.publicId,
      editionPublicId: input.editionPublicId,
      state: "draft",
      publishedAt: null,
      coverageNote: input.coverageNote,
      items: [{ event: { publicId: alpha } }, { event: { publicId: beta } }],
    });
    const rssPreview = await context.request.get(
      `${adminBriefsUrl}/${input.publicId}/preview?channel=rss`,
    );
    expect(rssPreview.status()).toBe(200);
    expect(rssPreview.headers()["content-type"]).toContain(
      "application/rss+xml",
    );
    expect(await rssPreview.text()).toContain(input.coverageNote);
    const emailPreview = await context.request.get(
      `${adminBriefsUrl}/${input.publicId}/preview?channel=email`,
    );
    expect(emailPreview.status()).toBe(200);
    expect(await emailPreview.json()).toMatchObject({ subject: input.title });
  }

  const publish = await context.request.post(
    `${adminBriefsUrl}/${englishInput.publicId}/publish`,
  );
  expect(publish.status()).toBe(200);
  expect(await publish.json()).toMatchObject({
    status: "published",
    editionPublicId: englishInput.editionPublicId,
    briefs: [
      {
        publicId: englishInput.publicId,
        locale: "en",
        items: [{ event: { publicId: alpha } }, { event: { publicId: beta } }],
      },
      {
        publicId: chineseInput.publicId,
        locale: "zh",
        items: [{ event: { publicId: alpha } }, { event: { publicId: beta } }],
      },
    ],
    deliveries: { accepted: 2, failed: 1 },
  });
  const repeatedPublish = await context.request.post(
    `${adminBriefsUrl}/${chineseInput.publicId}/publish`,
  );
  expect(repeatedPublish.status()).toBe(200);
  expect((await repeatedPublish.json()).deliveries).toEqual({
    accepted: 0,
    failed: 0,
  });

  const mismatchEdition = "daily-brief-edition-mismatch";
  const mismatchEnglish = makeBrief("en", {
    editionPublicId: mismatchEdition,
    publicId: "daily-brief-en-mismatch",
    version: "mismatch",
  });
  const mismatchChinese = makeBrief("zh", {
    editionPublicId: mismatchEdition,
    publicId: "daily-brief-zh-mismatch",
    version: "mismatch",
    eventIds: [beta, alpha],
  });
  expect(
    (
      await context.request.post(adminBriefsUrl, { data: mismatchEnglish })
    ).status(),
  ).toBe(201);
  expect(
    (
      await context.request.post(adminBriefsUrl, { data: mismatchChinese })
    ).status(),
  ).toBe(201);
  expect(
    (
      await context.request.post(
        `${adminBriefsUrl}/${mismatchEnglish.publicId}/publish`,
      )
    ).status(),
  ).toBe(409);

  const withdrawnEdition = "daily-brief-edition-withdrawn";
  const withdrawnEnglish = makeBrief("en", {
    editionPublicId: withdrawnEdition,
    publicId: "daily-brief-en-withdrawn",
    version: "withdrawn",
    eventIds: [gamma],
  });
  const withdrawnChinese = makeBrief("zh", {
    editionPublicId: withdrawnEdition,
    publicId: "daily-brief-zh-withdrawn",
    version: "withdrawn",
    eventIds: [gamma],
  });
  expect(
    (
      await context.request.post(adminBriefsUrl, { data: withdrawnEnglish })
    ).status(),
  ).toBe(201);
  expect(
    (
      await context.request.post(adminBriefsUrl, { data: withdrawnChinese })
    ).status(),
  ).toBe(201);
  await database.query(
    "update source_items set public_visibility = false where public_id = 'source-item-brief-gamma'",
  );
  expect(
    (
      await context.request.post(
        `${adminBriefsUrl}/${withdrawnEnglish.publicId}/publish`,
      )
    ).status(),
  ).toBe(409);

  const englishPublic = await context.request.get(
    `${applicationUrl}/api/v1/daily-briefs/${englishInput.publicId}?locale=en`,
  );
  expect(englishPublic.status()).toBe(200);
  const englishBrief = await englishPublic.json();
  expect(englishBrief.publishedAt).toMatch(/^2026-/);
  expect(
    englishBrief.items.map(
      ({ event }: { event: { publicId: string } }) => event.publicId,
    ),
  ).toEqual([alpha, beta]);
  expect(JSON.stringify(englishBrief)).not.toContain("reader@example.test");
  await database.query(
    `update localized_contents
        set title = 'Changed after Brief publication'
      where event_id = (select id from events where public_id = $1)
        and locale = 'en'`,
    [alpha],
  );
  const frozenPublic = await context.request.get(
    `${applicationUrl}/api/v1/daily-briefs/${englishInput.publicId}?locale=en`,
  );
  expect((await frozenPublic.json()).items[0].event.title).toBe(
    "Brief alpha & update",
  );

  for (const locale of ["en", "zh"] as const) {
    const rss = await context.request.get(
      `${applicationUrl}/${locale}/rss/daily.xml`,
    );
    expect(rss.status()).toBe(200);
    const rssText = await rss.text();
    const document = new XMLParser({ ignoreAttributes: false }).parse(rssText);
    expect(document.rss.channel.language).toBe(
      locale === "en" ? "en" : "zh-CN",
    );
    expect(document.rss.channel.item.title).toBe(
      locale === "en" ? englishInput.title : chineseInput.title,
    );
    expect(rssText).toContain(`/${locale}/radar/events/${alpha}`);
    expect(rssText).toContain("2026-08-31T06:00:00.000Z");
    expect(rssText).not.toContain("reader@example.test");
  }

  await page.goto(`${applicationUrl}/en`);
  await expect(page.locator('a[href="/en/rss/daily.xml"]')).toBeVisible();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(
    page.getByText("never includes it in public content", { exact: false }),
  ).toBeVisible();
  await page.goto(`${applicationUrl}/zh`);
  await expect(page.locator('a[href="/zh/rss/daily.xml"]')).toBeVisible();
  await expect(page.getByLabel("邮箱地址")).toBeVisible();
  await expect(
    page.getByText("不会将邮箱加入公开内容", { exact: false }),
  ).toBeVisible();

  await page.goto(`${applicationUrl}/en/briefs/${englishInput.publicId}`);
  await expect(
    page.getByRole("heading", { name: "Global AI Brief & Today" }),
  ).toBeVisible();
  await expect(page.getByText(englishInput.coverageNote)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Report / Suggest correction" }),
  ).toBeVisible();
  await page.goto(`${applicationUrl}/zh/briefs/${chineseInput.publicId}`);
  await expect(
    page.getByRole("heading", { name: "全球 AI 每日简报" }),
  ).toBeVisible();
  await expect(page.getByText("Beta 随后更新。")).toBeVisible();

  const dailyDeliveries = await database.query<{
    provider_message_id: string | null;
    delivery_public_id: string;
    idempotency_key: string;
    status: string;
    email: string;
  }>(
    `select d.provider_message_id,
            d.public_id as delivery_public_id,
            d.idempotency_key,
            d.status,
            s.email
       from email_deliveries d
       join email_subscriptions s on s.id = d.subscription_id
      where d.kind = 'daily_brief'
      order by s.email`,
  );
  expect(dailyDeliveries.rows.map(({ status }) => status).sort()).toEqual([
    "accepted",
    "accepted",
    "failed",
  ]);
  const deliveredTarget = dailyDeliveries.rows.find(
    ({ email }) => email === "reader@example.test",
  );
  const bouncedTarget = dailyDeliveries.rows.find(
    ({ email }) => email === "zh-reader@example.test",
  );
  if (
    !deliveredTarget?.provider_message_id ||
    !bouncedTarget?.provider_message_id
  ) {
    throw new Error("Expected accepted Daily Brief deliveries");
  }
  const unsubscribeToken = createEmailToken(
    { purpose: "unsubscribe", subscriptionId: reader.id },
    tokenSecret,
  );
  const unsubscribeUrl = `${applicationUrl}/en/email/unsubscribe#token=${encodeURIComponent(unsubscribeToken)}`;
  expect(new URL(unsubscribeUrl).search).toBe("");
  expect(deliveredTarget.provider_message_id).toBe(
    fakeEmailMessageId({
      ...renderDailyBriefEmail(englishBrief, {
        briefUrl: `${applicationUrl}/en/briefs/${englishInput.publicId}`,
        unsubscribeUrl,
      }),
      to: "reader@example.test",
      briefPublicId: englishInput.publicId,
      idempotencyKey: deliveredTarget.idempotency_key,
      deliveryPublicId: deliveredTarget.delivery_public_id,
    }),
  );

  const postWebhook = async (
    request: APIRequestContext,
    input: {
      id: string;
      messageId: string;
      type: "email.delivered" | "email.failed" | "email.bounced";
      occurredAt: string;
    },
  ) => {
    const data = {
      email_id: input.messageId,
      created_at: input.occurredAt,
      message_id: `message-${input.id}`,
      from: "briefs@example.test",
      to: ["provider-recipient@example.test"],
      subject: "AI Radar Daily Brief",
      ...(input.type === "email.failed"
        ? { failed: { reason: "provider rejected the message" } }
        : {}),
      ...(input.type === "email.bounced"
        ? {
            bounce: {
              message: "mailbox unavailable",
              type: "Permanent",
              subType: "General",
            },
          }
        : {}),
    };
    const payload = JSON.stringify({
      type: input.type,
      created_at: input.occurredAt,
      data,
    });
    const timestamp = "1788158100";
    return request.post(`${applicationUrl}/api/v1/email/provider-webhook`, {
      data: payload,
      headers: {
        "content-type": "application/json",
        "svix-id": input.id,
        "svix-timestamp": timestamp,
        "svix-signature": signFakeEmailWebhook(payload, {
          id: input.id,
          timestamp,
        }),
      },
    });
  };

  const forgedPayload = JSON.stringify({
    type: "email.delivered",
    created_at: "2026-08-31T09:15:00.000Z",
    data: {
      email_id: deliveredTarget.provider_message_id,
      created_at: "2026-08-31T09:15:00.000Z",
      message_id: "forged",
      from: "briefs@example.test",
      to: ["provider-recipient@example.test"],
      subject: "AI Radar Daily Brief",
    },
  });
  expect(
    (
      await context.request.post(
        `${applicationUrl}/api/v1/email/provider-webhook`,
        {
          data: forgedPayload,
          headers: {
            "content-type": "application/json",
            "svix-id": "provider-event-forged",
            "svix-timestamp": "1788158100",
            "svix-signature": "forged-signature",
          },
        },
      )
    ).status(),
  ).toBe(400);
  expect(
    (
      await postWebhook(context.request, {
        id: "provider-event-unknown",
        messageId: "unknown-provider-message",
        type: "email.delivered",
        occurredAt: "2026-08-31T09:30:00.000Z",
      })
    ).status(),
  ).toBe(503);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    expect(
      (
        await postWebhook(context.request, {
          id: "provider-event-delivered",
          messageId: deliveredTarget.provider_message_id,
          type: "email.delivered",
          occurredAt: "2026-08-31T09:15:00.000Z",
        })
      ).status(),
    ).toBe(204);
  }
  expect(
    (
      await postWebhook(context.request, {
        id: "provider-event-older-failed",
        messageId: deliveredTarget.provider_message_id,
        type: "email.failed",
        occurredAt: "2026-08-31T09:10:00.000Z",
      })
    ).status(),
  ).toBe(204);
  expect(
    (
      await postWebhook(context.request, {
        id: "provider-event-bounced",
        messageId: bouncedTarget.provider_message_id,
        type: "email.bounced",
        occurredAt: "2026-08-31T09:20:00.000Z",
      })
    ).status(),
  ).toBe(204);

  const projectedDeliveries = await database.query<{
    email: string;
    status: string;
  }>(
    `select s.email, d.status
       from email_deliveries d
       join email_subscriptions s on s.id = d.subscription_id
      where d.kind = 'daily_brief'`,
  );
  expect(
    projectedDeliveries.rows.find(
      ({ email }) => email === "reader@example.test",
    )?.status,
  ).toBe("delivered");
  expect(
    projectedDeliveries.rows.find(
      ({ email }) => email === "zh-reader@example.test",
    )?.status,
  ).toBe("bounced");
  const duplicateEventCount = await database.query<{ count: string }>(
    "select count(*) from email_delivery_events where provider_event_id = 'provider-event-delivered'",
  );
  expect(duplicateEventCount.rows[0].count).toBe("1");
  const bouncedSubscription = await database.query<{ state: string }>(
    "select state from email_subscriptions where id = $1",
    [zhSubscriptionId],
  );
  expect(bouncedSubscription.rows[0].state).toBe("unsubscribed");

  const deliveryStatus = await context.request.get(
    `${applicationUrl}/api/v1/admin/email-deliveries`,
  );
  expect(deliveryStatus.status()).toBe(200);
  const deliveryStatusBody = await deliveryStatus.json();
  const identitySafeDeliveryJson = JSON.stringify(deliveryStatusBody);
  expect(identitySafeDeliveryJson).toContain("delivered");
  expect(identitySafeDeliveryJson).toContain("bounced");
  expect(identitySafeDeliveryJson).toContain("failed");
  expect(identitySafeDeliveryJson).not.toContain("reader@example.test");

  await page.goto(unsubscribeUrl);
  await expect(
    page.getByText("You are unsubscribed from the Daily Brief."),
  ).toBeVisible();
  const repeatedUnsubscribe = await context.request.post(
    `${applicationUrl}/api/v1/email-subscriptions/unsubscribe`,
    { data: { token: unsubscribeToken } },
  );
  expect(repeatedUnsubscribe.status()).toBe(200);
  expect(await repeatedUnsubscribe.json()).toEqual({
    status: "unsubscribed",
  });
  expect(
    (
      await context.request.post(
        `${applicationUrl}/api/v1/email-subscriptions`,
        {
          data: {
            email: "reader@example.test",
            locale: "en",
            consent: true,
          },
        },
      )
    ).status(),
  ).toBe(202);
  const staleConfirmation = await context.request.post(
    `${applicationUrl}/api/v1/email-subscriptions/confirm`,
    { data: { token: confirmationToken } },
  );
  expect(staleConfirmation.status()).toBe(200);
  expect(await staleConfirmation.json()).toEqual({
    status: "invalid_or_expired",
  });
  const reconsentedState = await database.query<{ state: string }>(
    "select state from email_subscriptions where id = $1",
    [reader.id],
  );
  expect(reconsentedState.rows[0].state).toBe("pending");
  const malformedConfirmation = await context.request.post(
    `${applicationUrl}/api/v1/email-subscriptions/confirm`,
    { data: { token: "too-short" } },
  );
  expect(malformedConfirmation.status()).toBe(400);
  expect(await malformedConfirmation.json()).toEqual({
    status: "invalid_or_expired",
  });

  const openApiResponse = await context.request.get(
    `${applicationUrl}/api/openapi.json`,
  );
  expect(openApiResponse.status()).toBe(200);
  const openApi = await openApiResponse.json();
  expect(openApi.paths).toHaveProperty(
    "/api/v1/admin/daily-briefs/{publicId}/publish.post",
  );
  expect(openApi.paths).toHaveProperty(
    "/api/v1/email-subscriptions/confirm.post.responses.400",
  );
  expect(openApi.paths).toHaveProperty(
    "/api/v1/email/provider-webhook.post.responses.503",
  );
  expect(
    openApi.paths["/api/v1/email-subscriptions/confirm"],
  ).not.toHaveProperty("get");
  expect(
    openApi.paths["/api/v1/email-subscriptions/unsubscribe"],
  ).not.toHaveProperty("get");
  for (const pathItem of Object.values(openApi.paths) as Array<
    Record<string, unknown>
  >) {
    for (const method of ["get", "post", "put", "patch", "delete"]) {
      const operation = pathItem[method] as
        { requestBody?: Record<string, unknown> } | undefined;
      if (operation?.requestBody) {
        expect(Object.keys(operation.requestBody)).toEqual(
          expect.arrayContaining(["content"]),
        );
        expect(
          Object.keys(operation.requestBody).every((key) =>
            ["$ref", "description", "required", "content"].includes(key),
          ),
        ).toBe(true);
      }
    }
  }
  const ajv = new Ajv2020({ strict: false });
  addFormats(ajv);
  const briefSchema =
    openApi.paths["/api/v1/daily-briefs/{publicId}"].get.responses["200"]
      .content["application/json"].schema;
  const deliverySchema =
    openApi.paths["/api/v1/admin/email-deliveries"].get.responses["200"]
      .content["application/json"].schema;
  expect(ajv.compile(briefSchema)(englishBrief)).toBe(true);
  expect(ajv.compile(deliverySchema)(deliveryStatusBody)).toBe(true);

  await database.end();
});
