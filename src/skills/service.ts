import { and, eq, inArray } from "drizzle-orm";
import { database, databasePool } from "@/db/client";
import {
  entities,
  entityVersions,
  ownerOperationAudits,
  skillProfiles,
  skillVersionLocalizedContents,
  skillVersionProfiles,
  sourceItems,
} from "@/db/schema";
import { getPublicEntity } from "@/entities/service";
import { refreshEntitySearchIndex } from "@/search/indexer";
import {
  type PublicSkillVersion,
  type SkillListRequest,
  type SkillProfileCreateRequest,
  publicSkillDetailSchema,
  publicSkillListItemSchema,
  publicSkillListSchema,
} from "./contracts";

const publicRights = [
  "open",
  "attribution_required",
  "source_license",
  "metadata_only",
  "link_only",
] as const;

const securityLimitation = {
  en: "This review covers only the listed checks and is not a guarantee of safety.",
  zh: "此审核仅覆盖列出的检查，不构成安全保证。",
} as const;

export const createSkillProfile = async (input: SkillProfileCreateRequest) =>
  database.transaction(async (transaction) => {
    const [skill] = await transaction
      .select({
        id: entities.id,
        type: entities.type,
        lifecycleStatus: entities.lifecycleStatus,
        publicVisibility: entities.publicVisibility,
        lastVerifiedAt: entities.lastVerifiedAt,
      })
      .from(entities)
      .where(eq(entities.publicId, input.skillPublicId))
      .for("update");
    if (
      !skill ||
      skill.type !== "skill" ||
      skill.lifecycleStatus !== "active" ||
      !skill.publicVisibility
    ) {
      return { status: "invalid_reference" as const };
    }

    const sourcePublicIds = [
      ...new Set([
        input.sourceItemPublicId,
        ...input.versions.map(({ sourceItemPublicId }) => sourceItemPublicId),
      ]),
    ];
    const sources = await transaction
      .select({
        id: sourceItems.id,
        publicId: sourceItems.publicId,
        rightsStatus: sourceItems.rightsStatus,
      })
      .from(sourceItems)
      .where(
        and(
          inArray(sourceItems.publicId, sourcePublicIds),
          eq(sourceItems.publicVisibility, true),
        ),
      );
    if (
      sources.length !== sourcePublicIds.length ||
      sources.some(
        ({ rightsStatus }) => !publicRights.includes(rightsStatus as never),
      )
    ) {
      return { status: "invalid_reference" as const };
    }
    const sourceByPublicId = new Map(
      sources.map(({ id, publicId }) => [publicId, id]),
    );

    const requestedVersionIds = input.versions.map(
      ({ entityVersionPublicId }) => entityVersionPublicId,
    );
    const versions = await transaction
      .select({ id: entityVersions.id, publicId: entityVersions.publicId })
      .from(entityVersions)
      .where(
        and(
          eq(entityVersions.entityId, skill.id),
          eq(entityVersions.publicVisibility, true),
          inArray(entityVersions.publicId, requestedVersionIds),
        ),
      );
    if (versions.length !== requestedVersionIds.length) {
      return { status: "invalid_reference" as const };
    }
    const versionByPublicId = new Map(
      versions.map(({ id, publicId }) => [publicId, id]),
    );

    const [profile] = await transaction
      .insert(skillProfiles)
      .values({
        entityId: skill.id,
        sourceItemId: sourceByPublicId.get(input.sourceItemPublicId)!,
        authorName: input.author.name,
        authorUrl: input.author.url,
        task: input.task,
        rightsStatus: input.rightsStatus,
        officialInstallationUrl: input.officialInstallationUrl,
        publicVisibility: true,
      })
      .returning({ id: skillProfiles.id });

    for (const version of input.versions) {
      const [versionProfile] = await transaction
        .insert(skillVersionProfiles)
        .values({
          skillProfileId: profile.id,
          entityVersionId: versionByPublicId.get(
            version.entityVersionPublicId,
          )!,
          sourceItemId: sourceByPublicId.get(version.sourceItemPublicId)!,
          authorName: version.author.name,
          authorUrl: version.author.url,
          documentationRightsStatus: version.documentation.rightsStatus,
          documentationLicenseName: version.documentation.license.name,
          documentationLicenseUrl: version.documentation.license.url,
          repositoryRightsStatus: version.repository.rightsStatus,
          repositoryLicenseName: version.repository.license.name,
          repositoryLicenseUrl: version.repository.license.url,
          supportedPlatforms: version.supportedPlatforms,
          dependencies: version.dependencies,
          permissions: version.permissions,
          externalApis: version.externalApis,
          installationMethod: version.installationMethod,
          maintenanceStatus: version.maintenanceStatus,
          securityReviewStatus: version.securityReview.status,
          securityChecksPerformed: version.securityReview.checksPerformed,
          securityReviewedAt: version.securityReview.reviewedAt
            ? new Date(version.securityReview.reviewedAt)
            : null,
          publicVisibility: true,
        })
        .returning({ id: skillVersionProfiles.id });
      await transaction.insert(skillVersionLocalizedContents).values(
        version.localizations.map((localization) => ({
          skillVersionProfileId: versionProfile.id,
          locale: localization.locale,
          permissionReasons: localization.permissionReasons,
          externalApiPurposes: localization.externalApiPurposes,
          securityCheckDescriptions: localization.securityCheckDescriptions,
          authorship: localization.authorship,
          reviewStatus: localization.reviewStatus,
          publicVisibility: true,
        })),
      );
    }

    const lastVerifiedAt = new Date(
      Math.max(
        skill.lastVerifiedAt.getTime(),
        ...input.versions.map(({ securityReview }) =>
          securityReview.reviewedAt
            ? Date.parse(securityReview.reviewedAt)
            : Number.NEGATIVE_INFINITY,
        ),
      ),
    );
    await transaction
      .update(entities)
      .set({ lastVerifiedAt })
      .where(eq(entities.id, skill.id));
    await refreshEntitySearchIndex(transaction, skill.id);
    await transaction.insert(ownerOperationAudits).values({
      actorRole: "owner",
      action: "create_skill_profile",
      targetType: "entity",
      targetPublicId: input.skillPublicId,
      publicVisibility: true,
    });
    return {
      status: "created" as const,
      skillPublicId: input.skillPublicId,
      publicVisibility: true as const,
      versionPublicIds: requestedVersionIds,
    };
  });

