import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { PoolClient } from "pg";
import { database, databasePool } from "@/db/client";
import {
  entities,
  ownerOperationAudits,
  productObservations,
  productProfiles,
  productVendorReportedMetrics,
  relationEvidence,
  relations,
  sourceItems,
} from "@/db/schema";
import { getPublicEntity } from "@/entities/service";
import {
  type ProductListRequest,
  type ProductListCursor,
  type ProductObservationAppendRequest,
  type ProductProfileCreateRequest,
  type PublicProductDetail,
  type PublicProductListItem,
  productListCursorSchema,
  publicProductDetailSchema,
  publicProductListItemSchema,
  publicProductListSchema,
} from "./contracts";

const publicRights = [
  "open",
  "attribution_required",
  "source_license",
  "metadata_only",
  "link_only",
] as const;

export const createProductProfile = async (
  input: ProductProfileCreateRequest,
) =>
  database.transaction(async (transaction) => {
    const [product] = await transaction
      .select({
        id: entities.id,
        type: entities.type,
        lifecycleStatus: entities.lifecycleStatus,
        publicVisibility: entities.publicVisibility,
        lastVerifiedAt: entities.lastVerifiedAt,
      })
      .from(entities)
      .where(eq(entities.publicId, input.productPublicId));
    if (
      !product ||
      product.type !== "product" ||
      product.lifecycleStatus !== "active" ||
      !product.publicVisibility
    ) {
      return { status: "invalid_reference" as const };
    }
    const requestedSourcePublicIds = [
      ...new Set(
        input.observations.map(({ sourceItemPublicId }) => sourceItemPublicId),
      ),
    ];
    const evidence = await transaction
      .select({
        id: sourceItems.id,
        publicId: sourceItems.publicId,
        rightsStatus: sourceItems.rightsStatus,
      })
      .from(sourceItems)
      .where(
        and(
          inArray(sourceItems.publicId, requestedSourcePublicIds),
          eq(sourceItems.publicVisibility, true),
        ),
      );
    if (
      evidence.length !== requestedSourcePublicIds.length ||
      evidence.some(
        ({ rightsStatus }) => !publicRights.includes(rightsStatus as never),
      )
    ) {
      return { status: "invalid_reference" as const };
    }
    const evidenceByPublicId = new Map(
      evidence.map(({ id, publicId }) => [publicId, id]),
    );

    const [profile] = await transaction
      .insert(productProfiles)
      .values({
        entityId: product.id,
        category: input.category,
        platforms: input.platforms,
        audienceTypes: input.audienceTypes,
        publicVisibility: true,
      })
      .returning({ id: productProfiles.id });

    for (const observation of input.observations) {
      const [insertedObservation] = await transaction
        .insert(productObservations)
        .values({
          publicId: observation.publicId,
          productProfileId: profile.id,
          sourceItemId: evidenceByPublicId.get(observation.sourceItemPublicId)!,
          effectiveAt: new Date(observation.effectiveAt),
          observedAt: new Date(observation.observedAt),
          changeKind: observation.changeKind,
          lifecycleStatus: observation.lifecycleStatus,
          availabilityRegions: observation.availabilityRegions,
          pricingMode: observation.pricingMode,
          commercialRelationship: observation.commercialRelationship,
          commercialDisclosure: observation.commercialDisclosure,
          publicVisibility: true,
        })
        .returning({ id: productObservations.id });
      if (observation.vendorReportedMetrics.length > 0) {
        await transaction.insert(productVendorReportedMetrics).values(
          observation.vendorReportedMetrics.map((metric) => ({
            publicId: metric.publicId,
            productObservationId: insertedObservation.id,
            metric: metric.metric,
            value: metric.value,
            unit: metric.unit,
            periodEndedAt: new Date(metric.periodEndedAt),
            publicVisibility: true,
          })),
        );
      }
    }
    await transaction.insert(ownerOperationAudits).values({
      actorRole: "owner",
      action: "create_product_profile",
      targetType: "entity",
      targetPublicId: input.productPublicId,
      publicVisibility: true,
    });
    const latestVerification = new Date(
      Math.max(
        product.lastVerifiedAt.getTime(),
        ...input.observations.map(({ observedAt }) => Date.parse(observedAt)),
      ),
    );
    await transaction
      .update(entities)
      .set({ lastVerifiedAt: latestVerification })
      .where(eq(entities.id, product.id));
    return {
      status: "created" as const,
      productPublicId: input.productPublicId,
      publicVisibility: true,
      observationPublicIds: input.observations.map(({ publicId }) => publicId),
    };
  });

