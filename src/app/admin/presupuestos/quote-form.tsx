"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import {
  Field,
  FormMessage,
  buttonClass,
  ghostButtonClass,
  inputClass,
} from "@/components/ui/field";
import { IDLE, type FormState } from "@/lib/forms";
import {
  currencyValues,
  taxRateValues,
  type Currency,
  type TaxRate,
} from "@/db/schema";
import { formatMoneyParts, formatTaxRate } from "@/domain/format";
import { computeTotals, parseQty, type LineInput } from "@/domain/iva";
import { MoneyError, parseAmount } from "@/domain/money";
import { DEFAULT_VALIDITY_DAYS } from "@/domain/documents";
import { createQuoteAction, updateQuoteAction } from "./actions";

/**
 * The quote editor: header fields plus a line table.
 *
 * The running totals are computed with the very same `domain/iva` functions
 * the server uses to write the document, so what the user watches add up is
 * what gets stored — including the per-line IVA rounding.
 */

export type CustomerOption = {
  id: number;
  name: string;
  docLocale: string;
};

export type ProductOption = {
  id: number;
  name: string;
  unit: string;
  /** Formatted for the currency it was priced in — see `currency`. */
  unitAmount: string;
  currency: Currency;
  taxRate: TaxRate;
};

export type LineValues = {
  productId: string;
  description: string;
  unit: string;
  qty: string;
  unitAmount: string;
  taxRate: TaxRate;
};

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

export function emptyLine(): LineValues {
  return { productId: "", description: "", unit: "", qty: "1", unitAmount: "", taxRate: "10" };
}

function Submit({ label, ghost }: { label: string; ghost?: boolean }) {
  const t = useTranslations("quotes");
  const { pending } = useFormStatus();

  return (
    <button type="submit" className={ghost ? ghostButtonClass : buttonClass} disabled={pending}>
      {pending ? t("saving") : label}
    </button>
  );
}

