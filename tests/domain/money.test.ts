import { describe, expect, it } from "vitest";
import {
  CURRENCY_DECIMALS,
  CurrencyMismatchError,
  MINOR_UNITS_PER_MAJOR,
  MoneyError,
  add,
  allocate,
  assertSafeAmount,
  compare,
  equals,
  isNegative,
  isZero,
  max,
  money,
  multiplyByRatio,
  negate,
  parseAmount,
  roundHalfAwayFromZero,
  subtract,
  sum,
  zero,
} from "@/domain/money";

describe("currency shape", () => {
  it("gives PYG no decimals and USD two", () => {
    expect(CURRENCY_DECIMALS).toEqual({ PYG: 0, USD: 2 });
    expect(MINOR_UNITS_PER_MAJOR).toEqual({ PYG: 1, USD: 100 });
  });
});

describe("roundHalfAwayFromZero", () => {
  it.each([
    [0, 0],
    [0.4, 0],
    [0.5, 1],
    [0.6, 1],
    [1.5, 2],
    [2.5, 3],
    [-0.4, -0],
    [-0.5, -1],
    [-1.5, -2],
    [-2.5, -3],
  ])("rounds %s to %s", (input, expected) => {
    expect(roundHalfAwayFromZero(input)).toBe(expected);
  });

  it("is symmetric about zero, unlike Math.round", () => {
    expect(roundHalfAwayFromZero(-0.5)).toBe(-1);
    expect(Math.round(-0.5)).toBe(-0); // the behaviour we are avoiding
  });

  it("refuses a non-finite value", () => {
    expect(() => roundHalfAwayFromZero(Number.NaN)).toThrow(MoneyError);
    expect(() => roundHalfAwayFromZero(Number.POSITIVE_INFINITY)).toThrow(MoneyError);
  });
});

describe("assertSafeAmount", () => {
  it("accepts integers inside the safe range", () => {
    expect(() => assertSafeAmount(0)).not.toThrow();
    expect(() => assertSafeAmount(-1_500_000)).not.toThrow();
    expect(() => assertSafeAmount(Number.MAX_SAFE_INTEGER)).not.toThrow();
  });

  it("refuses a fractional amount — money is minor units only", () => {
    expect(() => assertSafeAmount(1500.5)).toThrow(MoneyError);
  });

  it("refuses an amount past the exact-integer range", () => {
    expect(() => assertSafeAmount(Number.MAX_SAFE_INTEGER + 2)).toThrow(MoneyError);
  });
});

describe("construction", () => {
  it("builds a value", () => {
    expect(money(1_500_000, "PYG")).toEqual({ amount: 1_500_000, currency: "PYG" });
  });

  it("refuses a float", () => {
    expect(() => money(10.5, "PYG")).toThrow(MoneyError);
  });

  it("has a zero for each currency", () => {
    expect(isZero(zero("PYG"))).toBe(true);
    expect(isZero(zero("USD"))).toBe(true);
    expect(isZero(money(1, "PYG"))).toBe(false);
  });
});

describe("arithmetic", () => {
  it("adds and subtracts within one currency", () => {
    expect(add(money(1_000_000, "PYG"), money(500_000, "PYG")).amount).toBe(1_500_000);
    expect(subtract(money(1_000_000, "PYG"), money(500_000, "PYG")).amount).toBe(500_000);
  });

  it("refuses to combine currencies without an explicit conversion", () => {
    expect(() => add(money(1000, "PYG"), money(1000, "USD"))).toThrow(CurrencyMismatchError);
    expect(() => subtract(money(1000, "PYG"), money(1000, "USD"))).toThrow(
      CurrencyMismatchError,
    );
    expect(() => compare(money(1000, "PYG"), money(1000, "USD"))).toThrow(
      CurrencyMismatchError,
    );
  });

  it("negates", () => {
    expect(negate(money(1_500_000, "PYG")).amount).toBe(-1_500_000);
    expect(isNegative(negate(money(1, "PYG")))).toBe(true);
  });

  it("sums a list, and an empty list is zero", () => {
    expect(sum([money(1, "PYG"), money(2, "PYG"), money(3, "PYG")], "PYG").amount).toBe(6);
    expect(sum([], "PYG").amount).toBe(0);
  });

  it("refuses to sum a foreign currency into the total", () => {
    expect(() => sum([money(1, "PYG"), money(2, "USD")], "PYG")).toThrow(
      CurrencyMismatchError,
    );
  });

  it("compares and picks a maximum", () => {
    expect(compare(money(1, "PYG"), money(2, "PYG"))).toBe(-1);
    expect(compare(money(2, "PYG"), money(1, "PYG"))).toBe(1);
    expect(compare(money(2, "PYG"), money(2, "PYG"))).toBe(0);
    expect(max(money(1, "PYG"), money(2, "PYG")).amount).toBe(2);
  });

  it("compares equality including currency", () => {
    expect(equals(money(1, "PYG"), money(1, "PYG"))).toBe(true);
    expect(equals(money(1, "PYG"), money(1, "USD"))).toBe(false);
  });
});

