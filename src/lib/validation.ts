import { CONSUMIDOR_FINAL_RUC_BASE, validateRuc, type RucParts } from "@/domain/ruc";
import { normalizeWhatsapp } from "@/domain/whatsapp";
import { MAX_MONEY_AMOUNT, MoneyError, parseAmount } from "@/domain/money";
import type { Currency } from "@/db/schema";

/**
 * Shared field validation for server actions.
 *
 * Everything here returns a *key*, never user-facing text (guardrail 5): the
 * action puts the key in `fieldErrors` and the form resolves it through
 * next-intl. The keys are deliberately the same words across entities —
 * `required`, `too_long`, `invalid` — so one block of translations serves
 * every screen.
 *
 * This is the layer `zod` was originally reserved for. It is hand-written
 * instead because the error a form needs is not a message string but a
 * translation key per field, which zod only reaches through a second mapping
 * layer of exactly this size — and because the money and RUC rules it defers
 * to already live in `src/domain`, where the tests are.
 */

export type FieldErrors = Record<string, string>;

/** Accumulates per-field error keys while an action walks its inputs. */
export class Errors {
  private readonly bag: FieldErrors = {};

  /** Records the first error seen for a field; later ones do not overwrite. */
  set(name: string, key: string): void {
    if (!(name in this.bag)) this.bag[name] = key;
  }

  get any(): boolean {
    return Object.keys(this.bag).length > 0;
  }

  get all(): FieldErrors {
    return { ...this.bag };
  }
}

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

const ok = <T,>(value: T): Checked<T> => ({ ok: true, value });
const bad = (error: string): Checked<never> => ({ ok: false, error });

/** A mandatory line of text. */
export function requiredText(raw: string, maxLength: number): Checked<string> {
  if (raw === "") return bad("required");
  if (raw.length > maxLength) return bad("too_long");
  return ok(raw);
}

/** An optional line of text; empty becomes NULL rather than "". */
export function optionalText(raw: string, maxLength: number): Checked<string | null> {
  if (raw === "") return ok(null);
  if (raw.length > maxLength) return bad("too_long");
  return ok(raw);
}

/**
 * An optional email address. The check is deliberately shallow — one `@` with
 * something either side and no spaces. Anything stricter rejects addresses
 * that work, and only delivery proves an address is real.
 */
export function optionalEmail(raw: string, maxLength = 255): Checked<string | null> {
  if (raw === "") return ok(null);
  if (raw.length > maxLength) return bad("too_long");
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(raw)) return bad("invalid");
  return ok(raw);
}

/** A value that must be one of a schema enum's members. */
export function enumValue<T extends string>(
  raw: string,
  allowed: readonly T[],
): Checked<T> {
  return (allowed as readonly string[]).includes(raw) ? ok(raw as T) : bad("invalid");
}

/** An optional http(s) URL — a logo or an image, never a `javascript:` href. */
export function optionalUrl(raw: string, maxLength = 500): Checked<string | null> {
  if (raw === "") return ok(null);
  if (raw.length > maxLength) return bad("too_long");
  if (!/^https?:\/\/\S+$/i.test(raw)) return bad("invalid");
  return ok(raw);
}

/**
 * A RUC, always through `validateRuc` (guardrail 7). The problem code from the
 * domain is passed straight through as the error key, so a wrong check digit
 * reads as `wrong_dv` rather than a generic "invalid".
 */
export function rucField(raw: string, required: boolean): Checked<RucParts | null> {
  if (raw === "") return required ? bad("required") : ok(null);

  const result = validateRuc(raw);
  if (!result.valid) return bad(result.problem);
  return ok(result.parts);
}

/** True when the RUC entered is the conventional consumidor final one. */
export function isConsumidorFinalRuc(parts: RucParts | null): boolean {
  return parts?.base === CONSUMIDOR_FINAL_RUC_BASE;
}

/** An optional WhatsApp number, normalised to `+5959XXXXXXXX` for storage. */
export function whatsappField(raw: string): Checked<string | null> {
  if (raw === "") return ok(null);

  const result = normalizeWhatsapp(raw);
  if (!result.valid) return bad(result.problem);
  return ok(result.normalized);
}

/**
 * A money amount typed by a human, returned as minor units of `currency`
 * (guardrail 1 — the parsing lives in `domain/money`, never here).
 */
export function moneyField(
  raw: string,
  currency: Currency,
  { allowZero = true }: { allowZero?: boolean } = {},
): Checked<number> {
  if (raw === "") return bad("required");

  let minor: number;
  try {
    minor = parseAmount(raw, currency);
  } catch (error) {
    if (error instanceof MoneyError) return bad("invalid");
    throw error;
  }

  if (minor < 0) return bad("negative");
  if (!allowZero && minor === 0) return bad("required");
  if (minor > MAX_MONEY_AMOUNT) return bad("too_large");
  return ok(minor);
}

/** A positive database id arriving as a form field. */
export function idField(raw: string): Checked<number> {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) return bad("invalid");
  return ok(value);
}
