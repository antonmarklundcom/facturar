/**
 * Timbrado — the DNIT authorisation a Paraguayan invoice is issued under.
 *
 * A timbrado carries a validity window and an authorised range of correlative
 * numbers. Issuing is **blocked** outside either, and the app **warns** as
 * either runs low: under 30 days of validity, or under 10 % of the range left
 * (paraguay-business-apps §3).
 *
 * Everything here is pure and date-injected, so "is this expiring?" is a
 * function of an explicit `today` rather than of when the test happens to run.
 */

export const EXPIRY_WARNING_DAYS = 30;
export const RANGE_WARNING_FRACTION = 0.1;

export type TimbradoSnapshot = {
  number: string;
  /** `yyyy-mm-dd`, inclusive. */
  validFrom: string;
  /** `yyyy-mm-dd`, inclusive. */
  validTo: string;
  establishment: string;
  expeditionPoint: string;
  rangeStart: number;
  rangeEnd: number;
  /** Next correlative to hand out. */
  nextSequence: number;
  active: boolean;
};

export type TimbradoBlocker =
  | "inactive"
  | "not_yet_valid"
  | "expired"
  | "range_exhausted"
  | "sequence_out_of_range";

export type TimbradoWarning = "expiring_soon" | "range_low";

export type TimbradoStatus = {
  /** True only when there are no blockers at all. */
  issuable: boolean;
  blockers: TimbradoBlocker[];
  warnings: TimbradoWarning[];
  /** Whole days from `today` to `validTo`, inclusive. Negative once expired. */
  daysRemaining: number;
  /** Correlatives left in the authorised range, never below 0. */
  numbersRemaining: number;
  /** Correlatives in the authorised range. */
  rangeSize: number;
  /** 0–1. How much of the range has been consumed. */
  rangeUsedFraction: number;
};

const MS_PER_DAY = 86_400_000;

/** Parse a `yyyy-mm-dd` date as a UTC midnight instant, for date-only maths. */
function parseDateOnly(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Expected a yyyy-mm-dd date, got "${value}"`);
  const [, year, month, day] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day));
}

/** Whole days between two `yyyy-mm-dd` dates (`to - from`). */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseDateOnly(to) - parseDateOnly(from)) / MS_PER_DAY);
}

/**
 * Assess a timbrado on a given calendar date (Asunción time — use
 * `asuncionDateString()` to derive `today` from an instant).
 */
export function timbradoStatus(
  timbrado: TimbradoSnapshot,
  today: string,
): TimbradoStatus {
  const blockers: TimbradoBlocker[] = [];
  const warnings: TimbradoWarning[] = [];

  const daysRemaining = daysBetween(today, timbrado.validTo);
  const daysUntilValid = daysBetween(today, timbrado.validFrom);

  const rangeSize = timbrado.rangeEnd - timbrado.rangeStart + 1;
  const numbersRemaining = Math.max(0, timbrado.rangeEnd - timbrado.nextSequence + 1);
  const rangeUsedFraction = rangeSize > 0 ? 1 - numbersRemaining / rangeSize : 1;

  if (!timbrado.active) blockers.push("inactive");
  if (daysUntilValid > 0) blockers.push("not_yet_valid");
  if (daysRemaining < 0) blockers.push("expired");

  if (timbrado.nextSequence < timbrado.rangeStart) {
    // The cursor is behind the authorised range — a misconfigured timbrado,
    // not merely an exhausted one. Issuing here would produce a number outside
    // what DNIT authorised.
    blockers.push("sequence_out_of_range");
  } else if (numbersRemaining === 0) {
    blockers.push("range_exhausted");
  }

  const issuable = blockers.length === 0;

  if (issuable) {
    if (daysRemaining <= EXPIRY_WARNING_DAYS) warnings.push("expiring_soon");
    if (numbersRemaining / rangeSize < RANGE_WARNING_FRACTION) warnings.push("range_low");
  }

  return {
    issuable,
    blockers,
    warnings,
    daysRemaining,
    numbersRemaining,
    rangeSize,
    rangeUsedFraction,
  };
}

/**
 * Guard for the issue path. Returns the blockers rather than throwing, so the
 * caller can map them to translation keys; `[]` means issuing may proceed.
 */
export function issuingBlockers(
  timbrado: TimbradoSnapshot,
  today: string,
): TimbradoBlocker[] {
  return timbradoStatus(timbrado, today).blockers;
}
