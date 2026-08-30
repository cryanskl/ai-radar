import { notFound } from "next/navigation";
import { z } from "zod";
import { readStatus } from "@/status/status";

const localeSchema = z.enum(["en", "zh"]);

const copy = {
  en: {
    heading: "Service status",
    summary: "Live checks for the public AI Radar application.",
    application: "Application",
    database: "PostgreSQL",
    ok: "Operational",
    error: "Unavailable",
    checkedAt: "Checked at",
  },
  zh: {
    heading: "服务状态",
    summary: "AI Radar 公共服务的实时检查。",
    application: "应用",
    database: "PostgreSQL",
    ok: "运行正常",
    error: "暂不可用",
    checkedAt: "检查时间",
  },
} as const;

export const dynamic = "force-dynamic";

export default async function StatusPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const parsedLocale = localeSchema.safeParse((await params).locale);
  if (!parsedLocale.success) notFound();

  const locale = parsedLocale.data;
  const labels = copy[locale];
  const status = await readStatus();

  return (
    <main lang={locale}>
      <h1>{labels.heading}</h1>
      <p>{labels.summary}</p>
      <dl>
        <div>
          <dt>{labels.application}</dt>
          <dd>{labels.ok}</dd>
        </div>
        <div>
          <dt>{labels.database}</dt>
          <dd>
            {status.services.database === "ok" ? labels.ok : labels.error}
          </dd>
        </div>
      </dl>
      <p>
        {labels.checkedAt}:{" "}
        <time dateTime={status.checkedAt}>{status.checkedAt}</time>
      </p>
    </main>
  );
}
