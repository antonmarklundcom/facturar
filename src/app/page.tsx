import { getTranslations } from "next-intl/server";
import { LocaleSwitch } from "@/components/locale-switch";

/**
 * Public landing page (decision 22). The real marketing page ships in PR-15 —
 * this placeholder only proves the scaffold renders in both catalogs.
 */
export default async function HomePage() {
  const t = await getTranslations("placeholder");

  return (
    <main className="mx-auto flex min-h-dvh max-w-[var(--container)] flex-col justify-center px-[var(--gutter)] py-[var(--s-16)]">
      <p className="eyebrow mb-[var(--s-4)]">{t("eyebrow")}</p>
      <h1 className="m-0 text-[length:var(--t-4)] sm:text-[length:var(--t-5)]">
        {t("title")}
      </h1>
      <p className="mt-[var(--s-6)] max-w-[var(--measure)] text-ink-70">{t("body")}</p>
      <div className="mt-[var(--s-8)] w-fit rounded-md border border-hairline bg-surface px-[var(--s-6)] py-[var(--s-4)] shadow-[var(--shadow-1)]">
        <p className="m-0 text-[length:var(--t--1)] text-ink-55">{t("status")}</p>
      </div>
      <div className="mt-[var(--s-8)]">
        <LocaleSwitch />
      </div>
    </main>
  );
}
