import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { APP_PATH, requireSession } from "@/lib/auth/guards";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { can } from "@/lib/auth/roles";
import { listTenantUsers } from "@/lib/auth/users";
import { CreateUserForm, EditUserForm, ResetPasswordForm } from "./user-forms";

/**
 * User management, admin only (ARCHITECTURE.md role matrix). The read is gated
 * here; every mutation re-checks with `requireRole("users.manage")` in
 * `actions.ts` — this page decides what to draw, not who may act.
 */
export default async function UsersPage() {
  const session = await requireSession();
  if (!can(session.role, "users.manage")) redirect(APP_PATH);

  const [t, format, users] = await Promise.all([
    getTranslations("users"),
    getFormatter(),
    listTenantUsers(session.tenantId),
  ]);

  return (
    <section className="py-0">
      <p className="eyebrow m-0">{t("eyebrow")}</p>
      <h1 className="mt-[var(--s-3)] text-[length:var(--t-3)]">{t("title")}</h1>
      <p className="text-ink-70">{t("body")}</p>

      <div className="mt-[var(--s-8)] grid gap-[var(--s-8)] lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-[var(--s-4)]">
          {users.map((user) => (
            <article
              key={user.id}
              className="rounded-md border border-hairline bg-surface p-[var(--s-6)] shadow-[var(--shadow-1)]"
            >
              <header className="flex flex-wrap items-baseline gap-[var(--s-3)]">
                <h2 className="m-0 text-[length:var(--t-1)]">{user.name}</h2>
                <span className="text-[length:var(--t--1)] text-ink-55">{user.email}</span>
                {!user.active ? (
                  <span className="rounded-sm bg-danger-soft px-[var(--s-2)] py-[var(--s-1)] text-[length:var(--t--1)] text-danger">
                    {t("inactive")}
                  </span>
                ) : null}
                {user.mustChangePassword ? (
                  <span className="rounded-sm bg-warn-soft px-[var(--s-2)] py-[var(--s-1)] text-[length:var(--t--1)] text-warn">
                    {t("mustChangePassword")}
                  </span>
                ) : null}
              </header>

              <p className="m-0 mt-[var(--s-2)] text-[length:var(--t--1)] text-ink-55">
                {user.lastLoginAt
                  ? t("lastLogin", {
                      when: format.dateTime(user.lastLoginAt, {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      }),
                    })
                  : t("neverLoggedIn")}
              </p>

              <div className="mt-[var(--s-4)] flex flex-col gap-[var(--s-4)]">
                <EditUserForm
                  user={{
                    id: user.id,
                    name: user.name,
                    role: user.role,
                    active: user.active,
                  }}
                />
                <ResetPasswordForm userId={user.id} minLength={MIN_PASSWORD_LENGTH} />
              </div>
            </article>
          ))}
        </div>

        <aside className="rounded-lg border border-hairline bg-surface p-[var(--s-6)] shadow-[var(--shadow-1)] lg:sticky lg:top-[var(--s-6)] lg:self-start">
          <h2 className="mt-0 text-[length:var(--t-1)]">{t("createTitle")}</h2>
          <CreateUserForm minLength={MIN_PASSWORD_LENGTH} />
        </aside>
      </div>
    </section>
  );
}