type SkillVersionRow = {
  version_public_id: string;
  version_label: string;
  released_at: Date | null;
  author_name: string;
  author_url: string | null;
  documentation_rights_status: PublicSkillVersion["documentation"]["rightsStatus"];
  documentation_license_name: string;
  documentation_license_url: string;
  repository_rights_status: PublicSkillVersion["repository"]["rightsStatus"];
  repository_license_name: string;
  repository_license_url: string;
  supported_platforms: string[];
  dependencies: PublicSkillVersion["dependencies"];
  permissions: Array<{ name: string; required: boolean }>;
  permission_reasons: Array<{ name: string; reason: string }>;
  external_apis: Array<{ name: string; apiKeyRequired: boolean }>;
  external_api_purposes: Array<{ name: string; purpose: string }>;
  installation_method: PublicSkillVersion["installationMethod"];
  maintenance_status: PublicSkillVersion["maintenanceStatus"];
  security_review_status: PublicSkillVersion["securityReview"]["status"];
  security_checks_performed: string[];
  security_check_descriptions: Array<{
    check: string;
    description: string;
  }>;
  security_reviewed_at: Date | null;
  localization_locale: "en" | "zh";
  localization_authorship: PublicSkillVersion["localization"]["authorship"];
  localization_review_status: "reviewed";
  localization_updated_at: Date;
  source_item_public_id: string;
  source_title: string;
  source_url: string;
  source_attribution: string;
};

const versionSelection = (localeParameter: string) => `
  version.public_id as version_public_id,
  version.version_label, version.released_at,
  version_profile.author_name, version_profile.author_url,
  version_profile.documentation_rights_status::text,
  version_profile.documentation_license_name,
  version_profile.documentation_license_url,
  version_profile.repository_rights_status::text,
  version_profile.repository_license_name,
  version_profile.repository_license_url,
  version_profile.supported_platforms, version_profile.dependencies,
  version_profile.permissions, localization.permission_reasons,
  version_profile.external_apis, localization.external_api_purposes,
  version_profile.installation_method::text,
  version_profile.maintenance_status::text,
  version_profile.security_review_status::text,
  version_profile.security_checks_performed,
  localization.security_check_descriptions,
  version_profile.security_reviewed_at,
  localization.locale::text as localization_locale,
  localization.authorship::text as localization_authorship,
  localization.review_status::text as localization_review_status,
  localization.updated_at as localization_updated_at,
  source_item.public_id as source_item_public_id,
  source_item.original_title as source_title,
  source_item.original_url as source_url,
  source_item.attribution as source_attribution
  from skill_version_profiles version_profile
  join entity_versions version on version.id = version_profile.entity_version_id
  join skill_version_localized_contents localization
    on localization.skill_version_profile_id = version_profile.id
    and localization.locale = ${localeParameter}::content_locale
    and localization.review_status = 'reviewed'
    and localization.public_visibility = true
  join source_items source_item on source_item.id = version_profile.source_item_id
    and source_item.public_visibility = true
    and source_item.rights_status in (
      'open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'
    )`;

