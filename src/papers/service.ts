import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { PoolClient } from "pg";
import { database, databasePool } from "@/db/client";
import {
  entities,
  entityVersions,
  arxivSourceItemMetadata,
  ownerOperationAudits,
  paperIdentities,
  paperResourceLinks,
  paperRevisionGuidance,
  paperRevisionProfiles,
  sourceItems,
  sources,
} from "@/db/schema";
import { getPublicEntity } from "@/entities/service";
import { publicRightsStatusSchema } from "@/events/contracts";
import { isArxivAbstractUrl } from "@/ingestion/arxiv-adapter";
import {
  type PaperListRequest,
  type PaperListCursor,
  type PaperRevisionProfileCreateRequest,
  paperListCursorSchema,
  publicPaperDetailSchema,
  publicPaperListItemSchema,
  publicPaperListSchema,
  type PublicPaperDetail,
  type PublicPaperListItem,
} from "./contracts";

export const createPaperRevisionProfile = async (
  input: PaperRevisionProfileCreateRequest,
) =>
  database.transaction(async (transaction) => {
    const [reference] = await transaction
      .select({
        familyId: entities.id,
        familyType: entities.type,
        familyPublicVisibility: entities.publicVisibility,
        versionId: entityVersions.id,
        versionLabel: entityVersions.versionLabel,
        versionReleasedAt: entityVersions.releasedAt,
        versionPublicVisibility: entityVersions.publicVisibility,
        sourceItemId: sourceItems.id,
        sourceExternalId: sourceItems.externalId,
        sourceTitle: sourceItems.originalTitle,
        sourceUrl: sourceItems.originalUrl,
        sourcePublishedAt: sourceItems.publishedAt,
        sourceLicenseUrl: sourceItems.licenseUrl,
        sourcePublicVisibility: sourceItems.publicVisibility,
        sourcePublicId: sources.publicId,
        sourceAccessStatus: sources.accessStatus,
        metadataAuthors: arxivSourceItemMetadata.authors,
      })
      .from(entities)
      .innerJoin(
        entityVersions,
        and(
          eq(entityVersions.entityId, entities.id),
          eq(entityVersions.publicId, input.versionPublicId),
        ),
      )
      .innerJoin(
        sourceItems,
        eq(sourceItems.publicId, input.sourceItemPublicId),
      )
      .innerJoin(sources, eq(sources.id, sourceItems.sourceId))
      .innerJoin(
        arxivSourceItemMetadata,
        eq(arxivSourceItemMetadata.sourceItemId, sourceItems.id),
      )
      .where(eq(entities.publicId, input.familyPublicId));
    if (
      !reference ||
      reference.familyType !== "paper" ||
      !reference.familyPublicVisibility ||
      !reference.versionPublicVisibility ||
      !reference.sourcePublicVisibility ||
      reference.sourcePublicId !== "arxiv" ||
      !["approved", "approved_limited"].includes(
        reference.sourceAccessStatus,
      ) ||
      reference.versionLabel !== input.arxivVersion ||
      reference.versionReleasedAt?.getTime() !==
        reference.sourcePublishedAt.getTime() ||
      reference.sourceExternalId !== `${input.arxivId}${input.arxivVersion}` ||
      reference.sourceTitle !== input.title ||
      !isArxivAbstractUrl(
        reference.sourceUrl,
        `${input.arxivId}${input.arxivVersion}`,
      ) ||
      reference.sourceLicenseUrl !==
        "https://creativecommons.org/publicdomain/zero/1.0/" ||
      reference.metadataAuthors.length !== input.authors.length ||
      reference.metadataAuthors.some(
        ({ name }, index) => name !== input.authors[index].name,
      )
    ) {
      return { status: "invalid_reference" as const };
    }
    const resourceEvidence =
      input.resourceLinks.length === 0
        ? []
        : await transaction
            .select({
              id: sourceItems.id,
              publicId: sourceItems.publicId,
              originalUrl: sourceItems.originalUrl,
              canonicalUrl: sourceItems.canonicalUrl,
              rightsStatus: sourceItems.rightsStatus,
              publicVisibility: sourceItems.publicVisibility,
              sourceAccessStatus: sources.accessStatus,
            })
            .from(sourceItems)
            .innerJoin(sources, eq(sources.id, sourceItems.sourceId))
            .where(
              inArray(
                sourceItems.publicId,
                input.resourceLinks.map(
                  ({ evidenceSourceItemPublicId }) =>
                    evidenceSourceItemPublicId,
                ),
              ),
            );
    const evidenceByPublicId = new Map(
      resourceEvidence.map((evidence) => [evidence.publicId, evidence]),
    );
    if (
      input.resourceLinks.some((resource) => {
        const evidence = evidenceByPublicId.get(
          resource.evidenceSourceItemPublicId,
        );
        return (
          !evidence ||
          !evidence.publicVisibility ||
          !publicRightsStatusSchema.safeParse(evidence.rightsStatus).success ||
          !["approved", "approved_limited"].includes(
            evidence.sourceAccessStatus,
          ) ||
          (evidence.originalUrl !== resource.url &&
            evidence.canonicalUrl !== resource.url)
        );
      })
    ) {
      return { status: "invalid_reference" as const };
    }
    const [insertedIdentity] = await transaction
      .insert(paperIdentities)
      .values({ entityId: reference.familyId, arxivId: input.arxivId })
      .onConflictDoNothing()
      .returning({ id: paperIdentities.id, arxivId: paperIdentities.arxivId });
    const [paperIdentity] = insertedIdentity
      ? [insertedIdentity]
      : await transaction
          .select({ id: paperIdentities.id, arxivId: paperIdentities.arxivId })
          .from(paperIdentities)
          .where(eq(paperIdentities.entityId, reference.familyId));
    if (!paperIdentity || paperIdentity.arxivId !== input.arxivId) {
      return { status: "invalid_reference" as const };
    }
    const publicVisibility =
      publicRightsStatusSchema.safeParse(input.fullTextRightsStatus).success &&
      input.guidance.every(({ reviewStatus }) => reviewStatus === "reviewed");
    const [profile] = await transaction
      .insert(paperRevisionProfiles)
      .values({
        paperIdentityId: paperIdentity.id,
        entityVersionId: reference.versionId,
        metadataSourceItemId: reference.sourceItemId,
        arxivVersion: input.arxivVersion,
        title: input.title,
        authors: reference.metadataAuthors.map(({ name }, index) => ({
          name,
          institutions: input.authors[index].institutions,
        })),
        topics: input.topics,
        metadataLicenseUrl: reference.sourceLicenseUrl,
        fullTextRightsStatus: input.fullTextRightsStatus,
        fullTextLicenseUrl: input.fullTextLicenseUrl,
        pdfPackaged: false,
        publicVisibility,
      })
      .returning({ id: paperRevisionProfiles.id });
    await transaction.insert(paperRevisionGuidance).values(
      input.guidance.map((guidance) => ({
        ...guidance,
        paperRevisionProfileId: profile.id,
        publicVisibility,
      })),
    );
    if (input.resourceLinks.length > 0) {
      await transaction.insert(paperResourceLinks).values(
        input.resourceLinks.map((resource) => ({
          publicId: resource.publicId,
          kind: resource.kind,
          label: resource.label,
          url: resource.url,
          paperRevisionProfileId: profile.id,
          evidenceSourceItemId: evidenceByPublicId.get(
            resource.evidenceSourceItemPublicId,
          )!.id,
          publicVisibility,
        })),
      );
    }
    await transaction.insert(ownerOperationAudits).values({
      actorRole: "owner",
      action: "create_paper_revision_profile",
      targetType: "entity_version",
      targetPublicId: input.versionPublicId,
      publicVisibility,
    });
    return {
      status: "created" as const,
      familyPublicId: input.familyPublicId,
      versionPublicId: input.versionPublicId,
      arxivId: input.arxivId,
      arxivVersion: input.arxivVersion,
      publicVisibility,
    };
  });

