import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { authOptions } from "@/auth/options";
import { getEventDraft } from "@/events/service";
import { PublishEventButton } from "./publish-event-button";

export const metadata = {
  robots: { index: false, follow: false },
};

export default async function EventPreviewPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "owner") {
    redirect(
      `/api/auth/signin?callbackUrl=/admin/events/${(await params).publicId}`,
    );
  }

  const event = await getEventDraft((await params).publicId);
  if (!event) notFound();

  return (
    <main>
      <h1>Event publication preview</h1>
      <p>Publication state: {event.publicationState}</p>
      {event.publicationState === "ready" ? (
        <PublishEventButton publicId={event.publicId} />
      ) : null}
      <p>
        Shared facts: {event.eventType}, {event.factStatus},{" "}
        {event.occurredAtPrecision} precision, rights {event.rightsStatus}
      </p>
      {event.localizations.map((localization) => (
        <section lang={localization.locale} key={localization.locale}>
          <p>
            {localization.locale.toUpperCase()} · {localization.authorship} ·{" "}
            {localization.reviewStatus}
          </p>
          <h2>{localization.title}</h2>
          <p>{localization.summary}</p>
        </section>
      ))}
      <section>
        <h2>Primary source</h2>
        <p>
          {event.source.name} · Tier {event.source.tier} · rights{" "}
          {event.source.rightsStatus}
        </p>
        <a href={event.source.originalUrl}>{event.source.originalTitle}</a>
      </section>
    </main>
  );
}