export const appendProductObservations = async (
  input: ProductObservationAppendRequest,
) =>
  database.transaction(async (transaction) => {
    const [product] = await transaction
      .select({
        id: entities.id,
        type: entities.type,
        lifecycleStatus: entities.lifecycleStatus,
        publicVisibility: entities.publicVisibility,
        lastVerifiedAt: entities.lastVerifiedAt,
        profileId: productProfiles.id,
        profileVisibility: productProfiles.publicVisibility,
      })
      .from(entities)
      .innerJoin(productProfiles, eq(productProfiles.entityId, entities.id))
      .where(eq(entities.publicId, input.productPublicId))
      .for("update");
    if (
      !product ||
      product.type !== "product" ||
      product.lifecycleStatus !== "active" ||
      !product.publicVisibility ||
      !product.profileVisibility
    ) {
      return { status: "invalid_reference" as const };
    }
    const [organizationRelation] = await transaction
      .select({ id: relations.id })
      .from(relations)
      .innerJoin(
        relationEvidence,
        eq(relationEvidence.relationId, relations.id),
      )
      .innerJoin(sourceItems, eq(sourceItems.id, relationEvidence.sourceItemId))
      .where(
        and(
          eq(relations.objectEntityId, product.id),
          eq(relations.predicate, "DEVELOPS"),
          eq(relations.reviewStatus, "reviewed"),
          eq(relations.publicVisibility, true),
          eq(sourceItems.publicVisibility, true),
        ),
      )
      .limit(1);
    if (!organizationRelation) {
      return { status: "invalid_reference" as const };
    }
    const requestedSourcePublicIds = [
      ...new Set(
        input.observations.map(({ sourceItemPublicId }) => sourceItemPublicId),
      ),
    ];
    const evidence = await transaction
      .select({
        id: sourceItems.id,
        publicId: sourceItems.publicId,
        rightsStatus: sourceItems.rightsStatus,
      })
      .from(sourceItems)
      .where(
        and(
          inArray(sourceItems.publicId, requestedSourcePublicIds),
          eq(sourceItems.publicVisibility, true),
        ),
      );
    if (
      evidence.length !== requestedSourcePublicIds.length ||
      evidence.some(
        ({ rightsStatus }) => !publicRights.includes(rightsStatus as never),
      )
    ) {
      return { status: "invalid_reference" as const };
    }
    const evidenceByPublicId = new Map(
      evidence.map(({ id, publicId }) => [publicId, id]),
    );
    for (const observation of input.observations) {
      const [insertedObservation] = await transaction
        .insert(productObservations)
        .values({
          publicId: observation.publicId,
          productProfileId: product.profileId,
          sourceItemId: evidenceByPublicId.get(observation.sourceItemPublicId)!,
          effectiveAt: new Date(observation.effectiveAt),
          observedAt: new Date(observation.observedAt),
          changeKind: observation.changeKind,
          lifecycleStatus: observation.lifecycleStatus,
          availabilityRegions: observation.availabilityRegions,
          pricingMode: observation.pricingMode,
          commercialRelationship: observation.commercialRelationship,
          commercialDisclosure: observation.commercialDisclosure,
          publicVisibility: true,
        })
        .returning({ id: productObservations.id });
      if (observation.vendorReportedMetrics.length > 0) {
        await transaction.insert(productVendorReportedMetrics).values(
          observation.vendorReportedMetrics.map((metric) => ({
            publicId: metric.publicId,
            productObservationId: insertedObservation.id,
            metric: metric.metric,
            value: metric.value,
            unit: metric.unit,
            periodEndedAt: new Date(metric.periodEndedAt),
            publicVisibility: true,
          })),
        );
      }
    }
    const latestVerification = new Date(
      Math.max(
        product.lastVerifiedAt.getTime(),
        ...input.observations.map(({ observedAt }) => Date.parse(observedAt)),
      ),
    );
    await transaction
      .update(entities)
      .set({ lastVerifiedAt: latestVerification })
      .where(eq(entities.id, product.id));
    await transaction
      .update(productProfiles)
      .set({ updatedAt: latestVerification })
      .where(eq(productProfiles.id, product.profileId));
    await transaction.insert(ownerOperationAudits).values({
      actorRole: "owner",
      action: "append_product_observations",
      targetType: "entity",
      targetPublicId: input.productPublicId,
      publicVisibility: true,
    });
    return {
      status: "created" as const,
      productPublicId: input.productPublicId,
      publicVisibility: true,
      observationPublicIds: input.observations.map(({ publicId }) => publicId),
    };
  });