type PaperRevisionRow = {
  profile_id: string;
  version_public_id: string;
  version_label: string;
  released_at: Date;
  arxiv_id: string;
  arxiv_version: string;
  title: string;
  authors: Array<{ name: string; institutions: string[] }>;
  topics: string[];
  metadata_rights_status: PublicPaperDetail["metadataRights"]["status"];
  metadata_license_url: string;
  abstract_url: string;
  full_text_rights_status: PublicPaperDetail["revisions"][number]["fullTextRightsStatus"];
  full_text_license_url: string | null;
  claimed_contributions: string[];
  limitations: string[];
  inference: string[];
  authorship: PublicPaperDetail["revisions"][number]["guidance"]["authorship"];
  last_verified_at: Date;
  projection_cutoff: Date;
};

type PaperResourceRow = {
  profile_id: string;
  public_id: string;
  kind: PublicPaperDetail["revisions"][number]["resourceLinks"][number]["kind"];
  label: string;
  url: string;
  evidence_source_item_public_id: string;
  projection_cutoff: Date;
};

export const getPublicPaper = async (publicId: string, locale: "en" | "zh") => {
  const generic = await getPublicEntity(publicId, locale);
  if (!generic || !("type" in generic) || generic.type !== "paper")
    return generic;
  const revisions = await databasePool.query<PaperRevisionRow>(
    `select profile.id as profile_id,
      version.public_id as version_public_id,
      version.version_label, version.released_at,
      identity.arxiv_id, profile.arxiv_version, profile.title,
      profile.authors, profile.topics,
      source_item.rights_status::text as metadata_rights_status,
      profile.metadata_license_url, source_item.original_url as abstract_url,
      profile.full_text_rights_status::text,
      profile.full_text_license_url,
      guidance.claimed_contributions, guidance.limitations,
      guidance.inference, guidance.authorship::text,
      greatest(version.last_verified_at, source_item.rights_checked_at,
        source_item.updated_at) as last_verified_at,
      greatest(version.last_verified_at, profile.updated_at,
        guidance.updated_at, source_item.rights_checked_at,
        source_item.updated_at) as projection_cutoff
     from entities family
     join entity_versions version on version.entity_id = family.id
       and version.public_visibility = true
     join paper_revision_profiles profile
       on profile.entity_version_id = version.id
       and profile.public_visibility = true and profile.pdf_packaged = false
     join paper_identities identity on identity.id = profile.paper_identity_id
     join paper_revision_guidance guidance
       on guidance.paper_revision_profile_id = profile.id
       and guidance.locale = $2::content_locale
       and guidance.review_status = 'reviewed'
       and guidance.public_visibility = true
     join source_items source_item
       on source_item.id = profile.metadata_source_item_id
       and source_item.public_visibility = true
     where family.public_id = $1 and family.type = 'paper'
       and family.lifecycle_status = 'active'
       and family.public_visibility = true
     order by version.released_at, version.public_id`,
    [publicId, locale],
  );
  if (revisions.rows.length === 0) return null;
  const resources = await databasePool.query<PaperResourceRow>(
    `select link.paper_revision_profile_id as profile_id,
      link.public_id, link.kind::text, link.label, link.url,
      source_item.public_id as evidence_source_item_public_id,
      greatest(link.created_at, source_item.rights_checked_at,
        source_item.updated_at) as projection_cutoff
     from paper_resource_links link
     join source_items source_item
       on source_item.id = link.evidence_source_item_id
       and source_item.public_visibility = true
       and source_item.rights_status in (
         'open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'
       )
     join sources evidence_source on evidence_source.id = source_item.source_id
       and evidence_source.access_status in ('approved', 'approved_limited')
     where link.paper_revision_profile_id = any($1::uuid[])
       and link.public_visibility = true
     order by link.kind::text, link.public_id`,
    [revisions.rows.map(({ profile_id }) => profile_id)],
  );
  const resourcesByProfile = new Map<string, PaperResourceRow[]>();
  for (const resource of resources.rows) {
    const grouped = resourcesByProfile.get(resource.profile_id) ?? [];
    grouped.push(resource);
    resourcesByProfile.set(resource.profile_id, grouped);
  }
  const entityTypes = await databasePool.query<{
    public_id: string;
    type: string;
  }>(
    `select public_id, type::text
     from entities
     where public_id = any($1::text[]) and public_visibility = true`,
    [
      [...generic.outgoingRelations, ...generic.backlinks].flatMap((relation) =>
        [relation.subject, relation.object].flatMap((endpoint) =>
          endpoint.type === "entity" && endpoint.publicId !== publicId
            ? [endpoint.publicId]
            : [],
        ),
      ),
    ],
  );
  const typeByPublicId = new Map(
    entityTypes.rows.map(({ public_id, type }) => [public_id, type]),
  );
  const relatedEntities = [
    ...generic.outgoingRelations,
    ...generic.backlinks,
  ].flatMap((relation) => {
    const endpoint =
      relation.direction === "outgoing" ? relation.object : relation.subject;
    if (endpoint.type !== "entity" || endpoint.publicId === publicId) return [];
    const type = typeByPublicId.get(endpoint.publicId);
    return type
      ? [
          {
            relationPublicId: relation.publicId,
            publicId: endpoint.publicId,
            name: endpoint.name,
            type,
            predicate: relation.predicate,
            direction: relation.direction,
            confidence: relation.confidence,
            firstVerifiedAt: relation.firstVerifiedAt,
            lastVerifiedAt: relation.lastVerifiedAt,
            evidence: relation.evidence,
          },
        ]
      : [];
  });
  const first = revisions.rows[0];
  const dataCutoff = new Date(
    Math.max(
      Date.parse(generic.lastVerifiedAt),
      ...generic.versions.map(({ lastVerifiedAt }) =>
        Date.parse(lastVerifiedAt),
      ),
      ...[...generic.outgoingRelations, ...generic.backlinks].map(
        ({ lastVerifiedAt }) => Date.parse(lastVerifiedAt),
      ),
      ...revisions.rows.map(({ projection_cutoff }) =>
        projection_cutoff.getTime(),
      ),
      ...resources.rows.map(({ projection_cutoff }) =>
        projection_cutoff.getTime(),
      ),
    ),
  ).toISOString();
  return publicPaperDetailSchema.parse({
    publicId: generic.publicId,
    name: generic.localization.name,
    summary: generic.localization.summary,
    arxivId: first.arxiv_id,
    metadataRights: {
      status: first.metadata_rights_status,
      licenseUrl: first.metadata_license_url,
    },
    pdfPackaged: false,
    dataCutoff,
    revisions: revisions.rows.map((revision) => ({
      versionPublicId: revision.version_public_id,
      versionLabel: revision.version_label,
      releasedAt: revision.released_at.toISOString(),
      arxivVersion: revision.arxiv_version,
      title: revision.title,
      abstractUrl: revision.abstract_url,
      authors: revision.authors,
      topics: revision.topics,
      fullTextRightsStatus: revision.full_text_rights_status,
      fullTextLicenseUrl: revision.full_text_license_url,
      guidance: {
        claimedContributions: revision.claimed_contributions,
        limitations: revision.limitations,
        inference: revision.inference,
        authorship: revision.authorship,
        reviewStatus: "reviewed" as const,
      },
      resourceLinks: (resourcesByProfile.get(revision.profile_id) ?? []).map(
        (resource) => ({
          publicId: resource.public_id,
          kind: resource.kind,
          label: resource.label,
          url: resource.url,
          evidenceSourceItemPublicId: resource.evidence_source_item_public_id,
        }),
      ),
      lastVerifiedAt: revision.last_verified_at.toISOString(),
    })),
    relatedEntities,
    relatedEvents: generic.timeline.map((event) => {
      const relation = generic.backlinks.find(
        ({ publicId: relationPublicId }) =>
          relationPublicId === event.relationPublicId,
      )!;
      return {
        relationPublicId: relation.publicId,
        eventPublicId: event.eventPublicId,
        title: event.title,
        occurredAt: event.occurredAt,
        predicate: event.predicate,
        confidence: relation.confidence,
        lastVerifiedAt: relation.lastVerifiedAt,
        evidence: relation.evidence,
      };
    }),
  });
};

