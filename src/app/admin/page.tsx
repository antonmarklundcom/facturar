import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { TimbradoAlerts } from "@/components/timbrado-status";
import { Card, EmptyState, PageHeader } from "@/components/ui/page";
import { CHANGE_PASSWORD_PATH, requireSession } from "@/lib/auth/guards";
import { can } from "@/lib/auth/roles";
import { listTimbrados } from "@/lib/settings/timbrados";
import { getTenant } from "@/lib/settings/tenant";
import { asuncionDateString, formatMoneyParts } from "@/domain/format";

/**
 * Dashboard skeleton. The action-first content — overdue invoices and quotes
 * awaiting follow-up — needs documents, so it lands with PR-13. What is real
 * here today is the timbrado warning, which is the one thing that can already
 * block work.
 */
export default async function AdminHomePage() {
  const session = await requireSession();
  if (session.mustChangePassword) redirect(CHANGE_PASSWORD_PATH);

  const [t, tenant, timbrados] = await Promise.all([
    getTranslations("dashboard"),
    getTenant(session.tenantId),
    listTimbrados(session.tenantId),
  ]);

  const today = asuncionDateString(new Date());
  const currency = tenant?.defaultCurrency ?? "PYG";

  return (
    <>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("greeting", { name: session.name.split(" ")[0] })}
        description={t("intro")}
      />

      <div className="flex flex-col gap-[var(--s-6)]">
        <TimbradoAlerts timbrados={timbrados} today={today} />

        {/* P3 staggered-weight grid: the primary tile spans two columns and
            uses a different card variant, so the row does not read as three
            identical boxes. */}
        <div className="grid gap-[var(--s-4)] sm:grid-cols-2 lg:grid-cols-3">
          <Card variant="accent" className="sm:col-span-2">
            <p className="eyebrow m-0">{t("tiles.today")}</p>
            <p className="m-0 mt-[var(--s-3)] font-[family-name:var(--font-display)] text-[length:var(--t-4)] leading-none">
              {t("tiles.nothingYet")}
            </p>
            <p className="m-0 mt-[var(--s-3)] text-[length:var(--t--1)] text-ink-55">
              {t("tiles.todayHint")}
            </p>
          </Card>

          <Card variant="hair">
            <p className="eyebrow m-0">{t("tiles.outstanding")}</p>
            <p className="tabular m-0 mt-[var(--s-3)] text-[length:var(--t-2)]">
              {formatMoneyParts(0, currency)}
            </p>
            <p className="m-0 mt-[var(--s-2)] text-[length:var(--t--1)] text-ink-55">
              {t("tiles.outstandingHint")}
            </p>
          </Card>
        </div>

        <Card variant="raised">
          <EmptyState title={t("empty.title")} body={t("empty.body")} />
        </Card>

        {timbrados.length === 0 && can(session.role, "timbrados.manage") ? (
          <Card variant="hair">
            <p className="m-0 font-medium">{t("setup.title")}</p>
            <p className="m-0 mt-[var(--s-2)] text-[length:var(--t--1)] text-ink-70">
              {t("setup.body")}
            </p>
            <Link
              href="/admin/ajustes/timbrados"
              className="mt-[var(--s-4)] inline-flex min-h-11 items-center rounded-sm bg-accent px-[var(--s-5)] text-[length:var(--t--1)] font-medium text-accent-contrast no-underline transition-transform duration-[var(--dur-fast)] ease-(--ease-io) hover:-translate-y-0.5"
            >
              {t("setup.cta")}
            </Link>
          </Card>
        ) : null}
      </div>
    </>
  );
}
