import Link from "next/link";
import { notFound } from "next/navigation";
import { EmailTokenAction } from "../email-token-action";

export default async function ConfirmEmailPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (locale !== "en" && locale !== "zh") notFound();
  return (
    <main lang={locale}>
      <h1>{locale === "en" ? "Confirm Daily Brief" : "确认每日简报订阅"}</h1>
      <EmailTokenAction kind="confirm" locale={locale} />
      <p>
        <Link href={`/${locale}`}>
          {locale === "en" ? "Back to AI Radar" : "返回 AI Radar"}
        </Link>
      </p>
    </main>
  );
}
