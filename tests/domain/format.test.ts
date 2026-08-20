import { describe, expect, it } from "vitest";
import {
  CURRENCY_SYMBOL,
  asuncionDateString,
  formatAmount,
  formatDate,
  formatDateOnly,
  formatDateTime,
  formatMoney,
  formatMoneyParts,
  formatMoneySigned,
  formatQty,
  formatTaxRate,
} from "@/domain/format";

describe("PYG formatting", () => {
  it("renders the reference figure from ARCHITECTURE.md", () => {
    expect(formatMoney({ amount: 1_500_000, currency: "PYG" })).toBe("₲ 1.500.000");
  });

  it.each([
    [0, "₲ 0"],
    [1, "₲ 1"],
    [99, "₲ 99"],
    [100, "₲ 100"],
    [999, "₲ 999"],
    [1_000, "₲ 1.000"],
    [10_000, "₲ 10.000"],
    [100_000, "₲ 100.000"],
    [1_000_000, "₲ 1.000.000"],
    [1_234_567, "₲ 1.234.567"],
    [999_999_999, "₲ 999.999.999"],
    [1_000_000_000, "₲ 1.000.000.000"],
  ])("formats %s as %s", (amount, expected) => {
    expect(formatMoney({ amount, currency: "PYG" })).toBe(expected);
  });

  it("never shows decimals — guaraníes have none", () => {
    for (const amount of [1, 999, 1_500_000, 1_234_567]) {
      expect(formatMoney({ amount, currency: "PYG" })).not.toContain(",");
    }
  });

  it("uses the guaraní sign, not the ICU default", () => {
    expect(CURRENCY_SYMBOL.PYG).toBe("₲");
    // Node's ICU renders es-PY PYG as "Gs. 1.500.000"; this is deliberately not that.
    expect(formatMoney({ amount: 1_500_000, currency: "PYG" })).not.toContain("Gs.");
  });
});

describe("USD formatting", () => {
  it("renders the reference figure from ARCHITECTURE.md", () => {
    expect(formatMoney({ amount: 123_456, currency: "USD" })).toBe("US$ 1.234,56");
  });

  it.each([
    [0, "US$ 0,00"],
    [1, "US$ 0,01"],
    [5, "US$ 0,05"],
    [99, "US$ 0,99"],
    [100, "US$ 1,00"],
    [1_050, "US$ 10,50"],
    [123_456, "US$ 1.234,56"],
    [100_000_000, "US$ 1.000.000,00"],
  ])("formats %s cents as %s", (amount, expected) => {
    expect(formatMoney({ amount, currency: "USD" })).toBe(expected);
  });

  it("always shows exactly two decimals", () => {
    for (const amount of [0, 1, 10, 100, 1000]) {
      expect(formatMoney({ amount, currency: "USD" })).toMatch(/,\d{2}$/);
    }
  });

  it("uses US$, not the ICU 'USD' prefix", () => {
    expect(CURRENCY_SYMBOL.USD).toBe("US$");
    expect(formatMoney({ amount: 123_456, currency: "USD" })).not.toMatch(/^USD/);
  });
});

describe("negative amounts", () => {
  it("puts the sign inside by default", () => {
    expect(formatMoney({ amount: -50_000, currency: "PYG" })).toBe("₲ -50.000");
  });

  it("puts the sign in front when asked — how a credit reads on a document", () => {
    expect(formatMoneySigned({ amount: -50_000, currency: "PYG" })).toBe("-₲ 50.000");
    expect(formatMoneySigned({ amount: -123_456, currency: "USD" })).toBe("-US$ 1.234,56");
  });

  it("leaves a positive amount untouched", () => {
    expect(formatMoneySigned({ amount: 50_000, currency: "PYG" })).toBe("₲ 50.000");
  });
});

describe("formatAmount", () => {
  it("omits the symbol, for a column that carries the currency in its header", () => {
    expect(formatAmount(1_500_000, "PYG")).toBe("1.500.000");
    expect(formatAmount(123_456, "USD")).toBe("1.234,56");
  });
});

describe("formatMoneyParts", () => {
  it("formats straight from database columns", () => {
    expect(formatMoneyParts(1_500_000, "PYG")).toBe("₲ 1.500.000");
  });
});

describe("formatQty", () => {
  it.each([
    [1000, "1"],
    [1500, "1,5"],
    [2250, "2,25"],
    [1, "0,001"],
    [10, "0,01"],
    [500, "0,5"],
    [12_000, "12"],
    [1_500_000, "1.500"],
    [-1500, "-1,5"],
  ])("renders fixed-point %s as %s", (qty, expected) => {
    expect(formatQty(qty)).toBe(expected);
  });
});

describe("formatTaxRate", () => {
  it("labels the three regimes in both document languages", () => {
    expect(formatTaxRate("10", "es")).toBe("10 %");
    expect(formatTaxRate("5", "es")).toBe("5 %");
    expect(formatTaxRate("exenta", "es")).toBe("Exenta");
    expect(formatTaxRate("exenta", "en")).toBe("Exempt");
  });
});

describe("dates in America/Asuncion", () => {
  it("renders dd/mm/yyyy", () => {
    expect(formatDate(new Date("2026-08-20T12:00:00Z"))).toBe("20/08/2026");
  });

  it("converts from UTC, so a late-UTC instant is still the previous day", () => {
    // Asunción runs behind UTC, so 02:00 UTC on the 20th is the 19th there.
    expect(formatDate(new Date("2026-08-20T02:00:00Z"))).toBe("19/08/2026");
  });

  it("zero-pads single-digit days and months", () => {
    expect(formatDate(new Date("2026-01-05T15:00:00Z"))).toBe("05/01/2026");
  });

  it("renders a timestamp with 24-hour time", () => {
    expect(formatDateTime(new Date("2026-08-20T12:00:00Z"))).toMatch(
      /^20\/08\/2026 \d{2}:00$/,
    );
  });

  it("renders midnight as 00, never 24", () => {
    for (const hour of [3, 4, 5]) {
      const value = new Date(`2026-08-20T0${hour}:30:00Z`);
      expect(formatDateTime(value)).not.toContain(" 24:");
    }
  });

  it("derives the Asunción calendar date for an issue_date column", () => {
    expect(asuncionDateString(new Date("2026-08-20T02:00:00Z"))).toBe("2026-08-19");
    expect(asuncionDateString(new Date("2026-08-20T12:00:00Z"))).toBe("2026-08-20");
  });

  it("formats a stored DATE column without inventing a time zone", () => {
    expect(formatDateOnly("2026-08-20")).toBe("20/08/2026");
    expect(formatDateOnly("2026-01-05")).toBe("05/01/2026");
  });

  it("returns an unparseable date string unchanged rather than throwing", () => {
    expect(formatDateOnly("not-a-date")).toBe("not-a-date");
  });
});
