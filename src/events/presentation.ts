export const displayTimestamp = (
  timestamp: string,
  precision: "day" | "minute" | "second",
) => (precision === "day" ? timestamp.slice(0, 10) : timestamp);

export const rightsLabels = {
  en: {
    open: "Open",
    attribution_required: "Attribution required",
    source_license: "Source license",
    metadata_only: "Metadata only",
    link_only: "Link only",
    permission_required: "Permission required",
    internal_only: "Internal only",
    withdrawn: "Withdrawn",
  },
  zh: {
    open: "开放",
    attribution_required: "需要署名",
    source_license: "遵循来源许可",
    metadata_only: "仅元数据",
    link_only: "仅链接",
    permission_required: "需要授权",
    internal_only: "仅内部",
    withdrawn: "已撤回",
  },
} as const;

export const authorshipLabels = {
  en: {
    human_authored: "Human-authored",
    ai_translated: "AI-translated",
    official_translation: "Official translation",
  },
  zh: {
    human_authored: "人工撰写",
    ai_translated: "AI 翻译",
    official_translation: "官方翻译",
  },
} as const;

export const reviewLabels = {
  en: { reviewed: "Reviewed" },
  zh: { reviewed: "已审核" },
} as const;
