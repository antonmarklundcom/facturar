"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { FormMessage, buttonClass, inputClass } from "@/components/ui/field";
import { IDLE, type FormState } from "@/lib/forms";
import { issueInvoiceAction } from "./actions";

export type TimbradoOption = {
  id: number;
  label: string;
  nextNumber: string;
  issuable: boolean;
};

/**
 * Issuing is the one-way door: it takes a number from the timbrado and the
 * invoice becomes immutable. The button says so, and the server checks the
 * timbrado again inside its row lock (guardrail 6).
 */
export function IssueInvoiceForm({
  documentId,
  timbrados,
}: {
  documentId: number;
  timbrados: TimbradoOption[];
}) {
  const t = useTranslations("invoices");
  const [state, formAction] = useActionState<FormState, FormData>(issueInvoiceAction, IDLE);

  const issuable = timbrados.filter((timbrado) => timbrado.issuable);

  if (issuable.length === 0) {
    return <FormMessage tone="error">{t("errors.noTimbrado")}</FormMessage>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-[var(--s-3)]">
      <input type="hidden" name="documentId" value={documentId} />

      {state.status === "error" ? (
        <FormMessage tone="error">{t(`errors.${state.messageKey}`)}</FormMessage>
      ) : null}
      {state.status === "success" ? (
        <FormMessage tone="success">{t("messages.issued")}</FormMessage>
      ) : null}

      <label className="flex flex-col gap-[var(--s-2)] text-[length:var(--t--1)] text-ink-70">
        {t("timbrado")}
        <select name="timbradoId" defaultValue={String(issuable[0].id)} className={inputClass}>
          {issuable.map((timbrado) => (
            <option key={timbrado.id} value={timbrado.id}>
              {timbrado.label} · {timbrado.nextNumber}
            </option>
          ))}
        </select>
      </label>

      <IssueButton />
      <p className="m-0 text-[length:var(--t--1)] text-ink-55">{t("issueWarning")}</p>
    </form>
  );
}

function IssueButton() {
  const t = useTranslations("invoices");
  const { pending } = useFormStatus();

  return (
    <button type="submit" className={buttonClass} disabled={pending}>
      {pending ? t("issuing") : t("issue")}
    </button>
  );
}
