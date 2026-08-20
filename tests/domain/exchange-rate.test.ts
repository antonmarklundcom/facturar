import { describe, expect, it } from "vitest";
import {
  ExchangeRateError,
  RATE_SCALE,
  assertValidRate,
  convert,
  formatRate,
  fromRateMicros,
  parseRate,
  requiresExchangeRate,
  toRateMicros,
} from "@/domain/exchange-rate";
import { money } from "@/domain/money";

/** A plausible PYG/USD quote: 7.350,25 guaraníes per dollar. */
const RATE = toRateMicros(7350.25);

describe("rate representation", () => {
  it("stores six decimal places as an integer", () => {
    expect(RATE_SCALE).toBe(1_000_000);
    expect(RATE).toBe(7_350_250_000);
    expect(Number.isInteger(RATE)).toBe(true);
  });

  it("round-trips through micro-units", () => {
    for (const rate of [1, 7000, 7350.25, 7350.123456]) {
      expect(fromRateMicros(toRateMicros(rate))).toBeCloseTo(rate, 6);
    }
  });

  it("refuses a non-positive rate", () => {
    expect(() => toRateMicros(0)).toThrow(ExchangeRateError);
    expect(() => toRateMicros(-1)).toThrow(ExchangeRateError);
    expect(() => toRateMicros(Number.NaN)).toThrow(ExchangeRateError);
  });

  it("refuses a stored rate that is not a positive integer", () => {
    expect(() => assertValidRate(0)).toThrow(ExchangeRateError);
    expect(() => assertValidRate(-1)).toThrow(ExchangeRateError);
    expect(() => assertValidRate(1.5)).toThrow(ExchangeRateError);
    expect(() => assertValidRate(1)).not.toThrow();
  });
});

describe("parseRate", () => {
  it.each([
    ["7350", 7_350_000_000],
    ["7.350", 7_350_000_000],
    ["7.350,25", 7_350_250_000],
    ["₲ 7.350,25", 7_350_250_000],
  ])("reads %s", (input, expected) => {
    expect(parseRate(input)).toBe(expected);
  });

  it("refuses input that is not a rate", () => {
    for (const bad of ["", "abc", "0", "-7350"]) {
      expect(() => parseRate(bad)).toThrow(ExchangeRateError);
    }
  });
});

describe("formatRate", () => {
  it.each([
    [7_350_000_000, "7.350"],
    [7_350_250_000, "7.350,25"],
    [1_000_000, "1"],
    [7_350_123_456, "7.350,123456"],
  ])("renders %s as %s", (micros, expected) => {
    expect(formatRate(micros)).toBe(expected);
  });

  it("trims trailing zeros rather than always showing six decimals", () => {
    expect(formatRate(toRateMicros(7350.5))).toBe("7.350,5");
  });
});

describe("convert", () => {
  it("returns the value untouched when no conversion is needed", () => {
    const value = money(1_500_000, "PYG");
    expect(convert(value, "PYG", RATE)).toBe(value);
  });

  it("converts US$ 100,00 to guaraníes at 7.350,25", () => {
    // 100 × 7350,25 = 735.025
    expect(convert(money(10_000, "USD"), "PYG", RATE)).toEqual({
      amount: 735_025,
      currency: "PYG",
    });
  });

  it("converts guaraníes back to cents", () => {
    // 735.025 / 7350,25 = 100,00 → 10.000 cents
    expect(convert(money(735_025, "PYG"), "USD", RATE)).toEqual({
      amount: 10_000,
      currency: "USD",
    });
  });

  it("rounds to whole guaraníes — PYG has no minor unit", () => {
    // US$ 0,01 × 7350,25 = 73,5025 → 74 (half away from zero)
    expect(convert(money(1, "USD"), "PYG", RATE).amount).toBe(74);
  });

  it("rounds to whole cents", () => {
    // ₲ 1 / 7350,25 = 0,000136… dollars = 0,0136 cents → 0
    expect(convert(money(1, "PYG"), "USD", RATE).amount).toBe(0);
  });

  it("always lands on an integer amount", () => {
    for (const cents of [1, 7, 99, 12_345, 1_000_000]) {
      const converted = convert(money(cents, "USD"), "PYG", RATE);
      expect(Number.isInteger(converted.amount)).toBe(true);
    }
  });

  it("handles negative amounts symmetrically", () => {
    const positive = convert(money(10_000, "USD"), "PYG", RATE).amount;
    const negative = convert(money(-10_000, "USD"), "PYG", RATE).amount;
    expect(negative).toBe(-positive);
  });

  it("does not guarantee an exact round trip — and that is why the rate is stored", () => {
    // Rounding in both directions loses sub-unit precision. The document keeps
    // the rate and the converted total so a reprint reproduces the figures
    // rather than recomputing them.
    const original = money(7, "USD");
    const roundTripped = convert(convert(original, "PYG", RATE), "USD", RATE);
    expect(Math.abs(roundTripped.amount - original.amount)).toBeLessThanOrEqual(1);
  });

  it("refuses an invalid rate", () => {
    expect(() => convert(money(100, "USD"), "PYG", 0)).toThrow(ExchangeRateError);
    expect(() => convert(money(100, "USD"), "PYG", -5)).toThrow(ExchangeRateError);
  });

  it("is monotonic — a larger amount never converts to a smaller one", () => {
    let previous = -1;
    for (const cents of [0, 1, 100, 10_000, 1_000_000]) {
      const converted = convert(money(cents, "USD"), "PYG", RATE).amount;
      expect(converted).toBeGreaterThan(previous);
      previous = converted;
    }
  });

  it("must be applied to a total, not to each part — rounding is not linear", () => {
    // US$ 1,00 → ₲ 7.350,25 → 7.350. A hundred of those summed gives 735.000,
    // but converting US$ 100,00 in one step gives 735.025. Converting the
    // total is the correct figure; this test pins the difference so nobody
    // "optimises" the caller into converting per line.
    const perUnit = convert(money(100, "USD"), "PYG", RATE).amount;
    const asTotal = convert(money(10_000, "USD"), "PYG", RATE).amount;

    expect(perUnit).toBe(7_350);
    expect(asTotal).toBe(735_025);
    expect(perUnit * 100).not.toBe(asTotal);
  });
});

describe("requiresExchangeRate", () => {
  it("is only true when the document currency differs from the tenant's", () => {
    expect(requiresExchangeRate("PYG", "PYG")).toBe(false);
    expect(requiresExchangeRate("USD", "USD")).toBe(false);
    expect(requiresExchangeRate("USD", "PYG")).toBe(true);
    expect(requiresExchangeRate("PYG", "USD")).toBe(true);
  });
});
