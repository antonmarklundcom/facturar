import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/page";
import { requireSession } from "@/lib/auth/guards";
import { can } from "@/lib/auth/roles";
import { listDocuments } from "@/lib/documents/data";
import { asuncionDateString, formatDateOnly, formatMoneyParts } from "@/domain/format";
import { effectiveQuoteStatus } from "@/domain/documents";
import { statusTone } from "./status";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("quotes");
  return { title: t("title") };
}

export default async function QuotesPage() {
  const session = await requireSession();

  const [t, rows] = await Promise.all([
    getTranslations("quotes"),
    listDocuments(session.tenantId, { type: "quote" }),
  ]);

  const today = asuncionDateString(new Date());
  const mayWrite = can(session.role, "documents.write");

  return (
    <>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("intro")}
        actions={
          mayWrite ? (
            <Link
              href="/admin/presupuestos/nuevo"
              className="inline-flex min-h-11 items-center rounded-sm bg-accent px-[var(--s-5)] text-[length:var(--t--1)] font-medium text-accent-contrast no-underline"
            >
              {t("new")}
            </Link>
          ) : undefined
        }
      />

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
                <Th>{t("customer")}</Th>
                <Th>{t("issueDate")}</Th>
                <Th>{t("validUntil")}</Th>
                <Th className="text-right">{t("total")}</Th>
                <Th>{t("status")}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const status = effectiveQuoteStatus(row.status, row.validUntil, today);

                return (
                  <tr key={row.id} className="border-b border-hairline last:border-0">
                    <td className="p-[var(--s-3)] align-top">
                      <Link
                        href={`/admin/presupuestos/${row.id}`}
                        className="font-medium no-underline hover:underline"
                      >
                        {row.customer?.name ?? t("noCustomer")}
                      </Link>
                    </td>
                    <td className="tabular p-[var(--s-3)] align-top text-ink-70">
                      {row.issueDate ? formatDateOnly(row.issueDate) : "—"}
                    </td>
                    <td className="tabular p-[var(--s-3)] align-top text-ink-70">
                      {row.validUntil ? formatDateOnly(row.validUntil) : "—"}
                    </td>
                    <td className="tabular p-[var(--s-3)] text-right align-top">
                      {formatMoneyParts(row.total, row.currency)}
                    </td>
                    <td className="p-[var(--s-3)] align-top">
                      <Badge tone={statusTone(status)}>{t(`statuses.${status}`)}</Badge>
                    </td>
                  </tr>
                );
              })}
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
