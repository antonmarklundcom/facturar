import { describe, expect, it } from "vitest";
import { PRODUCT_FIELDS, parseProduct } from "@/lib/products/parse";
import { ivaIncludedIn } from "@/domain/iva";
import { formatMoneyParts } from "@/domain/format";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.append(name, value);
  return data;
}

const BASE = {
  name: "Chapa galvanizada N°26",
  unit: "unidad",
  unitAmount: "150.000",
  currency: "PYG",
  taxRate: "10",
};

describe("parseProduct", () => {
  it("stores a guaraní price as whole minor units (guardrail 1)", () => {
    const parsed = parseProduct(form({ ...BASE, description: "2,44 m × 1,10 m" }));

    expect(parsed).toEqual({
      ok: true,
      values: {
        name: "Chapa galvanizada N°26",
        description: "2,44 m × 1,10 m",
        unit: "unidad",
        unitAmount: 150_000,
        currency: "PYG",
        taxRate: "10",
      },
    });
    // No fractional guaraní can survive parsing.
    if (!parsed.ok) return;
    expect(Number.isInteger(parsed.values.unitAmount)).toBe(true);
  });

  it("reads the amount in the units of the currency chosen, not a default", () => {
    // "1.500" is one thousand five hundred guaraníes, but in USD the dot is
    // a thousands separator too — 1500 dollars, i.e. 150 000 cents.
    const pyg = parseProduct(form({ ...BASE, unitAmount: "1.500", currency: "PYG" }));
    const usd = parseProduct(form({ ...BASE, unitAmount: "1.500", currency: "USD" }));

    expect(pyg.ok && pyg.values.unitAmount).toBe(1_500);
    expect(usd.ok && usd.values.unitAmount).toBe(150_000);
  });

  it("reads USD decimals as cents", () => {
    const parsed = parseProduct(form({ ...BASE, unitAmount: "1.234,56", currency: "USD" }));
    expect(parsed.ok && parsed.values.unitAmount).toBe(123_456);
  });

  it("accepts a price typed with its currency symbol", () => {
    const parsed = parseProduct(form({ ...BASE, unitAmount: "₲ 150.000" }));
    expect(parsed.ok && parsed.values.unitAmount).toBe(150_000);
  });

  it("round-trips through the display format", () => {
    const parsed = parseProduct(form(BASE));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const shown = formatMoneyParts(parsed.values.unitAmount, parsed.values.currency);
    expect(shown).toBe("₲ 150.000");

    const again = parseProduct(form({ ...BASE, unitAmount: shown }));
    expect(again.ok && again.values.unitAmount).toBe(parsed.values.unitAmount);
  });

  it("keeps the price IVA-inclusive, so the IVA can be read back out of it", () => {
    const parsed = parseProduct(form(BASE));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    // 150 000 at 10 % IVA-included: 150 000 × 10 / 110 = 13 636,36 → 13 636.
    expect(ivaIncludedIn(parsed.values.unitAmount, parsed.values.taxRate)).toBe(13_636);
  });

  it("accepts every IVA regime and no other", () => {
    for (const taxRate of ["10", "5", "exenta"]) {
      expect(parseProduct(form({ ...BASE, taxRate })).ok, taxRate).toBe(true);
    }
    expect(parseProduct(form({ ...BASE, taxRate: "21" }))).toEqual({
      ok: false,
      fieldErrors: { taxRate: "invalid" },
    });
  });

  it("accepts a zero price — a placeholder line priced on the quote", () => {
    const parsed = parseProduct(form({ ...BASE, unitAmount: "0" }));
    expect(parsed.ok && parsed.values.unitAmount).toBe(0);
  });

  it("rejects a negative, empty or unreadable price", () => {
    expect(parseProduct(form({ ...BASE, unitAmount: "-1000" }))).toEqual({
      ok: false,
      fieldErrors: { unitAmount: "negative" },
    });
    expect(parseProduct(form({ ...BASE, unitAmount: "" }))).toEqual({
      ok: false,
      fieldErrors: { unitAmount: "required" },
    });
    expect(parseProduct(form({ ...BASE, unitAmount: "a convenir" }))).toEqual({
      ok: false,
      fieldErrors: { unitAmount: "invalid" },
    });
  });

  it("does not try to read a price when the currency is unusable", () => {
    // Reading "1.500" without knowing the currency would be a guess.
    expect(parseProduct(form({ ...BASE, currency: "BRL" }))).toEqual({
      ok: false,
      fieldErrors: { currency: "invalid" },
    });
  });

  it("requires a name and a unit", () => {
    expect(parseProduct(form({ ...BASE, name: "  " })).ok).toBe(false);
    expect(parseProduct(form({ ...BASE, unit: "" }))).toEqual({
      ok: false,
      fieldErrors: { unit: "required" },
    });
  });

  it("stores an absent description as NULL rather than an empty string", () => {
    const parsed = parseProduct(form({ ...BASE, description: "" }));
    expect(parsed.ok && parsed.values.description).toBeNull();
  });

  it("enforces the column lengths the schema declares", () => {
    expect(parseProduct(form({ ...BASE, name: "x".repeat(201) })).ok).toBe(false);
    expect(parseProduct(form({ ...BASE, unit: "x".repeat(31) })).ok).toBe(false);
    expect(parseProduct(form({ ...BASE, unit: "x".repeat(30) })).ok).toBe(true);
  });

  it("reports every bad field at once", () => {
    const parsed = parseProduct(
      form({ name: "", unit: "", unitAmount: "abc", currency: "PYG", taxRate: "99" }),
    );

    expect(parsed).toEqual({
      ok: false,
      fieldErrors: {
        name: "required",
        unit: "required",
        unitAmount: "invalid",
        taxRate: "invalid",
      },
    });
  });

  it("echoes exactly the fields the form submits", () => {
    expect([...PRODUCT_FIELDS]).toEqual([
      "name",
      "description",
      "unit",
      "unitAmount",
      "currency",
      "taxRate",
    ]);
  });
});
