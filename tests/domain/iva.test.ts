import { describe, expect, it } from "vitest";
import {
  QTY_SCALE,
  computeLine,
  computeTotals,
  ivaIncludedIn,
  ratePercent,
  totalsAreConsistent,
  totalsAsMoney,
  parseQty,
  type LineInput,
} from "@/domain/iva";
import { MoneyError } from "@/domain/money";

const qty = (units: number) => units * QTY_SCALE;

describe("ratePercent", () => {
  it("maps the three regimes", () => {
    expect(ratePercent("10")).toBe(10);
    expect(ratePercent("5")).toBe(5);
    expect(ratePercent("exenta")).toBe(0);
  });
});

describe("ivaIncludedIn — the IVA is contained in the price, not added to it", () => {
  it("extracts 10 % from an IVA-inclusive total", () => {
    // ₲ 110.000 inclusive of 10 % → 110000 × 10/110 = 10.000
    expect(ivaIncludedIn(110_000, "10")).toBe(10_000);
  });

  it("extracts 5 % from an IVA-inclusive total", () => {
    // ₲ 105.000 inclusive of 5 % → 105000 × 5/105 = 5.000
    expect(ivaIncludedIn(105_000, "5")).toBe(5_000);
  });

  it("is always zero for exenta", () => {
    for (const amount of [0, 1, 999, 1_500_000]) {
      expect(ivaIncludedIn(amount, "exenta")).toBe(0);
    }
  });

  it("never adds tax on top — the IVA is always less than the amount", () => {
    for (const amount of [1, 7, 999, 1_500_000, 987_654_321]) {
      for (const rate of ["10", "5"] as const) {
        expect(ivaIncludedIn(amount, rate)).toBeLessThan(amount);
      }
    }
  });

  it.each([
    // amount, rate, expected — worked from amount × rate / (100 + rate)
    [1_500_000, "10", 136_364], // 1.500.000 × 10/110 = 136.363,63… → 136.364
    [1_000_000, "10", 90_909], // 90.909,09… → 90.909
    [1_000_000, "5", 47_619], // 47.619,04… → 47.619
    [55_000, "10", 5_000],
    [21_000, "5", 1_000],
    [1, "10", 0], // 0,0909… → 0
    [6, "10", 1], // 0,5454… → 1
    [5, "10", 0], // 0,4545… → 0
    [11, "10", 1],
    [0, "10", 0],
  ] as const)("extracts %s at %s%% as %s", (amount, rate, expected) => {
    expect(ivaIncludedIn(amount, rate)).toBe(expected);
  });

  it("rounds half away from zero at the exact midpoint", () => {
    // 63 × 10/110 = 5,7272… ; find an amount landing exactly on .5:
    // x × 10/110 = n + 0.5  →  x = 11(n + 0.5) → x = 11n + 5.5, never integral.
    // 5 %: x × 5/105 = n + 0.5 → x = 21n + 10.5, also never integral.
    // So exact midpoints cannot occur for IVA extraction — assert that.
    for (let amount = 0; amount < 5000; amount += 1) {
      for (const [rate, denominator] of [
        ["10", 110],
        ["5", 105],
      ] as const) {
        const exact = (amount * ratePercent(rate)) / denominator;
        expect(Math.abs(exact - Math.floor(exact) - 0.5)).toBeGreaterThan(1e-9);
      }
    }
  });

  it("refuses a fractional amount", () => {
    expect(() => ivaIncludedIn(10.5, "10")).toThrow(MoneyError);
  });
});

