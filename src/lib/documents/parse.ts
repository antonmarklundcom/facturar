import {
  currencyValues,
  localeValues,
  paymentMethodValues,
  taxRateValues,
  type Currency,
  type DocumentLocale,
  type DocumentType,
  type PaymentMethod,
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
import {
  DEFAULT_CREDIT_DAYS,
  DEFAULT_VALIDITY_DAYS,
  dueDateFrom,
  requiresDueDate,
  validUntilFrom,
} from "@/domain/documents";

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

/* -------------------------------------------------------------------------- */
/* invoices                                                                    */
/* -------------------------------------------------------------------------- */

export type InvoiceInput = {
  type: Extract<DocumentType, "invoice_contado" | "invoice_credito">;
  customerId: number;
  docLocale: DocumentLocale;
  currency: Currency;
  issueDate: string;
  /** Only a factura a crédito has one. */
  dueDate: string | null;
  notes: string | null;
  lines: DocumentLineInput[];
};

export const INVOICE_FIELDS = [
  "type",
  "customerId",
  "docLocale",
  "currency",
  "issueDate",
  "creditDays",
  "notes",
] as const;

const MAX_CREDIT_DAYS = 365;

export type ParsedInvoice =
  | { ok: true; values: InvoiceInput }
  | { ok: false; fieldErrors: FieldErrors };

/**
 * Invoice draft parsing. Shares the line rules with quotes — the lines are the
 * same thing, and PR-9 already tests them — and adds the credit terms.
 *
 * Nothing here allocates a number: a number comes only from the PR-4
 * generator, inside the issuing transaction (guardrail 6).
 */
export function parseInvoice(formData: FormData, today: string): ParsedInvoice {
  const asQuote = parseQuote(formData, today);

  const errors = new Errors();
  const type = enumValue(field(formData, "type"), [
    "invoice_contado",
    "invoice_credito",
  ] as const);
  if (!type.ok) errors.set("type", type.error);

  // Credit terms are read as a number of days, the way they are agreed
  // ("a 30 días"), and the date is derived.
  let creditDays = DEFAULT_CREDIT_DAYS;
  const creditRaw = field(formData, "creditDays");
  if (creditRaw !== "") {
    const parsed = Number(creditRaw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_CREDIT_DAYS) {
      errors.set("creditDays", "invalid");
    } else {
      creditDays = parsed;
    }
  }

  if (!asQuote.ok) {
    // The quote parser owns customer, currency, dates and lines; merge both
    // sets so the form is fixed in one pass.
    return { ok: false, fieldErrors: { ...asQuote.fieldErrors, ...errors.all } };
  }
  if (errors.any) return { ok: false, fieldErrors: errors.all };
  if (!type.ok) throw new Error("unreachable");

  return {
    ok: true,
    values: {
      type: type.value,
      customerId: asQuote.values.customerId,
      docLocale: asQuote.values.docLocale,
      currency: asQuote.values.currency,
      issueDate: asQuote.values.issueDate,
      dueDate: requiresDueDate(type.value)
        ? dueDateFrom(asQuote.values.issueDate, creditDays)
        : null,
      notes: asQuote.values.notes,
      lines: asQuote.values.lines,
    },
  };
}

/** Credit days a stored invoice was written with, for the edit form. */
export function creditDaysBetween(issueDate: string, dueDate: string): number {
  return validityDaysBetween(issueDate, dueDate);
}

/* -------------------------------------------------------------------------- */
/* payments and credit notes                                                   */
/* -------------------------------------------------------------------------- */

export type PaymentInput = {
  amount: number;
  currency: Currency;
  method: PaymentMethod;
  paidAt: Date;
  reference: string | null;
  notes: string | null;
};

export const PAYMENT_FIELDS = [
  "amount",
  "method",
  "paidAt",
  "reference",
  "paymentNotes",
] as const;

export type ParsedPayment =
  | { ok: true; values: PaymentInput }
  | { ok: false; fieldErrors: FieldErrors };

/**
 * A payment against an invoice. The currency is the **invoice's** — a payment
 * in another currency is a different conversation (exchange rates on
 * settlement), and letting the form choose one would silently mis-scale the
 * amount (guardrail 1).
 */
export function parsePayment(
  formData: FormData,
  currency: Currency,
  today: string,
): ParsedPayment {
  const errors = new Errors();

  const amount = moneyField(field(formData, "amount"), currency, { allowZero: false });
  if (!amount.ok) errors.set("amount", amount.error);

  const method = enumValue(field(formData, "method"), paymentMethodValues);
  if (!method.ok) errors.set("method", method.error);

  const paidAtRaw = field(formData, "paidAt");
  const paidAtDate = DATE_PATTERN.test(paidAtRaw) ? paidAtRaw : today;
  if (paidAtRaw !== "" && !DATE_PATTERN.test(paidAtRaw)) errors.set("paidAt", "invalid");
  // A payment cannot have been received in the future.
  if (paidAtDate > today) errors.set("paidAt", "future");

  const reference = optionalText(field(formData, "reference"), 120);
  if (!reference.ok) errors.set("reference", reference.error);

  const notes = optionalText(field(formData, "paymentNotes"), 2000);
  if (!notes.ok) errors.set("paymentNotes", notes.error);

  if (errors.any) return { ok: false, fieldErrors: errors.all };
  if (!amount.ok || !method.ok || !reference.ok || !notes.ok) {
    throw new Error("unreachable");
  }

  return {
    ok: true,
    values: {
      amount: amount.value,
      currency,
      method: method.value,
      // Stored as an instant at Asunción midday, so a date-only entry cannot
      // drift across a day boundary when rendered back in UTC.
      paidAt: new Date(`${paidAtDate}T15:00:00.000Z`),
      reference: reference.value,
      notes: notes.value,
    },
  };
}

export type CreditNoteInput = {
  lines: DocumentLineInput[];
  notes: string | null;
};

export const CREDIT_NOTE_FIELDS = ["creditNotes"] as const;

export type ParsedCreditNote =
  | { ok: true; values: CreditNoteInput }
  | { ok: false; fieldErrors: FieldErrors };

/**
 * A credit note's lines. Same editor and same rules as an invoice's — a credit
 * note is an invoice in reverse, and its IVA has to break down per rate the
 * same way, or the two documents will not reconcile.
 *
 * The amounts are entered positive; the note's *meaning* is the reversal.
 */
export function parseCreditNote(
  formData: FormData,
  currency: Currency,
  today: string,
): ParsedCreditNote {
  const data = new FormData();
  for (const [name, value] of formData.entries()) data.append(name, value);

  // Reuse the line rules wholesale by handing the quote parser the header it
  // expects; only the lines and the note text are read back out.
  data.set("customerId", field(formData, "customerId") || "1");
  data.set("docLocale", "es");
  data.set("currency", currency);
  data.set("issueDate", today);
  data.set("validityDays", "1");
  data.set("notes", field(formData, "creditNotes"));

  const parsed = parseQuote(data, today);
  if (!parsed.ok) {
    // The customer is the invoice's, not something this form asked for.
    const fieldErrors = { ...parsed.fieldErrors };
    delete fieldErrors.customerId;
    return { ok: false, fieldErrors };
  }

  return { ok: true, values: { lines: parsed.values.lines, notes: parsed.values.notes } };
}
