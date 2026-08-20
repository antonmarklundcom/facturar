/**
 * RUC — Registro Único de Contribuyentes, the Paraguayan tax id.
 *
 * Format: a base number, a hyphen, and a **dígito verificador** (check digit),
 * e.g. `80012345-0`. Companies' bases start with 80; individuals use their
 * cédula number.
 *
 * The DV is a modulo-11 check: walking the base from the rightmost digit, each
 * digit is weighted 2, 3, 4, … (the weight resets to 2 once it passes 11), the
 * weighted sum is taken modulo 11, and the DV is `11 - remainder`, or 0 when
 * the remainder is below 2.
 *
 * Note on the weight cycle: some write-ups cap the weight at 9 instead of 11.
 * For every RUC length that actually occurs (a base of 10 digits or fewer) the
 * weight never reaches 10 in the first place, so the two descriptions agree.
 * `MAX_BASE_LENGTH` keeps inputs inside that range, where the answer is not
 * open to interpretation.
 */

/** Invoices to an unnamed buyer use this RUC by convention. */
export const CONSUMIDOR_FINAL_RUC_BASE = "44444401";
export const CONSUMIDOR_FINAL_RUC_DV = "7";
export const CONSUMIDOR_FINAL_RUC = `${CONSUMIDOR_FINAL_RUC_BASE}-${CONSUMIDOR_FINAL_RUC_DV}`;

const MIN_BASE_LENGTH = 3;
const MAX_BASE_LENGTH = 10;
const WEIGHT_CAP = 11;

export type RucParts = {
  /** Digits before the hyphen, with separators stripped. */
  base: string;
  /** The single check digit. */
  dv: string;
};

export type RucProblem =
  | "empty"
  | "malformed"
  | "too_short"
  | "too_long"
  | "missing_dv"
  | "wrong_dv";

export type RucValidation =
  | { valid: true; parts: RucParts; normalized: string; isConsumidorFinal: boolean }
  | { valid: false; problem: RucProblem };

/**
 * Compute the check digit for a RUC base.
 *
 * @throws if the base is not 3–10 digits.
 */
export function computeRucDv(base: string): number {
  const digits = base.replace(/\D/g, "");

  if (digits.length < MIN_BASE_LENGTH || digits.length > MAX_BASE_LENGTH) {
    throw new Error(`RUC base must be ${MIN_BASE_LENGTH}–${MAX_BASE_LENGTH} digits`);
  }

  let total = 0;
  let weight = 2;

  for (let i = digits.length - 1; i >= 0; i -= 1) {
    if (weight > WEIGHT_CAP) weight = 2;
    total += Number(digits[i]) * weight;
    weight += 1;
  }

  const remainder = total % 11;
  return remainder > 1 ? 11 - remainder : 0;
}

/**
 * Validate a RUC. Accepts the base and DV together (`80012345-0`), with or
 * without dots, spaces or the hyphen; a bare base with no DV is rejected
 * rather than guessed at.
 *
 * Returns a discriminated result rather than a boolean so the caller can map
 * the problem to a translation key — this function returns no user-facing text.
 */
export function validateRuc(input: string | null | undefined): RucValidation {
  if (input === null || input === undefined || input.trim() === "") {
    return { valid: false, problem: "empty" };
  }

  const cleaned = input.trim().replace(/[\s.]/g, "");

  if (!/^\d+-?\d?$/.test(cleaned) && !/^\d+$/.test(cleaned)) {
    return { valid: false, problem: "malformed" };
  }

  let base: string;
  let dv: string;

  if (cleaned.includes("-")) {
    const [rawBase, rawDv] = cleaned.split("-");
    if (rawDv === undefined || rawDv.length !== 1) {
      return { valid: false, problem: "missing_dv" };
    }
    base = rawBase;
    dv = rawDv;
  } else {
    // No hyphen: the last digit is the DV, as long as something is left over.
    if (cleaned.length < MIN_BASE_LENGTH + 1) {
      return { valid: false, problem: "too_short" };
    }
    base = cleaned.slice(0, -1);
    dv = cleaned.slice(-1);
  }

  if (base.length < MIN_BASE_LENGTH) return { valid: false, problem: "too_short" };
  if (base.length > MAX_BASE_LENGTH) return { valid: false, problem: "too_long" };

  if (computeRucDv(base) !== Number(dv)) {
    return { valid: false, problem: "wrong_dv" };
  }

  const normalized = `${base}-${dv}`;

  return {
    valid: true,
    parts: { base, dv },
    normalized,
    isConsumidorFinal: normalized === CONSUMIDOR_FINAL_RUC,
  };
}

/** Convenience boolean for call sites that do not need the reason. */
export function isValidRuc(input: string | null | undefined): boolean {
  return validateRuc(input).valid;
}

/** Render stored `ruc_base` / `ruc_dv` columns for display. */
export function formatRuc(
  base: string | null | undefined,
  dv: string | null | undefined,
): string | null {
  if (!base || !dv) return null;
  return `${base}-${dv}`;
}

/**
 * The RUC to print on a document. A customer flagged consumidor final always
 * gets the conventional RUC, whatever else is stored against them.
 */
export function documentRuc(customer: {
  rucBase?: string | null;
  rucDv?: string | null;
  isConsumidorFinal?: boolean | null;
}): string {
  if (customer.isConsumidorFinal) return CONSUMIDOR_FINAL_RUC;
  return formatRuc(customer.rucBase, customer.rucDv) ?? CONSUMIDOR_FINAL_RUC;
}