describe("computeLine", () => {
  it("computes a whole-quantity line", () => {
    const line = computeLine({ qty: qty(3), unitAmount: 110_000, taxRate: "10" });
    expect(line.lineTotal).toBe(330_000);
    expect(line.lineIva).toBe(30_000);
    expect(line.lineTaxable).toBe(300_000);
  });

  it("computes a fractional quantity", () => {
    // 1,5 × ₲ 110.000 = ₲ 165.000
    const line = computeLine({ qty: 1500, unitAmount: 110_000, taxRate: "10" });
    expect(line.lineTotal).toBe(165_000);
    expect(line.lineIva).toBe(15_000);
  });

  it("rounds the line total once, at the quantity step", () => {
    // 0,333 × ₲ 1.000 = ₲ 333
    expect(computeLine({ qty: 333, unitAmount: 1000, taxRate: "10" }).lineTotal).toBe(333);
    // 0,001 × ₲ 1.500 = ₲ 1,5 → 2
    expect(computeLine({ qty: 1, unitAmount: 1500, taxRate: "10" }).lineTotal).toBe(2);
    // 0,001 × ₲ 1.400 = ₲ 1,4 → 1
    expect(computeLine({ qty: 1, unitAmount: 1400, taxRate: "10" }).lineTotal).toBe(1);
  });

  it("gives an exenta line no IVA but a full taxable-equal total", () => {
    const line = computeLine({ qty: qty(2), unitAmount: 50_000, taxRate: "exenta" });
    expect(line.lineTotal).toBe(100_000);
    expect(line.lineIva).toBe(0);
    expect(line.lineTaxable).toBe(100_000);
  });

  it("keeps lineTaxable + lineIva === lineTotal for any input", () => {
    for (const units of [1, 3, 7, 13]) {
      for (const unitAmount of [1, 999, 1_234_567, 55_000]) {
        for (const taxRate of ["10", "5", "exenta"] as const) {
          const line = computeLine({ qty: qty(units), unitAmount, taxRate });
          expect(line.lineTaxable + line.lineIva).toBe(line.lineTotal);
        }
      }
    }
  });

  it("handles a negative unit amount (a discount line)", () => {
    const line = computeLine({ qty: qty(1), unitAmount: -110_000, taxRate: "10" });
    expect(line.lineTotal).toBe(-110_000);
    expect(line.lineIva).toBe(-10_000);
    expect(line.lineTaxable).toBe(-100_000);
  });

  it("refuses a fractional quantity — quantities are fixed-point ×1000", () => {
    expect(() => computeLine({ qty: 1.5, unitAmount: 1000, taxRate: "10" })).toThrow();
  });
});

describe("computeTotals", () => {
  const mixed: LineInput[] = [
    { qty: qty(2), unitAmount: 110_000, taxRate: "10" }, // 220.000, iva 20.000
    { qty: qty(1), unitAmount: 55_000, taxRate: "10" }, //  55.000, iva  5.000
    { qty: qty(3), unitAmount: 21_000, taxRate: "5" }, //  63.000, iva  3.000
    { qty: qty(1), unitAmount: 40_000, taxRate: "exenta" }, //  40.000, iva      0
  ];

  it("breaks a mixed document down per rate", () => {
    const totals = computeTotals(mixed, "PYG");

    expect(totals.subtotal10).toBe(275_000);
    expect(totals.subtotal5).toBe(63_000);
    expect(totals.subtotalExenta).toBe(40_000);
    expect(totals.iva10).toBe(25_000);
    expect(totals.iva5).toBe(3_000);
    expect(totals.ivaTotal).toBe(28_000);
    expect(totals.total).toBe(378_000);
  });

  it("keeps the per-rate subtotals reconstructing the total exactly", () => {
    expect(totalsAreConsistent(computeTotals(mixed, "PYG"))).toBe(true);
  });

  it("sums per-line IVA rather than taxing the subtotal — they differ", () => {
    // Three lines of ₲ 1.000 at 10 %: each line's IVA rounds to 91
    // (90,909… → 91), so the document shows 273. Taxing the ₲ 3.000 subtotal
    // in one step would give 273 as well here, so use an amount where they
    // diverge: ₲ 5 per line, three lines.
    //   per line: 5 × 10/110 = 0,4545… → 0, summed → 0
    //   on the subtotal: 15 × 10/110 = 1,3636… → 1
    const lines: LineInput[] = Array.from({ length: 3 }, () => ({
      qty: qty(1),
      unitAmount: 5,
      taxRate: "10" as const,
    }));

    const totals = computeTotals(lines, "PYG");
    expect(totals.iva10).toBe(0);
    expect(ivaIncludedIn(totals.subtotal10, "10")).toBe(1);
    // ARCHITECTURE.md specifies per-line rounding, so 0 is the correct answer.
  });

  it("returns an all-zero breakdown for an empty document", () => {
    const totals = computeTotals([], "PYG");
    expect(totals).toMatchObject({
      subtotal10: 0,
      subtotal5: 0,
      subtotalExenta: 0,
      iva10: 0,
      iva5: 0,
      ivaTotal: 0,
      total: 0,
    });
    expect(totalsAreConsistent(totals)).toBe(true);
  });

  it("handles a document with only exempt lines", () => {
    const totals = computeTotals(
      [{ qty: qty(1), unitAmount: 500_000, taxRate: "exenta" }],
      "PYG",
    );
    expect(totals.ivaTotal).toBe(0);
    expect(totals.subtotalExenta).toBe(500_000);
    expect(totals.total).toBe(500_000);
  });

  it("carries the currency through", () => {
    expect(computeTotals([], "USD").currency).toBe("USD");
  });

  it("works in USD cents just as well as guaraníes", () => {
    // US$ 11,00 at 10 % → IVA US$ 1,00
    const totals = computeTotals(
      [{ qty: qty(1), unitAmount: 1100, taxRate: "10" }],
      "USD",
    );
    expect(totals.total).toBe(1100);
    expect(totals.iva10).toBe(100);
  });

  it("stays consistent across a wide sweep of documents", () => {
    const rates = ["10", "5", "exenta"] as const;

    for (let seed = 1; seed <= 200; seed += 1) {
      const lines: LineInput[] = Array.from({ length: (seed % 7) + 1 }, (_, index) => ({
        qty: ((seed * (index + 3)) % 9000) + 1,
        unitAmount: (seed * 7919 * (index + 1)) % 2_000_000,
        taxRate: rates[(seed + index) % 3],
      }));

      const totals = computeTotals(lines, "PYG");
      expect(totalsAreConsistent(totals), `seed ${seed}`).toBe(true);

      const lineSum = lines.reduce((acc, line) => acc + computeLine(line).lineTotal, 0);
      expect(totals.total, `seed ${seed}`).toBe(lineSum);
    }
  });
});

