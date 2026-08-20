import type { Currency, TaxRate } from "@/db/schema";
import { formatDocumentNumber } from "../numbering";
import { formatAmount, formatDate, formatMoney, formatTaxRate } from "../format";
import { computeTotals, type DocumentTotals, type LineInput } from "../iva";
import { validateRuc, type RucValidation } from "../ruc";
import type { Money } from "../money";

/**
 * Market profile (ARCHITECTURE.md principle 4).
 *
 * Tax maths, document numbering, tax-id validation and formatting sit behind
 * this interface so a second market can be added without remodelling. v1 ships
 * `py` only; a future `se` (moms, unbroken series, öre, org.nr) implements the
 * same shape.
 *
 * The interface is deliberately thin — it names the *decisions* that differ
 * between markets, and delegates to the same pure modules the rest of the app
 * imports directly.
 */
export type MarketProfileId = "py";

export type MarketProfile = {
  id: MarketProfileId;
  /** Currency a tenant on this profile defaults to. */
  defaultCurrency: Currency;
  /** Tax regimes available on a line, in the order a picker should show them. */
  taxRates: readonly TaxRate[];
  /**
   * Whether quoted prices include tax. Paraguay: yes — the IVA is reported as
   * contained in the total rather than added to it.
   */
  pricesIncludeTax: boolean;
  validateTaxId(input: string | null | undefined): RucValidation;
  computeTotals(lines: readonly LineInput[], currency: Currency): DocumentTotals;
  formatDocumentNumber(
    establishment: string | number,
    expeditionPoint: string | number,
    sequence: number,
  ): string;
  formatMoney(value: Money): string;
  formatAmount(amount: number, currency: Currency): string;
  formatDate(value: Date): string;
  formatTaxRate(taxRate: TaxRate, locale: "es" | "en"): string;
};

export const paraguayProfile: MarketProfile = {
  id: "py",
  defaultCurrency: "PYG",
  taxRates: ["10", "5", "exenta"],
  pricesIncludeTax: true,
  validateTaxId: validateRuc,
  computeTotals,
  formatDocumentNumber,
  formatMoney,
  formatAmount,
  formatDate,
  formatTaxRate,
};

const PROFILES: Record<MarketProfileId, MarketProfile> = {
  py: paraguayProfile,
};

export function marketProfile(id: MarketProfileId = "py"): MarketProfile {
  const profile = PROFILES[id];
  if (!profile) throw new Error(`Unknown market profile "${id}"`);
  return profile;
}