const methodology = {
  latest: {
    kind: "chronological" as const,
    en: "Latest orders eligible Paper families by their newest published revision.",
    zh: "最新按每个合格论文家族的最新公开修订时间排序。",
  },
  trending: {
    kind: "attention" as const,
    en: "Trending measures recent attention, not academic quality.",
    zh: "趋势只衡量近期关注，不代表学术质量。",
  },
  featured: {
    kind: "editorial" as const,
    en: "Featured is an editorial selection, not an algorithmic ranking.",
    zh: "精选是编辑选择，不是算法排名。",
  },
};

const maximumSnapshotItems = 1000;

const requestKeyFor = (input: PaperListRequest) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        locale: input.locale,
        view: input.view,
        topic: input.topic ?? null,
        author: input.author ?? null,
        institution: input.institution ?? null,
        publishedFrom: input.publishedFrom ?? null,
        publishedTo: input.publishedTo ?? null,
        hasCode: input.hasCode ?? null,
        relatedModelPublicId: input.relatedModelPublicId ?? null,
        limit: input.limit,
      }),
    )
    .digest("hex");

const decodePaperCursor = (value: string): PaperListCursor | null => {
  try {
    const parsed = paperListCursorSchema.safeParse(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8")),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

const encodePaperCursor = (cursor: PaperListCursor) =>
  Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");

const cursorFor = (
  requestKey: string,
  snapshotId: string,
  dataCutoff: string,
  offset: number,
) =>
  encodePaperCursor({
    version: 1,
    requestKey,
    dataCutoff,
    snapshotId,
    offset,
  });

type PaperListRow = {
  public_id: string;
  name: string;
  summary: string;
  version_public_id: string;
  arxiv_version: string;
  title: string;
  released_at: Date;
  authors: Array<{ name: string; institutions: string[] }>;
  projection_cutoff: Date;
};

const toPaperListItem = (row: PaperListRow): PublicPaperListItem =>
  publicPaperListItemSchema.parse({
    publicId: row.public_id,
    name: row.name,
    summary: row.summary,
    latestRevision: {
      versionPublicId: row.version_public_id,
      arxivVersion: row.arxiv_version,
      title: row.title,
      releasedAt: row.released_at.toISOString(),
      authors: row.authors,
    },
  });

const latestEligiblePaperSql = `
  with public_revisions as (
    select family.id as family_id, family.public_id,
      localization.name, localization.summary,
      version.public_id as version_public_id, version.released_at,
      profile.id as profile_id, profile.arxiv_version, profile.title,
      profile.authors, profile.topics,
      greatest(
        family.last_verified_at, family.updated_at, localization.updated_at,
        version.last_verified_at, profile.updated_at, guidance.updated_at,
        source_item.rights_checked_at, source_item.updated_at,
        source.updated_at,
        coalesce((
          select max(greatest(
            resource.created_at, evidence.rights_checked_at,
            evidence.updated_at, evidence_source.updated_at
          ))
          from paper_resource_links resource
          join source_items evidence on evidence.id = resource.evidence_source_item_id
            and evidence.public_visibility = true
            and evidence.rights_status in (
              'open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'
            )
          join sources evidence_source on evidence_source.id = evidence.source_id
            and evidence_source.access_status in ('approved', 'approved_limited')
          where resource.paper_revision_profile_id = profile.id
            and resource.public_visibility = true
        ), family.last_verified_at),
        coalesce((
          select max(greatest(
            relation.last_verified_at, relation.updated_at,
            related_entity.last_verified_at, related_entity.updated_at
          ))
          from relations relation
          join entities related_entity on related_entity.id = case
            when relation.subject_entity_id = family.id then relation.object_entity_id
            else relation.subject_entity_id
          end
          where (relation.subject_entity_id = family.id
              or relation.object_entity_id = family.id)
            and relation.public_visibility = true
            and relation.review_status = 'reviewed'
            and relation.rights_status in (
              'open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'
            )
            and related_entity.lifecycle_status = 'active'
            and related_entity.public_visibility = true
        ), family.last_verified_at)
      ) as projection_cutoff,
      row_number() over (
        partition by family.id
        order by version.released_at desc, version.public_id desc
      ) as revision_rank
    from entities family
    join entity_localized_contents localization
      on localization.entity_id = family.id
      and localization.locale = $1::content_locale
      and localization.review_status = 'reviewed'
      and localization.public_visibility = true
    join paper_identities identity on identity.entity_id = family.id
    join entity_versions version on version.entity_id = family.id
      and version.public_visibility = true and version.released_at is not null
    join paper_revision_profiles profile
      on profile.entity_version_id = version.id
      and profile.paper_identity_id = identity.id
      and profile.public_visibility = true and profile.pdf_packaged = false
      and profile.full_text_rights_status in (
        'open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'
      )
      and (
        profile.full_text_rights_status not in (
          'open', 'attribution_required', 'source_license'
        ) or profile.full_text_license_url is not null
      )
    join paper_revision_guidance guidance
      on guidance.paper_revision_profile_id = profile.id
      and guidance.locale = $1::content_locale
      and guidance.review_status = 'reviewed'
      and guidance.public_visibility = true
    join source_items source_item
      on source_item.id = profile.metadata_source_item_id
      and source_item.public_visibility = true
      and source_item.rights_status in (
        'open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'
      )
      and source_item.license_url =
        'https://creativecommons.org/publicdomain/zero/1.0/'
    join sources source on source.id = source_item.source_id
      and source.public_id = 'arxiv'
      and source.access_status in ('approved', 'approved_limited')
    where family.type = 'paper' and family.lifecycle_status = 'active'
      and family.public_visibility = true
  )
  select public_id, name, summary, version_public_id, arxiv_version, title,
    released_at, authors, projection_cutoff
  from public_revisions latest
  where revision_rank = 1
      and ($2::text is null or $2 = any(latest.topics))
      and ($3::text is null or exists (
        select 1 from jsonb_array_elements(latest.authors) author
        where lower(author ->> 'name') = lower($3)
      ))
      and ($4::text is null or exists (
        select 1 from jsonb_array_elements(latest.authors) author,
          jsonb_array_elements_text(author -> 'institutions') institution
        where lower(institution) = lower($4)
      ))
      and ($5::timestamptz is null or latest.released_at >= $5)
      and ($6::timestamptz is null or latest.released_at <= $6)
      and ($7::boolean is null or $7 = exists (
        select 1 from paper_resource_links resource
        join source_items evidence on evidence.id = resource.evidence_source_item_id
          and evidence.public_visibility = true
          and evidence.rights_status in (
            'open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'
          )
        join sources evidence_source on evidence_source.id = evidence.source_id
          and evidence_source.access_status in ('approved', 'approved_limited')
        where resource.paper_revision_profile_id = latest.profile_id
          and resource.kind = 'code' and resource.public_visibility = true
      ))
      and ($8::text is null or exists (
        select 1 from relations relation
        join entities related_model on related_model.id = case
          when relation.subject_entity_id = latest.family_id then relation.object_entity_id
          else relation.subject_entity_id
        end
        where (relation.subject_entity_id = latest.family_id
            or relation.object_entity_id = latest.family_id)
          and relation.public_visibility = true
          and relation.review_status = 'reviewed'
          and relation.rights_status in (
            'open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'
          )
          and related_model.public_id = $8 and related_model.type = 'model'
          and related_model.lifecycle_status = 'active'
          and related_model.public_visibility = true
      ))
  order by released_at desc, public_id
  limit $9`;

const currentlyDistributableSnapshotVersions = async (
  client: PoolClient,
  items: PublicPaperListItem[],
  input: PaperListRequest,
) => {
  if (items.length === 0) return new Set<string>();
  const result = await client.query<{ version_public_id: string }>(
    `with requested as (
       select * from jsonb_to_recordset($1::jsonb)
         as item(public_id text, version_public_id text)
     )
     select requested.version_public_id
     from requested
     join entities family on family.public_id = requested.public_id
       and family.type = 'paper' and family.lifecycle_status = 'active'
       and family.public_visibility = true
       and family.rights_status in (
         'open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'
       )
     join entity_localized_contents localization
       on localization.entity_id = family.id
       and localization.locale = $2::content_locale
       and localization.review_status = 'reviewed'
       and localization.public_visibility = true
     join paper_identities identity on identity.entity_id = family.id
     join entity_versions version on version.entity_id = family.id
       and version.public_id = requested.version_public_id
       and version.public_visibility = true and version.released_at is not null
     join paper_revision_profiles profile
       on profile.entity_version_id = version.id
       and profile.paper_identity_id = identity.id
       and profile.public_visibility = true and profile.pdf_packaged = false
       and profile.full_text_rights_status in (
         'open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'
       )
       and (
         profile.full_text_rights_status not in (
           'open', 'attribution_required', 'source_license'
         ) or profile.full_text_license_url is not null
       )
     join paper_revision_guidance guidance
       on guidance.paper_revision_profile_id = profile.id
       and guidance.locale = $2::content_locale
       and guidance.review_status = 'reviewed'
       and guidance.public_visibility = true
     join source_items metadata on metadata.id = profile.metadata_source_item_id
       and metadata.public_visibility = true
       and metadata.rights_status in (
         'open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'
       )
       and metadata.license_url =
         'https://creativecommons.org/publicdomain/zero/1.0/'
     join sources metadata_source on metadata_source.id = metadata.source_id
       and metadata_source.public_id = 'arxiv'
       and metadata_source.access_status in ('approved', 'approved_limited')
     where (not $3::boolean or exists (
       select 1 from paper_resource_links resource
       join source_items evidence on evidence.id = resource.evidence_source_item_id
         and evidence.public_visibility = true
         and evidence.rights_status in (
           'open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'
         )
       join sources evidence_source on evidence_source.id = evidence.source_id
         and evidence_source.access_status in ('approved', 'approved_limited')
       where resource.paper_revision_profile_id = profile.id
         and resource.kind = 'code' and resource.public_visibility = true
     ))
     and ($4::text is null or exists (
       select 1 from relations relation
       join entities related_model on related_model.id = case
         when relation.subject_entity_id = family.id then relation.object_entity_id
         else relation.subject_entity_id
       end
       where (relation.subject_entity_id = family.id
           or relation.object_entity_id = family.id)
         and relation.public_visibility = true
         and relation.review_status = 'reviewed'
         and relation.rights_status in (
           'open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'
         )
         and related_model.public_id = $4 and related_model.type = 'model'
         and related_model.lifecycle_status = 'active'
         and related_model.public_visibility = true
     ))`,
    [
      JSON.stringify(
        items.map((item) => ({
          public_id: item.publicId,
          version_public_id: item.latestRevision.versionPublicId,
        })),
      ),
      input.locale,
      input.hasCode === "true",
      input.relatedModelPublicId ?? null,
    ],
  );
  return new Set(result.rows.map(({ version_public_id }) => version_public_id));
};

const readPaperSnapshotPage = async (
  input: PaperListRequest,
  requestKey: string,
  cursor: PaperListCursor,
) => {
  const client = await databasePool.connect();
  try {
    await client.query("begin isolation level repeatable read read only");
    const snapshot = await client.query<{
      data_cutoff: Date;
      total_count: number;
      truncated: boolean;
    }>(
      `select data_cutoff, total_count, truncated
       from search_snapshots
       where id = $1 and request_key = $2 and data_cutoff = $3::timestamptz
         and expires_at > clock_timestamp()`,
      [cursor.snapshotId, requestKey, cursor.dataCutoff],
    );
    const metadata = snapshot.rows[0];
    if (!metadata) {
      await client.query("rollback");
      return { status: "invalid_cursor" as const };
    }
    const page = await client.query<{ payload: unknown }>(
      `select payload
       from search_snapshot_items
       where snapshot_id = $1 and position >= $2 and position < $3
       order by position`,
      [cursor.snapshotId, cursor.offset, cursor.offset + input.limit],
    );
    const storedItems = page.rows.map(({ payload }) =>
      publicPaperListItemSchema.parse(payload),
    );
    const distributableVersions = await currentlyDistributableSnapshotVersions(
      client,
      storedItems,
      input,
    );
    const items = storedItems.filter((item) =>
      distributableVersions.has(item.latestRevision.versionPublicId),
    );
    const nextOffset = cursor.offset + storedItems.length;
    await client.query("commit");
    return {
      status: "ok" as const,
      response: publicPaperListSchema.parse({
        locale: input.locale,
        view: "latest",
        rankingState: "available",
        methodology: {
          publicId: "paper-discovery",
          version: "1.0.0",
          kind: methodology.latest.kind,
          limitation: methodology.latest[input.locale],
        },
        dataCutoff: cursor.dataCutoff,
        resultSet: {
          capturedCount: metadata.total_count,
          limit: maximumSnapshotItems,
          truncated: metadata.truncated,
        },
        emptyState: items.length === 0 ? "no_matches" : null,
        nextCursor:
          nextOffset < metadata.total_count
            ? cursorFor(
                requestKey,
                cursor.snapshotId,
                cursor.dataCutoff,
                nextOffset,
              )
            : null,
        items,
      }),
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
};

const createPaperSnapshotPage = async (
  input: PaperListRequest,
  requestKey: string,
) => {
  const client = await databasePool.connect();
  try {
    await client.query("begin isolation level repeatable read");
    const snapshotClock = await client.query<{ snapshot_created_at: Date }>(
      "select transaction_timestamp() as snapshot_created_at",
    );
    const snapshotCreatedAt =
      snapshotClock.rows[0].snapshot_created_at.toISOString();
    const result = await client.query<PaperListRow>(latestEligiblePaperSql, [
      input.locale,
      input.topic ?? null,
      input.author ?? null,
      input.institution ?? null,
      input.publishedFrom ?? null,
      input.publishedTo ?? null,
      input.hasCode === undefined ? null : input.hasCode === "true",
      input.relatedModelPublicId ?? null,
      maximumSnapshotItems + 1,
    ]);
    const capturedRows = result.rows.slice(0, maximumSnapshotItems);
    const items = capturedRows.map(toPaperListItem);
    const truncated = result.rows.length > maximumSnapshotItems;
    const snapshotId = randomUUID();
    await client.query(
      "delete from search_snapshots where expires_at <= clock_timestamp()",
    );
    if (items.length === 0) {
      await client.query("commit");
      return {
        status: "ok" as const,
        response: publicPaperListSchema.parse({
          locale: input.locale,
          view: "latest",
          rankingState: "available",
          methodology: {
            publicId: "paper-discovery",
            version: "1.0.0",
            kind: methodology.latest.kind,
            limitation: methodology.latest[input.locale],
          },
          dataCutoff: null,
          resultSet: {
            capturedCount: 0,
            limit: maximumSnapshotItems,
            truncated: false,
          },
          emptyState: "no_matches",
          nextCursor: null,
          items: [],
        }),
      };
    }
    const dataCutoff = new Date(
      Math.max(
        ...capturedRows.map(({ projection_cutoff }) =>
          projection_cutoff.getTime(),
        ),
      ),
    ).toISOString();
    await client.query(
      `insert into search_snapshots (
        id, request_key, ranking_state, data_cutoff, expires_at, total_count,
        truncated
      ) values (
        $1, $2, 'available', $3::timestamptz,
        $4::timestamptz + interval '24 hours', $5, $6
      )`,
      [
        snapshotId,
        requestKey,
        dataCutoff,
        snapshotCreatedAt,
        items.length,
        truncated,
      ],
    );
    await client.query(
      `insert into search_snapshot_items (snapshot_id, position, payload)
       select $1, (ordinality - 1)::integer, value
       from jsonb_array_elements($2::jsonb) with ordinality`,
      [snapshotId, JSON.stringify(items)],
    );
    await client.query("commit");
    return {
      status: "ok" as const,
      response: publicPaperListSchema.parse({
        locale: input.locale,
        view: "latest",
        rankingState: "available",
        methodology: {
          publicId: "paper-discovery",
          version: "1.0.0",
          kind: methodology.latest.kind,
          limitation: methodology.latest[input.locale],
        },
        dataCutoff,
        resultSet: {
          capturedCount: items.length,
          limit: maximumSnapshotItems,
          truncated,
        },
        emptyState: null,
        nextCursor:
          items.length > input.limit
            ? cursorFor(requestKey, snapshotId, dataCutoff, input.limit)
            : null,
        items: items.slice(0, input.limit),
      }),
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
};

export const listPublicPapers = async (input: PaperListRequest) => {
  if (input.view !== "latest") {
    const viewMethodology = methodology[input.view];
    return {
      status: "ok" as const,
      response: publicPaperListSchema.parse({
        locale: input.locale,
        view: input.view,
        rankingState:
          input.view === "trending" ? "insufficient_evidence" : "available",
        methodology: {
          publicId: "paper-discovery",
          version: "1.0.0",
          kind: viewMethodology.kind,
          limitation: viewMethodology[input.locale],
        },
        dataCutoff: null,
        resultSet: {
          capturedCount: 0,
          limit: maximumSnapshotItems,
          truncated: false,
        },
        emptyState:
          input.view === "trending"
            ? "insufficient_evidence"
            : "no_editorial_selections",
        nextCursor: null,
        items: [],
      }),
    };
  }
  const requestKey = requestKeyFor(input);
  const cursor = input.cursor ? decodePaperCursor(input.cursor) : null;
  if (input.cursor && (!cursor || cursor.requestKey !== requestKey)) {
    return { status: "invalid_cursor" as const };
  }
  return cursor
    ? readPaperSnapshotPage(input, requestKey, cursor)
    : createPaperSnapshotPage(input, requestKey);
};
