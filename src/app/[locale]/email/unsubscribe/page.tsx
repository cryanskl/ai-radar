import Link from "next/link";
import { notFound } from "next/navigation";
import { EmailTokenAction } from "../email-token-action";

export default async function UnsubscribeEmailPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (locale !== "en" && locale !== "zh") notFound();
  return (
    <main lang={locale}>
      <h1>{locale === "en" ? "Unsubscribe" : "退订"}</h1>
      <EmailTokenAction kind="unsubscribe" locale={locale} />
      <p>
        <Link href={`/${locale}`}>
          {locale === "en" ? "Back to AI Radar" : "返回 AI Radar"}
        </Link>
      </p>
    </main>
  );
}
