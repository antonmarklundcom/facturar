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
import { currencyValues, taxRateValues, type Currency, type TaxRate } from "@/db/schema";
import { formatMoneyParts, formatTaxRate } from "@/domain/format";
import { ivaIncludedIn } from "@/domain/iva";
import { MoneyError, parseAmount } from "@/domain/money";
import {
  createProductAction,
  setProductActiveAction,
  updateProductAction,
} from "./actions";

export type ProductValues = {
  id?: number;
  name: string;
  description: string;
  unit: string;
  /** As typed by a human: "1.500.000", not minor units. */
  unitAmount: string;
  currency: string;
  taxRate: string;
  active?: boolean;
};

const EMPTY = (currency: Currency): ProductValues => ({
  name: "",
  description: "",
  unit: "",
  unitAmount: "",
  currency,
  taxRate: "10",
});

function Submit({ label, ghost }: { label: string; ghost?: boolean }) {
  const t = useTranslations("products");
  const { pending } = useFormStatus();

  return (
    <button type="submit" className={ghost ? ghostButtonClass : buttonClass} disabled={pending}>
      {pending ? t("saving") : label}
    </button>
  );
}

/**
 * Shared fields. The price preview runs the same `domain/money` +
 * `domain/iva` functions the server does, so what the form shows is what will
 * be stored — including the IVA already contained in the price, which is the
 * part people get wrong when they read a Paraguayan price list.
 */
