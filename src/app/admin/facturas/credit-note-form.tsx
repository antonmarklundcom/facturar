"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { Field, FormMessage, buttonClass, inputClass } from "@/components/ui/field";
import { IDLE, type FormState } from "@/lib/forms";
import type { Currency } from "@/db/schema";
import {
  LineEditor,
  TotalsPanel,
  runningTotals,
  type LineValues,
} from "@/components/documents/line-editor";
import type { TimbradoOption } from "./issue-form";
import { issueCreditNoteAction } from "./actions";

/**
 * A credit note against an issued invoice — the only way to correct one
 * (guardrail 4).
 *
 * The lines start as a copy of the invoice's, which is the common case (a full
 * reversal); removing or editing rows turns it into a partial credit. The
 * amounts are entered positive — the *document type* is what makes it a
 * reversal, and its IVA has to break down per rate exactly like the invoice's
 * or the two will not reconcile.
 */
export function CreditNoteForm({
  documentId,
  currency,
  invoiceLines,
  creditableLabel,
  timbrados,
}: {
  documentId: number;
  currency: Currency;
  invoiceLines: LineValues[];
  creditableLabel: string;
  timbrados: TimbradoOption[];
}) {
  const t = useTranslations("creditNotes");
  const [state, formAction] = useActionState<FormState, FormData>(
    issueCreditNoteAction,
    IDLE,
  );

  const [lines, setLines] = useState<LineValues[]>(invoiceLines);
  const [open, setOpen] = useState(false);

  const error = (name: string) =>
    state.fieldErrors?.[name] ? t(`errors.${state.fieldErrors[name]}`) : undefined;

  const totals = runningTotals(lines, currency);
  const issuable = timbrados.filter((timbrado) => timbrado.issuable);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonClass}>
        {t("start")}
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-[var(--s-5)]" noValidate>
      <input type="hidden" name="documentId" value={documentId} />

      {state.status === "error" ? (
        <FormMessage tone="error">
          {state.fieldErrors ? t("errors.invalid") : t(`errors.${state.messageKey}`)}
        </FormMessage>
      ) : null}
      {state.status === "success" ? (
        <FormMessage tone="success">{t("messages.credited")}</FormMessage>
      ) : null}

      <p className="m-0 text-[length:var(--t--1)] text-ink-55">
        {t("creditable", { amount: creditableLabel })}
      </p>

      {issuable.length === 0 ? (
        <FormMessage tone="error">{t("errors.noTimbrado")}</FormMessage>
      ) : (
        <Field label={t("timbrado")} htmlFor="creditTimbrado">
          <select
            id="creditTimbrado"
            name="timbradoId"
            defaultValue={String(issuable[0].id)}
            className={inputClass}
          >
            {issuable.map((timbrado) => (
              <option key={timbrado.id} value={timbrado.id}>
                {timbrado.label} · {timbrado.nextNumber}
              </option>
            ))}
          </select>
        </Field>
      )}

      <LineEditor
        lines={lines}
        setLines={setLines}
        products={[]}
        currency={currency}
        error={error}
        namespace="creditNotes"
      />

      <TotalsPanel totals={totals} currency={currency} namespace="creditNotes" />

      <Field label={t("notes")} htmlFor="creditNotes" hint={t("notesHint")}>
        <textarea
          id="creditNotes"
          name="creditNotes"
          rows={2}
          maxLength={2000}
          className={`${inputClass} min-h-20 py-[var(--s-3)]`}
        />
      </Field>

      <p className="m-0 text-[length:var(--t--1)] text-ink-55">{t("warning")}</p>

      <div className="flex flex-wrap gap-[var(--s-3)]">
        <Issue disabled={issuable.length === 0} />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="min-h-12 rounded-sm border border-hairline-strong px-[var(--s-5)] text-[length:var(--t--1)]"
        >
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}

function Issue({ disabled }: { disabled: boolean }) {
  const t = useTranslations("creditNotes");
  const { pending } = useFormStatus();

  return (
    <button type="submit" className={buttonClass} disabled={pending || disabled}>
      {pending ? t("issuing") : t("issue")}
    </button>
  );
}
