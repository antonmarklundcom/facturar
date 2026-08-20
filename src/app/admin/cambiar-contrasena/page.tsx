import { getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth/guards";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { ChangePasswordForm } from "./change-password-form";

export default async function ChangePasswordPage() {
  const [session, t] = await Promise.all([
    requireSession(),
    getTranslations("changePassword"),
  ]);

  return (
    <section className="max-w-[30rem] py-0">
      <p className="eyebrow m-0">{t("eyebrow")}</p>
      <h1 className="mt-[var(--s-3)] text-[length:var(--t-3)]">{t("title")}</h1>

      {session.mustChangePassword ? (
        <p className="rounded-sm border border-warn/30 bg-warn-soft px-[var(--s-4)] py-[var(--s-3)] text-[length:var(--t--1)] text-warn">
          {t("forced")}
        </p>
      ) : (
        <p className="text-ink-70">{t("body")}</p>
      )}

      <div className="mt-[var(--s-6)] rounded-lg border border-hairline bg-surface p-[var(--s-8)] shadow-[var(--shadow-1)]">
        <ChangePasswordForm minLength={MIN_PASSWORD_LENGTH} />
      </div>
    </section>
  );
}
