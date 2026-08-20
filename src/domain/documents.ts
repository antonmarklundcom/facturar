import type { DocumentStatus, DocumentType } from "@/db/schema";
import { daysBetween } from "./timbrado";

/**
 * Document type and status rules.
 *
 * `documents.status` is one enum spanning quotes, invoices and credit notes
 * (see ARCHITECTURE.md). That keeps the storage simple but means nothing in
 * the database stops an invoice landing in `aceptado`, a quote-only state.
 * This module is that guard, and it is pure so the rules are testable without
 * a database.
 */

export const QUOTE_STATUSES = [
  "borrador",
  "enviado",
  "aceptado",
  "rechazado",
  "vencido",
] as const satisfies readonly DocumentStatus[];

/**
 * Invoices and credit notes. `borrador` is included: an invoice exists as a
 * draft before it is issued, and only issuing gives it a number.
 */
export const INVOICE_STATUSES = [
  "borrador",
  "pendiente",
  "parcial",
  "pagada",
  "vencida",
  "anulada",
] as const satisfies readonly DocumentStatus[];

export function isQuote(type: DocumentType): boolean {
  return type === "quote";
}

export function isInvoice(type: DocumentType): boolean {
  return type === "invoice_contado" || type === "invoice_credito";
}

export function isCreditNote(type: DocumentType): boolean {
  return type === "credit_note";
}

/** The states this document type may ever be in. */
export function statusesFor(type: DocumentType): readonly DocumentStatus[] {
  return isQuote(type) ? QUOTE_STATUSES : INVOICE_STATUSES;
}

export function isStatusAllowed(type: DocumentType, status: DocumentStatus): boolean {
  return statusesFor(type).includes(status);
}

/**
 * Legal transitions for a quote. Acceptance and rejection are terminal:
 * a quote that has been accepted is the source of an invoice, and rewinding
 * it would orphan that link. `vencido` is reached by time, not by a user, but
 * a quote can be re-sent afterwards with a new validity date.
 */
const QUOTE_TRANSITIONS: Record<string, readonly DocumentStatus[]> = {
  borrador: ["enviado", "aceptado", "rechazado", "vencido"],
  enviado: ["aceptado", "rechazado", "vencido"],
  vencido: ["enviado", "aceptado", "rechazado"],
  aceptado: [],
  rechazado: [],
};

/**
 * Invoices and credit notes. Issuing is the one move PR-10 makes: a draft
 * becomes `pendiente` the moment it takes a number. Everything after that is
 * derived from payments (`parcial`, `pagada`, `vencida`) or from a credit note
 * (`anulada`), which is PR-11's table — a person never types those in.
 */
const INVOICE_TRANSITIONS: Record<string, readonly DocumentStatus[]> = {
  borrador: ["pendiente"],
  pendiente: [],
  parcial: [],
  pagada: [],
  vencida: [],
  anulada: [],
};

export function canTransition(
  type: DocumentType,
  from: DocumentStatus,
  to: DocumentStatus,
): boolean {
  if (!isStatusAllowed(type, from) || !isStatusAllowed(type, to)) return false;
  if (from === to) return false;

  const table = isQuote(type) ? QUOTE_TRANSITIONS : INVOICE_TRANSITIONS;
  return (table[from] ?? []).includes(to);
}

/**
 * A quote may be edited until it is decided. An accepted quote is frozen —
 * it is the record of what the customer agreed to, and an invoice points at
 * it. A rejected one is kept as it was for the same reason.
 */
export function isQuoteEditable(status: DocumentStatus): boolean {
  return status === "borrador" || status === "enviado" || status === "vencido";
}

/** Only an accepted quote turns into an invoice, and only once. */
export function isConvertible(
  type: DocumentType,
  status: DocumentStatus,
  alreadyConverted: boolean,
): boolean {
  if (!isQuote(type)) return false;
  if (alreadyConverted) return false;
  return status === "aceptado";
}

/** Default validity window offered on a new quote, in days. */
export const DEFAULT_VALIDITY_DAYS = 15;

/** `yyyy-mm-dd` this many days after `issueDate`, inclusive of the issue day. */
export function validUntilFrom(issueDate: string, days: number): string {
  if (!Number.isInteger(days) || days < 0) {
    throw new Error(`Validity must be a whole number of days, got ${days}`);
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(issueDate);
  if (!match) throw new Error(`Expected a yyyy-mm-dd date, got "${issueDate}"`);

  const at = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return new Date(at + days * 86_400_000).toISOString().slice(0, 10);
}

/** Days left on a quote, inclusive of the last valid day. Negative once past. */
export function daysOfValidityLeft(validUntil: string, today: string): number {
  return daysBetween(today, validUntil);
}

/**
 * Status a quote should be shown in, given the date. Expiry is a fact about
 * the calendar, so it is derived on read rather than waiting for a cron job
 * to write it — but only for a quote still awaiting an answer.
 */
export function effectiveQuoteStatus(
  status: DocumentStatus,
  validUntil: string | null,
  today: string,
): DocumentStatus {
  if (status !== "borrador" && status !== "enviado") return status;
  if (!validUntil) return status;
  return daysOfValidityLeft(validUntil, today) < 0 ? "vencido" : status;
}

/* -------------------------------------------------------------------------- */
/* invoices                                                                    */
/* -------------------------------------------------------------------------- */

/** Days a factura a crédito is given by default. */
export const DEFAULT_CREDIT_DAYS = 30;

/** A document that has taken a number is issued, and issued is forever. */
export function isIssued(document: {
  number?: string | null;
  issuedAt?: Date | null;
}): boolean {
  return Boolean(document.number) || Boolean(document.issuedAt);
}

/**
 * **The immutability rule** (guardrail 4). An issued invoice or credit note is
 * never edited and never deleted — a correction is a new credit note. A draft,
 * which has no number and has been shown to nobody, is ordinary editable data.
 *
 * This function is the single place that answer comes from; server actions
 * call it, and hiding the form is only the UX half.
 */
export function isDocumentEditable(document: {
  type: DocumentType;
  status: DocumentStatus;
  number?: string | null;
  issuedAt?: Date | null;
}): boolean {
  if (isQuote(document.type)) return isQuoteEditable(document.status);
  if (isIssued(document)) return false;
  return document.status === "borrador";
}

/** Only a draft can be issued, and only once. */
export function isIssuable(document: {
  type: DocumentType;
  status: DocumentStatus;
  number?: string | null;
  issuedAt?: Date | null;
}): boolean {
  if (isQuote(document.type)) return false;
  if (isIssued(document)) return false;
  return document.status === "borrador";
}

/** A factura a crédito carries a due date; a contado one is due on issue. */
export function requiresDueDate(type: DocumentType): boolean {
  return type === "invoice_credito";
}

/** `yyyy-mm-dd` this many days after the issue date. */
export function dueDateFrom(issueDate: string, days: number): string {
  return validUntilFrom(issueDate, days);
}

/** Days until a credit invoice falls due; negative once overdue. */
export function daysUntilDue(dueDate: string, today: string): number {
  return daysBetween(today, dueDate);
}

/**
 * Is an unpaid invoice overdue on this date? Payment state is PR-11's job —
 * this answers only the calendar half, and never overrides a paid or voided
 * invoice.
 */
export function isOverdue(
  status: DocumentStatus,
  dueDate: string | null,
  today: string,
): boolean {
  if (status !== "pendiente" && status !== "parcial") return false;
  if (!dueDate) return false;
  return daysUntilDue(dueDate, today) < 0;
}