describe("multiplyByRatio", () => {
  it("rounds once, at the end", () => {
    // 1/3 of ₲ 100 is 33.33…; a single rounding gives 33.
    expect(multiplyByRatio(money(100, "PYG"), 1, 3).amount).toBe(33);
    expect(multiplyByRatio(money(100, "PYG"), 2, 3).amount).toBe(67);
  });

  it("keeps the intermediate exact for large amounts", () => {
    // 15 % of ₲ 1.234.567 = 185.185,05 → 185.185
    expect(multiplyByRatio(money(1_234_567, "PYG"), 15, 100).amount).toBe(185_185);
  });

  it("refuses a zero denominator", () => {
    expect(() => multiplyByRatio(money(100, "PYG"), 1, 0)).toThrow(MoneyError);
  });
});

describe("allocate", () => {
  it("splits evenly when it divides exactly", () => {
    expect(allocate(money(900_000, "PYG"), 3).map((m) => m.amount)).toEqual([
      300_000, 300_000, 300_000,
    ]);
  });

  it("distributes the remainder one minor unit at a time", () => {
    expect(allocate(money(100, "PYG"), 3).map((m) => m.amount)).toEqual([34, 33, 33]);
  });

  it("always adds back up to the original — no guaraní is lost", () => {
    for (const total of [1, 7, 99, 100_000, 1_500_001, 12_345_678]) {
      for (const parts of [1, 2, 3, 4, 6, 7, 12]) {
        const split = allocate(money(total, "PYG"), parts);
        expect(split.reduce((acc, m) => acc + m.amount, 0)).toBe(total);
        expect(split).toHaveLength(parts);
      }
    }
  });

  it("handles a negative amount without losing a unit", () => {
    const split = allocate(money(-100, "PYG"), 3);
    expect(split.map((m) => m.amount)).toEqual([-34, -33, -33]);
    expect(split.reduce((acc, m) => acc + m.amount, 0)).toBe(-100);
  });

  it("refuses a non-positive number of parts", () => {
    expect(() => allocate(money(100, "PYG"), 0)).toThrow(MoneyError);
    expect(() => allocate(money(100, "PYG"), -1)).toThrow(MoneyError);
    expect(() => allocate(money(100, "PYG"), 1.5)).toThrow(MoneyError);
  });
});

describe("parseAmount", () => {
  it.each([
    ["1.500.000", "PYG", 1_500_000],
    ["1500000", "PYG", 1_500_000],
    ["₲ 1.500.000", "PYG", 1_500_000],
    ["0", "PYG", 0],
    ["-50.000", "PYG", -50_000],
  ] as const)("reads %s as %s %s", (input, currency, expected) => {
    expect(parseAmount(input, currency)).toBe(expected);
  });

  it.each([
    ["1.234,56", "USD", 123_456],
    ["US$ 1.234,56", "USD", 123_456],
    ["0,05", "USD", 5],
    ["1234.56", "USD", 123_456_00],
  ] as const)("reads %s as %s %s", (input, currency, expected) => {
    expect(parseAmount(input, currency)).toBe(expected);
  });

  it("rounds a PYG input that carries decimals — guaraníes have none", () => {
    expect(parseAmount("1500,6", "PYG")).toBe(1501);
  });

  it("refuses input that is not an amount", () => {
    for (const bad of ["", "   ", "abc", "₲"]) {
      expect(() => parseAmount(bad, "PYG")).toThrow(MoneyError);
    }
  });
});
