import { currencyValues, taxRateValues, type Currency, type TaxRate } from "@/db/schema";
import { field } from "@/lib/forms";
import {
  Errors,
  enumValue,
  moneyField,
  optionalText,
  requiredText,
  type FieldErrors,
} from "@/lib/validation";

/**
 * Product / service form parsing — pure, so the rules are unit-testable
 * without a database or a session. The unit price is IVA-**inclusive**, the
 * way a Paraguayan price list is written and the way `document_lines` stores
 * it, and it is held as integer minor units of its currency (guardrail 1).
 */

export type ProductInput = {
  name: string;
  description: string | null;
  unit: string;
  /** IVA-inclusive unit price in minor units of `currency`. */
  unitAmount: number;
  currency: Currency;
  taxRate: TaxRate;
};

/** Fields echoed back on error so a validation failure never blanks the form. */
export const PRODUCT_FIELDS = [
  "name",
  "description",
  "unit",
  "unitAmount",
  "currency",
  "taxRate",
] as const;

export type ParsedProduct =
  | { ok: true; values: ProductInput }
  | { ok: false; fieldErrors: FieldErrors };

export function parseProduct(formData: FormData): ParsedProduct {
  const errors = new Errors();

  const name = requiredText(field(formData, "name"), 200);
  if (!name.ok) errors.set("name", name.error);

  const description = optionalText(field(formData, "description"), 2000);
  if (!description.ok) errors.set("description", description.error);

  const unit = requiredText(field(formData, "unit"), 30);
  if (!unit.ok) errors.set("unit", unit.error);

  const currency = enumValue(field(formData, "currency"), currencyValues);
  if (!currency.ok) errors.set("currency", currency.error);

  const taxRate = enumValue(field(formData, "taxRate"), taxRateValues);
  if (!taxRate.ok) errors.set("taxRate", taxRate.error);

  // The amount can only be read once the currency is known — PYG has no
  // decimals, USD has two, and "1.500" means different things in each.
  let unitAmount = 0;
  if (currency.ok) {
    const amount = moneyField(field(formData, "unitAmount"), currency.value);
    if (amount.ok) unitAmount = amount.value;
    else errors.set("unitAmount", amount.error);
  }

  if (errors.any) return { ok: false, fieldErrors: errors.all };
  if (!name.ok || !description.ok || !unit.ok || !currency.ok || !taxRate.ok) {
    throw new Error("unreachable");
  }

  return {
    ok: true,
    values: {
      name: name.value,
      description: description.value,
      unit: unit.value,
      unitAmount,
      currency: currency.value,
      taxRate: taxRate.value,
    },
  };
}