function ProductFields({
  values,
  error,
  echoed,
}: {
  values: ProductValues;
  error: (name: string) => string | undefined;
  echoed?: Record<string, string>;
}) {
  const t = useTranslations("products");
  // Rate labels are UI text, so they follow the viewer's language. Document
  // text follows the document's locale — that is PR-9's job, not this form's.
  const uiLocale = useLocale() === "en" ? "en" : "es";
  const suffix = values.id ?? "new";

  const initial = (name: keyof ProductValues) =>
    echoed?.[name] ?? (values[name] as string | undefined) ?? "";

  const [currency, setCurrency] = useState<Currency>(
    (initial("currency") || "PYG") as Currency,
  );
  const [taxRate, setTaxRate] = useState<TaxRate>((initial("taxRate") || "10") as TaxRate);
  const [amount, setAmount] = useState(initial("unitAmount"));

  const preview = previewPrice(amount, currency, taxRate);

  return (
    <>
      <Field label={t("name")} htmlFor={`name-${suffix}`} error={error("name")}>
        <input
          id={`name-${suffix}`}
          name="name"
          defaultValue={initial("name")}
          required
          maxLength={200}
          autoComplete="off"
          className={inputClass}
        />
      </Field>

      <Field
        label={t("description")}
        htmlFor={`description-${suffix}`}
        hint={t("descriptionHint")}
        error={error("description")}
      >
        <textarea
          id={`description-${suffix}`}
          name="description"
          defaultValue={initial("description")}
          rows={2}
          maxLength={2000}
          className={`${inputClass} min-h-20 py-[var(--s-3)]`}
        />
      </Field>

      <div className="grid gap-[var(--s-4)] sm:grid-cols-2">
        <Field
          label={t("unitAmount")}
          htmlFor={`unitAmount-${suffix}`}
          hint={t("unitAmountHint")}
          error={error("unitAmount")}
        >
          <input
            id={`unitAmount-${suffix}`}
            name="unitAmount"
            value={amount}
            onChange={(event) => setAmount(event.currentTarget.value)}
            inputMode="decimal"
            required
            placeholder={currency === "PYG" ? "150.000" : "25,00"}
            className={`${inputClass} tabular`}
          />
        </Field>

        <Field
          label={t("currency")}
          htmlFor={`currency-${suffix}`}
          error={error("currency")}
        >
          <select
            id={`currency-${suffix}`}
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
        <Field
          label={t("taxRate")}
          htmlFor={`taxRate-${suffix}`}
          hint={t("taxRateHint")}
          error={error("taxRate")}
        >
          <select
            id={`taxRate-${suffix}`}
            name="taxRate"
            value={taxRate}
            onChange={(event) => setTaxRate(event.currentTarget.value as TaxRate)}
            className={inputClass}
          >
            {taxRateValues.map((value) => (
              <option key={value} value={value}>
                {formatTaxRate(value, uiLocale)}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label={t("unit")}
          htmlFor={`unit-${suffix}`}
          hint={t("unitHint")}
          error={error("unit")}
        >
          <input
            id={`unit-${suffix}`}
            name="unit"
            defaultValue={initial("unit") || t("units.default")}
            list={`units-${suffix}`}
            required
            maxLength={30}
            autoComplete="off"
            className={inputClass}
          />
          <datalist id={`units-${suffix}`}>
            {["default", "hour", "day", "service", "kg", "metre", "squareMetre"].map((key) => (
              <option key={key} value={t(`units.${key}`)} />
            ))}
          </datalist>
        </Field>
      </div>

      {preview ? (
        <p
          className="m-0 rounded-sm border border-hairline bg-surface-2 px-[var(--s-4)] py-[var(--s-3)] text-[length:var(--t--1)] text-ink-70"
          aria-live="polite"
        >
          <span className="tabular font-medium text-ink">{preview.price}</span>{" "}
          {preview.iva === null
            ? t("preview.exempt")
            : t("preview.ivaIncluded", { iva: preview.iva })}
        </p>
      ) : null}
    </>
  );
}

/** Format what the typed price will become, or nothing while it is unreadable. */
function previewPrice(
  raw: string,
  currency: Currency,
  taxRate: TaxRate,
): { price: string; iva: string | null } | null {
  if (raw.trim() === "") return null;

  let minor: number;
  try {
    minor = parseAmount(raw, currency);
  } catch (error) {
    if (error instanceof MoneyError) return null;
    throw error;
  }

  if (minor < 0) return null;

  return {
    price: formatMoneyParts(minor, currency),
    iva:
      taxRate === "exenta"
        ? null
        : formatMoneyParts(ivaIncludedIn(minor, taxRate), currency),
  };
}

function useProductForm(action: typeof createProductAction) {
  const t = useTranslations("products");
  const [state, formAction] = useActionState<FormState, FormData>(action, IDLE);

  const error = (name: string) =>
    state.fieldErrors?.[name] ? t(`errors.${state.fieldErrors[name]}`) : undefined;

  return { state, formAction, error, t };
}

export function CreateProductForm({ defaultCurrency }: { defaultCurrency: Currency }) {
  const { state, formAction, error, t } = useProductForm(createProductAction);

  return (
    <form action={formAction} className="flex flex-col gap-[var(--s-5)]" noValidate>
      {state.status === "error" && !state.fieldErrors ? (
        <FormMessage tone="error">{t(`errors.${state.messageKey}`)}</FormMessage>
      ) : null}
      {state.status === "success" ? (
        <FormMessage tone="success">{t("messages.created")}</FormMessage>
      ) : null}

      {/* Remount on every failed attempt so the echoed values land as
          defaultValue — React 19 resets the form once the action settles. */}
      <div key={state.attempt ?? 0} className="flex flex-col gap-[var(--s-5)]">
        <ProductFields
          values={EMPTY(defaultCurrency)}
          error={error}
          echoed={state.values}
        />
      </div>

      <div>
        <Submit label={t("create")} />
      </div>
    </form>
  );
}

export function EditProductForm({ values }: { values: ProductValues }) {
  const { state, formAction, error, t } = useProductForm(updateProductAction);

  return (
    <form action={formAction} className="flex flex-col gap-[var(--s-5)]" noValidate>
      <input type="hidden" name="productId" value={values.id} />

      {state.status === "error" && !state.fieldErrors ? (
        <FormMessage tone="error">{t(`errors.${state.messageKey}`)}</FormMessage>
      ) : null}
      {state.status === "success" ? (
        <FormMessage tone="success">{t("messages.updated")}</FormMessage>
      ) : null}

      <div key={state.attempt ?? 0} className="flex flex-col gap-[var(--s-5)]">
        <ProductFields
          values={values}
          error={error}
          echoed={state.values}
        />
      </div>

      <input type="hidden" name="active" value={values.active ? "true" : "false"} />

      <div>
        <Submit label={t("save")} />
      </div>
    </form>
  );
}

export function ProductActiveToggle({ id, active }: { id: number; active: boolean }) {
  const t = useTranslations("products");
  const [state, formAction] = useActionState<FormState, FormData>(
    setProductActiveAction,
    IDLE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-[var(--s-3)]">
      <input type="hidden" name="productId" value={id} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />

      {state.status === "error" ? (
        <FormMessage tone="error">{t(`errors.${state.messageKey}`)}</FormMessage>
      ) : null}
      {state.status === "success" ? (
        <FormMessage tone="success">{t(`messages.${state.messageKey}`)}</FormMessage>
      ) : null}

      <Submit label={active ? t("deactivate") : t("restore")} ghost />
    </form>
  );
}