type ObservationRow = {
  id: string;
  public_id: string;
  effective_at: Date;
  observed_at: Date;
  change_kind:
    "launch" | "product_update" | "pricing_change" | "availability_change";
  lifecycle_status: "beta" | "active" | "deprecated" | "discontinued";
  availability_regions: string[];
  pricing_mode:
    | "free"
    | "freemium"
    | "subscription"
    | "usage_based"
    | "contact_sales"
    | "open_source";
  commercial_relationship:
    "none_disclosed" | "vendor_submitted" | "affiliate" | "sponsored";
  commercial_disclosure: string | null;
  source_item_public_id: string;
  source_title: string;
  source_url: string;
  source_verified_at: Date;
};

type MetricRow = {
  product_observation_id: string;
  public_id: string;
  metric: "users" | "revenue" | "adoption" | "downloads";
  value: string;
  unit: string;
  period_ended_at: Date;
};

type ProductListRow = {
  public_id: string;
  name: string;
  summary: string;
  official_url: string;
  category: string;
  platforms: string[];
  audience_types: string[];
  organization_relation_public_id: string;
  organization_public_id: string;
  organization_name: string;
  observation_id: string;
  observation_public_id: string;
  effective_at: Date;
  observed_at: Date;
  change_kind: ObservationRow["change_kind"];
  lifecycle_status: ObservationRow["lifecycle_status"];
  availability_regions: string[];
  pricing_mode: ObservationRow["pricing_mode"];
  commercial_relationship: ObservationRow["commercial_relationship"];
  commercial_disclosure: string | null;
  source_item_public_id: string;
  source_title: string;
  source_url: string;
  data_cutoff: Date;
};

