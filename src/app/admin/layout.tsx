import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { logoutAction } from "@/app/login/actions";
import { AppShell } from "@/components/shell/app-shell";
import { PreferenceControls } from "@/components/shell/preferences";
import {
  CustomersIcon,
  DashboardIcon,
  InvoicesIcon,
  PaymentsIcon,
  ProductsIcon,
  QuotesIcon,
  ReportsIcon,
  SettingsIcon,
} from "@/components/shell/icons";
import type { NavItem } from "@/components/shell/nav";
import { requireSession } from "@/lib/auth/guards";
import { can } from "@/lib/auth/roles";
import { getTenant } from "@/lib/settings/tenant";
import { THEME_COOKIE, defaultTheme, isTheme } from "@/lib/theme";

/**
 * Authenticated app shell (decision 22 — everything behind auth lives under
 * `/admin/*`). `requireSession()` here is the real gate; the middleware only
 * checks that a cookie exists.
 *
 * Sections that land in later PRs are shown but not linked, so the shell does
 * not advertise routes that 404.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  const [t, cookieStore, tenant] = await Promise.all([
    getTranslations("admin"),
    cookies(),
    getTenant(session.tenantId),
  ]);

  const stored = cookieStore.get(THEME_COOKIE)?.value;
  const theme = isTheme(stored) ? stored : defaultTheme;

  const items: NavItem[] = [
    { href: "/admin", label: t("nav.dashboard"), icon: <DashboardIcon /> },
    { href: "/admin/clientes", label: t("nav.customers"), icon: <CustomersIcon /> },
    { href: "/admin/productos", label: t("nav.products"), icon: <ProductsIcon /> },
    { href: "/admin/presupuestos", label: t("nav.quotes"), icon: <QuotesIcon /> },
    { href: "/admin/facturas", label: t("nav.invoices"), icon: <InvoicesIcon /> },
  ];

  // PR-11 onward add their own entries here as the routes appear.
  const upcoming: { label: string; icon: React.ReactNode }[] = [
    { label: t("nav.payments"), icon: <PaymentsIcon /> },
    { label: t("nav.reports"), icon: <ReportsIcon /> },
  ];

  if (can(session.role, "tenant.manage")) {
    items.push({ href: "/admin/ajustes", label: t("nav.settings"), icon: <SettingsIcon /> });
  }

  return (
    <AppShell
      items={items}
      brand={{ title: t("nav.dashboard"), subtitle: tenant?.name ?? null }}
      preferences={<PreferenceControls theme={theme} />}
      identity={
        <div className="flex flex-col gap-[var(--s-3)]">
          <div className="min-w-0">
            <p className="m-0 truncate text-[length:var(--t--1)] font-medium">
              {session.name}
            </p>
            <p className="m-0 text-[length:var(--t--1)] text-ink-55">
              {t(`roles.${session.role}`)}
            </p>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="min-h-11 w-full rounded-sm border border-hairline-strong px-[var(--s-4)] text-[length:var(--t--1)] transition-colors duration-[var(--dur-fast)] hover:bg-surface-2"
            >
              {t("logout")}
            </button>
          </form>
        </div>
      }
    >
      {children}
      <UpcomingSections items={upcoming} label={t("nav.upcoming")} />
    </AppShell>
  );
}

/**
 * A quiet strip naming the sections still to be built. Better than nav links
 * that 404, and it tells whoever is demoing the app what is coming.
 */
function UpcomingSections({
  items,
  label,
}: {
  items: { label: string; icon: React.ReactNode }[];
  label: string;
}) {
  return (
    <section className="mt-[var(--s-16)] border-t border-hairline pt-[var(--s-6)]">
      <p className="eyebrow m-0 mb-[var(--s-3)]">{label}</p>
      <ul className="m-0 flex list-none flex-wrap gap-[var(--s-2)] p-0">
        {items.map((item) => (
          <li
            key={item.label}
            className="inline-flex items-center gap-[var(--s-2)] rounded-sm border border-hairline px-[var(--s-3)] py-[var(--s-1)] text-[length:var(--t--1)] text-ink-55"
          >
            <span aria-hidden className="grid size-4 place-items-center opacity-60">
              {item.icon}
            </span>
            {item.label}
          </li>
        ))}
      </ul>
    </section>
  );
}