/** Read a typed line into the domain's shape, or null while it is incomplete. */
function toLineInput(line: LineValues, currency: Currency): LineInput | null {
  try {
    const qty = parseQty(line.qty === "" ? "1" : line.qty);
    const unitAmount = parseAmount(line.unitAmount === "" ? "0" : line.unitAmount, currency);
    if (qty <= 0 || unitAmount < 0) return null;
    return { qty, unitAmount, taxRate: line.taxRate };
  } catch (error) {
    if (error instanceof MoneyError || error instanceof Error) return null;
    throw error;
  }
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
  const uiLocale = useLocale() === "en" ? "en" : "es";

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

  const totals = computeTotals(
    lines.map((line) => toLineInput(line, currency)).filter((line) => line !== null),
    currency,
  );

  const updateLine = (index: number, patch: Partial<LineValues>) =>
    setLines((current) =>
      current.map((line, at) => (at === index ? { ...line, ...patch } : line)),
    );

  /** Choosing a catalogue product fills the row; it stays editable after. */
  const applyProduct = (index: number, productId: string) => {
    const product = products.find((candidate) => String(candidate.id) === productId);
    if (!product) return updateLine(index, { productId: "" });

    updateLine(index, {
      productId,
      description: product.name,
      unit: product.unit,
      taxRate: product.taxRate,
      // Only carry the price across when the currencies match — a USD price
      // pasted into a guaraní quote would be off by a factor of thousands.
      unitAmount: product.currency === currency ? product.unitAmount : "",
    });
  };

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

      <div className="flex flex-col gap-[var(--s-3)]">
        <div className="flex items-end justify-between gap-[var(--s-3)]">
          <h2 className="m-0 text-[length:var(--t-1)]">{t("lines")}</h2>
          {error("lines") ? (
            <p role="alert" className="m-0 text-[length:var(--t--1)] text-danger">
              {error("lines")}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-[var(--s-4)]">
          {lines.map((line, index) => (
            <div
              key={index}
              className="grid gap-[var(--s-3)] rounded-md border border-hairline p-[var(--s-4)] lg:grid-cols-[minmax(0,2fr)_5rem_6rem_8rem_7rem_auto] lg:items-end"
            >
              <input type="hidden" name="lineProductId" value={line.productId} />

              <div className="flex flex-col gap-[var(--s-2)]">
                <label
                  htmlFor={`lineDescription-${index}`}
                  className="text-[length:var(--t--1)] font-medium text-ink-70"
                >
                  {t("lineDescription")}
                </label>
                {products.length > 0 ? (
                  <select
                    aria-label={t("chooseProduct")}
                    value={line.productId}
                    onChange={(event) => applyProduct(index, event.currentTarget.value)}
                    className={`${inputClass} min-h-10 text-[length:var(--t--1)]`}
                  >
                    <option value="">{t("chooseProduct")}</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                ) : null}
                <input
                  id={`lineDescription-${index}`}
                  name="lineDescription"
                  value={line.description}
                  onChange={(event) =>
                    updateLine(index, { description: event.currentTarget.value })
                  }
                  maxLength={300}
                  className={inputClass}
                />
                {error(`lines.${index}.description`) ? (
                  <p role="alert" className="m-0 text-[length:var(--t--1)] text-danger">
                    {error(`lines.${index}.description`)}
                  </p>
                ) : null}
              </div>

              <Field
                label={t("lineQty")}
                htmlFor={`lineQty-${index}`}
                error={error(`lines.${index}.qty`)}
              >
                <input
                  id={`lineQty-${index}`}
                  name="lineQty"
                  value={line.qty}
                  onChange={(event) => updateLine(index, { qty: event.currentTarget.value })}
                  inputMode="decimal"
                  className={`${inputClass} tabular`}
                />
              </Field>

              <Field label={t("lineUnit")} htmlFor={`lineUnit-${index}`}>
                <input
                  id={`lineUnit-${index}`}
                  name="lineUnit"
                  value={line.unit}
                  onChange={(event) => updateLine(index, { unit: event.currentTarget.value })}
                  maxLength={30}
                  placeholder={t("unitPlaceholder")}
                  className={inputClass}
                />
              </Field>

              <Field
                label={t("lineUnitAmount")}
                htmlFor={`lineUnitAmount-${index}`}
                error={error(`lines.${index}.unitAmount`)}
              >
                <input
                  id={`lineUnitAmount-${index}`}
                  name="lineUnitAmount"
                  value={line.unitAmount}
                  onChange={(event) =>
                    updateLine(index, { unitAmount: event.currentTarget.value })
                  }
                  inputMode="decimal"
                  className={`${inputClass} tabular`}
                />
              </Field>

              <Field label={t("lineTaxRate")} htmlFor={`lineTaxRate-${index}`}>
                <select
                  id={`lineTaxRate-${index}`}
                  name="lineTaxRate"
                  value={line.taxRate}
                  onChange={(event) =>
                    updateLine(index, { taxRate: event.currentTarget.value as TaxRate })
                  }
                  className={inputClass}
                >
                  {taxRateValues.map((value) => (
                    <option key={value} value={value}>
                      {formatTaxRate(value, uiLocale)}
                    </option>
                  ))}
                </select>
              </Field>

              <button
                type="button"
                onClick={() =>
                  setLines((current) =>
                    current.length === 1
                      ? [emptyLine()]
                      : current.filter((_, at) => at !== index),
                  )
                }
                className="min-h-11 rounded-sm border border-hairline-strong px-[var(--s-3)] text-[length:var(--t--1)] text-ink-70"
              >
                {t("removeLine")}
              </button>
            </div>
          ))}
        </div>

        <div>
          <button
            type="button"
            onClick={() => setLines((current) => [...current, emptyLine()])}
            className={ghostButtonClass}
          >
            {t("addLine")}
          </button>
        </div>
      </div>

      {/* Running totals, per rate, exactly as the PDF will print them. */}
      <div className="flex justify-end">
        <dl className="m-0 w-full max-w-sm rounded-md border border-hairline bg-surface-2 p-[var(--s-4)]">
          <Total label={t("subtotal10")} value={formatMoneyParts(totals.subtotal10, currency)} />
          <Total label={t("subtotal5")} value={formatMoneyParts(totals.subtotal5, currency)} />
          <Total
            label={t("subtotalExenta")}
            value={formatMoneyParts(totals.subtotalExenta, currency)}
          />
          <Total label={t("ivaTotal")} value={formatMoneyParts(totals.ivaTotal, currency)} muted />
          <Total label={t("total")} value={formatMoneyParts(totals.total, currency)} strong />
        </dl>
      </div>

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

function Total({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-[var(--s-4)] py-[var(--s-1)] ${
        strong ? "mt-[var(--s-2)] border-t border-hairline-strong pt-[var(--s-3)]" : ""
      }`}
    >
      <dt className={`m-0 text-[length:var(--t--1)] ${muted ? "text-ink-55" : "text-ink-70"}`}>
        {label}
      </dt>
      <dd className={`tabular m-0 ${strong ? "text-[length:var(--t-1)] font-medium" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
