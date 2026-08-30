import Link from "next/link";
import { notFound } from "next/navigation";
import { localeSchema } from "@/events/contracts";
import { getPublicProduct } from "@/products/service";

const copy = {
  en: {
    organization: "Organization",
    category: "Category",
    platforms: "Platforms",
    audience: "Audience",
    lifecycle: "Lifecycle",
    availability: "Availability",
    pricing: "Pricing mode",
    commercialRelationship: "Commercial relationship",
    disclosure: "Commercial disclosure",
    noDisclosure: "No commercial relationship disclosed",
    vendorMetric: "Vendor self-reported",
    evidence: "Source evidence",
    related: "Related Models, Repositories, Prompts, Skills and Guides",
    timeline: "Pricing and update timeline",
    effective: "Effective time",
    observed: "AI Radar observed",
    change: "Change",
    cutoff: "Data cutoff",
    verified: "Last verified",
  },
  zh: {
    organization: "开发组织",
    category: "类别",
    platforms: "平台",
    audience: "用户类型",
    lifecycle: "生命周期",
    availability: "可用地区",
    pricing: "价格模式",
    commercialRelationship: "商业关系",
    disclosure: "商业关系披露",
    noDisclosure: "未披露商业关系",
    vendorMetric: "厂商自报",
    evidence: "来源证据",
    related: "相关模型、仓库、提示词、Skill 与指南",
    timeline: "价格与更新时间线",
    effective: "事实生效时间",
    observed: "AI Radar 收录时间",
    change: "变更类型",
    cutoff: "数据截止时间",
    verified: "最后核验",
  },
} as const;

const valueCopy = {
  en: {
    developer_tool: "Developer tool",
    web: "Web",
    api: "API",
    developers: "Developers",
    researchers: "Researchers",
    global: "Global",
    free: "Free",
    freemium: "Freemium",
    subscription: "Subscription",
    usage_based: "Usage based",
    contact_sales: "Contact sales",
    open_source: "Open source",
    beta: "Beta",
    active: "Active",
    deprecated: "Deprecated",
    discontinued: "Discontinued",
    launch: "Launch",
    product_update: "Product update",
    pricing_change: "Pricing change",
    availability_change: "Availability change",
    users: "Users",
    revenue: "Revenue",
    adoption: "Adoption",
    downloads: "Downloads",
    none_disclosed: "None disclosed",
    vendor_submitted: "Vendor submitted",
    affiliate: "Affiliate",
    sponsored: "Sponsored",
  },
  zh: {
    developer_tool: "开发者工具",
    web: "网页",
    api: "API",
    developers: "开发者",
    researchers: "研究人员",
    global: "全球",
    free: "免费",
    freemium: "免费增值",
    subscription: "订阅",
    usage_based: "按量计费",
    contact_sales: "联系销售",
    open_source: "开源",
    beta: "测试版",
    active: "活跃",
    deprecated: "已弃用",
    discontinued: "已停止",
    launch: "产品发布",
    product_update: "产品更新",
    pricing_change: "价格变化",
    availability_change: "可用地区变化",
    users: "用户数",
    revenue: "收入",
    adoption: "采用量",
    downloads: "下载量",
    none_disclosed: "未披露",
    vendor_submitted: "厂商提交",
    affiliate: "联盟营销",
    sponsored: "赞助",
  },
} as const;

const localizedValue = (locale: "en" | "zh", value: string) =>
  valueCopy[locale][value as keyof (typeof valueCopy)["en"]] ?? value;

export const dynamic = "force-dynamic";

