"use client";

import { useActionState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { FormMessage } from "@/components/ui/field";
import { IDLE, type FormState } from "@/lib/forms";
import {
  markWhatsappSentAction,
  sendDocumentEmailAction,
} from "@/app/admin/send-actions";

/**
 * The two send channels (PR-12, decision 9 — WhatsApp first).
 *
 * WhatsApp is a `wa.me` deeplink: the message leaves from the user's own
 * WhatsApp, so the app can only record that it handed the document over. The
 * link is a real anchor — it must keep working with JavaScript busy — and the
 * log is fired alongside it rather than in its way.
 */
export function WhatsappSendLink({
  documentId,
  href,
  label,
}: {
  documentId: number;
  href: string;
  label: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        // Fire and forget: the navigation must not wait on the log, and a
        // failed log must never cost the user the message.
        startTransition(async () => {
          await markWhatsappSentAction(documentId);
        });
      }}
      aria-busy={pending}
      className="inline-flex min-h-11 items-center justify-center rounded-sm bg-accent px-[var(--s-4)] text-[length:var(--t--1)] font-medium text-accent-contrast no-underline transition-transform duration-[var(--dur-fast)] ease-(--ease-io) hover:-translate-y-0.5"
    >
      {label}
    </a>
  );
}

export function EmailSendForm({
  documentId,
  to,
  enabled,
}: {
  documentId: number;
  to: string | null;
  enabled: boolean;
}) {
  const t = useTranslations("send");
  const [state, formAction] = useActionState<FormState, FormData>(
    sendDocumentEmailAction,
    IDLE,
  );

  if (!enabled) {
    return <p className="m-0 text-[length:var(--t--1)] text-ink-55">{t("emailDisabled")}</p>;
  }

  if (!to) {
    return <p className="m-0 text-[length:var(--t--1)] text-ink-55">{t("noEmail")}</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-[var(--s-3)]">
      <input type="hidden" name="documentId" value={documentId} />

      {state.status === "error" ? (
        <FormMessage tone="error">{t(`errors.${state.messageKey}`)}</FormMessage>
      ) : null}
      {state.status === "success" ? (
        <FormMessage tone="success">{t("messages.emailSent")}</FormMessage>
      ) : null}

      <EmailButton to={to} />
    </form>
  );
}

function EmailButton({ to }: { to: string }) {
  const t = useTranslations("send");
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-11 items-center justify-center rounded-sm border border-hairline-strong px-[var(--s-4)] text-[length:var(--t--1)] disabled:opacity-60"
    >
      {pending ? t("sending") : t("sendEmailTo", { email: to })}
    </button>
  );
}