export const getPublicProduct = async (
  publicId: string,
  locale: "en" | "zh",
) => {
  const familyResult = await databasePool.query<{
    id: string;
    public_id: string;
    name: string;
    summary: string;
    official_url: string;
    category: string;
    platforms: string[];
    audience_types: string[];
    last_verified_at: Date;
  }>(
    `select product.id, product.public_id, localization.name,
       localization.summary, product.official_url, profile.category,
       profile.platforms, profile.audience_types, product.last_verified_at
     from entities product
     join product_profiles profile on profile.entity_id = product.id
       and profile.public_visibility = true
     join entity_localized_contents localization
       on localization.entity_id = product.id
       and localization.locale = $2::content_locale
       and localization.review_status = 'reviewed'
       and localization.public_visibility = true
     where product.public_id = $1 and product.type = 'product'
       and product.lifecycle_status = 'active'
       and product.public_visibility = true`,
    [publicId, locale],
  );
  const family = familyResult.rows[0];
  if (!family) return null;

  const observationsResult = await databasePool.query<ObservationRow>(
    `select observation.id, observation.public_id, observation.effective_at,
       observation.observed_at,
       observation.change_kind::text, observation.lifecycle_status::text,
       observation.availability_regions, observation.pricing_mode::text,
       observation.commercial_relationship::text,
       observation.commercial_disclosure,
       source_item.public_id as source_item_public_id,
       source_item.original_title as source_title,
       source_item.original_url as source_url,
       source_item.rights_checked_at as source_verified_at
     from product_observations observation
     join product_profiles profile on profile.id = observation.product_profile_id
     join source_items source_item on source_item.id = observation.source_item_id
     where profile.entity_id = $1 and observation.public_visibility = true
       and source_item.public_visibility = true
       and source_item.rights_status in (
         'open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'
       )
     order by observation.effective_at, observation.observed_at,
       observation.public_id`,
    [family.id],
  );
  if (observationsResult.rows.length === 0) return null;
  const observationIds = observationsResult.rows.map(({ id }) => id);
  const metricsResult = await databasePool.query<MetricRow>(
    `select metric.product_observation_id, metric.public_id,
       metric.metric::text, metric.value::text, metric.unit,
       metric.period_ended_at
     from product_vendor_reported_metrics metric
     where metric.product_observation_id = any($1::uuid[])
       and metric.public_visibility = true
     order by metric.public_id`,
    [observationIds],
  );
  const metricsByObservation = new Map<string, MetricRow[]>();
  for (const metric of metricsResult.rows) {
    const metrics =
      metricsByObservation.get(metric.product_observation_id) ?? [];
    metrics.push(metric);
    metricsByObservation.set(metric.product_observation_id, metrics);
  }
  const observations = observationsResult.rows.map((observation) => ({
    publicId: observation.public_id,
    effectiveAt: observation.effective_at.toISOString(),
    observedAt: observation.observed_at.toISOString(),
    changeKind: observation.change_kind,
    lifecycleStatus: observation.lifecycle_status,
    availabilityRegions: observation.availability_regions,
    pricingMode: observation.pricing_mode,
    commercialRelationship: observation.commercial_relationship,
    commercialDisclosure: observation.commercial_disclosure,
    vendorReportedMetrics: (metricsByObservation.get(observation.id) ?? []).map(
      (metric) => ({
        publicId: metric.public_id,
        metric: metric.metric,
        value: metric.value.replace(/\.0+$/, ""),
        unit: metric.unit,
        periodEndedAt: metric.period_ended_at.toISOString(),
        provenance: "vendor_self_reported" as const,
      }),
    ),
    source: {
      sourceItemPublicId: observation.source_item_public_id,
      title: observation.source_title,
      url: observation.source_url,
    },
  }));
  const observationCutoff = Math.max(
    ...observationsResult.rows.map(({ observed_at }) => observed_at.getTime()),
  );
  const current = observations
    .filter(({ effectiveAt }) => Date.parse(effectiveAt) <= observationCutoff)
    .at(-1);
  if (!current) return null;

  const genericEntity = await getPublicEntity(publicId, locale);
  if (!genericEntity || genericEntity.type !== "product") return null;
  const relationEndpoints = [
    ...genericEntity.outgoingRelations.map((relation) => ({
      relation,
      endpoint: relation.object,
      direction: "outgoing" as const,
    })),
    ...genericEntity.backlinks.map((relation) => ({
      relation,
      endpoint: relation.subject,
      direction: "incoming" as const,
    })),
  ].filter(
    ({ endpoint }) =>
      endpoint.type === "entity" && endpoint.publicId !== publicId,
  );
  const relatedPublicIds = relationEndpoints.map(
    ({ endpoint }) => endpoint.publicId,
  );
  const relatedRows: Array<{
    public_id: string;
    type: PublicProductDetail["relatedEntities"][number]["type"];
    name: string;
  }> =
    relatedPublicIds.length === 0
      ? []
      : (
          await databasePool.query<{
            public_id: string;
            type: PublicProductDetail["relatedEntities"][number]["type"];
            name: string;
          }>(
            `select entity.public_id, entity.type::text, localization.name
           from entities entity
           join entity_localized_contents localization
             on localization.entity_id = entity.id
             and localization.locale = $2::content_locale
             and localization.review_status = 'reviewed'
             and localization.public_visibility = true
           where entity.public_id = any($1::text[])
             and entity.lifecycle_status = 'active'
             and entity.public_visibility = true`,
            [relatedPublicIds, locale],
          )
        ).rows;
  const relatedByPublicId = new Map(
    relatedRows.map((related) => [related.public_id, related]),
  );
  const relatedEntities: PublicProductDetail["relatedEntities"] =
    relationEndpoints.flatMap(({ relation, endpoint, direction }) => {
      const related = relatedByPublicId.get(endpoint.publicId);
      return related
        ? [
            {
              relationPublicId: relation.publicId,
              publicId: related.public_id,
              name: related.name,
              type: related.type,
              predicate: relation.predicate,
              direction,
              viaEventPublicId: null,
            },
          ]
        : [];
    });
  const eventRelatedResult =
    genericEntity.timeline.length === 0
      ? { rows: [] }
      : await databasePool.query<{
          relation_public_id: string;
          public_id: string;
          type: PublicProductDetail["relatedEntities"][number]["type"];
          name: string;
          predicate: string;
          event_public_id: string;
          last_verified_at: Date;
        }>(
          `select relation.public_id as relation_public_id,
             related.public_id, related.type::text, localization.name,
             relation.predicate::text, event.public_id as event_public_id,
             relation.last_verified_at
           from relations relation
           join events event on event.id = relation.subject_event_id
             and event.publication_state in ('published', 'corrected')
             and event.public_visibility = true
           join entities related on related.id = relation.object_entity_id
             and related.id <> $1 and related.lifecycle_status = 'active'
             and related.public_visibility = true
           join entity_localized_contents localization
             on localization.entity_id = related.id
             and localization.locale = $3::content_locale
             and localization.review_status = 'reviewed'
             and localization.public_visibility = true
           where event.public_id = any($2::text[])
             and relation.review_status = 'reviewed'
             and relation.public_visibility = true
             and exists (
               select 1 from relation_evidence evidence
               join source_items source_item on source_item.id = evidence.source_item_id
               where evidence.relation_id = relation.id
                 and source_item.public_visibility = true
                 and source_item.rights_status in (
                   'open', 'attribution_required', 'source_license',
                   'metadata_only', 'link_only'
                 )
             )
           order by event.occurred_at desc, related.public_id`,
          [
            family.id,
            genericEntity.timeline.map(({ eventPublicId }) => eventPublicId),
            locale,
          ],
        );
  const directRelatedPublicIds = new Set(
    relatedEntities.map(({ publicId: relatedPublicId }) => relatedPublicId),
  );
  relatedEntities.push(
    ...eventRelatedResult.rows
      .filter(({ public_id: relatedPublicId }) =>
        directRelatedPublicIds.has(relatedPublicId) ? false : true,
      )
      .map((related) => ({
        relationPublicId: related.relation_public_id,
        publicId: related.public_id,
        name: related.name,
        type: related.type,
        predicate: related.predicate,
        direction: "via_event" as const,
        viaEventPublicId: related.event_public_id,
      })),
  );
  const organizationRelation = relatedEntities.find(
    ({ direction, predicate, type }) =>
      direction === "incoming" &&
      predicate === "DEVELOPS" &&
      type === "organization",
  );
  const organization = organizationRelation
    ? {
        relationPublicId: organizationRelation.relationPublicId,
        publicId: organizationRelation.publicId,
        name: organizationRelation.name,
      }
    : null;
  if (!organization) return null;
  const timeline = [
    ...observations.map((observation) => ({
      type: "product_observation" as const,
      observationPublicId: observation.publicId,
      occurredAt: observation.effectiveAt,
      observedAt: observation.observedAt,
      changeKind: observation.changeKind,
      lifecycleStatus: observation.lifecycleStatus,
      availabilityRegions: observation.availabilityRegions,
      pricingMode: observation.pricingMode,
      commercialRelationship: observation.commercialRelationship,
      commercialDisclosure: observation.commercialDisclosure,
      vendorReportedMetrics: observation.vendorReportedMetrics,
      title: observation.source.title,
      source: observation.source,
    })),
    ...genericEntity.timeline.map((event) => ({
      type: "event" as const,
      eventPublicId: event.eventPublicId,
      occurredAt: event.occurredAt,
      predicate: event.predicate,
      title: event.title,
    })),
  ].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  const dataCutoff = new Date(
    Math.max(
      family.last_verified_at.getTime(),
      ...observationsResult.rows.flatMap((observation) => [
        observation.observed_at.getTime(),
        observation.source_verified_at.getTime(),
      ]),
      ...genericEntity.outgoingRelations.map(({ lastVerifiedAt }) =>
        Date.parse(lastVerifiedAt),
      ),
      ...genericEntity.backlinks.map(({ lastVerifiedAt }) =>
        Date.parse(lastVerifiedAt),
      ),
      ...eventRelatedResult.rows.map(({ last_verified_at }) =>
        last_verified_at.getTime(),
      ),
    ),
  );

  return publicProductDetailSchema.parse({
    publicId: family.public_id,
    name: family.name,
    summary: family.summary,
    officialUrl: family.official_url,
    category: family.category,
    platforms: family.platforms,
    audienceTypes: family.audience_types,
    organization,
    current,
    observations,
    relatedEntities,
    timeline,
    lastVerifiedAt: family.last_verified_at.toISOString(),
    dataCutoff: dataCutoff.toISOString(),
  });
};

