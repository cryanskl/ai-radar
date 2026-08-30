export const guidePresentation = {
  en: {
    provenance: {
      ai_radar_original: "AI Radar original",
      authorized_submission: "Authorized submission",
      external_guidance: "External guidance",
    },
    status: { current: "Current", stale: "Stale" },
    rightsStatus: {
      open: "Open",
      attribution_required: "Attribution required",
      source_license: "Source license",
      metadata_only: "Metadata only",
      link_only: "Link only",
    },
  },
  zh: {
    provenance: {
      ai_radar_original: "AI Radar 原创",
      authorized_submission: "授权投稿",
      external_guidance: "外部导读",
    },
    status: { current: "当前可用", stale: "已过期" },
    rightsStatus: {
      open: "开放",
      attribution_required: "需要署名",
      source_license: "遵循来源许可证",
      metadata_only: "仅元数据",
      link_only: "仅提供外部链接",
    },
  },
} as const;
