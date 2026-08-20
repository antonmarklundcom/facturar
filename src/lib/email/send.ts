import "server-only";

import type { EmailContent } from "./templates";

/**
 * Outbound email through Resend (decision 10).
 *
 * Called through the REST API rather than the SDK: one `fetch` against a
 * documented endpoint is less to keep up to date than a dependency, and it
 * keeps the "sending is disabled" path trivial.
 *
 * **Sending is optional.** With no `RESEND_API_KEY` the app still works —
 * every document has a WhatsApp path and a public link, which is how most
 * Paraguayan SMBs send things anyway. `emailEnabled()` is what the UI asks
 * before offering the button.
 */

const ENDPOINT = "https://api.resend.com/emails";
const TIMEOUT_MS = 10_000;

export type EmailResult =
  | { ok: true; id: string | null }
  | { ok: false; reason: "disabled" | "rejected" | "network" };

export function emailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

/** The verified sender, or a sensible default for local development. */
export function emailFrom(): string {
  return process.env.RESEND_FROM?.trim() || "facturar <onboarding@resend.dev>";
}

export async function sendEmail(options: {
  to: string;
  content: EmailContent;
  replyTo?: string | null;
}): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { ok: false, reason: "disabled" };

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: emailFrom(),
        to: [options.to],
        subject: options.content.subject,
        text: options.content.text,
        html: options.content.html,
        ...(options.replyTo ? { reply_to: options.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      // Never log the key, and never surface the provider's message to the
      // customer-facing form (decision 20 — structured server logs).
      console.error("[facturar] resend rejected an email", {
        status: response.status,
        subject: options.content.subject,
      });
      return { ok: false, reason: "rejected" };
    }

    const body = (await response.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, id: body?.id ?? null };
  } catch (error) {
    console.error("[facturar] resend request failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, reason: "network" };
  }
}
