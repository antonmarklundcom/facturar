/**
 * Theme handling (decision 11).
 *
 * Three states, matching what the tokens in `globals.css` already support:
 *
 *   system — no `data-theme` attribute; `prefers-color-scheme` decides
 *   light  — `data-theme="light"`, which also wins over a dark OS preference
 *   dark   — `data-theme="dark"`
 *
 * The choice is read from a cookie on the server and rendered straight onto
 * `<html>`, so there is no flash of the wrong theme and no blocking inline
 * script. PDFs are always light and never consult this.
 */
export const THEME_COOKIE = "facturar_theme";

export const themes = ["system", "light", "dark"] as const;

export type Theme = (typeof themes)[number];

export const defaultTheme: Theme = "system";

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (themes as readonly string[]).includes(value);
}

/**
 * The `data-theme` attribute value for a choice. `system` deliberately renders
 * no attribute at all, letting the media query in `globals.css` apply.
 */
export function themeAttribute(theme: Theme): "light" | "dark" | undefined {
  return theme === "system" ? undefined : theme;
}
