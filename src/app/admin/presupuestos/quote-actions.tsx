"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { FormMessage, ghostButtonClass, buttonClass } from "@/components/ui/field";
import { IDLE, type FormState } from "@/lib/forms";
import type { DocumentStatus } from "@/db/schema";
import { convertQuoteAction, setQuoteStatusAction } from "./actions";

function Pending({ label }: { label: string }) {
  const t = useTranslations("quotes");
  const { pending } = useFormStatus();
  return <>{pending ? t("saving") : label}</>;
}

/**
 * Lifecycle buttons. Which ones are offered is decided on the server from the
 * domain's transition table and handed in — the server action checks the same
 * table again, because hiding a button is not a permission check.
 */
export function QuoteStatusActions({
  documentId,
  transitions,
}: {
  documentId: number;
  transitions: DocumentStatus[];
}) {
  const t = useTranslations("quotes");
  const [state, formAction] = useActionState<FormState, FormData>(setQuoteStatusAction, IDLE);

  if (transitions.length === 0 && state.status === "idle") return null;

  return (
    <div className="flex flex-col gap-[var(--s-3)]">
      {state.status === "error" ? (
        <FormMessage tone="error">{t(`errors.${state.messageKey}`)}</FormMessage>
      ) : null}
      {state.status === "success" ? (
        <FormMessage tone="success">{t(`messages.${state.messageKey}`)}</FormMessage>
      ) : null}

      <div className="flex flex-wrap gap-[var(--s-2)]">
        {transitions.map((status) => (
          <form key={status} action={formAction}>
            <input type="hidden" name="documentId" value={documentId} />
            <input type="hidden" name="status" value={status} />
            <button type="submit" className={ghostButtonClass}>
              <Pending label={t(`transitions.${status}`)} />
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}

/**
 * Convert to a **draft** invoice. Numbering happens at issue time through the
 * PR-4 generator only, so nothing is numbered here.
 */
export function ConvertQuoteAction({ documentId }: { documentId: number }) {
  const t = useTranslations("quotes");
  const [state, formAction] = useActionState<FormState, FormData>(convertQuoteAction, IDLE);

  return (
    <form action={formAction} className="flex flex-col gap-[var(--s-3)]">
      <input type="hidden" name="documentId" value={documentId} />

      {state.status === "error" ? (
        <FormMessage tone="error">{t(`errors.${state.messageKey}`)}</FormMessage>
      ) : null}
      {state.status === "success" ? (
        <FormMessage tone="success">{t("messages.converted")}</FormMessage>
      ) : null}

      <label className="flex flex-col gap-[var(--s-2)] text-[length:var(--t--1)] text-ink-70">
        {t("invoiceType")}
        <select
          name="invoiceType"
          defaultValue="invoice_contado"
          className="min-h-11 rounded-sm border border-hairline-strong bg-surface px-[var(--s-3)] text-ink"
        >
          <option value="invoice_contado">{t("invoiceTypes.contado")}</option>
          <option value="invoice_credito">{t("invoiceTypes.credito")}</option>
        </select>
      </label>

      <button type="submit" className={buttonClass}>
        <Pending label={t("convert")} />
      </button>
    </form>
  );
}
