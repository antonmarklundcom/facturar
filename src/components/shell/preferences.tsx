import { getLocale, getTranslations } from "next-intl/server";
import { setThemeAction, setUiLocaleAction } from "@/app/actions/preferences";
import { locales } from "@/i18n/config";
import { themes, type Theme } from "@/lib/theme";

/**
 * Language and theme pickers, rendered as segmented controls.
 *
 * Both are plain forms with a submit button per option: they work without
 * JavaScript, and each option is a real button rather than a `select` that
 * needs a change handler to be useful.
 */
function segmentClass(selected: boolean): string {
  return [
    "min-h-9 flex-1 rounded-sm px-[var(--s-2)] text-[length:var(--t--1)]",
    "transition-colors duration-[var(--dur-fast)] ease-(--ease-io)",
    selected
      ? "bg-surface font-medium text-ink shadow-[var(--shadow-1)]"
      : "text-ink-55 hover:text-ink",
  ].join(" ");
}

export async function PreferenceControls({ theme }: { theme: Theme }) {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("preferences")]);

  return (
    <div className="flex flex-col gap-[var(--s-4)]">
      <div>
        <p className="eyebrow m-0 mb-[var(--s-2)]">{t("language")}</p>
        <form action={setUiLocaleAction} className="flex gap-[var(--s-1)] rounded-sm bg-surface-2 p-[var(--s-1)]">
          {locales.map((candidate) => (
            <button
              key={candidate}
              type="submit"
              name="locale"
              value={candidate}
              aria-pressed={candidate === locale}
              className={segmentClass(candidate === locale)}
            >
              {t(`locales.${candidate}`)}
            </button>
          ))}
        </form>
      </div>

      <div>
        <p className="eyebrow m-0 mb-[var(--s-2)]">{t("theme")}</p>
        <form action={setThemeAction} className="flex gap-[var(--s-1)] rounded-sm bg-surface-2 p-[var(--s-1)]">
          {themes.map((candidate) => (
            <button
              key={candidate}
              type="submit"
              name="theme"
              value={candidate}
              aria-pressed={candidate === theme}
              className={segmentClass(candidate === theme)}
            >
              {t(`themes.${candidate}`)}
            </button>
          ))}
        </form>
      </div>
    </div>
  );
}
