import Link from "next/link";
import { notFound } from "next/navigation";
import { localeSchema } from "@/events/contracts";
import { productListRequestSchema } from "@/products/contracts";
import { listPublicProducts } from "@/products/service";

const copy = {
  en: {
    heading: "Products",
    filters: "Product filters",
    category: "Category",
    platform: "Platform",
    audience: "Audience",
    region: "Region",
    pricing: "Pricing mode",
    lifecycle: "Lifecycle",
    apply: "Apply filters",
    organization: "Organization",
    availability: "Availability",
    updated: "Latest sourced update",
    updatedFrom: "Updated from (ISO 8601)",
    updatedTo: "Updated to (ISO 8601)",
    empty: "No public Product profiles match these filters.",
    cutoff: "Data cutoff",
  },
  zh: {
    heading: "产品",
    filters: "产品筛选",
    category: "类别",
    platform: "平台",
    audience: "用户类型",
    region: "地区",
    pricing: "价格模式",
    lifecycle: "生命周期",
    apply: "应用筛选",
    organization: "开发组织",
    availability: "可用地区",
    updated: "最新来源更新",
    updatedFrom: "更新起始时间（ISO 8601）",
    updatedTo: "更新结束时间（ISO 8601）",
    empty: "没有符合筛选条件的公开产品档案。",
    cutoff: "数据截止时间",
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
  },
} as const;

const localizedValue = (locale: "en" | "zh", value: string) =>
  valueCopy[locale][value as keyof (typeof valueCopy)["en"]] ?? value;

export const dynamic = "force-dynamic";

export default async function ProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const locale = localeSchema.safeParse((await params).locale);
  if (!locale.success) notFound();
  const parsed = productListRequestSchema.safeParse({
    ...Object.fromEntries(
      Object.entries(await searchParams).filter(([, value]) => value !== ""),
    ),
    locale: locale.data,
  });
  if (!parsed.success) notFound();
  const result = await listPublicProducts(parsed.data);
  if (result.status === "invalid_cursor") notFound();
  const products = result.response;
  const labels = copy[locale.data];
  return (
    <main lang={locale.data}>
      <h1>{labels.heading}</h1>
      <form method="get">
        <fieldset>
          <legend>{labels.filters}</legend>
          {(["category", "platform", "audience", "region"] as const).map(
            (field) => (
              <label key={field}>
                {labels[field]}
                <input name={field} defaultValue={parsed.data[field]} />
              </label>
            ),
          )}
          <label>
            {labels.pricing}
            <select
              name="pricingMode"
              defaultValue={parsed.data.pricingMode ?? ""}
            >
              <option value="">—</option>
              {[
                "free",
                "freemium",
                "subscription",
                "usage_based",
                "contact_sales",
                "open_source",
              ].map((mode) => (
                <option key={mode} value={mode}>
                  {localizedValue(locale.data, mode)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {labels.lifecycle}
            <select name="lifecycle" defaultValue={parsed.data.lifecycle ?? ""}>
              <option value="">—</option>
              {["beta", "active", "deprecated", "discontinued"].map(
                (status) => (
                  <option key={status} value={status}>
                    {localizedValue(locale.data, status)}
                  </option>
                ),
              )}
            </select>
          </label>
          <label>
            {labels.updatedFrom}
            <input name="updatedFrom" defaultValue={parsed.data.updatedFrom} />
          </label>
          <label>
            {labels.updatedTo}
            <input name="updatedTo" defaultValue={parsed.data.updatedTo} />
          </label>
          <button type="submit">{labels.apply}</button>
        </fieldset>
      </form>
      <p>{products.methodology.limitation}</p>
      {products.items.length === 0 ? <p>{labels.empty}</p> : null}
      <ol>
        {products.items.map((product) => (
          <li key={product.publicId}>
            <h2>
              <Link href={`/${locale.data}/products/${product.publicId}`}>
                {product.name}
              </Link>
            </h2>
            <p>{product.summary}</p>
            <dl>
              <dt>{labels.organization}</dt>
              <dd>{product.organization.name}</dd>
              <dt>{labels.category}</dt>
              <dd>{localizedValue(locale.data, product.category)}</dd>
              <dt>{labels.platform}</dt>
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
              <dd>
                {localizedValue(locale.data, product.current.lifecycleStatus)}
              </dd>
              <dt>{labels.pricing}</dt>
              <dd>
                {localizedValue(locale.data, product.current.pricingMode)}
              </dd>
              <dt>{labels.availability}</dt>
              <dd>
                {product.current.availabilityRegions
                  .map((value) => localizedValue(locale.data, value))
                  .join(", ")}
              </dd>
              <dt>{labels.updated}</dt>
              <dd>
                <time dateTime={product.current.observedAt}>
                  {product.current.observedAt}
                </time>
              </dd>
            </dl>
          </li>
        ))}
      </ol>
      {products.dataCutoff ? (
        <p>
          {labels.cutoff}:{" "}
          <time dateTime={products.dataCutoff}>{products.dataCutoff}</time>
        </p>
      ) : null}
      {products.nextCursor ? (
        <Link
          href={`/${locale.data}/products?${new URLSearchParams({
            ...Object.fromEntries(
              Object.entries(await searchParams).filter(
                ([key, value]) => key !== "cursor" && value,
              ) as Array<[string, string]>,
            ),
            cursor: products.nextCursor,
          }).toString()}`}
        >
          {locale.data === "en" ? "Next page" : "下一页"}
        </Link>
      ) : null}
    </main>
  );
}
