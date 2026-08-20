"use client";

import { useLocale, useTranslations } from "next-intl";
import { Field, ghostButtonClass, inputClass } from "@/components/ui/field";
import { taxRateValues, type Currency, type TaxRate } from "@/db/schema";
import { formatMoneyParts, formatTaxRate } from "@/domain/format";
import { computeTotals, parseQty, type DocumentTotals, type LineInput } from "@/domain/iva";
import { MoneyError, parseAmount } from "@/domain/money";

/**
 * The line editor and its running totals — shared by quotes (PR-9) and
 * invoices (PR-10), which put the same lines on the same `document_lines`
 * table. Credit notes in PR-11 will use it too.
 *
 * The totals are computed with the very same `domain/iva` functions the server
 * writes with, so what a user watches add up is what gets stored, per-line
 * rounding included.
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
  /** Formatted the way a human types it, in `currency`. */
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

/**
 * Screens that use the editor. Each one's catalogue carries the same line
 * labels, so the editor reads them from whichever namespace it is used in.
 */
export type LineNamespace = "quotes" | "invoices" | "creditNotes";

export function emptyLine(): LineValues {
  return { productId: "", description: "", unit: "", qty: "1", unitAmount: "", taxRate: "10" };
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

export function runningTotals(lines: LineValues[], currency: Currency): DocumentTotals {
  return computeTotals(
    lines.map((line) => toLineInput(line, currency)).filter((line) => line !== null),
    currency,
  );
}

export function LineEditor({
  lines,
  setLines,
  products,
  currency,
  error,
  namespace,
}: {
  lines: LineValues[];
  setLines: (update: (current: LineValues[]) => LineValues[]) => void;
  products: ProductOption[];
  currency: Currency;
  error: (name: string) => string | undefined;
  /** Message namespace of the screen using the editor. */
  namespace: LineNamespace;
}) {
  const t = useTranslations(namespace);
  // Rate labels are UI text, so they follow the viewer's language; document
  // text follows the document's locale, which the PDF owns.
  const uiLocale = useLocale() === "en" ? "en" : "es";

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
      // pasted into a guaraní document would be wrong by a factor of thousands.
      unitAmount: product.currency === currency ? product.unitAmount : "",
    });
  };

  return (
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
                  current.length === 1 ? [emptyLine()] : current.filter((_, at) => at !== index),
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
  );
}

/** The per-rate breakdown, laid out the way the PDF prints it. */
export function TotalsPanel({
  totals,
  currency,
  namespace,
}: {
  totals: DocumentTotals;
  currency: Currency;
  namespace: LineNamespace;
}) {
  const t = useTranslations(namespace);

  return (
    <div className="flex justify-end">
      <dl className="m-0 w-full max-w-sm rounded-md border border-hairline bg-surface-2 p-[var(--s-4)]">
        <TotalRow label={t("subtotal10")} value={formatMoneyParts(totals.subtotal10, currency)} />
        <TotalRow label={t("subtotal5")} value={formatMoneyParts(totals.subtotal5, currency)} />
        <TotalRow
          label={t("subtotalExenta")}
          value={formatMoneyParts(totals.subtotalExenta, currency)}
        />
        <TotalRow label={t("ivaTotal")} value={formatMoneyParts(totals.ivaTotal, currency)} muted />
        <TotalRow label={t("total")} value={formatMoneyParts(totals.total, currency)} strong />
      </dl>
    </div>
  );
}

export function TotalRow({
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
