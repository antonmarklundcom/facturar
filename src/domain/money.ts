import type { Currency } from "@/db/schema";

/**
 * Money in facturar is always an integer number of **minor units** plus a
 * currency (guardrail 1). There is no float and no DECIMAL anywhere in the
 * stack, and no arithmetic on money happens outside this module.
 *
 *   PYG — minor unit is 1 guaraní. Guaraníes have no usable subdivision, so
 *         ₲ 1.500.000 is stored as `1500000`.
 *   USD — minor unit is 1 cent. US$ 1.234,56 is stored as `123456`.
 */
export type Money = {
  readonly amount: number;
  readonly currency: Currency;
};

/** Decimal places a currency is presented with. */
export const CURRENCY_DECIMALS: Record<Currency, number> = {
  PYG: 0,
  USD: 2,
};

/** Minor units per major unit: 1 for PYG, 100 for USD. */
export const MINOR_UNITS_PER_MAJOR: Record<Currency, number> = {
  PYG: 1,
  USD: 100,
};

/**
 * Upper bound for any stored amount. `bigint` columns are read back as JS
 * numbers, which are exact only up to 2^53 - 1; this leaves several orders of
 * magnitude of headroom over any realistic guaraní total while still catching
 * an overflow before it becomes a silently wrong invoice.
 */
export const MAX_MONEY_AMOUNT = Number.MAX_SAFE_INTEGER;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

export class CurrencyMismatchError extends MoneyError {
  constructor(a: Currency, b: Currency) {
    super(`Cannot combine ${a} and ${b} without an explicit conversion`);
    this.name = "CurrencyMismatchError";
  }
}

/**
 * Round half away from zero — commercial rounding, and what a Paraguayan
 * invoice is expected to show. `Math.round` rounds half *up* (toward +∞),
 * which is asymmetric for the negative amounts a credit note can produce.
 */
export function roundHalfAwayFromZero(value: number): number {
  if (!Number.isFinite(value)) {
    throw new MoneyError(`Cannot round a non-finite value: ${value}`);
  }
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

export function assertSafeAmount(amount: number): asserts amount is number {
  if (!Number.isInteger(amount)) {
    throw new MoneyError(`Money must be an integer in minor units, got ${amount}`);
  }
  if (Math.abs(amount) > MAX_MONEY_AMOUNT) {
    throw new MoneyError(`Amount ${amount} exceeds the safe integer range`);
  }
}

export function money(amount: number, currency: Currency): Money {
  assertSafeAmount(amount);
  return { amount, currency };
}

export function zero(currency: Currency): Money {
  return { amount: 0, currency };
}

export function isZero(value: Money): boolean {
  return value.amount === 0;
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) throw new CurrencyMismatchError(a.currency, b.currency);
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amount + b.amount, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amount - b.amount, a.currency);
}

export function negate(value: Money): Money {
  return money(-value.amount, value.currency);
}

export function sum(values: readonly Money[], currency: Currency): Money {
  let total = 0;
  for (const value of values) {
    if (value.currency !== currency) throw new CurrencyMismatchError(currency, value.currency);
    total += value.amount;
  }
  return money(total, currency);
}

export function compare(a: Money, b: Money): number {
  assertSameCurrency(a, b);
  return a.amount === b.amount ? 0 : a.amount < b.amount ? -1 : 1;
}

export function equals(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.amount === b.amount;
}

export function isNegative(value: Money): boolean {
  return value.amount < 0;
}

export function max(a: Money, b: Money): Money {
  return compare(a, b) >= 0 ? a : b;
}

/**
 * Multiply an amount by a ratio expressed as a numerator/denominator pair of
 * integers, rounding once at the end. Taking the ratio as integers rather than
 * a float keeps the whole calculation exact until the single rounding step.
 */
export function multiplyByRatio(
  value: Money,
  numerator: number,
  denominator: number,
): Money {
  if (denominator === 0) throw new MoneyError("Cannot divide by zero");
  return money(
    roundHalfAwayFromZero((value.amount * numerator) / denominator),
    value.currency,
  );
}

/**
 * Split an amount into `parts` as evenly as possible, distributing the
 * remainder one minor unit at a time so the parts always add back up to the
 * original — the rule instalments on a factura a crédito follow.
 */
export function allocate(value: Money, parts: number): Money[] {
  if (!Number.isInteger(parts) || parts <= 0) {
    throw new MoneyError(`Cannot split money into ${parts} parts`);
  }

  const sign = value.amount < 0 ? -1 : 1;
  const magnitude = Math.abs(value.amount);
  const base = Math.floor(magnitude / parts);
  let remainder = magnitude - base * parts;

  return Array.from({ length: parts }, () => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return money(sign * (base + extra), value.currency);
  });
}

/** Parse user input ("1.500.000", "1234,56") into minor units. */
export function parseAmount(input: string, currency: Currency): number {
  const trimmed = input.trim();
  if (trimmed === "") throw new MoneyError("Empty amount");

  const negative = trimmed.startsWith("-");
  // es-PY writes thousands with dots and decimals with a comma.
  const cleaned = trimmed.replace(/[^\d.,]/g, "").replace(/\./g, "").replace(",", ".");

  if (cleaned === "" || !/^\d*(\.\d*)?$/.test(cleaned)) {
    throw new MoneyError(`Cannot read "${input}" as an amount`);
  }

  const asNumber = Number(cleaned);
  if (!Number.isFinite(asNumber)) throw new MoneyError(`Cannot read "${input}" as an amount`);

  const minor = roundHalfAwayFromZero(asNumber * MINOR_UNITS_PER_MAJOR[currency]);
  return negative ? -minor : minor;
}