const mapVersion = (
  row: SkillVersionRow,
  locale: "en" | "zh",
): PublicSkillVersion => {
  const reasonByPermission = new Map(
    row.permission_reasons.map(({ name, reason }) => [name, reason]),
  );
  const purposeByApi = new Map(
    row.external_api_purposes.map(({ name, purpose }) => [name, purpose]),
  );
  const descriptionByCheck = new Map(
    row.security_check_descriptions.map(({ check, description }) => [
      check,
      description,
    ]),
  );
  return {
    versionPublicId: row.version_public_id,
    version: row.version_label,
    releasedAt: row.released_at?.toISOString() ?? null,
    author: { name: row.author_name, url: row.author_url },
    documentation: {
      rightsStatus: row.documentation_rights_status,
      license: {
        name: row.documentation_license_name,
        url: row.documentation_license_url,
      },
    },
    repository: {
      rightsStatus: row.repository_rights_status,
      license: {
        name: row.repository_license_name,
        url: row.repository_license_url,
      },
    },
    supportedPlatforms: row.supported_platforms,
    dependencies: row.dependencies,
    permissions: row.permissions.map((permission) => ({
      ...permission,
      reason: reasonByPermission.get(permission.name)!,
    })),
    externalApis: row.external_apis.map((api) => ({
      ...api,
      purpose: purposeByApi.get(api.name)!,
    })),
    installationMethod: row.installation_method,
    maintenanceStatus: row.maintenance_status,
    securityReview: {
      status: row.security_review_status,
      checksPerformed: row.security_checks_performed.map((id) => ({
        id,
        description: descriptionByCheck.get(id)!,
      })),
      reviewedAt: row.security_reviewed_at?.toISOString() ?? null,
      limitation: securityLimitation[locale],
    },
    localization: {
      locale: row.localization_locale,
      authorship: row.localization_authorship,
      reviewStatus: row.localization_review_status,
      lastLocalizedAt: row.localization_updated_at.toISOString(),
    },
    source: {
      sourceItemPublicId: row.source_item_public_id,
      title: row.source_title,
      url: row.source_url,
      attribution: row.source_attribution,
    },
  };
};

export const getPublicSkill = async (publicId: string, locale: "en" | "zh") => {
  const profileResult = await databasePool.query<{
    id: string;
    entity_id: string;
    public_id: string;
    name: string;
    summary: string;
    official_url: string;
    author_name: string;
    author_url: string | null;
    task: string;
    rights_status: SkillProfileCreateRequest["rightsStatus"];
    official_installation_url: string;
    last_verified_at: Date;
    source_item_public_id: string;
    source_title: string;
    source_url: string;
    source_attribution: string;
  }>(
    `select profile.id, skill.id as entity_id, skill.public_id,
       localization.name, localization.summary, skill.official_url,
       profile.author_name, profile.author_url, profile.task,
       profile.rights_status::text, profile.official_installation_url,
       skill.last_verified_at, source_item.public_id as source_item_public_id,
       source_item.original_title as source_title,
       source_item.original_url as source_url,
       source_item.attribution as source_attribution
     from entities skill
     join skill_profiles profile on profile.entity_id = skill.id
       and profile.public_visibility = true
       and profile.rights_status in (
         'open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'
       )
     join source_items source_item on source_item.id = profile.source_item_id
       and source_item.public_visibility = true
       and source_item.rights_status in (
         'open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'
       )
     join entity_localized_contents localization
       on localization.entity_id = skill.id
       and localization.locale = $2::content_locale
       and localization.review_status = 'reviewed'
       and localization.public_visibility = true
     where skill.public_id = $1 and skill.type = 'skill'
       and skill.lifecycle_status = 'active' and skill.public_visibility = true`,
    [publicId, locale],
  );
  const profile = profileResult.rows[0];
  if (!profile) return null;
  const versionResult = await databasePool.query<SkillVersionRow>(
    `select ${versionSelection("$3")}
     where version.entity_id = $1
       and version.public_visibility = true
       and version_profile.skill_profile_id = $2
       and version_profile.public_visibility = true
     order by version.released_at desc nulls last, version.version_label desc`,
    [profile.entity_id, profile.id, locale],
  );
  if (versionResult.rows.length === 0) return null;
  const generic = await getPublicEntity(publicId, locale);
  if (!generic || generic.type !== "skill") return null;
  const relations = generic.outgoingRelations
    .filter((relation) => relation.predicate === "SUPPORTS")
    .map((relation) => ({
      publicId: relation.publicId,
      predicate: "SUPPORTS" as const,
      direction: "outgoing" as const,
      target: {
        publicId: relation.object.publicId,
        type: "product" as const,
        name: relation.object.name,
      },
      evidence: relation.evidence.map(
        ({ sourceItemPublicId, originalTitle, originalUrl }) => ({
          sourceItemPublicId,
          title: originalTitle,
          url: originalUrl,
        }),
      ),
    }));
  if (relations.length === 0) return null;
  return publicSkillDetailSchema.parse({
    publicId: profile.public_id,
    name: profile.name,
    summary: profile.summary,
    officialUrl: profile.official_url,
    author: { name: profile.author_name, url: profile.author_url },
    task: profile.task,
    rightsStatus: profile.rights_status,
    officialInstallationUrl: profile.official_installation_url,
    installationAction: "external_link_only",
    apiKeyCollection: "never",
    lastVerifiedAt: profile.last_verified_at.toISOString(),
    source: {
      sourceItemPublicId: profile.source_item_public_id,
      title: profile.source_title,
      url: profile.source_url,
      attribution: profile.source_attribution,
    },
    versions: versionResult.rows.map((row) => mapVersion(row, locale)),
    relations,
  });
};

