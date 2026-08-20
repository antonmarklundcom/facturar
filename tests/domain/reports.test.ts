import { describe, expect, it } from "vitest";
import {
  countsTowardsIva,
  ivaSummaries,
  monthPeriod,
  previousMonthPeriod,
  salesByMonth,
  summaryIsConsistent,
  withinPeriod,
  yearPeriod,
  type ReportableDocument,
} from "@/domain/reports";

/** ₲ 1.100.000 at 10 %: 1 000 000 net, 100 000 IVA. */
const invoice: ReportableDocument = {
  type: "invoice_contado",
  status: "pagada",
  currency: "PYG",
  issueDate: "2026-08-12",
  subtotal10: 1_100_000,
  subtotal5: 0,
  subtotalExenta: 0,
  iva10: 100_000,
  iva5: 0,
  total: 1_100_000,
};

const mixed: ReportableDocument = {
  ...invoice,
  issueDate: "2026-08-20",
  subtotal10: 1_100_000,
  subtotal5: 210_000,
  subtotalExenta: 50_000,
  iva10: 100_000,
  iva5: 10_000,
  total: 1_360_000,
};

const creditNote: ReportableDocument = {
  type: "credit_note",
  status: "pendiente",
  currency: "PYG",
  issueDate: "2026-08-25",
  subtotal10: 220_000,
  subtotal5: 0,
  subtotalExenta: 0,
  iva10: 20_000,
  iva5: 0,
  total: 220_000,
};

describe("countsTowardsIva", () => {
  it("counts issued invoices and credit notes", () => {
    expect(countsTowardsIva(invoice)).toBe(true);
    expect(countsTowardsIva(creditNote)).toBe(true);
  });

  it("ignores drafts — nothing was issued, so nothing is owed", () => {
    expect(countsTowardsIva({ ...invoice, status: "borrador" })).toBe(false);
  });

  it("ignores quotes entirely", () => {
    expect(countsTowardsIva({ ...invoice, type: "quote", status: "aceptado" })).toBe(false);
  });

  it("ignores an invoice already voided by a credit note", () => {
    // The credit note is in the period and subtracts it; counting the voided
    // invoice as well would subtract it twice.
    expect(countsTowardsIva({ ...invoice, status: "anulada" })).toBe(false);
    expect(countsTowardsIva({ ...creditNote, status: "anulada" })).toBe(true);
  });
});

describe("ivaSummaries", () => {
  it("sums a period per rate", () => {
    const [summary] = ivaSummaries([invoice, mixed]);

    expect(summary.documents).toBe(2);
    expect(summary.gravadas10).toBe(2_200_000);
    expect(summary.gravadas5).toBe(210_000);
    expect(summary.exentas).toBe(50_000);
    expect(summary.iva10).toBe(200_000);
    expect(summary.iva5).toBe(10_000);
    expect(summary.ivaTotal).toBe(210_000);
    expect(summary.total).toBe(2_460_000);
  });

  it("subtracts credit notes from every figure", () => {
    const [summary] = ivaSummaries([invoice, creditNote]);

    expect(summary.documents).toBe(1);
    expect(summary.creditNotes).toBe(1);
    expect(summary.gravadas10).toBe(880_000);
    expect(summary.iva10).toBe(80_000);
    expect(summary.total).toBe(880_000);
  });

  it("never mixes currencies — two currencies, two summaries", () => {
    const summaries = ivaSummaries([
      invoice,
      { ...invoice, currency: "USD", total: 12_345, subtotal10: 12_345, iva10: 1_122 },
    ]);

    expect(summaries).toHaveLength(2);
    expect(summaries.map((summary) => summary.currency)).toEqual(["PYG", "USD"]);
    expect(summaries[1].total).toBe(12_345);
  });

  it("returns nothing for a period with no issued documents", () => {
    expect(ivaSummaries([])).toEqual([]);
    expect(ivaSummaries([{ ...invoice, status: "borrador" }])).toEqual([]);
  });

  it("keeps the printed figures internally consistent", () => {
    for (const summary of ivaSummaries([invoice, mixed, creditNote])) {
      expect(summaryIsConsistent(summary)).toBe(true);
    }
  });

  it("can go negative when a period credits more than it invoices", () => {
    // Correcting last month's invoice in this month's period. The figure is
    // negative and that is the correct answer, not a bug to clamp away.
    const [summary] = ivaSummaries([creditNote]);
    expect(summary.total).toBe(-220_000);
    expect(summary.iva10).toBe(-20_000);
  });
});

describe("salesByMonth", () => {
  it("buckets by calendar month, newest first", () => {
    const buckets = salesByMonth([
      invoice,
      { ...invoice, issueDate: "2026-09-02" },
      { ...invoice, issueDate: "2026-07-30" },
    ]);

    expect(buckets.map((bucket) => bucket.month)).toEqual([
      "2026-09",
      "2026-08",
      "2026-07",
    ]);
  });

  it("keeps currencies apart within a month", () => {
    const buckets = salesByMonth([invoice, { ...invoice, currency: "USD", total: 500 }]);

    expect(buckets).toHaveLength(2);
    expect(buckets.map((bucket) => bucket.currency)).toEqual(["PYG", "USD"]);
  });

  it("subtracts credit notes from their own month", () => {
    const [bucket] = salesByMonth([invoice, creditNote]);
    expect(bucket.total).toBe(880_000);
    expect(bucket.documents).toBe(0);
  });

  it("skips a document with no issue date", () => {
    expect(salesByMonth([{ ...invoice, issueDate: null }])).toEqual([]);
  });
});

describe("periods", () => {
  it("takes the whole calendar month, including its last day", () => {
    expect(monthPeriod("2026-08-12")).toEqual({ from: "2026-08-01", to: "2026-08-31" });
    expect(monthPeriod("2026-02-05")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    // 2028 is a leap year.
    expect(monthPeriod("2028-02-05")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });

  it("finds the previous month, across a year boundary", () => {
    expect(previousMonthPeriod("2026-08-12")).toEqual({
      from: "2026-07-01",
      to: "2026-07-31",
    });
    expect(previousMonthPeriod("2026-01-15")).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    });
  });

  it("takes the whole calendar year", () => {
    expect(yearPeriod("2026-08-12")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });

  it("is inclusive at both ends", () => {
    const period = monthPeriod("2026-08-12");

    expect(withinPeriod("2026-08-01", period)).toBe(true);
    expect(withinPeriod("2026-08-31", period)).toBe(true);
    expect(withinPeriod("2026-07-31", period)).toBe(false);
    expect(withinPeriod("2026-09-01", period)).toBe(false);
    expect(withinPeriod(null, period)).toBe(false);
  });
});
