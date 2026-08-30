export const skillPresentation = {
  en: {
    installationMethod: {
      manual: "Manual installation",
      package_manager: "Package manager",
      marketplace: "Marketplace",
      repository: "Repository",
    },
    maintenanceStatus: {
      maintained: "Maintained",
      limited: "Limited maintenance",
      unmaintained: "Unmaintained",
      archived: "Archived",
    },
    securityReviewStatus: {
      not_reviewed: "Not reviewed",
      metadata_reviewed: "Metadata reviewed",
      manual_reviewed: "Manually reviewed",
      issues_found: "Issues found",
    },
    rightsStatus: {
      open: "Open",
      attribution_required: "Attribution required",
      source_license: "Source license applies",
      metadata_only: "Metadata only",
      link_only: "External link only",
    },
  },
  zh: {
    installationMethod: {
      manual: "手动安装",
      package_manager: "包管理器",
      marketplace: "应用市场",
      repository: "代码仓库",
    },
    maintenanceStatus: {
      maintained: "持续维护",
      limited: "有限维护",
      unmaintained: "停止维护",
      archived: "已归档",
    },
    securityReviewStatus: {
      not_reviewed: "尚未审核",
      metadata_reviewed: "已审核元数据",
      manual_reviewed: "已人工审核",
      issues_found: "发现问题",
    },
    rightsStatus: {
      open: "公开",
      attribution_required: "需要署名",
      source_license: "遵循来源许可证",
      metadata_only: "仅元数据",
      link_only: "仅提供外部链接",
    },
  },
} as const;
