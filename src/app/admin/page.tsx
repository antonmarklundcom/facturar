import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CHANGE_PASSWORD_PATH, requireSession } from "@/lib/auth/guards";

/**
 * Dashboard placeholder. The action-first dashboard is PR-5 (skeleton) and
 * PR-13 (real content).
 */
export default async function AdminHomePage() {
  const session = await requireSession();
  if (session.mustChangePassword) redirect(CHANGE_PASSWORD_PATH);

  const t = await getTranslations("admin");

  return (
    <section className="py-0">
      <p className="eyebrow m-0">{t("dashboard.eyebrow")}</p>
      <h1 className="mt-[var(--s-3)] text-[length:var(--t-3)]">
        {t("dashboard.greeting", { name: session.name })}
      </h1>
      <p className="text-ink-70">{t("dashboard.body")}</p>
    </section>
  );
}
