import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Card, EmptyState, PageHeader } from "@/components/ui/page";
import { requireSession } from "@/lib/auth/guards";
import { listRecentPayments } from "@/lib/documents/data";
import { formatDateTime, formatMoneyParts } from "@/domain/format";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("payments");
  return { title: t("title") };
}

/**
 * Every payment received, newest first — the "did that transfer come in?"
 * screen. Read-only: a payment is recorded against its invoice, which is where
 * the context is.
 */
export default async function PaymentsPage() {
  const session = await requireSession();

  const [t, rows] = await Promise.all([
    getTranslations("payments"),
    listRecentPayments(session.tenantId),
  ]);

  return (
    <>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} description={t("intro")} />

      {rows.length === 0 ? (
        <Card variant="raised">
          <EmptyState title={t("empty.title")} body={t("empty.body")} />
        </Card>
      ) : (
        <Card variant="raised" className="overflow-x-auto p-0">
          <table className="w-full border-collapse text-[length:var(--t-0)]">
            <caption className="sr-only">{t("title")}</caption>
            <thead>
              <tr className="border-b border-hairline text-left">
                <Th>{t("paidAt")}</Th>
                <Th>{t("invoice")}</Th>
                <Th>{t("customer")}</Th>
                <Th>{t("method")}</Th>
                <Th className="text-right">{t("amount")}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.payment.id} className="border-b border-hairline last:border-0">
                  <td className="tabular p-[var(--s-3)] align-top text-ink-70">
                    {formatDateTime(row.payment.paidAt)}
                  </td>
                  <td className="tabular p-[var(--s-3)] align-top">
                    <Link
                      href={`/admin/facturas/${row.payment.documentId}`}
                      className="no-underline hover:underline"
                    >
                      {row.documentNumber ?? `#${row.payment.documentId}`}
                    </Link>
                  </td>
                  <td className="p-[var(--s-3)] align-top">{row.customerName ?? "—"}</td>
                  <td className="p-[var(--s-3)] align-top text-ink-70">
                    {t(`methods.${row.payment.method}`)}
                    {row.payment.reference ? (
                      <span className="block text-[length:var(--t--1)] text-ink-55">
                        {row.payment.reference}
                      </span>
                    ) : null}
                  </td>
                  <td className="tabular p-[var(--s-3)] text-right align-top font-medium">
                    {formatMoneyParts(row.payment.amount, row.payment.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
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