const maximumSnapshotItems = 1000;

const productMethodologyLimitation = {
  en: "Products are ordered by their latest sourced update. AI Radar does not publish a universal Product score.",
  zh: "产品按最新的有来源更新排序。AI Radar 不发布通用产品总分。",
} as const;

const productRequestKey = (input: ProductListRequest) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        locale: input.locale,
        category: input.category ?? null,
        platform: input.platform ?? null,
        audience: input.audience ?? null,
        region: input.region ?? null,
        pricingMode: input.pricingMode ?? null,
        lifecycle: input.lifecycle ?? null,
        updatedFrom: input.updatedFrom ?? null,
        updatedTo: input.updatedTo ?? null,
      }),
    )
    .digest("hex");

const encodeProductCursor = (cursor: ProductListCursor) =>
  Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");

const decodeProductCursor = (value: string): ProductListCursor | null => {
  try {
    return productListCursorSchema.parse(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8")),
    );
  } catch {
    return null;
  }
};

const distributableSnapshotProducts = async (
  client: PoolClient,
  items: PublicProductListItem[],
  locale: "en" | "zh",
) => {
  if (items.length === 0) return new Set<string>();
  const pairs = items.map((item) => ({
    product_public_id: item.publicId,
    observation_public_id: item.current.publicId,
    organization_public_id: item.organization.publicId,
    organization_relation_public_id: item.organization.relationPublicId,
  }));
  const result = await client.query<{ public_id: string }>(
    `select product.public_id
     from jsonb_to_recordset($1::jsonb)
       as requested(
         product_public_id text, observation_public_id text,
         organization_public_id text, organization_relation_public_id text
       )
     join entities product on product.public_id = requested.product_public_id
       and product.type = 'product' and product.lifecycle_status = 'active'
       and product.public_visibility = true
     join entity_localized_contents localization
       on localization.entity_id = product.id
       and localization.locale = $2::content_locale
       and localization.review_status = 'reviewed'
       and localization.public_visibility = true
     join product_profiles profile on profile.entity_id = product.id
       and profile.public_visibility = true
     join product_observations observation
       on observation.product_profile_id = profile.id
       and observation.public_id = requested.observation_public_id
       and observation.public_visibility = true
     join source_items source_item on source_item.id = observation.source_item_id
       and source_item.public_visibility = true
       and source_item.rights_status in (
         'open', 'attribution_required', 'source_license', 'metadata_only', 'link_only'
       )
     join entities organization
       on organization.public_id = requested.organization_public_id
       and organization.type = 'organization'
       and organization.lifecycle_status = 'active'
       and organization.public_visibility = true
     join entity_localized_contents organization_localization
       on organization_localization.entity_id = organization.id
       and organization_localization.locale = $2::content_locale
       and organization_localization.review_status = 'reviewed'
       and organization_localization.public_visibility = true
     join relations ownership
       on ownership.public_id = requested.organization_relation_public_id
       and ownership.subject_entity_id = organization.id
       and ownership.object_entity_id = product.id
       and ownership.predicate = 'DEVELOPS'
       and ownership.review_status = 'reviewed'
       and ownership.public_visibility = true
     where exists (
       select 1 from relation_evidence evidence
       join source_items ownership_source
         on ownership_source.id = evidence.source_item_id
       where evidence.relation_id = ownership.id
         and ownership_source.public_visibility = true
         and ownership_source.rights_status in (
           'open', 'attribution_required', 'source_license',
           'metadata_only', 'link_only'
         )
     )`,
    [JSON.stringify(pairs), locale],
  );
  return new Set(result.rows.map(({ public_id }) => public_id));
};

