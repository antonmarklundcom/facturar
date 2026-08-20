/**
 * WhatsApp numbers (guardrail 7): stored in one canonical shape,
 * `+5959XXXXXXXX`, so a `wa.me` link can be built without re-parsing and two
 * spellings of the same number are the same string in the database.
 *
 * Paraguayan mobile numbers are nine significant digits beginning with 9 —
 * `981123456` — written locally with a trunk zero (`0981 123456`) and
 * internationally as `+595 981 123456`. Landlines (`021 …`, `061 …`) are
 * rejected: WhatsApp is a mobile identity, and a landline stored here would
 * produce a link that goes nowhere.
 */

export const PY_COUNTRY_CODE = "595";

/** Nine digits, leading 9, second digit non-zero. */
const PY_MOBILE = /^9[1-9]\d{7}$/;

export type WhatsappProblem =
  | "empty"
  | "malformed"
  | "wrong_country"
  | "not_mobile";

export type WhatsappValidation =
  | {
      valid: true;
      /** `+595981123456` — exactly what goes in the database. */
      normalized: string;
      /** `981123456` — the national significant number. */
      national: string;
    }
  | { valid: false; problem: WhatsappProblem };

/**
 * Normalise anything a Paraguayan would type into `+5959XXXXXXXX`.
 *
 * Accepts `0981 123456`, `0981123456`, `981123456`, `+595 981 123456`,
 * `595981123456`, `00595981123456`, and the same with dots, dashes or
 * parentheses. Returns a discriminated result, never user-facing text — the
 * caller maps `problem` to a translation key (guardrail 5).
 */
export function normalizeWhatsapp(input: string | null | undefined): WhatsappValidation {
  if (input === null || input === undefined || input.trim() === "") {
    return { valid: false, problem: "empty" };
  }

  const trimmed = input.trim();
  const hadPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");

  if (digits === "") return { valid: false, problem: "malformed" };

  let national: string;

  if (digits.startsWith("00")) {
    // International prefix dialled the old way.
    national = stripCountry(digits.slice(2));
    if (national === "") return { valid: false, problem: "wrong_country" };
  } else if (hadPlus) {
    national = stripCountry(digits);
    if (national === "") return { valid: false, problem: "wrong_country" };
  } else if (digits.startsWith(PY_COUNTRY_CODE) && digits.length === 12) {
    // Bare international form: 595 + nine national digits.
    national = digits.slice(3);
  } else if (digits.startsWith("0")) {
    // Trunk prefix: 0981123456.
    national = digits.slice(1);
  } else {
    national = digits;
  }

  if (!PY_MOBILE.test(national)) {
    // A plausible Paraguayan number that simply is not a mobile — a landline
    // (`021 205000`) or a short code — is reported as such rather than as
    // gibberish, so the form can explain itself.
    const plausible = national.length >= 7 && national.length <= 10;
    const looksMobile = national.startsWith("9");
    return {
      valid: false,
      problem: plausible && (!looksMobile || national.length === 9)
        ? "not_mobile"
        : "malformed",
    };
  }

  return { valid: true, normalized: `+${PY_COUNTRY_CODE}${national}`, national };
}

/** Drop a leading 595, or report the number as belonging elsewhere. */
function stripCountry(digits: string): string {
  if (!digits.startsWith(PY_COUNTRY_CODE)) return "";
  return digits.slice(PY_COUNTRY_CODE.length);
}

/** Convenience boolean for call sites that do not need the reason. */
export function isValidWhatsapp(input: string | null | undefined): boolean {
  return normalizeWhatsapp(input).valid;
}

/**
 * `wa.me` deeplink for a stored number. The path carries digits only — the
 * `+` in a stored number would be percent-encoded and break the link.
 *
 * @param text optional pre-filled message; encoded here, never by the caller.
 */
export function waMeLink(normalized: string, text?: string): string {
  const digits = normalized.replace(/\D/g, "");
  const base = `https://wa.me/${digits}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

/** Display form: `+595 981 123 456`. Storage stays unspaced. */
export function formatWhatsapp(normalized: string | null | undefined): string | null {
  if (!normalized) return null;
  const digits = normalized.replace(/\D/g, "");
  if (!digits.startsWith(PY_COUNTRY_CODE) || digits.length !== 12) return normalized;

  const national = digits.slice(3);
  return `+${PY_COUNTRY_CODE} ${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
}
