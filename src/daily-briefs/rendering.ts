import { XMLBuilder } from "fast-xml-parser";

export type PublishedDailyBrief = {
  publicId: string;
  editionPublicId: string;
  locale: "en" | "zh";
  briefDate: string;
  version: string;
  dataCutoff: string;
  publishedAt: string | null;
  title: string;
  overview: string;
  coverageNote: string;
  whatToWatch: string;
  correctionUrl: string;
  items: Array<{
    position: number;
    section:
      | "key_developments"
      | "models_research"
      | "products_open_source"
      | "prompts_skills_guides";
    commentary: string;
    event: {
      publicId: string;
      title: string;
      summary: string;
      occurredAt: string;
      href: string;
      source: { title: string; url: string } | null;
    };
  }>;
};

const escapeMarkup = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export const renderDailyBriefRss = (
  brief: PublishedDailyBrief,
  origin: string,
  previewedAt?: string,
) => {
  const renderedAt = brief.publishedAt ?? previewedAt;
  if (!renderedAt) throw new Error("daily_brief_render_time_required");
  const briefUrl = `${origin}/${brief.locale}/briefs/${brief.publicId}`;
  const description = [
    brief.overview,
    ...brief.items.map(({ commentary, event }) =>
      [
        `${event.title}: ${commentary}`,
        event.summary,
        `Occurred at: ${event.occurredAt}`,
        new URL(event.href, origin).href,
        event.source ? `${event.source.title} — ${event.source.url}` : null,
      ]
        .filter((value) => value !== null)
        .join(" | "),
    ),
    brief.whatToWatch,
    `Coverage: ${brief.coverageNote}`,
    `Corrections: ${brief.correctionUrl}`,
    `Data cutoff: ${brief.dataCutoff}`,
    `Version ${brief.version}`,
  ].join("\n");

  return new XMLBuilder({
    format: true,
    ignoreAttributes: false,
  }).build({
    "?xml": { "@_version": "1.0", "@_encoding": "UTF-8" },
    rss: {
      "@_version": "2.0",
      channel: {
        title:
          brief.locale === "en" ? "AI Radar Daily Brief" : "AI Radar 每日简报",
        link: `${origin}/${brief.locale}`,
        description:
          brief.locale === "en"
            ? "A frozen daily synthesis of verified global AI changes."
            : "每日冻结发布的全球 AI 已核验变化摘要。",
        language: brief.locale === "en" ? "en" : "zh-CN",
        lastBuildDate: new Date(renderedAt).toUTCString(),
        item: {
          title: brief.title,
          link: briefUrl,
          guid: {
            "#text": `public-${brief.publicId}`,
            "@_isPermaLink": "false",
          },
          pubDate: new Date(renderedAt).toUTCString(),
          description,
        },
      },
    },
  });
};

export const renderDailyBriefEmail = (
  brief: PublishedDailyBrief,
  links: { briefUrl: string; unsubscribeUrl: string },
) => ({
  subject: brief.title,
  text: [
    brief.title,
    brief.overview,
    ...brief.items.map(
      ({ commentary, event }) =>
        `${event.title}\n${commentary}\n${event.summary}\n${new URL(event.href, links.briefUrl).href}${event.source ? `\n${event.source.title}: ${event.source.url}` : ""}`,
    ),
    brief.whatToWatch,
    `Coverage: ${brief.coverageNote}`,
    `Data cutoff: ${brief.dataCutoff}`,
    `Version ${brief.version}`,
    links.briefUrl,
    `${brief.locale === "en" ? "Report / Suggest correction" : "报告问题 / 建议更正"}: ${brief.correctionUrl}`,
    `${brief.locale === "en" ? "Unsubscribe" : "退订"}: ${links.unsubscribeUrl}`,
  ].join("\n\n"),
  html: `<main>
  <h1>${escapeMarkup(brief.title)}</h1>
  <p>${escapeMarkup(brief.overview)}</p>
  <ol>
${brief.items
  .map(
    ({ commentary, event }) => `    <li>
      <h2><a href="${escapeMarkup(new URL(event.href, links.briefUrl).href)}">${escapeMarkup(event.title)}</a></h2>
      <p>${escapeMarkup(commentary)}</p>
      <p>${escapeMarkup(event.summary)}</p>${
        event.source
          ? `
      <p><a href="${escapeMarkup(event.source.url)}">${escapeMarkup(event.source.title)}</a></p>`
          : ""
      }
    </li>`,
  )
  .join("\n")}
  </ol>
  <p>${escapeMarkup(brief.whatToWatch)}</p>
  <p>Coverage: ${escapeMarkup(brief.coverageNote)}</p>
  <p>Data cutoff: ${escapeMarkup(brief.dataCutoff)}</p>
  <p>Version ${escapeMarkup(brief.version)}</p>
  <p><a href="${escapeMarkup(links.briefUrl)}">${brief.locale === "en" ? "Read on AI Radar" : "在 AI Radar 阅读"}</a></p>
  <p><a href="${escapeMarkup(brief.correctionUrl)}">${brief.locale === "en" ? "Report / Suggest correction" : "报告问题 / 建议更正"}</a></p>
  <p><a href="${escapeMarkup(links.unsubscribeUrl)}">${brief.locale === "en" ? "Unsubscribe" : "退订"}</a></p>
</main>`,
});

export const renderSubscriptionConfirmationEmail = (
  locale: "en" | "zh",
  confirmationUrl: string,
) => {
  const copy =
    locale === "en"
      ? {
          subject: "Confirm AI Radar Daily Brief",
          action: "Confirm subscription",
          privacy:
            "AI Radar uses your email only to deliver the selected Daily Brief. It is never included in public content, APIs or data releases.",
        }
      : {
          subject: "确认订阅 AI Radar 每日简报",
          action: "确认订阅",
          privacy:
            "AI Radar 仅使用你的邮箱投递所选语言的每日简报，不会将邮箱加入公开内容、API 或数据发布。",
        };
  return {
    subject: copy.subject,
    text: `${copy.action}: ${confirmationUrl}\n\n${copy.privacy}`,
    html: `<p><a href="${escapeMarkup(confirmationUrl)}">${copy.action}</a></p><p>${copy.privacy}</p>`,
  };
};
