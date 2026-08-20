import type { Currency } from "@/db/schema";
import { ASUNCION_TIME_ZONE } from "@/lib/datetime";
import { CURRENCY_DECIMALS, MINOR_UNITS_PER_MAJOR, type Money } from "./money";

/**
 * es-PY presentation rules (ARCHITECTURE.md "Locale/formatting rules"):
 *
 *   PYG  `₲ 1.500.000`     — dots for thousands, no decimals
 *   USD  `US$ 1.234,56`    — dots for thousands, comma for decimals, always 2
 *   dates `dd/mm/yyyy`, rendered in `America/Asuncion` from a UTC timestamp
 *
 * Grouping is done here rather than through `Intl.NumberFormat` on purpose.
 * Node's ICU renders PYG as `Gs. 1.500.000` and USD as `USD 1.234,56`, neither
 * of which matches the spec, and ICU output can shift between Node versions.
 * These are the figures that get printed on a legal document, so they are
 * produced deterministically and asserted exactly in the tests.
 */

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  PYG: "₲",
  USD: "US$",
};

const GROUP_SEPARATOR = ".";
const DECIMAL_SEPARATOR = ",";

/** Insert thousands separators into a run of digits. */
function group(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP_SEPARATOR);
}

/**
 * Format an integer amount of minor units as digits only, with no symbol —
 * for table cells that carry the currency in the column header.
 */
export function formatAmount(amount: number, currency: Currency): string {
  const decimals = CURRENCY_DECIMALS[currency];
  const negative = amount < 0;
  const magnitude = Math.abs(amount);

  if (decimals === 0) {
    return `${negative ? "-" : ""}${group(String(magnitude))}`;
  }

  const perMajor = MINOR_UNITS_PER_MAJOR[currency];
  const major = Math.floor(magnitude / perMajor);
  const minor = magnitude - major * perMajor;

  return `${negative ? "-" : ""}${group(String(major))}${DECIMAL_SEPARATOR}${String(
    minor,
  ).padStart(decimals, "0")}`;
}

/** Format with the currency symbol: `₲ 1.500.000`, `US$ 1.234,56`. */
export function formatMoney(value: Money): string {
  return `${CURRENCY_SYMBOL[value.currency]} ${formatAmount(value.amount, value.currency)}`;
}

/** Same, from a raw amount + currency pair as stored in the database. */
export function formatMoneyParts(amount: number, currency: Currency): string {
  return formatMoney({ amount, currency });
}

/**
 * A negative amount reads better with the sign before the symbol on a
 * document: `-₲ 50.000` rather than `₲ -50.000`.
 */
export function formatMoneySigned(value: Money): string {
  if (value.amount >= 0) return formatMoney(value);
  return `-${formatMoney({ amount: -value.amount, currency: value.currency })}`;
}

/** Render a fixed-point ×1000 quantity, trimming meaningless zeros. */
export function formatQty(qty: number): string {
  const negative = qty < 0;
  const magnitude = Math.abs(qty);
  const whole = Math.floor(magnitude / 1000);
  const fraction = magnitude - whole * 1000;

  if (fraction === 0) return `${negative ? "-" : ""}${group(String(whole))}`;

  const trimmed = String(fraction).padStart(3, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${group(String(whole))}${DECIMAL_SEPARATOR}${trimmed}`;
}

/** `10 %`, `5 %`, `Exenta` — the label a document prints for a rate. */
export function formatTaxRate(taxRate: string, locale: "es" | "en"): string {
  if (taxRate === "exenta") return locale === "es" ? "Exenta" : "Exempt";
  return `${taxRate} %`;
}

/* -------------------------------------------------------------------------- */
/* dates                                                                       */
/* -------------------------------------------------------------------------- */

const DATE_FORMATTER = new Intl.DateTimeFormat("es-PY", {
  timeZone: ASUNCION_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("es-PY", {
  timeZone: ASUNCION_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function parts(formatter: Intl.DateTimeFormat, value: Date): Record<string, string> {
  return Object.fromEntries(
    formatter.formatToParts(value).map((part) => [part.type, part.value]),
  );
}

/**
 * `dd/mm/yyyy` in Paraguay's civil time. Timestamps are stored in UTC, so a
 * late-evening UTC instant is still "yesterday" in Asunción — the conversion
 * belongs here and nowhere else.
 */
export function formatDate(value: Date): string {
  const p = parts(DATE_FORMATTER, value);
  return `${p.day}/${p.month}/${p.year}`;
}

/** `dd/mm/yyyy HH:mm`, Asunción time. */
export function formatDateTime(value: Date): string {
  const p = parts(DATE_TIME_FORMATTER, value);
  // ICU can render midnight as "24"; normalise it to "00".
  const hour = p.hour === "24" ? "00" : p.hour;
  return `${p.day}/${p.month}/${p.year} ${hour}:${p.minute}`;
}

/** Format a stored `DATE` column (`yyyy-mm-dd`), which carries no time zone. */
export function formatDateOnly(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

/** The calendar date in Asunción for an instant — what `issue_date` should be. */
export function asuncionDateString(value: Date): string {
  const p = parts(DATE_FORMATTER, value);
  return `${p.year}-${p.month}-${p.day}`;
}
