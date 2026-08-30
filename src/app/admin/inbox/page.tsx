import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth/options";
import { getInboxOverview } from "@/ingestion/inbox";

export const metadata = {
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function OwnerInboxPage() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "owner") {
    redirect("/api/auth/signin?callbackUrl=/admin/inbox");
  }
  const overview = await getInboxOverview();
  const newCandidateCount = overview.candidates.filter(
    ({ status }) => status === "new",
  ).length;

  return (
    <main>
      <h1>Owner Inbox</h1>
      <p>New candidates: {newCandidateCount}</p>
      <section>
        <h2>Source health</h2>
        {overview.health.map((health) => (
          <article key={health.sourceName}>
            <h3>{health.sourceName}</h3>
            <p>Source health: {health.status}</p>
            <p>Consecutive errors: {health.consecutiveErrorCount}</p>
            <p>
              Last attempt: {health.lastAttemptAt?.toISOString() ?? "never"}
            </p>
            <p>
              Last success: {health.lastSuccessAt?.toISOString() ?? "never"}
            </p>
            <p>Last item: {health.lastItemAt?.toISOString() ?? "never"}</p>
            <p>
              Source lag: {health.lagSeconds ?? "unknown"}
              {health.lagSeconds === null ? "" : " seconds"}
            </p>
            <p>
              Next run: {health.nextRunAt?.toISOString() ?? "not scheduled"}
            </p>
          </article>
        ))}
      </section>
      <section>
        <h2>Candidates</h2>
        {overview.candidates.map((candidate) => (
          <article key={candidate.sourceItemPublicId}>
            <h3>
              <a href={candidate.originalUrl}>{candidate.originalTitle}</a>
            </h3>
            <p>
              {candidate.sourceName} · {candidate.status} ·{" "}
              {candidate.parseStatus} · rights {candidate.rightsStatus}
            </p>
            <p>Published: {candidate.publishedAt.toISOString()}</p>
            <p>Discovered: {candidate.discoveredAt.toISOString()}</p>
          </article>
        ))}
      </section>
      <section>
        <h2>Recent ingest runs</h2>
        {overview.runs.map((run) => (
          <article key={run.publicId}>
            <h3>{run.sourceName}</h3>
            <p>
              {run.status}
              {run.errorKind ? ` · ${run.errorKind}` : ""}
            </p>
            <p>
              Fetched {run.fetchedCount}; created {run.createdCount}; started{" "}
              {run.startedAt.toISOString()}
            </p>
            {run.errorMessage ? <p>{run.errorMessage}</p> : null}
            {run.retryAfterAt ? (
              <p>Retry after: {run.retryAfterAt.toISOString()}</p>
            ) : null}
          </article>
        ))}
      </section>
    </main>
  );
}
