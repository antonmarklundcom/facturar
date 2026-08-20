import type { Currency, DocumentStatus, DocumentType } from "@/db/schema";
import { isInvoice } from "./documents";

/**
 * Period reporting: the IVA liquidation and the sales figures a Paraguayan
 * SMB hands to its accountant every month.
 *
 * Pure and row-shaped on purpose. The database can group and sum perfectly
 * well, but these are the numbers a tax return is built from — they belong
 * where they can be asserted exactly, next to the per-line rounding rules they
 * have to agree with (guardrail 8).
 *
 * Everything is integer minor units of its own currency (guardrail 1), and
 * currencies are **never** mixed: a period with both PYG and USD documents
 * reports two summaries, not one converted total.
 */

export type ReportableDocument = {
  type: DocumentType;
  status: DocumentStatus;
  currency: Currency;
  /** `yyyy-mm-dd`. */
  issueDate: string | null;
  subtotal10: number;
  subtotal5: number;
  subtotalExenta: number;
  iva10: number;
  iva5: number;
  total: number;
};

export type IvaSummary = {
  currency: Currency;
  /** Invoices counted. */
  documents: number;
  /** Credit notes counted, subtracted from every figure below. */
  creditNotes: number;
  gravadas10: number;
  gravadas5: number;
  exentas: number;
  iva10: number;
  iva5: number;
  ivaTotal: number;
  total: number;
};

const EMPTY = (currency: Currency): IvaSummary => ({
  currency,
  documents: 0,
  creditNotes: 0,
  gravadas10: 0,
  gravadas5: 0,
  exentas: 0,
  iva10: 0,
  iva5: 0,
  ivaTotal: 0,
  total: 0,
});

/** Documents that count towards a period's tax figures. */
export function countsTowardsIva(document: ReportableDocument): boolean {
  if (document.status === "borrador") return false;
  if (!isInvoice(document.type) && document.type !== "credit_note") return false;
  // An annulled invoice is fully covered by a credit note that is itself in
  // the period; counting both would subtract it twice.
  return document.status !== "anulada" || document.type === "credit_note";
}

/**
 * Roll a period up per currency. A credit note subtracts, which is exactly
 * what it does to the tax owed.
 */
export function ivaSummaries(
  documents: readonly ReportableDocument[],
): IvaSummary[] {
  const byCurrency = new Map<Currency, IvaSummary>();

  for (const document of documents) {
    if (!countsTowardsIva(document)) continue;

    const summary = byCurrency.get(document.currency) ?? EMPTY(document.currency);
    const sign = document.type === "credit_note" ? -1 : 1;

    if (sign === 1) summary.documents += 1;
    else summary.creditNotes += 1;

    summary.gravadas10 += sign * document.subtotal10;
    summary.gravadas5 += sign * document.subtotal5;
    summary.exentas += sign * document.subtotalExenta;
    summary.iva10 += sign * document.iva10;
    summary.iva5 += sign * document.iva5;
    summary.total += sign * document.total;
    summary.ivaTotal = summary.iva10 + summary.iva5;

    byCurrency.set(document.currency, summary);
  }

  return [...byCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

/**
 * The invariant the printed figures must satisfy: the per-rate subtotals add
 * back up to the period total, and the IVA reported is the sum of the two
 * rates. Anything else means a document was written with inconsistent totals.
 */
export function summaryIsConsistent(summary: IvaSummary): boolean {
  return (
    summary.gravadas10 + summary.gravadas5 + summary.exentas === summary.total &&
    summary.iva10 + summary.iva5 === summary.ivaTotal
  );
}

export type PeriodBucket = {
  /** `yyyy-mm`. */
  month: string;
  currency: Currency;
  documents: number;
  total: number;
  ivaTotal: number;
};

/** Sales per calendar month, for the "how did the year go" table. */
export function salesByMonth(documents: readonly ReportableDocument[]): PeriodBucket[] {
  const buckets = new Map<string, PeriodBucket>();

  for (const document of documents) {
    if (!countsTowardsIva(document) || !document.issueDate) continue;

    const month = document.issueDate.slice(0, 7);
    const key = `${month}:${document.currency}`;
    const bucket = buckets.get(key) ?? {
      month,
      currency: document.currency,
      documents: 0,
      total: 0,
      ivaTotal: 0,
    };

    const sign = document.type === "credit_note" ? -1 : 1;
    bucket.documents += sign;
    bucket.total += sign * document.total;
    bucket.ivaTotal += sign * (document.iva10 + document.iva5);

    buckets.set(key, bucket);
  }

  return [...buckets.values()].sort(
    (a, b) => b.month.localeCompare(a.month) || a.currency.localeCompare(b.currency),
  );
}

/* -------------------------------------------------------------------------- */
/* periods                                                                     */
/* -------------------------------------------------------------------------- */

export type Period = { from: string; to: string };

/** The calendar month a `yyyy-mm-dd` date falls in, inclusive at both ends. */
export function monthPeriod(date: string): Period {
  const [year, month] = date.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return {
    from: `${date.slice(0, 7)}-01`,
    to: `${date.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`,
  };
}

/** The month before the one `date` falls in — the usual reporting period. */
export function previousMonthPeriod(date: string): Period {
  const [year, month] = date.split("-").map(Number);
  const previous = new Date(Date.UTC(year, month - 2, 1));
  return monthPeriod(previous.toISOString().slice(0, 10));
}

/** The calendar year `date` falls in. */
export function yearPeriod(date: string): Period {
  const year = date.slice(0, 4);
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

/** Is a `yyyy-mm-dd` date inside a period, inclusive? */
export function withinPeriod(date: string | null, period: Period): boolean {
  if (!date) return false;
  return date >= period.from && date <= period.to;
}
