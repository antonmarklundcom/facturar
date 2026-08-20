/**
 * UI language is a per-user preference (decision 6), not a URL segment — the
 * route contract in decision 22 (`/`, `/login`, `/admin/*`) has no locale
 * prefix. next-intl therefore runs without i18n routing and resolves the
 * locale from a cookie, which PR-3 keeps in sync with `users.ui_locale`.
 */
export const locales = ["es", "en"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "es";

/** Cookie holding the active UI language. */
export const LOCALE_COOKIE = "facturar_locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}
