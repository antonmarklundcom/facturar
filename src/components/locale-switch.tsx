import { getLocale, getTranslations } from "next-intl/server";
import { switchLocaleAction } from "@/app/actions/locale";
import { locales } from "@/i18n/config";

/**
 * Minimal es/en switcher for the PR-1 placeholder. The app-shell version with
 * the user's stored preference arrives in PR-5.
 */
export async function LocaleSwitch() {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("common")]);

  return (
    <form action={switchLocaleAction} className="flex items-center gap-[var(--s-3)]">
      <span className="text-[length:var(--t--1)] text-ink-55">{t("language")}</span>
      {locales.map((candidate) => (
        <button
          key={candidate}
          type="submit"
          name="locale"
          value={candidate}
          aria-current={candidate === locale ? "true" : undefined}
          className={`min-h-11 rounded-sm border px-[var(--s-4)] text-[length:var(--t--1)] transition-[transform,box-shadow] duration-[var(--dur-fast)] ease-(--ease-io) hover:-translate-y-0.5 ${
            candidate === locale
              ? "border-transparent bg-accent text-accent-contrast"
              : "border-hairline-strong bg-transparent text-ink"
          }`}
        >
          {candidate === "es" ? t("spanish") : t("english")}
        </button>
      ))}
    </form>
  );
}
