import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/page";
import { requireSession } from "@/lib/auth/guards";
import { can } from "@/lib/auth/roles";
import { listDocuments } from "@/lib/documents/data";
import { asuncionDateString, formatDateOnly, formatMoneyParts } from "@/domain/format";
import { isOverdue } from "@/domain/documents";
import { statusTone } from "../presupuestos/status";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("invoices");
  return { title: t("title") };
}

export default async function InvoicesPage() {
  const session = await requireSession();

  const [t, contado, credito] = await Promise.all([
    getTranslations("invoices"),
    listDocuments(session.tenantId, { type: "invoice_contado" }),
    listDocuments(session.tenantId, { type: "invoice_credito" }),
  ]);

  const rows = [...contado, ...credito].sort((a, b) => b.id - a.id);
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
              href="/admin/facturas/nuevo"
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
                <Th>{t("number")}</Th>
                <Th>{t("customer")}</Th>
                <Th>{t("issueDate")}</Th>
                <Th>{t("dueDate")}</Th>
                <Th className="text-right">{t("total")}</Th>
                <Th>{t("status")}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const overdue = isOverdue(row.status, row.dueDate, today);

                return (
                  <tr key={row.id} className="border-b border-hairline last:border-0">
                    <td className="tabular p-[var(--s-3)] align-top">
                      <Link
                        href={`/admin/facturas/${row.id}`}
                        className="font-medium no-underline hover:underline"
                      >
                        {row.number ?? t("draftNumber")}
                      </Link>
                      <span className="block text-[length:var(--t--1)] text-ink-55">
                        {t(row.type === "invoice_credito" ? "types.credito" : "types.contado")}
                      </span>
                    </td>
                    <td className="p-[var(--s-3)] align-top">
                      {row.customer?.name ?? t("noCustomer")}
                    </td>
                    <td className="tabular p-[var(--s-3)] align-top text-ink-70">
                      {row.issueDate ? formatDateOnly(row.issueDate) : "—"}
                    </td>
                    <td className="tabular p-[var(--s-3)] align-top text-ink-70">
                      {row.dueDate ? formatDateOnly(row.dueDate) : "—"}
                    </td>
                    <td className="tabular p-[var(--s-3)] text-right align-top">
                      {formatMoneyParts(row.total, row.currency)}
                    </td>
                    <td className="p-[var(--s-3)] align-top">
                      <Badge tone={overdue ? "danger" : statusTone(row.status)}>
                        {overdue ? t("statuses.vencida") : t(`statuses.${row.status}`)}
                      </Badge>
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
