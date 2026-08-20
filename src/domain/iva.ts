import type { Currency, TaxRate } from "@/db/schema";
import { assertSafeAmount, money, roundHalfAwayFromZero, type Money } from "./money";

/**
 * IVA — Paraguayan value-added tax.
 *
 * Three regimes per line: **10 %** (standard), **5 %** (basic goods, some
 * interest and real estate), and **exenta** (exempt).
 *
 * The rule that shapes everything here: in Paraguay prices are quoted
 * **IVA-inclusive**. A line total of ₲ 110.000 at 10 % already contains the
 * tax; the invoice reports the IVA *contained in* the total, not tax added on
 * top of it:
 *
 *     iva = total × rate / (100 + rate)
 *
 * rounded **once per line** (ARCHITECTURE.md), then summed per rate. Rounding
 * per line rather than on the document total is what makes the printed
 * per-line figures add up to the printed totals.
 */

/** Quantities are fixed-point ×1000: 1.5 units is stored as 1500. */
export const QTY_SCALE = 1000;

export type LineInput = {
  /** Fixed-point ×1000. */
  qty: number;
  /** IVA-inclusive unit price, minor units. */
  unitAmount: number;
  taxRate: TaxRate;
};

export type ComputedLine = {
  qty: number;
  unitAmount: number;
  taxRate: TaxRate;
  /** qty × unitAmount, rounded once. IVA-inclusive. */
  lineTotal: number;
  /** IVA contained in `lineTotal`. Always 0 for exenta. */
  lineIva: number;
  /** `lineTotal - lineIva` — the taxable base, "gravada" on the document. */
  lineTaxable: number;
};

export type DocumentTotals = {
  currency: Currency;
  /** IVA-inclusive subtotal of the lines at each rate. */
  subtotal10: number;
  subtotal5: number;
  subtotalExenta: number;
  /** IVA contained in the corresponding subtotal. */
  iva10: number;
  iva5: number;
  /** iva10 + iva5. */
  ivaTotal: number;
  /** Sum of every line total. Equals what the customer pays. */
  total: number;
};

/** Numeric percentage for a rate. `exenta` is 0. */
export function ratePercent(taxRate: TaxRate): number {
  return taxRate === "exenta" ? 0 : Number(taxRate);
}

/**
 * IVA contained in an IVA-inclusive amount.
 *
 * The multiplication happens before the division so the intermediate value
 * stays exact, and the single rounding step is half-away-from-zero.
 */
export function ivaIncludedIn(amount: number, taxRate: TaxRate): number {
  assertSafeAmount(amount);
  if (taxRate === "exenta") return 0;

  const rate = ratePercent(taxRate);
  return roundHalfAwayFromZero((amount * rate) / (100 + rate));
}

/** Compute one line: total, the IVA inside it, and the taxable base. */
export function computeLine(line: LineInput): ComputedLine {
  if (!Number.isInteger(line.qty)) {
    throw new Error(`Quantity must be fixed-point ×${QTY_SCALE}, got ${line.qty}`);
  }
  assertSafeAmount(line.unitAmount);

  const lineTotal = roundHalfAwayFromZero((line.qty * line.unitAmount) / QTY_SCALE);
  assertSafeAmount(lineTotal);

  const lineIva = ivaIncludedIn(lineTotal, line.taxRate);

  return {
    qty: line.qty,
    unitAmount: line.unitAmount,
    taxRate: line.taxRate,
    lineTotal,
    lineIva,
    lineTaxable: lineTotal - lineIva,
  };
}

/**
 * Roll a set of lines up into the per-rate breakdown a Paraguayan invoice
 * prints. Every IVA figure is the sum of the per-line roundings, never a
 * rounding of the sum — so the column of printed line figures adds up to the
 * printed total exactly.
 */
export function computeTotals(
  lines: readonly LineInput[],
  currency: Currency,
): DocumentTotals {
  const totals: DocumentTotals = {
    currency,
    subtotal10: 0,
    subtotal5: 0,
    subtotalExenta: 0,
    iva10: 0,
    iva5: 0,
    ivaTotal: 0,
    total: 0,
  };

  for (const line of lines) {
    const computed = computeLine(line);

    if (computed.taxRate === "10") {
      totals.subtotal10 += computed.lineTotal;
      totals.iva10 += computed.lineIva;
    } else if (computed.taxRate === "5") {
      totals.subtotal5 += computed.lineTotal;
      totals.iva5 += computed.lineIva;
    } else {
      totals.subtotalExenta += computed.lineTotal;
    }

    totals.total += computed.lineTotal;
  }

  totals.ivaTotal = totals.iva10 + totals.iva5;

  assertSafeAmount(totals.total);
  return totals;
}

/** Totals as `Money`, for anything that then does further money arithmetic. */
export function totalsAsMoney(totals: DocumentTotals): {
  subtotal10: Money;
  subtotal5: Money;
  subtotalExenta: Money;
  iva10: Money;
  iva5: Money;
  ivaTotal: Money;
  total: Money;
} {
  const wrap = (amount: number) => money(amount, totals.currency);
  return {
    subtotal10: wrap(totals.subtotal10),
    subtotal5: wrap(totals.subtotal5),
    subtotalExenta: wrap(totals.subtotalExenta),
    iva10: wrap(totals.iva10),
    iva5: wrap(totals.iva5),
    ivaTotal: wrap(totals.ivaTotal),
    total: wrap(totals.total),
  };
}

/**
 * Invariant check used by the tests and by the issue-time path: the per-rate
 * subtotals must reconstruct the document total exactly, with nothing lost to
 * rounding.
 */
export function totalsAreConsistent(totals: DocumentTotals): boolean {
  return (
    totals.subtotal10 + totals.subtotal5 + totals.subtotalExenta === totals.total &&
    totals.iva10 + totals.iva5 === totals.ivaTotal &&
    totals.ivaTotal <= totals.total
  );
}