type SkillListRow = {
  public_id: string;
  name: string;
  summary: string;
  profile_author_name: string;
  profile_author_url: string | null;
  task: string;
  rights_status: SkillProfileCreateRequest["rightsStatus"];
  last_verified_at: Date;
} & SkillVersionRow;

export const listPublicSkills = async (input: SkillListRequest) => {
  const result = await databasePool.query<SkillListRow>(
    `select skill.public_id, entity_localization.name,
       entity_localization.summary,
       profile.author_name as profile_author_name,
       profile.author_url as profile_author_url,
       profile.task, profile.rights_status::text, skill.last_verified_at,
       current_version.*
     from entities skill
     join skill_profiles profile on profile.entity_id = skill.id
       and profile.public_visibility = true
       and profile.rights_status in (
         'open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'
       )
     join source_items profile_source on profile_source.id = profile.source_item_id
       and profile_source.public_visibility = true
       and profile_source.rights_status in (
         'open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'
       )
     join entity_localized_contents entity_localization
       on entity_localization.entity_id = skill.id
       and entity_localization.locale = $1::content_locale
       and entity_localization.review_status = 'reviewed'
       and entity_localization.public_visibility = true
     join lateral (
       select ${versionSelection("$1")}
       where version.entity_id = skill.id
         and version.public_visibility = true
         and version_profile.skill_profile_id = profile.id
         and version_profile.public_visibility = true
       order by version.released_at desc nulls last, version.version_label desc
       limit 1
     ) current_version on true
     where skill.type = 'skill' and skill.lifecycle_status = 'active'
       and skill.public_visibility = true
       and ($2::text is null or $2 = any(current_version.supported_platforms))
       and ($3::text is null or exists (
         select 1 from jsonb_array_elements(current_version.permissions) permission
         where permission ->> 'name' = $3
       ))
       and ($4::text is null or profile.task = $4)
       and ($5::text is null or profile.rights_status::text = $5)
       and ($6::text is null or current_version.installation_method = $6)
       and ($7::text is null or lower(current_version.documentation_license_name) = lower($7)
         or lower(current_version.repository_license_name) = lower($7))
       and exists (
         select 1 from relations relation
         join entities target on target.id = relation.object_entity_id
           and target.type = 'product' and target.lifecycle_status = 'active'
           and target.public_visibility = true
         join relation_evidence evidence on evidence.relation_id = relation.id
         join source_items relation_source on relation_source.id = evidence.source_item_id
           and relation_source.public_visibility = true
           and relation_source.rights_status in (
             'open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'
           )
         where relation.subject_entity_id = skill.id
           and relation.predicate = 'SUPPORTS'
           and relation.review_status = 'reviewed'
           and relation.public_visibility = true
       )
     order by skill.last_verified_at desc, skill.public_id`,
    [
      input.locale,
      input.platform ?? null,
      input.permission ?? null,
      input.task ?? null,
      input.rightsStatus ?? null,
      input.installationMethod ?? null,
      input.license ?? null,
    ],
  );
  const items = result.rows.map((row) =>
    publicSkillListItemSchema.parse({
      publicId: row.public_id,
      name: row.name,
      summary: row.summary,
      author: { name: row.profile_author_name, url: row.profile_author_url },
      task: row.task,
      rightsStatus: row.rights_status,
      lastVerifiedAt: row.last_verified_at.toISOString(),
      currentVersion: mapVersion(row, input.locale),
    }),
  );
  return publicSkillListSchema.parse({
    locale: input.locale,
    methodology: {
      publicId: "skill-permission-aware-discovery",
      version: "1.0.0",
      kind: "filtered_discovery",
      limitation: securityLimitation[input.locale],
    },
    items,
    dataCutoff: items[0]?.lastVerifiedAt ?? null,
  });
};
