import { describe, expect, it } from "vitest";
import { marketProfile, paraguayProfile } from "@/domain/market";
import { QTY_SCALE } from "@/domain/iva";

describe("market profile abstraction (ARCHITECTURE principle 4)", () => {
  it("resolves the Paraguayan profile by default", () => {
    expect(marketProfile().id).toBe("py");
    expect(marketProfile("py")).toBe(paraguayProfile);
  });

  it("throws on an unknown profile rather than silently falling back", () => {
    // A tenant row carrying a market_profile the build does not implement must
    // fail loudly — quietly applying Paraguayan tax rules to a Swedish tenant
    // would be worse than an error.
    expect(() => marketProfile("se" as "py")).toThrow();
  });

  it("declares Paraguay's tax regimes and inclusive pricing", () => {
    expect([...paraguayProfile.taxRates]).toEqual(["10", "5", "exenta"]);
    expect(paraguayProfile.pricesIncludeTax).toBe(true);
    expect(paraguayProfile.defaultCurrency).toBe("PYG");
  });

  it("routes tax-id validation to the RUC check", () => {
    expect(paraguayProfile.validateTaxId("44444401-7").valid).toBe(true);
    expect(paraguayProfile.validateTaxId("44444401-6").valid).toBe(false);
  });

  it("routes totals, numbering and formatting to the shared implementations", () => {
    const totals = paraguayProfile.computeTotals(
      [{ qty: QTY_SCALE, unitAmount: 110_000, taxRate: "10" }],
      "PYG",
    );
    expect(totals.iva10).toBe(10_000);

    expect(paraguayProfile.formatDocumentNumber("001", "001", 1)).toBe("001-001-0000001");
    expect(paraguayProfile.formatMoney({ amount: 1_500_000, currency: "PYG" })).toBe(
      "₲ 1.500.000",
    );
    expect(paraguayProfile.formatAmount(1_500_000, "PYG")).toBe("1.500.000");
    expect(paraguayProfile.formatTaxRate("exenta", "es")).toBe("Exenta");
    expect(paraguayProfile.formatDate(new Date("2026-08-20T12:00:00Z"))).toBe("20/08/2026");
  });
});
