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

test("publishes localized, permission-aware Skill records with independent evidence boundaries", async ({
  context,
  page,
}) => {
  if (!application) throw new Error("Test application did not start");
  const applicationUrl = application.url;
  const profileUrl = `${applicationUrl}/api/v1/admin/skill-profiles`;

  expect((await context.request.post(profileUrl, { data: {} })).status()).toBe(
    401,
  );
  const owner = await completeFakeGithubOAuth({
    applicationUrl,
    databaseUrl: application.databaseUrl,
    ownerGithubId: "34471145",
    profile: {
      avatar_url: "https://avatars.example.test/skill-owner",
      email: "skill-owner@example.test",
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

  const publishEvidence = async (key: string, title: string) => {
    const eventPublicId = `event-${key}`;
    const sourceItemPublicId = `source-item-${key}`;
    const draft = await context.request.post(
      `${applicationUrl}/api/v1/admin/event-drafts`,
      {
        data: {
          source: {
            publicId: `source-${key}`,
            name: `${title} publisher`,
            homepageUrl: `https://${key}.example.test/`,
            tier: "A",
            accessStatus: "approved",
            acquisitionMethod: "manual",
            policyLastReviewedAt: "2026-08-01T00:00:00.000Z",
          },
          sourceItem: {
            publicId: sourceItemPublicId,
            externalId: `${key}-evidence`,
            externalIdVerifiedAt: "2026-08-28T08:00:00.000Z",
            isOriginalSource: true,
            originalUrl: `https://${key}.example.test/evidence`,
            canonicalUrl: `https://${key}.example.test/`,
            originalTitle: title,
            originalLanguage: "en",
            publishedAt: "2026-08-28T08:00:00.000Z",
            publishedAtPrecision: "second",
            discoveredAt: "2026-08-28T09:00:00.000Z",
            rightsStatus: "open",
            rightsCheckedAt: "2026-08-28T09:00:00.000Z",
            attribution: `${title} authors`,
            licenseUrl: "https://opensource.org/license/mit",
          },
          event: {
            publicId: eventPublicId,
            eventType: "updates",
            factStatus: "confirmed",
            occurredAt: "2026-08-28T08:00:00.000Z",
            occurredAtPrecision: "second",
            lastVerifiedAt: "2026-08-28T09:00:00.000Z",
            rightsStatus: "open",
          },
          localizations: [
            {
              locale: "en",
              title: `${title} published`,
              summary: `${title} is available as public evidence.`,
              authorship: "human_authored",
              reviewStatus: "reviewed",
            },
            {
              locale: "zh",
              title: `${title} 已发布`,
              summary: `${title}已作为公开证据发布。`,
              authorship: "human_authored",
              reviewStatus: "reviewed",
            },
          ],
        },
      },
    );
    expect(draft.status(), await draft.text()).toBe(201);
    const published = await context.request.post(
      `${applicationUrl}/api/v1/admin/events/${eventPublicId}/publish`,
    );
    expect(published.status(), await published.text()).toBe(200);
    return sourceItemPublicId;
  };

  const createEntity = async (data: {
    publicId: string;
    type: "product" | "skill";
    name: string;
    zhName: string;
    versions?: Array<{
      publicId: string;
      versionLabel: string;
      releasedAt: string;
      releasedAtPrecision: "second";
    }>;
  }) => {
    const response = await context.request.post(
      `${applicationUrl}/api/v1/admin/entities`,
      {
        data: {
          entity: {
            publicId: data.publicId,
            type: data.type,
            officialName: data.name,
            officialUrl: `https://${data.publicId}.example.test/`,
            lastVerifiedAt: "2026-08-30T08:00:00.000Z",
            rightsStatus: "open",
          },
          localizations: [
            {
              locale: "en",
              name: data.name,
              summary: `${data.name} is a versioned capability package.`,
              authorship: "human_authored",
              reviewStatus: "reviewed",
            },
            {
              locale: "zh",
              name: data.zhName,
              summary: `${data.zhName}是一个版本化能力包。`,
              authorship: "human_authored",
              reviewStatus: "reviewed",
            },
          ],
          aliases: [],
          versions: data.versions ?? [],
        },
      },
    );
    expect(response.status(), await response.text()).toBe(201);
  };

  const createSupportsRelation = async (
    skillPublicId: string,
    sourceItemPublicIds: string[],
  ) => {
    const response = await context.request.post(
      `${applicationUrl}/api/v1/admin/relations`,
      {
        data: {
          relation: {
            publicId: `relation-${skillPublicId}-supports-workbench`,
            subject: { type: "entity", publicId: skillPublicId },
            predicate: "SUPPORTS",
            objectEntityPublicId: "product-agent-workbench",
            validFrom: "2026-08-28T08:00:00.000Z",
            validTo: null,
            firstVerifiedAt: "2026-08-28T09:00:00.000Z",
            lastVerifiedAt: "2026-08-28T09:00:00.000Z",
            confidence: 100,
            reviewStatus: "reviewed",
            creationMethod: "editor",
            rightsStatus: "open",
          },
          evidenceSourceItemPublicIds: sourceItemPublicIds,
        },
      },
    );
    expect(response.status(), await response.text()).toBe(201);
  };

  const localization = (
    locale: "en" | "zh",
    permissionNames: string[],
    apiNames: string[],
    checks: string[],
  ) => ({
    locale,
    permissionReasons: permissionNames.map((name) => ({
      name,
      reason:
        locale === "en"
          ? `Needed for ${name.replaceAll("_", " ")}`
          : `用于${name.replaceAll("_", " ")}`,
    })),
    externalApiPurposes: apiNames.map((name) => ({
      name,
      purpose:
        locale === "en" ? `Read ${name} metadata` : `读取 ${name} 元数据`,
    })),
    securityCheckDescriptions: checks.map((check) => ({
      check,
      description:
        locale === "en"
          ? `Reviewed ${check.replaceAll("_", " ")}`
          : `已检查${check.replaceAll("_", " ")}`,
    })),
    authorship: "human_authored" as const,
    reviewStatus: "reviewed" as const,
  });

  const oneVersionRequest = (data: {
    skillPublicId: string;
    versionPublicId: string;
    profileSource: string;
    versionSource: string;
    reviewedAt: string;
  }) => {
    const permissions = ["repository_read"];
    const checks = ["permission_manifest"];
    return {
      skillPublicId: data.skillPublicId,
      sourceItemPublicId: data.profileSource,
      author: {
        name: `${data.skillPublicId} maintainers`,
        url: `https://${data.skillPublicId}.example.test/about`,
      },
      task: "code-review",
      rightsStatus: "link_only",
      officialInstallationUrl: `https://${data.skillPublicId}.example.test/install`,
      versions: [
        {
          entityVersionPublicId: data.versionPublicId,
          sourceItemPublicId: data.versionSource,
          author: {
            name: `${data.skillPublicId} version authors`,
            url: `https://${data.skillPublicId}.example.test/authors`,
          },
          documentation: {
            rightsStatus: "metadata_only",
            license: {
              name: "CC-BY-4.0",
              url: "https://creativecommons.org/licenses/by/4.0/",
            },
          },
          repository: {
            rightsStatus: "source_license",
            license: {
              name: "MIT",
              url: "https://opensource.org/license/mit",
            },
          },
          supportedPlatforms: ["codex"],
          dependencies: [
            { name: "git", versionConstraint: ">=2.40", required: true },
          ],
          permissions: permissions.map((name) => ({ name, required: true })),
          externalApis: [],
          installationMethod: "manual",
          maintenanceStatus: "maintained",
          securityReview: {
            status: "metadata_reviewed",
            checksPerformed: checks,
            reviewedAt: data.reviewedAt,
          },
          localizations: [
            localization("en", permissions, [], checks),
            localization("zh", permissions, [], checks),
          ],
        },
      ],
    };
  };

  const withdrawSource = async (sourceItemPublicId: string, suffix: string) => {
    const response = await context.request.post(
      `${applicationUrl}/api/v1/admin/rights-decisions`,
      {
        data: {
          publicId: `rights-${suffix}-withdrawal`,
          case: {
            publicId: `case-${suffix}-withdrawal`,
            receivedAt: "2026-08-31T10:00:00.000Z",
            originalRequest: "Withdraw this source from public use.",
            evidenceSummary: "The source owner requested withdrawal.",
          },
          target: { type: "source_item", publicId: sourceItemPublicId },
          toStatus: "withdrawn",
          publicReasonCode: "source_withdrawal",
          effectiveAt: "2026-08-31T10:00:00.000Z",
          internalNote: "Owner verified this source withdrawal.",
        },
      },
    );
    expect(response.status(), await response.text()).toBe(201);
  };

  await createEntity({
    publicId: "product-agent-workbench",
    type: "product",
    name: "Agent Workbench",
    zhName: "Agent 工作台",
  });

  const primarySources = {
    profile: await publishEvidence(
      "skill-primary-profile",
      "Primary Skill profile",
    ),
    v1: await publishEvidence("skill-primary-v1", "Primary Skill version 1"),
    v2: await publishEvidence("skill-primary-v2", "Primary Skill version 2"),
    relation: await publishEvidence(
      "skill-primary-relation",
      "Primary Skill support relation",
    ),
    relationBackup: await publishEvidence(
      "skill-primary-relation-backup",
      "Primary Skill backup support evidence",
    ),
  };
  await createEntity({
    publicId: "skill-radar-review",
    type: "skill",
    name: "Radar Review Skill",
    zhName: "雷达审阅 Skill",
    versions: [
      {
        publicId: "skill-radar-review-v1",
        versionLabel: "1.0.0",
        releasedAt: "2026-08-10T08:00:00.000Z",
        releasedAtPrecision: "second",
      },
      {
        publicId: "skill-radar-review-v2",
        versionLabel: "2.0.0",
        releasedAt: "2026-08-28T08:00:00.000Z",
        releasedAtPrecision: "second",
      },
    ],
  });
  await createSupportsRelation("skill-radar-review", [
    primarySources.relation,
    primarySources.relationBackup,
  ]);

  const v1Permissions = ["repository_read"];
  const v1Checks = ["permission_manifest", "dependency_manifest"];
  const v2Permissions = ["repository_read", "network_access"];
  const v2Apis = ["GitHub API", "Private Review API"];
  const v2Checks = [
    "source_review",
    "permission_manifest",
    "dependency_manifest",
  ];
  const primaryRequest = {
    skillPublicId: "skill-radar-review",
    sourceItemPublicId: primarySources.profile,
    author: {
      name: "Radar Skill Maintainers",
      url: "https://skill-radar-review.example.test/about",
    },
    task: "code-review",
    rightsStatus: "link_only",
    officialInstallationUrl: "https://skill-radar-review.example.test/install",
    versions: [
      {
        entityVersionPublicId: "skill-radar-review-v1",
        sourceItemPublicId: primarySources.v1,
        author: {
          name: "Radar Skill Maintainers",
          url: "https://skill-radar-review.example.test/v1-authors",
        },
        documentation: {
          rightsStatus: "metadata_only",
          license: {
            name: "CC-BY-4.0",
            url: "https://creativecommons.org/licenses/by/4.0/",
          },
        },
        repository: {
          rightsStatus: "source_license",
          license: {
            name: "MIT",
            url: "https://opensource.org/license/mit",
          },
        },
        supportedPlatforms: ["codex", "claude-code"],
        dependencies: [
          { name: "git", versionConstraint: ">=2.40", required: true },
        ],
        permissions: v1Permissions.map((name) => ({ name, required: true })),
        externalApis: [],
        installationMethod: "manual",
        maintenanceStatus: "maintained",
        securityReview: {
          status: "metadata_reviewed",
          checksPerformed: v1Checks,
          reviewedAt: "2026-08-20T09:00:00.000Z",
        },
        localizations: [
          localization("en", v1Permissions, [], v1Checks),
          localization("zh", v1Permissions, [], v1Checks),
        ],
      },
      {
        entityVersionPublicId: "skill-radar-review-v2",
        sourceItemPublicId: primarySources.v2,
        author: {
          name: "Radar Review Collective",
          url: "https://skill-radar-review.example.test/v2-authors",
        },
        documentation: {
          rightsStatus: "attribution_required",
          license: {
            name: "Apache-2.0",
            url: "https://www.apache.org/licenses/LICENSE-2.0",
          },
        },
        repository: {
          rightsStatus: "source_license",
          license: {
            name: "Apache-2.0",
            url: "https://www.apache.org/licenses/LICENSE-2.0",
          },
        },
        supportedPlatforms: ["codex", "claude-code"],
        dependencies: [
          { name: "git", versionConstraint: ">=2.40", required: true },
          { name: "ripgrep", versionConstraint: ">=14", required: false },
        ],
        permissions: v2Permissions.map((name) => ({
          name,
          required: name === "repository_read",
        })),
        externalApis: [
          { name: "GitHub API", apiKeyRequired: false },
          { name: "Private Review API", apiKeyRequired: true },
        ],
        installationMethod: "manual",
        maintenanceStatus: "maintained",
        securityReview: {
          status: "manual_reviewed",
          checksPerformed: v2Checks,
          reviewedAt: "2026-08-30T09:00:00.000Z",
        },
        localizations: [
          localization("en", v2Permissions, v2Apis, v2Checks),
          localization("zh", v2Permissions, v2Apis, v2Checks),
        ],
      },
    ],
  };

  const rejectsApiKeys = await context.request.post(profileUrl, {
    data: { ...primaryRequest, apiKey: "must-not-be-collected" },
  });
  expect(rejectsApiKeys.status()).toBe(400);
  const permissionRequired = structuredClone(primaryRequest);
  permissionRequired.versions[0].documentation.rightsStatus =
    "permission_required";
  expect(
    (
      await context.request.post(profileUrl, { data: permissionRequired })
    ).status(),
  ).toBe(400);

  const created = await context.request.post(profileUrl, {
    data: primaryRequest,
  });
  expect(created.status(), await created.text()).toBe(201);

  const cacheVersionSourceByPublicId = new Map<string, string>();
  for (const cache of [
    {
      suffix: "alpha",
      publicId: "skill-cache-alpha",
      name: "Cache Skill Alpha",
      zhName: "缓存 Skill Alpha",
      reviewedAt: "2026-08-31T07:00:00.000Z",
    },
    {
      suffix: "beta",
      publicId: "skill-cache-beta",
      name: "Cache Skill Beta",
      zhName: "缓存 Skill Beta",
      reviewedAt: "2026-08-31T06:00:00.000Z",
    },
  ]) {
    const sources = {
      profile: await publishEvidence(
        `skill-cache-${cache.suffix}-profile`,
        `${cache.name} profile`,
      ),
      version: await publishEvidence(
        `skill-cache-${cache.suffix}-version`,
        `${cache.name} version`,
      ),
      relation: await publishEvidence(
        `skill-cache-${cache.suffix}-relation`,
        `${cache.name} relation`,
      ),
    };
    const versionPublicId = `${cache.publicId}-v1`;
    await createEntity({
      publicId: cache.publicId,
      type: "skill",
      name: cache.name,
      zhName: cache.zhName,
      versions: [
        {
          publicId: versionPublicId,
          versionLabel: "1.0.0",
          releasedAt: cache.reviewedAt,
          releasedAtPrecision: "second",
        },
      ],
    });
    await createSupportsRelation(cache.publicId, [sources.relation]);
    const response = await context.request.post(profileUrl, {
      data: oneVersionRequest({
        skillPublicId: cache.publicId,
        versionPublicId,
        profileSource: sources.profile,
        versionSource: sources.version,
        reviewedAt: cache.reviewedAt,
      }),
    });
    expect(response.status(), await response.text()).toBe(201);
    cacheVersionSourceByPublicId.set(cache.publicId, sources.version);
  }

  const profileBoundarySources = {
    profile: await publishEvidence(
      "skill-profile-boundary-profile",
      "Profile Boundary Skill profile",
    ),
    version: await publishEvidence(
      "skill-profile-boundary-version",
      "Profile Boundary Skill version",
    ),
    relation: await publishEvidence(
      "skill-profile-boundary-relation",
      "Profile Boundary Skill relation",
    ),
  };
  await createEntity({
    publicId: "skill-profile-boundary",
    type: "skill",
    name: "Profile Boundary Skill",
    zhName: "资料边界 Skill",
    versions: [
      {
        publicId: "skill-profile-boundary-v1",
        versionLabel: "1.0.0",
        releasedAt: "2026-08-29T08:00:00.000Z",
        releasedAtPrecision: "second",
      },
    ],
  });
  await createSupportsRelation("skill-profile-boundary", [
    profileBoundarySources.relation,
  ]);
  expect(
    (
      await context.request.post(profileUrl, {
        data: oneVersionRequest({
          skillPublicId: "skill-profile-boundary",
          versionPublicId: "skill-profile-boundary-v1",
          profileSource: profileBoundarySources.profile,
          versionSource: profileBoundarySources.version,
          reviewedAt: "2026-08-29T09:00:00.000Z",
        }),
      })
    ).status(),
  ).toBe(201);

  const list = await context.request.get(
    `${applicationUrl}/api/v1/skills?locale=en&platform=codex&permission=repository_read&installationMethod=manual&license=Apache-2.0&rightsStatus=link_only`,
  );
  expect(list.status()).toBe(200);
  const listBody = await list.json();
  expect(listBody.items).toEqual([
    expect.objectContaining({
      publicId: "skill-radar-review",
      lastVerifiedAt: "2026-08-30T09:00:00.000Z",
      currentVersion: expect.objectContaining({
        versionPublicId: "skill-radar-review-v2",
        author: expect.objectContaining({ name: "Radar Review Collective" }),
        documentation: expect.objectContaining({
          license: expect.objectContaining({ name: "Apache-2.0" }),
        }),
        maintenanceStatus: "maintained",
        securityReview: expect.objectContaining({ status: "manual_reviewed" }),
      }),
    }),
  ]);
  expect(JSON.stringify(listBody)).not.toMatch(/absolutely safe|绝对安全/i);

  const detail = await context.request.get(
    `${applicationUrl}/api/v1/skills/skill-radar-review?locale=en`,
  );
  expect(detail.status()).toBe(200);
  const detailBody = await detail.json();
  expect(detailBody).toMatchObject({
    publicId: "skill-radar-review",
    officialInstallationUrl: "https://skill-radar-review.example.test/install",
    installationAction: "external_link_only",
    apiKeyCollection: "never",
    lastVerifiedAt: "2026-08-30T09:00:00.000Z",
    source: { sourceItemPublicId: primarySources.profile },
    versions: [
      expect.objectContaining({
        version: "2.0.0",
        author: expect.objectContaining({ name: "Radar Review Collective" }),
        documentation: expect.objectContaining({
          rightsStatus: "attribution_required",
          license: expect.objectContaining({ name: "Apache-2.0" }),
        }),
        repository: expect.objectContaining({
          rightsStatus: "source_license",
          license: expect.objectContaining({ name: "Apache-2.0" }),
        }),
        permissions: expect.arrayContaining([
          expect.objectContaining({
            name: "network_access",
            reason: "Needed for network access",
          }),
        ]),
        externalApis: expect.arrayContaining([
          expect.objectContaining({
            name: "GitHub API",
            apiKeyRequired: false,
            purpose: "Read GitHub API metadata",
          }),
          expect.objectContaining({
            name: "Private Review API",
            apiKeyRequired: true,
          }),
        ]),
        securityReview: expect.objectContaining({
          checksPerformed: expect.arrayContaining([
            expect.objectContaining({
              id: "source_review",
              description: "Reviewed source review",
            }),
          ]),
          reviewedAt: "2026-08-30T09:00:00.000Z",
          limitation:
            "This review covers only the listed checks and is not a guarantee of safety.",
        }),
        source: expect.objectContaining({
          sourceItemPublicId: primarySources.v2,
          title: "Primary Skill version 2",
        }),
      }),
      expect.objectContaining({
        version: "1.0.0",
        author: expect.objectContaining({ name: "Radar Skill Maintainers" }),
        repository: expect.objectContaining({
          license: expect.objectContaining({ name: "MIT" }),
        }),
      }),
    ],
    relations: [
      expect.objectContaining({
        publicId: "relation-skill-radar-review-supports-workbench",
        evidence: expect.arrayContaining([
          {
            sourceItemPublicId: primarySources.relation,
            title: "Primary Skill support relation",
            url: "https://skill-primary-relation.example.test/evidence",
          },
          {
            sourceItemPublicId: primarySources.relationBackup,
            title: "Primary Skill backup support evidence",
            url: "https://skill-primary-relation-backup.example.test/evidence",
          },
        ]),
      }),
    ],
  });

  const zhDetail = await context.request.get(
    `${applicationUrl}/api/v1/skills/skill-radar-review?locale=zh`,
  );
  expect(zhDetail.status()).toBe(200);
  expect(await zhDetail.json()).toMatchObject({
    name: "雷达审阅 Skill",
    versions: expect.arrayContaining([
      expect.objectContaining({
        permissions: expect.arrayContaining([
          expect.objectContaining({
            name: "network_access",
            reason: "用于network access",
          }),
        ]),
        externalApis: expect.arrayContaining([
          expect.objectContaining({
            name: "GitHub API",
            purpose: "读取 GitHub API 元数据",
          }),
        ]),
        securityReview: expect.objectContaining({
          checksPerformed: expect.arrayContaining([
            expect.objectContaining({ description: "已检查source review" }),
          ]),
          limitation: "此审核仅覆盖列出的检查，不构成安全保证。",
        }),
      }),
    ]),
  });

  await page.goto(
    `${applicationUrl}/en/skills?platform=codex&installationMethod=manual&license=Apache-2.0`,
  );
  await expect(
    page.getByRole("heading", { name: "Radar Review Skill" }),
  ).toBeVisible();
  await expect(page.getByText("Maintenance: Maintained")).toBeVisible();
  await expect(
    page.getByText("Security review: Manually reviewed"),
  ).toBeVisible();
  await expect(page.getByText("2026-08-30T09:00:00.000Z")).toBeVisible();
  await page.goto(`${applicationUrl}/zh/skills?license=Apache-2.0`);
  await expect(
    page.getByRole("heading", { name: "雷达审阅 Skill" }),
  ).toBeVisible();
  await expect(
    page.getByText("不构成安全保证", { exact: false }),
  ).toBeVisible();
  const zhListCard = page.locator("article");
  await expect(
    zhListCard.getByText("手动安装", { exact: false }),
  ).toBeVisible();
  await expect(
    zhListCard.getByText("持续维护", { exact: false }),
  ).toBeVisible();
  await expect(
    zhListCard.getByText("已人工审核", { exact: false }),
  ).toBeVisible();
  await expect(
    page.locator('select[name="installationMethod"] option[value="manual"]'),
  ).toHaveText("手动安装");
  await expect(
    page.locator(
      'select[name="installationMethod"] option[value="package_manager"]',
    ),
  ).toHaveText("包管理器");
  await page.goto(`${applicationUrl}/en/skills?platform=not-a-platform`);
  await expect(page.getByText("No Skills match these filters.")).toBeVisible();

  await page.goto(`${applicationUrl}/en/skills/skill-radar-review`);
  await expect(
    page.getByRole("link", { name: "Official installation instructions" }),
  ).toHaveAttribute("href", "https://skill-radar-review.example.test/install");
  await expect(
    page.getByText("API key not required", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("API key required", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Radar Review Collective", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("Primary Skill version 2 authors")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Primary Skill support relation" }),
  ).toHaveAttribute(
    "href",
    "https://skill-primary-relation.example.test/evidence",
  );
  await expect(
    page.getByText("2026-08-30T09:00:00.000Z").first(),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /install/i })).toHaveCount(0);
  await expect(page.locator('input[name*="key" i]')).toHaveCount(0);
  await page.goto(`${applicationUrl}/zh/skills/skill-radar-review`);
  await expect(
    page.getByText("用于network access", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("读取 GitHub API 元数据", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("不需要 API Key", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("手动安装", { exact: false }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("持续维护", { exact: false }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("已人工审核", { exact: false }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("需要署名", { exact: false }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("遵循来源许可证", { exact: false }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("仅提供外部链接", { exact: false }),
  ).toBeVisible();

  expect(
    (
      await context.request.post(
        `${applicationUrl}/api/v1/skills/skill-radar-review/install`,
        { data: {} },
      )
    ).status(),
  ).toBe(404);

  const openApiResponse = await context.request.get(
    `${applicationUrl}/api/openapi.json`,
  );
  expect(openApiResponse.status()).toBe(200);
  const openApi = await openApiResponse.json();
  const listSchema =
    openApi.paths["/api/v1/skills"].get.responses["200"].content[
      "application/json"
    ].schema;
  const detailSchema =
    openApi.paths["/api/v1/skills/{publicId}"].get.responses["200"].content[
      "application/json"
    ].schema;
  const createSchema =
    openApi.paths["/api/v1/admin/skill-profiles"].post.requestBody.content[
      "application/json"
    ].schema;
  const ajv = new Ajv2020({ strict: false });
  addFormats(ajv);
  expect(ajv.compile(listSchema)(listBody)).toBe(true);
  expect(ajv.compile(detailSchema)(detailBody)).toBe(true);
  expect(ajv.compile(createSchema)(primaryRequest)).toBe(true);

  const firstCacheSearch = await context.request.get(
    `${applicationUrl}/api/v1/search?q=Cache%20Skill&locale=en&type=skill&limit=1`,
  );
  expect(firstCacheSearch.status()).toBe(200);
  const firstCacheBody = await firstCacheSearch.json();
  expect(firstCacheBody.items).toHaveLength(1);
  expect(typeof firstCacheBody.nextCursor).toBe("string");
  const secondCacheSearch = await context.request.get(
    `${applicationUrl}/api/v1/search?q=Cache%20Skill&locale=en&type=skill&limit=1&cursor=${encodeURIComponent(firstCacheBody.nextCursor)}`,
  );
  expect(secondCacheSearch.status()).toBe(200);
  const secondCacheBody = await secondCacheSearch.json();
  expect(secondCacheBody.items).toHaveLength(1);
  const secondCachePublicId = secondCacheBody.items[0].publicId as string;
  const secondCacheVersionSource =
    cacheVersionSourceByPublicId.get(secondCachePublicId);
  if (!secondCacheVersionSource)
    throw new Error("Snapshot page did not contain a Cache Skill");
  await withdrawSource(secondCacheVersionSource, "cache-version");
  const rehydratedSecondPage = await context.request.get(
    `${applicationUrl}/api/v1/search?q=Cache%20Skill&locale=en&type=skill&limit=1&cursor=${encodeURIComponent(firstCacheBody.nextCursor)}`,
  );
  expect(rehydratedSecondPage.status()).toBe(200);
  expect((await rehydratedSecondPage.json()).items).toEqual([]);
  expect(
    (
      await context.request.get(
        `${applicationUrl}/api/v1/skills/${secondCachePublicId}?locale=en`,
      )
    ).status(),
  ).toBe(404);

  await withdrawSource(profileBoundarySources.profile, "skill-profile");
  expect(
    (
      await context.request.get(
        `${applicationUrl}/api/v1/skills/skill-profile-boundary?locale=en`,
      )
    ).status(),
  ).toBe(404);
  const profileBoundaryList = await context.request.get(
    `${applicationUrl}/api/v1/skills?locale=en&task=code-review`,
  );
  expect(
    (await profileBoundaryList.json()).items.map(
      ({ publicId }: { publicId: string }) => publicId,
    ),
  ).not.toContain("skill-profile-boundary");
  const profileBoundarySearch = await context.request.get(
    `${applicationUrl}/api/v1/search?q=Profile%20Boundary%20Skill&locale=en&type=skill`,
  );
  expect((await profileBoundarySearch.json()).items).toEqual([]);

  await withdrawSource(primarySources.relation, "skill-relation-first");
  const detailWithRemainingRelationEvidence = await context.request.get(
    `${applicationUrl}/api/v1/skills/skill-radar-review?locale=en`,
  );
  expect(detailWithRemainingRelationEvidence.status()).toBe(200);
  expect((await detailWithRemainingRelationEvidence.json()).relations).toEqual([
    expect.objectContaining({
      evidence: [
        expect.objectContaining({
          sourceItemPublicId: primarySources.relationBackup,
          title: "Primary Skill backup support evidence",
        }),
      ],
    }),
  ]);
  await page.goto(`${applicationUrl}/en/skills/skill-radar-review`);
  await expect(
    page.getByRole("link", { name: "Primary Skill backup support evidence" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Primary Skill support relation" }),
  ).toHaveCount(0);

  await withdrawSource(primarySources.relationBackup, "skill-relation-last");
  expect(
    (
      await context.request.get(
        `${applicationUrl}/api/v1/skills/skill-radar-review?locale=en`,
      )
    ).status(),
  ).toBe(404);
  const primaryAfterRelationWithdrawal = await context.request.get(
    `${applicationUrl}/api/v1/skills?locale=en&license=Apache-2.0`,
  );
  expect((await primaryAfterRelationWithdrawal.json()).items).toEqual([]);
  const searchAfterRelationWithdrawal = await context.request.get(
    `${applicationUrl}/api/v1/search?q=Radar%20Review%20Skill&locale=en&type=skill`,
  );
  expect((await searchAfterRelationWithdrawal.json()).items).toEqual([]);
});
