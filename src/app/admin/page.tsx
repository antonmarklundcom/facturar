import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { TimbradoAlerts } from "@/components/timbrado-status";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/page";
import { CHANGE_PASSWORD_PATH, requireSession } from "@/lib/auth/guards";
import { can } from "@/lib/auth/roles";
import {
  balancesFor,
  listOpenQuotes,
  listUnpaidInvoices,
} from "@/lib/documents/data";
import { listTimbrados } from "@/lib/settings/timbrados";
import { getTenant } from "@/lib/settings/tenant";
import { asuncionDateString, formatDateOnly, formatMoneyParts } from "@/domain/format";
import { daysOfValidityLeft, effectiveQuoteStatus, isOverdue } from "@/domain/documents";

/**
 * The dashboard answers one question: **what needs doing today?**
 *
 * Overdue invoices first, because that is money already earned and not yet
 * collected. Then quotes about to expire, because a quote nobody follows up
 * is a sale lost quietly. Then the timbrado, because it is the one thing that
 * can stop work outright.
 */
export default async function AdminHomePage() {
  const session = await requireSession();
  if (session.mustChangePassword) redirect(CHANGE_PASSWORD_PATH);

  const today = asuncionDateString(new Date());

  const [t, tenant, timbrados, unpaid, quotes] = await Promise.all([
    getTranslations("dashboard"),
    getTenant(session.tenantId),
    listTimbrados(session.tenantId),
    listUnpaidInvoices(session.tenantId),
    listOpenQuotes(session.tenantId),
  ]);

  const balances = await balancesFor(session.tenantId, unpaid);
  const currency = tenant?.defaultCurrency ?? "PYG";

  const overdue = balances.filter((invoice) =>
    isOverdue(invoice.status, invoice.dueDate, today),
  );

  // Totals are per the tenant's own currency only: adding guaraníes to
  // dollars would be a lie, and a second tile for a second currency is
  // clearer than a converted one (guardrail 1).
  const outstandingTotal = balances
    .filter((invoice) => invoice.currency === currency)
    .reduce((sum, invoice) => sum + invoice.outstanding, 0);

  const overdueTotal = overdue
    .filter((invoice) => invoice.currency === currency)
    .reduce((sum, invoice) => sum + invoice.outstanding, 0);

  const expiring = quotes
    .map((quote) => ({
      quote,
      status: effectiveQuoteStatus(quote.status, quote.validUntil, today),
      daysLeft: quote.validUntil ? daysOfValidityLeft(quote.validUntil, today) : null,
    }))
    .filter((entry) => entry.status !== "vencido")
    .slice(0, 5);

  const nothingToDo = overdue.length === 0 && quotes.length === 0;

  return (
    <>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("greeting", { name: session.name.split(" ")[0] })}
        description={t("intro")}
      />

      <div className="flex flex-col gap-[var(--s-6)]">
        <TimbradoAlerts timbrados={timbrados} today={today} />

        <div className="grid gap-[var(--s-4)] sm:grid-cols-2 lg:grid-cols-3">
          <Card variant="accent" className="sm:col-span-2">
            <p className="eyebrow m-0">{t("tiles.overdue")}</p>
            <p className="tabular m-0 mt-[var(--s-3)] font-[family-name:var(--font-display)] text-[length:var(--t-4)] leading-none">
              {formatMoneyParts(overdueTotal, currency)}
            </p>
            <p className="m-0 mt-[var(--s-3)] text-[length:var(--t--1)] text-ink-55">
              {t("tiles.overdueHint", { count: overdue.length })}
            </p>
          </Card>

          <Card variant="hair">
            <p className="eyebrow m-0">{t("tiles.outstanding")}</p>
            <p className="tabular m-0 mt-[var(--s-3)] text-[length:var(--t-2)]">
              {formatMoneyParts(outstandingTotal, currency)}
            </p>
            <p className="m-0 mt-[var(--s-2)] text-[length:var(--t--1)] text-ink-55">
              {t("tiles.outstandingHint", { count: balances.length })}
            </p>
          </Card>
        </div>

        {nothingToDo ? (
          <Card variant="raised">
            <EmptyState title={t("empty.title")} body={t("empty.body")} />
          </Card>
        ) : null}

        {overdue.length > 0 ? (
          <Card variant="raised">
            <div className="mb-[var(--s-4)] flex items-end justify-between gap-[var(--s-3)]">
              <h2 className="m-0 text-[length:var(--t-1)]">{t("overdue.title")}</h2>
              <Link
                href="/admin/facturas"
                className="text-[length:var(--t--1)] text-accent no-underline hover:underline"
              >
                {t("overdue.all")}
              </Link>
            </div>

            <ul className="m-0 flex list-none flex-col gap-[var(--s-3)] p-0">
              {overdue.slice(0, 6).map((invoice) => (
                <li
                  key={invoice.id}
                  className="flex flex-wrap items-baseline justify-between gap-[var(--s-3)] border-b border-hairline pb-[var(--s-3)] last:border-0"
                >
                  <span className="min-w-0">
                    <Link
                      href={`/admin/facturas/${invoice.id}`}
                      className="font-medium no-underline hover:underline"
                    >
                      {invoice.number ?? t("overdue.draft")}
                    </Link>
                    <span className="block text-[length:var(--t--1)] text-ink-55">
                      {invoice.customer?.name ?? "—"}
                      {invoice.dueDate
                        ? ` · ${t("overdue.due", { date: formatDateOnly(invoice.dueDate) })}`
                        : ""}
                    </span>
                  </span>
                  <span className="flex items-baseline gap-[var(--s-3)]">
                    <Badge tone="danger">{t("overdue.badge")}</Badge>
                    <span className="tabular font-medium">
                      {formatMoneyParts(invoice.outstanding, invoice.currency)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {expiring.length > 0 ? (
          <Card variant="raised">
            <div className="mb-[var(--s-4)] flex items-end justify-between gap-[var(--s-3)]">
              <h2 className="m-0 text-[length:var(--t-1)]">{t("quotes.title")}</h2>
              <Link
                href="/admin/presupuestos"
                className="text-[length:var(--t--1)] text-accent no-underline hover:underline"
              >
                {t("quotes.all")}
              </Link>
            </div>

            <ul className="m-0 flex list-none flex-col gap-[var(--s-3)] p-0">
              {expiring.map((entry) => (
                <li
                  key={entry.quote.id}
                  className="flex flex-wrap items-baseline justify-between gap-[var(--s-3)] border-b border-hairline pb-[var(--s-3)] last:border-0"
                >
                  <span className="min-w-0">
                    <Link
                      href={`/admin/presupuestos/${entry.quote.id}`}
                      className="font-medium no-underline hover:underline"
                    >
                      {entry.quote.customer?.name ?? "—"}
                    </Link>
                    <span className="block text-[length:var(--t--1)] text-ink-55">
                      {entry.daysLeft === null
                        ? t("quotes.noExpiry")
                        : t("quotes.daysLeft", { days: entry.daysLeft })}
                    </span>
                  </span>
                  <span className="flex items-baseline gap-[var(--s-3)]">
                    <Badge tone={entry.status === "borrador" ? "muted" : "info"}>
                      {t(`quotes.status.${entry.status}`)}
                    </Badge>
                    <span className="tabular">
                      {formatMoneyParts(entry.quote.total, entry.quote.currency)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

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
