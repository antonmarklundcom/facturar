import type { Currency, DocumentStatus, PaymentMethod } from "@/db/schema";
import { daysBetween } from "./timbrado";

/**
 * Payment state of an issued invoice.
 *
 * An invoice's status is **derived**, never typed in: it is a function of what
 * has been paid against it, what has been credited back, and the calendar.
 * Keeping that as a pure function means the dashboard, the invoice screen and
 * the PDF all answer the question the same way, and the answer is testable
 * without a database (guardrail 8).
 *
 * All amounts are integer minor units of the document's currency (guardrail 1).
 */

export type PaymentLike = {
  amount: number;
  currency: Currency;
};

/** Cash actually received against a document. */
export function paidTotal(payments: readonly PaymentLike[]): number {
  return payments.reduce((total, payment) => total + payment.amount, 0);
}

/**
 * Amount owed after payments and credit notes.
 *
 * Clamped at zero: an overpayment or an over-credit is a data problem to
 * report, not a negative debt to carry around. `overpaid()` is how a caller
 * asks about it.
 */
export function outstanding(total: number, paid: number, credited: number): number {
  return Math.max(0, total - paid - credited);
}

/** How much more than the invoice has been paid or credited, if any. */
export function overpaid(total: number, paid: number, credited: number): number {
  return Math.max(0, paid + credited - total);
}

export type PaymentState = {
  /** Invoice total, minor units. */
  total: number;
  paid: number;
  credited: number;
  /** `yyyy-mm-dd`, or null for a contado invoice. */
  dueDate: string | null;
  /** `yyyy-mm-dd` in Asunción civil time. */
  today: string;
};

/**
 * The status an issued invoice should be showing.
 *
 * Order of precedence, and why:
 *
 * 1. **anulada** — credit notes cover the whole invoice. The document has been
 *    undone; nothing else about it matters any more.
 * 2. **pagada** — payments plus credits cover it. Settled.
 * 3. **vencida** — still owing and past its due date. This outranks `parcial`
 *    on purpose: "half paid and three weeks late" is a collections problem,
 *    and the dashboard needs to surface it as one.
 * 4. **parcial** — something has been paid, but not all of it.
 * 5. **pendiente** — nothing paid, not yet due.
 *
 * A contado invoice has no due date, so it never becomes `vencida` by itself.
 */
export function derivePaymentStatus(state: PaymentState): DocumentStatus {
  const covered = state.paid + state.credited;

  if (state.total > 0 && state.credited >= state.total) return "anulada";
  if (state.total > 0 && covered >= state.total) return "pagada";
  if (state.total === 0) return "pagada";

  if (state.dueDate !== null && daysBetween(state.today, state.dueDate) < 0) {
    return "vencida";
  }

  return covered > 0 ? "parcial" : "pendiente";
}

/**
 * Can this payment be recorded? Returns a problem key rather than a boolean so
 * the form can say why (guardrail 5 — keys, never text).
 */
export type PaymentProblem =
  | "not_issued"
  | "voided"
  | "already_paid"
  | "exceeds_outstanding"
  | "wrong_currency"
  | "not_positive";

export function paymentProblem(options: {
  status: DocumentStatus;
  isIssued: boolean;
  currency: Currency;
  outstandingAmount: number;
  payment: PaymentLike;
}): PaymentProblem | null {
  if (!options.isIssued) return "not_issued";
  if (options.status === "anulada") return "voided";
  if (options.payment.amount <= 0) return "not_positive";
  if (options.payment.currency !== options.currency) return "wrong_currency";
  if (options.outstandingAmount === 0) return "already_paid";
  // Paying more than is owed is almost always a typo, and an unexplained
  // credit balance is worse than a rejected form.
  if (options.payment.amount > options.outstandingAmount) return "exceeds_outstanding";
  return null;
}

/** Methods a Paraguayan SMB is actually paid by, in the order they are used. */
export const PAYMENT_METHOD_ORDER: readonly PaymentMethod[] = [
  "efectivo",
  "transferencia",
  "tigo_money",
  "billetera_personal",
  "zimple",
  "qr",
  "tarjeta",
  "cheque",
];

/* -------------------------------------------------------------------------- */
/* credit notes                                                                */
/* -------------------------------------------------------------------------- */

export type CreditProblem =
  | "not_issued"
  | "already_voided"
  | "exceeds_invoice"
  | "not_positive"
  | "wrong_currency";

/**
 * Can this credit note be issued against that invoice? A credit note may cover
 * part or all of an invoice, but the total credited can never exceed it — that
 * would turn a correction into a refund the invoice never justified.
 */
export function creditProblem(options: {
  invoiceStatus: DocumentStatus;
  invoiceIsIssued: boolean;
  invoiceTotal: number;
  invoiceCurrency: Currency;
  alreadyCredited: number;
  creditTotal: number;
  creditCurrency: Currency;
}): CreditProblem | null {
  if (!options.invoiceIsIssued) return "not_issued";
  if (options.invoiceStatus === "anulada") return "already_voided";
  if (options.creditTotal <= 0) return "not_positive";
  if (options.creditCurrency !== options.invoiceCurrency) return "wrong_currency";
  if (options.alreadyCredited + options.creditTotal > options.invoiceTotal) {
    return "exceeds_invoice";
  }
  return null;
}

/** How much of an invoice may still be credited. */
export function creditableAmount(invoiceTotal: number, alreadyCredited: number): number {
  return Math.max(0, invoiceTotal - alreadyCredited);
}
