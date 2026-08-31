"use client";

import { useState, type FormEvent } from "react";
import styles from "./homepage.module.css";

const copy = {
  en: {
    email: "Email address",
    consent:
      "I agree to receive the English Daily Brief. AI Radar uses my email only for this delivery and never includes it in public content, APIs or data releases.",
    submit: "Send confirmation",
    pending: "Check your inbox and confirm the subscription.",
    failed: "The confirmation request failed. Please try again.",
  },
  zh: {
    email: "邮箱地址",
    consent:
      "我同意接收中文每日简报。AI Radar 仅使用我的邮箱完成此投递，不会将邮箱加入公开内容、API 或数据发布。",
    submit: "发送确认邮件",
    pending: "请前往邮箱确认订阅。",
    failed: "确认请求失败，请重试。",
  },
} as const;

export function EmailSubscriptionForm({ locale }: { locale: "en" | "zh" }) {
  const [status, setStatus] = useState<"idle" | "pending" | "sent" | "failed">(
    "idle",
  );
  const text = copy[locale];

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("pending");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/v1/email-subscriptions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        locale,
        consent: form.get("consent") === "on",
      }),
    });
    setStatus(response.ok ? "sent" : "failed");
  };

  return (
    <form className={styles.subscriptionForm} onSubmit={submit}>
      <label>
        <span>{text.email}</span>
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label className={styles.consentField}>
        <input name="consent" type="checkbox" required />
        <span>{text.consent}</span>
      </label>
      <button disabled={status === "pending"} type="submit">
        {text.submit}
      </button>
      <p aria-live="polite">
        {status === "sent" ? text.pending : null}
        {status === "failed" ? text.failed : null}
      </p>
    </form>
  );
}
