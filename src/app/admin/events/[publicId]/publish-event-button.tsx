"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function PublishEventButton({ publicId }: { publicId: string }) {
  const router = useRouter();
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string>();

  const publish = async () => {
    setPublishing(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/v1/admin/events/${publicId}/publish`, {
        method: "POST",
      });
      if (!response.ok) {
        setError(`Publishing failed with HTTP ${response.status}`);
        return;
      }
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Publishing request failed",
      );
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div>
      <button disabled={publishing} onClick={publish} type="button">
        {publishing ? "Publishing…" : "Publish event"}
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
