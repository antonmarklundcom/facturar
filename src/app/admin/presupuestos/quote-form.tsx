"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import {
  Field,
  FormMessage,
  buttonClass,
  ghostButtonClass,
  inputClass,
} from "@/components/ui/field";
import { IDLE, type FormState } from "@/lib/forms";
import { currencyValues, type Currency } from "@/db/schema";
import {
  LineEditor,
  TotalsPanel,
  runningTotals,
  type CustomerOption,
  type LineValues,
  type ProductOption,
} from "@/components/documents/line-editor";
import { emptyLine } from "@/lib/documents/line-values";
import { DEFAULT_VALIDITY_DAYS } from "@/domain/documents";
import { createQuoteAction, updateQuoteAction } from "./actions";

/**
 * The quote editor: header fields plus a line table.
 *
 * The running totals are computed with the very same `domain/iva` functions
 * the server uses to write the document, so what the user watches add up is
 * what gets stored — including the per-line IVA rounding.
 */

export type QuoteValues = {
  id?: number;
  customerId: string;
  docLocale: string;
  currency: Currency;
  issueDate: string;
  validityDays: string;
  notes: string;
  lines: LineValues[];
};

function Submit({ label, ghost }: { label: string; ghost?: boolean }) {
  const t = useTranslations("quotes");
  const { pending } = useFormStatus();

  return (
    <button type="submit" className={ghost ? ghostButtonClass : buttonClass} disabled={pending}>
      {pending ? t("saving") : label}
    </button>
  );
}

export function QuoteForm({
  values,
  customers,
  products,
  mode,
}: {
  values: QuoteValues;
  customers: CustomerOption[];
  products: ProductOption[];
  mode: "create" | "edit";
}) {
  const t = useTranslations("quotes");

  const [state, formAction] = useActionState<FormState, FormData>(
    mode === "create" ? createQuoteAction : updateQuoteAction,
    IDLE,
  );

  const [currency, setCurrency] = useState<Currency>(values.currency);
  const [lines, setLines] = useState<LineValues[]>(
    values.lines.length > 0 ? values.lines : [emptyLine()],
  );

  const error = (name: string) =>
    state.fieldErrors?.[name] ? t(`errors.${state.fieldErrors[name]}`) : undefined;

  const totals = runningTotals(lines, currency);

  return (
    <form action={formAction} className="flex flex-col gap-[var(--s-6)]" noValidate>
      {values.id ? <input type="hidden" name="documentId" value={values.id} /> : null}

      {state.status === "error" && !state.fieldErrors ? (
        <FormMessage tone="error">{t(`errors.${state.messageKey}`)}</FormMessage>
      ) : null}
      {state.status === "error" && state.fieldErrors ? (
        <FormMessage tone="error">{t("errors.invalid")}</FormMessage>
      ) : null}
      {state.status === "success" ? (
        <FormMessage tone="success">{t("messages.updated")}</FormMessage>
      ) : null}

      <div className="grid gap-[var(--s-4)] sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t("customer")} htmlFor="customerId" error={error("customerId")}>
          <select
            id="customerId"
            name="customerId"
            defaultValue={values.customerId}
            required
            className={inputClass}
          >
            <option value="">{t("chooseCustomer")}</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t("issueDate")} htmlFor="issueDate" error={error("issueDate")}>
          <input
            id="issueDate"
            name="issueDate"
            type="date"
            defaultValue={values.issueDate}
            required
            className={inputClass}
          />
        </Field>

        <Field
          label={t("validityDays")}
          htmlFor="validityDays"
          hint={t("validityDaysHint")}
          error={error("validityDays")}
        >
          <input
            id="validityDays"
            name="validityDays"
            type="number"
            min={1}
            max={365}
            defaultValue={values.validityDays || String(DEFAULT_VALIDITY_DAYS)}
            className={`${inputClass} tabular`}
          />
        </Field>

        <Field label={t("currency")} htmlFor="currency" error={error("currency")}>
          <select
            id="currency"
            name="currency"
            value={currency}
            onChange={(event) => setCurrency(event.currentTarget.value as Currency)}
            className={inputClass}
          >
            {currencyValues.map((value) => (
              <option key={value} value={value}>
                {t(`currencies.${value}`)}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field
        label={t("docLocale")}
        htmlFor="docLocale"
        hint={t("docLocaleHint")}
        error={error("docLocale")}
      >
        <select
          id="docLocale"
          name="docLocale"
          defaultValue={values.docLocale}
          className={`${inputClass} max-w-xs`}
        >
          <option value="es">{t("locales.es")}</option>
          <option value="en">{t("locales.en")}</option>
        </select>
      </Field>

      <LineEditor
        lines={lines}
        setLines={setLines}
        products={products}
        currency={currency}
        error={error}
        namespace="quotes"
      />

      <TotalsPanel totals={totals} currency={currency} namespace="quotes" />

      <Field label={t("notes")} htmlFor="notes" hint={t("notesHint")} error={error("notes")}>
        <textarea
          id="notes"
          name="notes"
          defaultValue={values.notes}
          rows={3}
          maxLength={2000}
          className={`${inputClass} min-h-24 py-[var(--s-3)]`}
        />
      </Field>

      <div>
        <Submit label={mode === "create" ? t("create") : t("save")} />
      </div>
    </form>
  );
}
