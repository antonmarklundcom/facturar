import type { Currency } from "@/db/schema";
import {
  MINOR_UNITS_PER_MAJOR,
  MoneyError,
  money,
  roundHalfAwayFromZero,
  type Money,
} from "./money";

/**
 * Exchange rates, kept integral like every other number here (guardrail 1).
 *
 * The stored rate is **guaraníes per 1 US dollar**, in micro-units:
 * a rate of 7.350,25 ₲/US$ is stored as `7_350_250_000`. Six decimal places of
 * precision is far more than a PYG/USD quote ever carries, and keeping it an
 * integer means no float ever touches a document total.
 *
 * Conversion is never silent: `convert()` requires the rate to be passed in
 * explicitly, and a document that was converted stores the rate it used, so a
 * reprint years later reproduces the same figures.
 */

export const RATE_SCALE = 1_000_000;

export class ExchangeRateError extends MoneyError {
  constructor(message: string) {
    super(message);
    this.name = "ExchangeRateError";
  }
}

export function assertValidRate(rateMicros: number): asserts rateMicros is number {
  if (!Number.isInteger(rateMicros) || rateMicros <= 0) {
    throw new ExchangeRateError(`Exchange rate must be a positive integer, got ${rateMicros}`);
  }
}

/** `7350.25` → `7350250000`. */
export function toRateMicros(rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new ExchangeRateError(`Exchange rate must be positive, got ${rate}`);
  }
  return roundHalfAwayFromZero(rate * RATE_SCALE);
}

/** `7350250000` → `7350.25`. For display only — never for arithmetic. */
export function fromRateMicros(rateMicros: number): number {
  assertValidRate(rateMicros);
  return rateMicros / RATE_SCALE;
}

/** Parse a user-entered rate ("7.350,25") into micro-units. */
export function parseRate(input: string): number {
  const trimmed = input.trim();
  // A rate is never negative; stripping the sign would silently turn a typo
  // into a plausible-looking rate.
  if (trimmed.startsWith("-")) {
    throw new ExchangeRateError(`Cannot read "${input}" as an exchange rate`);
  }

  const cleaned = trimmed.replace(/[^\d.,]/g, "").replace(/\./g, "").replace(",", ".");
  const value = Number(cleaned);
  if (cleaned === "" || !Number.isFinite(value) || value <= 0) {
    throw new ExchangeRateError(`Cannot read "${input}" as an exchange rate`);
  }
  return toRateMicros(value);
}

/** Render a stored rate as `7.350,25` (no symbol — the caller labels it). */
export function formatRate(rateMicros: number): string {
  assertValidRate(rateMicros);

  const whole = Math.floor(rateMicros / RATE_SCALE);
  const fraction = rateMicros - whole * RATE_SCALE;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  if (fraction === 0) return grouped;

  // Show the significant decimals only, up to the six the scale carries.
  const decimals = String(fraction).padStart(6, "0").replace(/0+$/, "");
  return `${grouped},${decimals}`;
}

/**
 * Convert between PYG and USD at an explicit rate.
 *
 * Both directions go through a single rounding step at the end, in the target
 * currency's minor units. Converting and converting back is **not** guaranteed
 * to return the exact original amount — that is inherent to rounding, and the
 * reason a document stores the rate and the converted total rather than
 * recomputing them on every render.
 */
export function convert(value: Money, target: Currency, rateMicros: number): Money {
  assertValidRate(rateMicros);

  if (value.currency === target) return value;

  if (value.currency === "USD" && target === "PYG") {
    // cents → dollars → guaraníes
    const guaranies =
      (value.amount * rateMicros) / (MINOR_UNITS_PER_MAJOR.USD * RATE_SCALE);
    return money(roundHalfAwayFromZero(guaranies), "PYG");
  }

  if (value.currency === "PYG" && target === "USD") {
    // guaraníes → dollars → cents
    const cents = (value.amount * MINOR_UNITS_PER_MAJOR.USD * RATE_SCALE) / rateMicros;
    return money(roundHalfAwayFromZero(cents), "USD");
  }

  throw new ExchangeRateError(`No conversion defined from ${value.currency} to ${target}`);
}

/**
 * Is a rate required to record this document? Only when the document's currency
 * differs from the tenant's own — a PYG tenant invoicing in PYG needs none.
 */
export function requiresExchangeRate(
  documentCurrency: Currency,
  tenantCurrency: Currency,
): boolean {
  return documentCurrency !== tenantCurrency;
}
