import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { logoutAction } from "@/app/login/actions";
import { LocaleSwitch } from "@/components/locale-switch";
import { can } from "@/lib/auth/roles";
import { requireSession } from "@/lib/auth/guards";

/**
 * Authenticated app shell (decision 22 — everything behind auth lives under
 * `/admin/*`). This is the real gate: the middleware only checks that a cookie
 * exists, `requireSession()` here verifies it and redirects to `/login` if not.
 *
 * PR-5 replaces this with the designed shell; the guard stays.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [session, t] = await Promise.all([requireSession(), getTranslations("admin")]);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-hairline bg-surface">
        <div className="mx-auto flex max-w-[var(--container)] flex-wrap items-center gap-[var(--s-4)] px-[var(--gutter)] py-[var(--s-4)]">
          <Link
            href="/admin"
            className="font-[family-name:var(--font-display)] text-[length:var(--t-1)] no-underline"
          >
            facturar
          </Link>

          {can(session.role, "users.manage") ? (
            <Link
              href="/admin/ajustes/usuarios"
              className="text-[length:var(--t--1)] text-ink-70 underline-offset-4 hover:underline"
            >
              {t("nav.users")}
            </Link>
          ) : null}

          <div className="ms-auto flex items-center gap-[var(--s-4)]">
            <span className="text-[length:var(--t--1)] text-ink-55">
              {session.name} · {t(`roles.${session.role}`)}
            </span>
            <form action={logoutAction}>
              <button
                type="submit"
                className="min-h-11 rounded-sm border border-hairline-strong px-[var(--s-4)] text-[length:var(--t--1)]"
              >
                {t("logout")}
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[var(--container)] flex-1 px-[var(--gutter)] py-[var(--s-8)]">
        {children}
      </main>

      <footer className="mx-auto w-full max-w-[var(--container)] px-[var(--gutter)] pb-[var(--s-8)]">
        <LocaleSwitch />
      </footer>
    </div>
  );
}