describe("totalsAsMoney", () => {
  it("wraps every figure with the document's currency", () => {
    const totals = computeTotals(
      [{ qty: qty(1), unitAmount: 110_000, taxRate: "10" }],
      "PYG",
    );
    const wrapped = totalsAsMoney(totals);

    expect(wrapped.total).toEqual({ amount: 110_000, currency: "PYG" });
    expect(wrapped.iva10).toEqual({ amount: 10_000, currency: "PYG" });
    for (const value of Object.values(wrapped)) {
      expect(value.currency).toBe("PYG");
    }
  });
});

describe("totalsAreConsistent", () => {
  it("rejects a tampered breakdown", () => {
    const totals = computeTotals(
      [{ qty: qty(1), unitAmount: 110_000, taxRate: "10" }],
      "PYG",
    );
    expect(totalsAreConsistent({ ...totals, total: totals.total + 1 })).toBe(false);
    expect(totalsAreConsistent({ ...totals, ivaTotal: totals.ivaTotal + 1 })).toBe(false);
  });
});

describe("parseQty", () => {
  it("reads whole and decimal quantities as fixed-point ×1000", () => {
    expect(parseQty("1")).toBe(1_000);
    expect(parseQty("10")).toBe(10_000);
    expect(parseQty("1,5")).toBe(1_500);
    expect(parseQty("0,25")).toBe(250);
    expect(parseQty("  2  ")).toBe(2_000);
  });

  it("reads es-PY thousands separators", () => {
    expect(parseQty("1.200")).toBe(1_200_000);
  });

  it("rounds past the third decimal rather than storing a float", () => {
    expect(parseQty("0,3333")).toBe(333);
    expect(parseQty("0,0005")).toBe(1);
    expect(Number.isInteger(parseQty("1,3333"))).toBe(true);
  });

  it("keeps a negative sign — the caller decides whether that is allowed", () => {
    expect(parseQty("-2")).toBe(-2_000);
  });

  it("refuses anything unreadable", () => {
    for (const input of ["", "   ", "dos", "1,2,3"]) {
      expect(() => parseQty(input), input).toThrow();
    }
  });
});