const readProductSnapshotPage = async (
  input: ProductListRequest,
  requestKey: string,
  cursor: ProductListCursor,
) => {
  const client = await databasePool.connect();
  try {
    await client.query("begin isolation level repeatable read read only");
    const snapshot = await client.query<{
      total_count: number;
      truncated: boolean;
    }>(
      `select total_count, truncated
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
      `select payload from search_snapshot_items
       where snapshot_id = $1 and position >= $2 and position < $3
       order by position`,
      [cursor.snapshotId, cursor.offset, cursor.offset + input.limit],
    );
    const storedItems = page.rows.map(({ payload }) =>
      publicProductListItemSchema.parse(payload),
    );
    const distributable = await distributableSnapshotProducts(
      client,
      storedItems,
      input.locale,
    );
    const items = storedItems.filter(({ publicId }) =>
      distributable.has(publicId),
    );
    const nextOffset = cursor.offset + storedItems.length;
    await client.query("commit");
    return {
      status: "ok" as const,
      response: publicProductListSchema.parse({
        locale: input.locale,
        methodology: {
          publicId: "product-latest-observation",
          version: "1.0.0",
          kind: "chronological_update",
          limitation: productMethodologyLimitation[input.locale],
        },
        items,
        dataCutoff: cursor.dataCutoff,
        resultSet: {
          capturedCount: metadata.total_count,
          limit: maximumSnapshotItems,
          truncated: metadata.truncated,
        },
        nextCursor:
          nextOffset < metadata.total_count
            ? encodeProductCursor({ ...cursor, offset: nextOffset })
            : null,
      }),
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
};

const createProductSnapshotPage = async (
  input: ProductListRequest,
  requestKey: string,
) => {
  const productRows = await databasePool.query<ProductListRow>(
    `select product.public_id, localization.name, localization.summary,
       product.official_url, profile.category, profile.platforms,
       profile.audience_types,
       organization.relation_public_id as organization_relation_public_id,
       organization.public_id as organization_public_id,
       organization.name as organization_name,
       current.id as observation_id,
       current.public_id as observation_public_id,
       current.effective_at, current.observed_at, current.change_kind,
       current.lifecycle_status, current.availability_regions,
       current.pricing_mode, current.commercial_relationship,
       current.commercial_disclosure, current.source_item_public_id,
       current.source_title, current.source_url,
       greatest(
         product.last_verified_at, organization.last_verified_at,
         current.observed_at, current.source_verified_at
       ) as data_cutoff
     from entities product
     join product_profiles profile on profile.entity_id = product.id
       and profile.public_visibility = true
     join entity_localized_contents localization
       on localization.entity_id = product.id
       and localization.locale = $9::content_locale
       and localization.review_status = 'reviewed'
       and localization.public_visibility = true
     join lateral (
       select observation.id, observation.public_id,
         observation.effective_at, observation.observed_at,
         observation.change_kind::text,
         observation.lifecycle_status::text,
         observation.availability_regions, observation.pricing_mode::text,
         observation.commercial_relationship::text,
         observation.commercial_disclosure,
         source_item.public_id as source_item_public_id,
         source_item.original_title as source_title,
         source_item.original_url as source_url,
         source_item.rights_checked_at as source_verified_at
       from product_observations observation
       join source_items source_item on source_item.id = observation.source_item_id
         and source_item.public_visibility = true
         and source_item.rights_status in (
           'open', 'attribution_required', 'source_license',
           'metadata_only', 'link_only'
       )
       where observation.product_profile_id = profile.id
         and observation.public_visibility = true
         and observation.effective_at <= (
           select max(cutoff_observation.observed_at)
           from product_observations cutoff_observation
           join source_items cutoff_source
             on cutoff_source.id = cutoff_observation.source_item_id
             and cutoff_source.public_visibility = true
             and cutoff_source.rights_status in (
               'open', 'attribution_required', 'source_license',
               'metadata_only', 'link_only'
             )
           where cutoff_observation.product_profile_id = profile.id
             and cutoff_observation.public_visibility = true
         )
       order by observation.effective_at desc, observation.observed_at desc,
         observation.public_id desc
       limit 1
     ) current on true
     join lateral (
       select ownership.public_id as relation_public_id,
         organization_entity.public_id,
         organization_localization.name,
         greatest(
           ownership.last_verified_at,
           organization_entity.last_verified_at
         ) as last_verified_at
       from relations ownership
       join entities organization_entity
         on organization_entity.id = ownership.subject_entity_id
         and organization_entity.type = 'organization'
         and organization_entity.lifecycle_status = 'active'
         and organization_entity.public_visibility = true
       join entity_localized_contents organization_localization
         on organization_localization.entity_id = organization_entity.id
         and organization_localization.locale = $9::content_locale
         and organization_localization.review_status = 'reviewed'
         and organization_localization.public_visibility = true
       where ownership.object_entity_id = product.id
         and ownership.predicate = 'DEVELOPS'
         and ownership.review_status = 'reviewed'
         and ownership.public_visibility = true
         and exists (
           select 1 from relation_evidence evidence
           join source_items ownership_source
             on ownership_source.id = evidence.source_item_id
           where evidence.relation_id = ownership.id
             and ownership_source.public_visibility = true
             and ownership_source.rights_status in (
               'open', 'attribution_required', 'source_license',
               'metadata_only', 'link_only'
             )
         )
       order by ownership.public_id
       limit 1
     ) organization on true
     where product.type = 'product' and product.lifecycle_status = 'active'
       and product.public_visibility = true
       and ($1::text is null or profile.category = $1)
       and ($2::text is null or $2 = any(profile.platforms))
       and ($3::text is null or $3 = any(profile.audience_types))
       and ($4::text is null or $4 = any(current.availability_regions))
       and ($5::text is null or current.pricing_mode = $5)
       and ($6::text is null or current.lifecycle_status = $6)
       and ($7::timestamptz is null or current.effective_at >= $7)
       and ($8::timestamptz is null or current.effective_at <= $8)
     order by current.effective_at desc, product.public_id
     limit $10`,
    [
      input.category ?? null,
      input.platform ?? null,
      input.audience ?? null,
      input.region ?? null,
      input.pricingMode ?? null,
      input.lifecycle ?? null,
      input.updatedFrom ?? null,
      input.updatedTo ?? null,
      input.locale,
      maximumSnapshotItems + 1,
    ],
  );
  const captured = productRows.rows.slice(0, maximumSnapshotItems);
  const truncated = productRows.rows.length > maximumSnapshotItems;
  if (captured.length === 0) {
    return {
      status: "ok" as const,
      response: publicProductListSchema.parse({
        locale: input.locale,
        methodology: {
          publicId: "product-latest-observation",
          version: "1.0.0",
          kind: "chronological_update",
          limitation: productMethodologyLimitation[input.locale],
        },
        items: [],
        dataCutoff: null,
        resultSet: {
          capturedCount: 0,
          limit: maximumSnapshotItems,
          truncated: false,
        },
        nextCursor: null,
      }),
    };
  }
  const metricsResult = await databasePool.query<MetricRow>(
    `select metric.product_observation_id, metric.public_id,
       metric.metric::text, metric.value::text, metric.unit,
       metric.period_ended_at
     from product_vendor_reported_metrics metric
     where metric.product_observation_id = any($1::uuid[])
       and metric.public_visibility = true
     order by metric.public_id`,
    [captured.map(({ observation_id }) => observation_id)],
  );
  const metricsByObservation = new Map<string, MetricRow[]>();
  for (const metric of metricsResult.rows) {
    const metrics =
      metricsByObservation.get(metric.product_observation_id) ?? [];
    metrics.push(metric);
    metricsByObservation.set(metric.product_observation_id, metrics);
  }
  const items = captured.map((product) =>
    publicProductListItemSchema.parse({
      publicId: product.public_id,
      name: product.name,
      summary: product.summary,
      officialUrl: product.official_url,
      category: product.category,
      platforms: product.platforms,
      audienceTypes: product.audience_types,
      organization: {
        relationPublicId: product.organization_relation_public_id,
        publicId: product.organization_public_id,
        name: product.organization_name,
      },
      current: {
        publicId: product.observation_public_id,
        effectiveAt: product.effective_at.toISOString(),
        observedAt: product.observed_at.toISOString(),
        changeKind: product.change_kind,
        lifecycleStatus: product.lifecycle_status,
        availabilityRegions: product.availability_regions,
        pricingMode: product.pricing_mode,
        commercialRelationship: product.commercial_relationship,
        commercialDisclosure: product.commercial_disclosure,
        vendorReportedMetrics: (
          metricsByObservation.get(product.observation_id) ?? []
        ).map((metric) => ({
          publicId: metric.public_id,
          metric: metric.metric,
          value: metric.value.replace(/\.0+$/, ""),
          unit: metric.unit,
          periodEndedAt: metric.period_ended_at.toISOString(),
          provenance: "vendor_self_reported",
        })),
        source: {
          sourceItemPublicId: product.source_item_public_id,
          title: product.source_title,
          url: product.source_url,
        },
      },
    }),
  );
  const dataCutoff = new Date(
    Math.max(...captured.map(({ data_cutoff }) => data_cutoff.getTime())),
  ).toISOString();
  const snapshotId = randomUUID();
  const client = await databasePool.connect();
  try {
    await client.query("begin");
    await client.query(
      "delete from search_snapshots where expires_at <= clock_timestamp()",
    );
    await client.query(
      `insert into search_snapshots (
        id, request_key, ranking_state, data_cutoff, expires_at, total_count,
        truncated
      ) values (
        $1, $2, 'available', $3::timestamptz,
        clock_timestamp() + interval '24 hours', $4, $5
      )`,
      [snapshotId, requestKey, dataCutoff, items.length, truncated],
    );
    await client.query(
      `insert into search_snapshot_items (snapshot_id, position, payload)
       select $1, (ordinality - 1)::integer, value
       from jsonb_array_elements($2::jsonb) with ordinality`,
      [snapshotId, JSON.stringify(items)],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  return {
    status: "ok" as const,
    response: publicProductListSchema.parse({
      locale: input.locale,
      methodology: {
        publicId: "product-latest-observation",
        version: "1.0.0",
        kind: "chronological_update",
        limitation: productMethodologyLimitation[input.locale],
      },
      items: items.slice(0, input.limit),
      dataCutoff,
      resultSet: {
        capturedCount: items.length,
        limit: maximumSnapshotItems,
        truncated,
      },
      nextCursor:
        items.length > input.limit
          ? encodeProductCursor({
              version: 1,
              requestKey,
              dataCutoff,
              snapshotId,
              offset: input.limit,
            })
          : null,
    }),
  };
};

export const listPublicProducts = async (input: ProductListRequest) => {
  const requestKey = productRequestKey(input);
  if (!input.cursor) return createProductSnapshotPage(input, requestKey);
  const cursor = decodeProductCursor(input.cursor);
  if (!cursor || cursor.requestKey !== requestKey) {
    return { status: "invalid_cursor" as const };
  }
  return readProductSnapshotPage(input, requestKey, cursor);
};
