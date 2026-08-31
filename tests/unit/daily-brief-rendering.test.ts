import { describe, expect, it } from "vitest";
import { XMLParser } from "fast-xml-parser";
import {
  renderDailyBriefEmail,
  renderDailyBriefRss,
  type PublishedDailyBrief,
} from "@/daily-briefs/rendering";

const brief: PublishedDailyBrief = {
  publicId: "daily-brief-en-2026-08-31-v1",
  editionPublicId: "daily-brief-2026-08-31-v1",
  locale: "en",
  briefDate: "2026-08-31",
  version: "1.0",
  dataCutoff: "2026-08-31T08:00:00.000Z",
  publishedAt: "2026-08-31T09:00:00.000Z",
  title: "AI & Agents <Today>",
  overview: "Two verified changes, one frozen editorial brief.",
  coverageNote: "Global public AI changes verified before the cutoff.",
  whatToWatch: "Watch the next public release.",
  correctionUrl: "https://radar.example.test/corrections",
  items: [
    {
      position: 1,
      section: "key_developments",
      commentary: "Alpha shipped first.",
      event: {
        publicId: "event-alpha",
        title: "Alpha & launch",
        summary: "The verified Alpha summary.",
        occurredAt: "2026-08-31T06:00:00.000Z",
        href: "/en/radar/events/event-alpha",
        source: {
          title: "Alpha <official>",
          url: "https://alpha.example.test/release?a=1&b=2",
        },
      },
    },
    {
      position: 2,
      section: "models_research",
      commentary: "Beta followed.",
      event: {
        publicId: "event-beta",
        title: "Beta research",
        summary: "The verified Beta summary.",
        occurredAt: "2026-08-31T07:00:00.000Z",
        href: "/en/radar/events/event-beta",
        source: null,
      },
    },
  ],
};

describe("Daily Brief channel rendering", () => {
  it("renders a parseable RSS item from the frozen Brief in editorial order", () => {
    const rss = renderDailyBriefRss(brief, "https://radar.example.test");
    const parsed = new XMLParser({ ignoreAttributes: false }).parse(rss);

    expect(rss).toContain('<rss version="2.0">');
    expect(rss).toContain("AI &amp; Agents &lt;Today&gt;");
    expect(rss).toContain("Alpha &amp; launch");
    expect(rss).toContain("The verified Alpha summary.");
    expect(rss).toContain("2026-08-31T06:00:00.000Z");
    expect(rss).toContain(
      "https://radar.example.test/en/radar/events/event-alpha",
    );
    expect(rss).toContain("Alpha &lt;official&gt;");
    expect(rss).toContain("a=1&amp;b=2");
    expect(rss.indexOf("Alpha shipped first.")).toBeLessThan(
      rss.indexOf("Beta followed."),
    );
    expect(rss).toContain("public-daily-brief-en-2026-08-31-v1");
    expect(rss).toContain(
      "Global public AI changes verified before the cutoff.",
    );
    expect(rss).toContain("https://radar.example.test/corrections");
    expect(rss).not.toContain("subscriber@example.test");
    expect(parsed.rss.channel).toMatchObject({
      title: "AI Radar Daily Brief",
      language: "en",
      item: {
        title: "AI & Agents <Today>",
        link: "https://radar.example.test/en/briefs/daily-brief-en-2026-08-31-v1",
      },
    });
  });

  it("renders email from the same Brief and adds only delivery-specific links", () => {
    const email = renderDailyBriefEmail(brief, {
      briefUrl:
        "https://radar.example.test/en/briefs/daily-brief-en-2026-08-31-v1",
      unsubscribeUrl: "https://radar.example.test/en/unsubscribe?token=opaque",
    });

    expect(email.subject).toBe("AI & Agents <Today>");
    expect(email.html).toContain("Alpha &amp; launch");
    expect(email.html).toContain("Beta research");
    expect(email.html.indexOf("Alpha shipped first.")).toBeLessThan(
      email.html.indexOf("Beta followed."),
    );
    expect(email.html).toContain("Data cutoff: 2026-08-31T08:00:00.000Z");
    expect(email.html).toContain("Version 1.0");
    expect(email.html).toContain(
      "Global public AI changes verified before the cutoff.",
    );
    expect(email.html).toContain("https://radar.example.test/corrections");
    expect(email.html).toContain("token=opaque");
  });
});
