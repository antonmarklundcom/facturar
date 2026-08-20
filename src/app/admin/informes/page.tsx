import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui/page";
import { TotalRow } from "@/components/documents/line-editor";
import { requireSession } from "@/lib/auth/guards";
import { listPeriodDocuments } from "@/lib/documents/data";
import { asuncionDateString, formatDateOnly, formatMoneyParts } from "@/domain/format";
import {
  ivaSummaries,
  monthPeriod,
  previousMonthPeriod,
  salesByMonth,
  yearPeriod,
  type Period,
} from "@/domain/reports";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("reports");
  return { title: t("title") };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The IVA liquidation and sales figures (PR-13).
 *
 * The period is in the URL, so a report can be bookmarked and sent to an
 * accountant as a link. Everything on the page is computed by
 * `domain/reports` from the same rows the CSV export uses — the screen and the
 * file can never disagree.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const today = asuncionDateString(new Date());

  const period: Period =
    DATE.test(params.from ?? "") && DATE.test(params.to ?? "")
      ? { from: params.from as string, to: params.to as string }
      : monthPeriod(today);

  const [t, rows] = await Promise.all([
    getTranslations("reports"),
    listPeriodDocuments(session.tenantId, period),
  ]);

  const summaries = ivaSummaries(rows);
  const months = salesByMonth(rows);

  const presets: { label: string; period: Period }[] = [
    { label: t("presets.thisMonth"), period: monthPeriod(today) },
    { label: t("presets.lastMonth"), period: previousMonthPeriod(today) },
    { label: t("presets.thisYear"), period: yearPeriod(today) },
  ];

  const href = (next: Period) => `/admin/informes?from=${next.from}&to=${next.to}`;
  const csv = (kind: string) =>
    `/admin/informes/csv?kind=${kind}&from=${period.from}&to=${period.to}`;

  return (
    <>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("intro")}
      />

      <div className="flex flex-col gap-[var(--s-6)]">
        <Card variant="hair">
          <div className="flex flex-wrap items-end justify-between gap-[var(--s-4)]">
            <div>
              <p className="eyebrow m-0">{t("period")}</p>
              <p className="tabular m-0 mt-[var(--s-2)] text-[length:var(--t-1)]">
                {formatDateOnly(period.from)} — {formatDateOnly(period.to)}
              </p>
            </div>

            <div className="flex flex-wrap gap-[var(--s-2)]">
              {presets.map((preset) => (
                <Link
                  key={preset.label}
                  href={href(preset.period)}
                  className="inline-flex min-h-11 items-center rounded-sm border border-hairline-strong px-[var(--s-4)] text-[length:var(--t--1)] no-underline"
                >
                  {preset.label}
                </Link>
              ))}
            </div>
          </div>

          <form method="get" className="mt-[var(--s-5)] flex flex-wrap items-end gap-[var(--s-3)]">
            <label className="flex flex-col gap-[var(--s-2)] text-[length:var(--t--1)] text-ink-70">
              {t("from")}
              <input
                type="date"
                name="from"
                defaultValue={period.from}
                className="min-h-11 rounded-sm border border-hairline-strong bg-surface px-[var(--s-3)] text-ink"
              />
            </label>
            <label className="flex flex-col gap-[var(--s-2)] text-[length:var(--t--1)] text-ink-70">
              {t("to")}
              <input
                type="date"
                name="to"
                defaultValue={period.to}
                className="min-h-11 rounded-sm border border-hairline-strong bg-surface px-[var(--s-3)] text-ink"
              />
            </label>
            <button
              type="submit"
              className="min-h-11 rounded-sm border border-hairline-strong px-[var(--s-4)] text-[length:var(--t--1)]"
            >
              {t("apply")}
            </button>
          </form>
        </Card>

        {summaries.length === 0 ? (
          <Card variant="raised">
            <EmptyState title={t("empty.title")} body={t("empty.body")} />
          </Card>
        ) : (
          <div className="grid gap-[var(--s-4)] lg:grid-cols-2">
            {summaries.map((summary) => (
              <Card key={summary.currency} variant="accent">
                <SectionTitle
                  hint={t("documentsCounted", {
                    invoices: summary.documents,
                    creditNotes: summary.creditNotes,
                  })}
                >
                  {t("ivaTitle", { currency: summary.currency })}
                </SectionTitle>

                <dl className="m-0">
                  <TotalRow
                    label={t("gravadas10")}
                    value={formatMoneyParts(summary.gravadas10, summary.currency)}
                  />
                  <TotalRow
                    label={t("gravadas5")}
                    value={formatMoneyParts(summary.gravadas5, summary.currency)}
                  />
                  <TotalRow
                    label={t("exentas")}
                    value={formatMoneyParts(summary.exentas, summary.currency)}
                  />
                  <TotalRow
                    label={t("iva10")}
                    value={formatMoneyParts(summary.iva10, summary.currency)}
                    muted
                  />
                  <TotalRow
                    label={t("iva5")}
                    value={formatMoneyParts(summary.iva5, summary.currency)}
                    muted
                  />
                  <TotalRow
                    label={t("ivaTotal")}
                    value={formatMoneyParts(summary.ivaTotal, summary.currency)}
                    strong
                  />
                  <TotalRow
                    label={t("total")}
                    value={formatMoneyParts(summary.total, summary.currency)}
                  />
                </dl>
              </Card>
            ))}
          </div>
        )}

        {months.length > 0 ? (
          <Card variant="raised" className="overflow-x-auto">
            <SectionTitle>{t("salesTitle")}</SectionTitle>
            <table className="w-full border-collapse text-[length:var(--t-0)]">
              <thead>
                <tr className="border-b border-hairline text-left">
                  <Th>{t("month")}</Th>
                  <Th>{t("currency")}</Th>
                  <Th className="text-right">{t("documents")}</Th>
                  <Th className="text-right">{t("ivaTotal")}</Th>
                  <Th className="text-right">{t("total")}</Th>
                </tr>
              </thead>
              <tbody>
                {months.map((bucket) => (
                  <tr
                    key={`${bucket.month}-${bucket.currency}`}
                    className="border-b border-hairline last:border-0"
                  >
                    <td className="tabular p-[var(--s-3)]">{bucket.month}</td>
                    <td className="p-[var(--s-3)] text-ink-70">{bucket.currency}</td>
                    <td className="tabular p-[var(--s-3)] text-right">{bucket.documents}</td>
                    <td className="tabular p-[var(--s-3)] text-right text-ink-70">
                      {formatMoneyParts(bucket.ivaTotal, bucket.currency)}
                    </td>
                    <td className="tabular p-[var(--s-3)] text-right font-medium">
                      {formatMoneyParts(bucket.total, bucket.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : null}

        <Card variant="hair">
          <p className="eyebrow m-0">{t("exportTitle")}</p>
          <p className="m-0 mb-[var(--s-4)] mt-[var(--s-2)] text-[length:var(--t--1)] text-ink-55">
            {t("exportHint")}
          </p>
          <div className="flex flex-wrap gap-[var(--s-3)]">
            <a
              href={csv("iva")}
              className="inline-flex min-h-11 items-center rounded-sm border border-hairline-strong px-[var(--s-4)] text-[length:var(--t--1)] no-underline"
            >
              {t("exportIva")}
            </a>
            <a
              href={csv("documentos")}
              className="inline-flex min-h-11 items-center rounded-sm border border-hairline-strong px-[var(--s-4)] text-[length:var(--t--1)] no-underline"
            >
              {t("exportDocuments")}
            </a>
          </div>
        </Card>
      </div>
    </>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={`p-[var(--s-3)] text-[length:var(--t--1)] font-medium text-ink-55 ${className}`}
    >
      {children}
    </th>
  );
}
