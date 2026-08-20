import {
  currencyValues,
  localeValues,
  taxRateValues,
  type Currency,
  type DocumentLocale,
  type TaxRate,
} from "@/db/schema";
import { field } from "@/lib/forms";
import {
  Errors,
  enumValue,
  idField,
  moneyField,
  optionalText,
  requiredText,
  type FieldErrors,
} from "@/lib/validation";
import { parseQty } from "@/domain/iva";
import { DEFAULT_VALIDITY_DAYS, validUntilFrom } from "@/domain/documents";

/**
 * Quote form parsing — pure, so the line-item rules are unit-testable without
 * a database or a session.
 *
 * Lines arrive as parallel repeated fields (`lineDescription`, `lineQty`, …)
 * rather than as `lines[0][description]`: `FormData.getAll()` keeps them
 * index-aligned, and a row the user cleared out simply drops away.
 */

export type DocumentLineInput = {
  /** Null for a free-text line that is not in the catalogue. */
  productId: number | null;
  description: string;
  unit: string;
  /** Fixed-point ×1000. */
  qty: number;
  /** IVA-inclusive unit price in minor units of the document currency. */
  unitAmount: number;
  taxRate: TaxRate;
  position: number;
};

export type QuoteInput = {
  customerId: number;
  docLocale: DocumentLocale;
  currency: Currency;
  /** `yyyy-mm-dd`. */
  issueDate: string;
  /** `yyyy-mm-dd`, inclusive. */
  validUntil: string;
  notes: string | null;
  lines: DocumentLineInput[];
};

export const QUOTE_FIELDS = [
  "customerId",
  "docLocale",
  "currency",
  "issueDate",
  "validityDays",
  "notes",
] as const;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_LINES = 60;
const MAX_VALIDITY_DAYS = 365;

export type ParsedQuote =
  | { ok: true; values: QuoteInput }
  | { ok: false; fieldErrors: FieldErrors };

/** One row of the line editor, before validation. */
type RawLine = {
  productId: string;
  description: string;
  unit: string;
  qty: string;
  unitAmount: string;
  taxRate: string;
};

function rawLines(formData: FormData): RawLine[] {
  const column = (name: string) =>
    formData.getAll(name).map((value) => (typeof value === "string" ? value.trim() : ""));

  const descriptions = column("lineDescription");
  const productIds = column("lineProductId");
  const units = column("lineUnit");
  const quantities = column("lineQty");
  const amounts = column("lineUnitAmount");
  const rates = column("lineTaxRate");

  return descriptions.map((description, index) => ({
    description,
    productId: productIds[index] ?? "",
    unit: units[index] ?? "",
    qty: quantities[index] ?? "",
    unitAmount: amounts[index] ?? "",
    taxRate: rates[index] ?? "",
  }));
}

/** A row the user left completely alone is not an error — it is not a line. */
function isBlank(line: RawLine): boolean {
  return (
    line.description === "" &&
    line.unitAmount === "" &&
    (line.qty === "" || line.qty === "1") &&
    line.productId === ""
  );
}

export function parseQuote(formData: FormData, today: string): ParsedQuote {
  const errors = new Errors();

  const customerId = idField(field(formData, "customerId"));
  if (!customerId.ok) errors.set("customerId", "required");

  const docLocale = enumValue(field(formData, "docLocale"), localeValues);
  if (!docLocale.ok) errors.set("docLocale", docLocale.error);

  const currency = enumValue(field(formData, "currency"), currencyValues);
  if (!currency.ok) errors.set("currency", currency.error);

  const issueDateRaw = field(formData, "issueDate");
  const issueDate = DATE_PATTERN.test(issueDateRaw) ? issueDateRaw : today;
  if (issueDateRaw !== "" && !DATE_PATTERN.test(issueDateRaw)) {
    errors.set("issueDate", "invalid");
  }

  // Paraguayan quotes are written as "válido por X días", so the form asks
  // for the window and the date is derived — one fewer thing to get wrong.
  const validityRaw = field(formData, "validityDays");
  let validityDays = DEFAULT_VALIDITY_DAYS;
  if (validityRaw !== "") {
    const parsed = Number(validityRaw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_VALIDITY_DAYS) {
      errors.set("validityDays", "invalid");
    } else {
      validityDays = parsed;
    }
  }

  const notes = optionalText(field(formData, "notes"), 2000);
  if (!notes.ok) errors.set("notes", notes.error);

  const lines: DocumentLineInput[] = [];
  const rows = rawLines(formData).filter((line) => !isBlank(line));

  if (rows.length === 0) errors.set("lines", "required");
  if (rows.length > MAX_LINES) errors.set("lines", "too_many");

  rows.forEach((row, index) => {
    const prefix = `lines.${index}`;

    const description = requiredText(row.description, 300);
    if (!description.ok) errors.set(`${prefix}.description`, description.error);

    const unit = requiredText(row.unit === "" ? "unidad" : row.unit, 30);
    if (!unit.ok) errors.set(`${prefix}.unit`, unit.error);

    let qty = 0;
    try {
      qty = parseQty(row.qty === "" ? "1" : row.qty);
      if (qty <= 0) errors.set(`${prefix}.qty`, "positive");
    } catch {
      errors.set(`${prefix}.qty`, "invalid");
    }

    let unitAmount = 0;
    if (currency.ok) {
      // The currency has to be known first: "1.500" is 1 500 guaraníes but
      // 150 000 cents (guardrail 1).
      const amount = moneyField(row.unitAmount, currency.value);
      if (amount.ok) unitAmount = amount.value;
      else errors.set(`${prefix}.unitAmount`, amount.error);
    }

    const taxRate = enumValue(row.taxRate, taxRateValues);
    if (!taxRate.ok) errors.set(`${prefix}.taxRate`, taxRate.error);

    let productId: number | null = null;
    if (row.productId !== "") {
      const parsed = idField(row.productId);
      if (parsed.ok) productId = parsed.value;
      else errors.set(`${prefix}.productId`, parsed.error);
    }

    if (description.ok && unit.ok && taxRate.ok) {
      lines.push({
        productId,
        description: description.value,
        unit: unit.value,
        qty,
        unitAmount,
        taxRate: taxRate.value,
        position: index,
      });
    }
  });

  if (errors.any) return { ok: false, fieldErrors: errors.all };
  if (!customerId.ok || !docLocale.ok || !currency.ok || !notes.ok) {
    throw new Error("unreachable");
  }

  return {
    ok: true,
    values: {
      customerId: customerId.value,
      docLocale: docLocale.value,
      currency: currency.value,
      issueDate,
      validUntil: validUntilFrom(issueDate, validityDays),
      notes: notes.value,
      lines,
    },
  };
}

/** Days of validity a stored quote was written with, for the edit form. */
export function validityDaysBetween(issueDate: string, validUntil: string): number {
  const at = (value: string) => {
    const [year, month, day] = value.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((at(validUntil) - at(issueDate)) / 86_400_000);
}