export default async function ProductPage({
  params,
}: {
  params: Promise<{ locale: string; publicId: string }>;
}) {
  const resolved = await params;
  const locale = localeSchema.safeParse(resolved.locale);
  if (!locale.success) notFound();
  const product = await getPublicProduct(resolved.publicId, locale.data);
  if (!product) notFound();
  const labels = copy[locale.data];
  return (
    <main lang={locale.data}>
      <h1>{product.name}</h1>
      <p>{product.summary}</p>
      <p>
        <a href={product.officialUrl}>{product.name}</a>
      </p>
      <dl>
        <dt>{labels.organization}</dt>
        <dd>{product.organization.name}</dd>
        <dt>{labels.category}</dt>
        <dd>{localizedValue(locale.data, product.category)}</dd>
        <dt>{labels.platforms}</dt>
        <dd>
          {product.platforms
            .map((value) => localizedValue(locale.data, value))
            .join(", ")}
        </dd>
        <dt>{labels.audience}</dt>
        <dd>
          {product.audienceTypes
            .map((value) => localizedValue(locale.data, value))
            .join(", ")}
        </dd>
        <dt>{labels.lifecycle}</dt>
        <dd>{localizedValue(locale.data, product.current.lifecycleStatus)}</dd>
        <dt>{labels.availability}</dt>
        <dd>
          {product.current.availabilityRegions
            .map((value) => localizedValue(locale.data, value))
            .join(", ")}
        </dd>
        <dt>{labels.pricing}</dt>
        <dd>{localizedValue(locale.data, product.current.pricingMode)}</dd>
        <dt>{labels.disclosure}</dt>
        <dd>{product.current.commercialDisclosure ?? labels.noDisclosure}</dd>
      </dl>
      {product.current.vendorReportedMetrics.map((metric) => (
        <article key={metric.publicId}>
          <h2>{labels.vendorMetric}</h2>
          <p>
            {localizedValue(locale.data, metric.metric)}: {metric.value}{" "}
            {metric.unit}
          </p>
          <time dateTime={metric.periodEndedAt}>{metric.periodEndedAt}</time>
        </article>
      ))}
      <p>
        <a href={product.current.source.url}>
          {labels.evidence}: {product.current.source.title}
        </a>
      </p>
      <h2>{labels.related}</h2>
      <ul>
        {product.relatedEntities.map((related) => (
          <li key={related.relationPublicId}>
            <Link href={`/${locale.data}/entities/${related.publicId}`}>
              {related.name}
            </Link>{" "}
            · {related.predicate}
          </li>
        ))}
      </ul>
      <h2>{labels.timeline}</h2>
      <ol>
        {product.timeline.map((entry) => (
          <li
            key={
              entry.type === "event"
                ? entry.eventPublicId
                : entry.observationPublicId
            }
          >
            {entry.type === "event" ? (
              <Link
                href={`/${locale.data}/radar/events/${entry.eventPublicId}`}
              >
                {entry.title}
              </Link>
            ) : (
              <>
                <a href={entry.source.url}>{entry.title}</a>
                <dl>
                  <dt>{labels.change}</dt>
                  <dd>{localizedValue(locale.data, entry.changeKind)}</dd>
                  <dt>{labels.pricing}</dt>
                  <dd>{localizedValue(locale.data, entry.pricingMode)}</dd>
                  <dt>{labels.lifecycle}</dt>
                  <dd>{localizedValue(locale.data, entry.lifecycleStatus)}</dd>
                  <dt>{labels.availability}</dt>
                  <dd>
                    {entry.availabilityRegions
                      .map((value) => localizedValue(locale.data, value))
                      .join(", ")}
                  </dd>
                  <dt>{labels.commercialRelationship}</dt>
                  <dd>
                    {localizedValue(locale.data, entry.commercialRelationship)}
                  </dd>
                  <dt>{labels.disclosure}</dt>
                  <dd>{entry.commercialDisclosure ?? labels.noDisclosure}</dd>
                  {entry.vendorReportedMetrics.length > 0 ? (
                    <>
                      <dt>{labels.vendorMetric}</dt>
                      <dd>
                        <ul>
                          {entry.vendorReportedMetrics.map((metric) => (
                            <li key={metric.publicId}>
                              {localizedValue(locale.data, metric.metric)}:{" "}
                              {metric.value} {metric.unit} ·{" "}
                              {metric.periodEndedAt}
                            </li>
                          ))}
                        </ul>
                      </dd>
                    </>
                  ) : null}
                  <dt>{labels.effective}</dt>
                  <dd>
                    <time dateTime={entry.occurredAt}>{entry.occurredAt}</time>
                  </dd>
                  <dt>{labels.observed}</dt>
                  <dd>
                    <time dateTime={entry.observedAt}>{entry.observedAt}</time>
                  </dd>
                </dl>
              </>
            )}{" "}
            {entry.type === "event" ? (
              <time dateTime={entry.occurredAt}>{entry.occurredAt}</time>
            ) : null}
          </li>
        ))}
      </ol>
      <p>
        {labels.verified}:{" "}
        <time dateTime={product.lastVerifiedAt}>{product.lastVerifiedAt}</time>
      </p>
      <p>
        {labels.cutoff}:{" "}
        <time dateTime={product.dataCutoff}>{product.dataCutoff}</time>
      </p>
    </main>
  );
}
