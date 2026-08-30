import Link from "next/link";
import { notFound } from "next/navigation";
import styles from "../homepage.module.css";

export default async function SavedPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (locale !== "en" && locale !== "zh") notFound();

  return (
    <div className={styles.page} lang={locale}>
      <main className={styles.main}>
        <p>
          <Link href={`/${locale}`}>← AI Radar</Link>
        </p>
        <section className={styles.section}>
          <div className={styles.sectionLead}>
            <h1>{locale === "en" ? "Saved" : "收藏"}</h1>
          </div>
          <p>
            {locale === "en"
              ? "Saved records stay only in this browser. No records have been saved yet."
              : "收藏记录只保存在当前浏览器中。目前还没有收藏记录。"}
          </p>
        </section>
      </main>
    </div>
  );
}
