"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { Field, FormMessage, buttonClass, inputClass } from "@/components/ui/field";
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
import { DEFAULT_CREDIT_DAYS } from "@/domain/documents";
import { createInvoiceAction, updateInvoiceAction } from "./actions";

/**
 * The draft-invoice editor. Same lines as a quote; what differs is the credit
 * term, which is entered as a number of days ("a 30 días") the way it is
 * actually agreed, and the date derived from it.
 *
 * This form only ever edits a **draft**. Once issued, an invoice is immutable
 * (guardrail 4) and the detail page shows it read-only instead.
 */

export type InvoiceValues = {
  id?: number;
  type: "invoice_contado" | "invoice_credito";
  customerId: string;
  docLocale: string;
  currency: Currency;
  issueDate: string;
  creditDays: string;
  notes: string;
  lines: LineValues[];
};

function Submit({ label }: { label: string }) {
  const t = useTranslations("invoices");
  const { pending } = useFormStatus();

  return (
    <button type="submit" className={buttonClass} disabled={pending}>
      {pending ? t("saving") : label}
    </button>
  );
}

export function InvoiceForm({
  values,
  customers,
  products,
  mode,
}: {
  values: InvoiceValues;
  customers: CustomerOption[];
  products: ProductOption[];
  mode: "create" | "edit";
}) {
  const t = useTranslations("invoices");

  const [state, formAction] = useActionState<FormState, FormData>(
    mode === "create" ? createInvoiceAction : updateInvoiceAction,
    IDLE,
  );

  const [type, setType] = useState(values.type);
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
        <Field label={t("type")} htmlFor="type" error={error("type")}>
          <select
            id="type"
            name="type"
            value={type}
            onChange={(event) =>
              setType(event.currentTarget.value as InvoiceValues["type"])
            }
            className={inputClass}
          >
            <option value="invoice_contado">{t("types.contado")}</option>
            <option value="invoice_credito">{t("types.credito")}</option>
          </select>
        </Field>

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

      <div className="grid gap-[var(--s-4)] sm:grid-cols-2">
        {type === "invoice_credito" ? (
          <Field
            label={t("creditDays")}
            htmlFor="creditDays"
            hint={t("creditDaysHint")}
            error={error("creditDays")}
          >
            <input
              id="creditDays"
              name="creditDays"
              type="number"
              min={1}
              max={365}
              defaultValue={values.creditDays || String(DEFAULT_CREDIT_DAYS)}
              className={`${inputClass} tabular`}
            />
          </Field>
        ) : null}

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
            className={inputClass}
          >
            <option value="es">{t("locales.es")}</option>
            <option value="en">{t("locales.en")}</option>
          </select>
        </Field>
      </div>

      <LineEditor
        lines={lines}
        setLines={setLines}
        products={products}
        currency={currency}
        error={error}
        namespace="invoices"
      />

      <TotalsPanel totals={totals} currency={currency} namespace="invoices" />

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
