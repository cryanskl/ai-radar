"use client";

import { useEffect, useState } from "react";

const copy = {
  en: {
    loading: "Applying your email preference…",
    confirmed: "Your Daily Brief subscription is confirmed.",
    unsubscribed: "You are unsubscribed from the Daily Brief.",
    invalid: "This email link is invalid or no longer current.",
  },
  zh: {
    loading: "正在更新你的邮件偏好…",
    confirmed: "每日简报订阅已确认。",
    unsubscribed: "你已退订每日简报。",
    invalid: "此邮件链接无效或已失效。",
  },
} as const;

export function EmailTokenAction({
  kind,
  locale,
}: {
  kind: "confirm" | "unsubscribe";
  locale: "en" | "zh";
}) {
  const [status, setStatus] = useState<"loading" | "success" | "invalid">(
    "loading",
  );

  useEffect(() => {
    const applyToken = async () => {
      const token = new URLSearchParams(window.location.hash.slice(1)).get(
        "token",
      );
      if (!token) return "invalid" as const;
      const response = await fetch(`/api/v1/email-subscriptions/${kind}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = await response.json();
      return response.ok &&
        (kind === "unsubscribe" || body.status === "confirmed")
        ? ("success" as const)
        : ("invalid" as const);
    };
    void applyToken()
      .then(setStatus)
      .catch(() => setStatus("invalid"));
  }, [kind]);

  const text = copy[locale];
  return (
    <p aria-live="polite">
      {status === "loading" ? text.loading : null}
      {status === "success"
        ? kind === "confirm"
          ? text.confirmed
          : text.unsubscribed
        : null}
      {status === "invalid" ? text.invalid : null}
    </p>
  );
}
