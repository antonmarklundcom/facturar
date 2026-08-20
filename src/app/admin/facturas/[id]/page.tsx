import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge, Card, PageHeader, SectionTitle } from "@/components/ui/page";
import { TotalRow } from "@/components/documents/line-editor";
import { requireSession } from "@/lib/auth/guards";
import { can } from "@/lib/auth/roles";
import { findDocument } from "@/lib/documents/data";
import { documentEditorOptions } from "@/lib/documents/options";
import { creditDaysBetween } from "@/lib/documents/parse";
import { publicDocumentUrl } from "@/lib/documents/token";
import { listTimbrados, toSnapshot } from "@/lib/settings/timbrados";
import {
  asuncionDateString,
  formatAmount,
  formatDateOnly,
  formatDateTime,
  formatMoneyParts,
  formatQty,
  formatTaxRate,
} from "@/domain/format";
import { isDocumentEditable, isIssuable, isIssued, isOverdue } from "@/domain/documents";
import { previewNextNumber } from "@/domain/numbering";
import { timbradoStatus } from "@/domain/timbrado";
import { waMeLink } from "@/domain/whatsapp";
import { statusTone } from "../../presupuestos/status";
import { InvoiceForm } from "../invoice-form";
import { IssueInvoiceForm } from "../issue-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const session = await requireSession();
  const { id } = await params;
  const full = await findDocument(session.tenantId, Number(id));
  const t = await getTranslations("invoices");

  return { title: full?.document.number ?? t("draftNumber") };
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;

  const documentId = Number(id);
  if (!Number.isInteger(documentId) || documentId <= 0) notFound();

  const full = await findDocument(session.tenantId, documentId);
  if (
    !full ||
    (full.document.type !== "invoice_contado" && full.document.type !== "invoice_credito")
  ) {
    notFound();
  }

  const [t, locale] = await Promise.all([getTranslations("invoices"), getLocale()]);
  const uiLocale = locale === "en" ? "en" : "es";
  const today = asuncionDateString(new Date());

  const issued = isIssued(full.document);
  const mayWrite = can(session.role, "documents.write");
  const mayIssue = can(session.role, "documents.issue");
  const editable = mayWrite && isDocumentEditable(full.document);

  const [options, timbrados] = await Promise.all([
    editable
      ? documentEditorOptions(session.tenantId)
      : Promise.resolve({ customers: [], products: [] }),
    isIssuable(full.document) && mayIssue
      ? listTimbrados(session.tenantId)
      : Promise.resolve([]),
  ]);

  const share = await getTranslations({
    locale: full.document.docLocale,
    namespace: "documentShare",
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const publicUrl = full.document.publicToken
    ? publicDocumentUrl(full.document.publicToken, baseUrl)
    : null;

  const overdue = isOverdue(full.document.status, full.document.dueDate, today);

  return (
    <>
      <PageHeader
        eyebrow={t(full.document.type === "invoice_credito" ? "types.credito" : "types.contado")}
        title={full.document.number ?? t("draftNumber")}
        description={full.customer?.name ?? t("noCustomer")}
        actions={
          <Link
            href="/admin/facturas"
            className="inline-flex min-h-11 items-center rounded-sm border border-hairline-strong px-[var(--s-4)] text-[length:var(--t--1)] no-underline"
          >
            {t("backToList")}
          </Link>
        }
      />

      <div className="grid gap-[var(--s-6)] lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="flex flex-col gap-[var(--s-6)]">
          <Card variant="raised" className="overflow-x-auto">
            <SectionTitle
              hint={
                full.document.dueDate
                  ? t("dueOn", { date: formatDateOnly(full.document.dueDate) })
                  : undefined
              }
            >
              {t("lines")}
            </SectionTitle>

            <table className="w-full border-collapse text-[length:var(--t-0)]">
              <thead>
                <tr className="border-b border-hairline text-left">
                  <th scope="col" className="p-[var(--s-2)] text-[length:var(--t--1)] font-medium text-ink-55">
                    {t("lineDescription")}
                  </th>
                  <th scope="col" className="p-[var(--s-2)] text-right text-[length:var(--t--1)] font-medium text-ink-55">
                    {t("lineQty")}
                  </th>
                  <th scope="col" className="p-[var(--s-2)] text-right text-[length:var(--t--1)] font-medium text-ink-55">
                    {t("lineUnitAmount")}
                  </th>
                  <th scope="col" className="p-[var(--s-2)] text-[length:var(--t--1)] font-medium text-ink-55">
                    {t("lineTaxRate")}
                  </th>
                  <th scope="col" className="p-[var(--s-2)] text-right text-[length:var(--t--1)] font-medium text-ink-55">
                    {t("lineTotal")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {full.lines.map((line) => (
                  <tr key={line.id} className="border-b border-hairline last:border-0">
                    <td className="p-[var(--s-2)] align-top">
                      {line.description}
                      <span className="block text-[length:var(--t--1)] text-ink-55">
                        {line.unit}
                      </span>
                    </td>
                    <td className="tabular p-[var(--s-2)] text-right align-top">
                      {formatQty(line.qty)}
                    </td>
                    <td className="tabular p-[var(--s-2)] text-right align-top">
                      {formatMoneyParts(line.unitAmount, full.document.currency)}
                    </td>
                    <td className="p-[var(--s-2)] align-top text-ink-70">
                      {formatTaxRate(line.taxRate, uiLocale)}
                    </td>
                    <td className="tabular p-[var(--s-2)] text-right align-top">
                      {formatMoneyParts(line.lineTotal, full.document.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <dl className="m-0 ml-auto mt-[var(--s-5)] max-w-sm">
              <TotalRow
                label={t("subtotal10")}
                value={formatMoneyParts(full.document.subtotal10, full.document.currency)}
              />
              <TotalRow
                label={t("subtotal5")}
                value={formatMoneyParts(full.document.subtotal5, full.document.currency)}
              />
              <TotalRow
                label={t("subtotalExenta")}
                value={formatMoneyParts(full.document.subtotalExenta, full.document.currency)}
              />
              <TotalRow
                label={t("ivaTotal")}
                value={formatMoneyParts(
                  full.document.iva10 + full.document.iva5,
                  full.document.currency,
                )}
                muted
              />
              <TotalRow
                label={t("total")}
                value={formatMoneyParts(full.document.total, full.document.currency)}
                strong
              />
            </dl>

            {full.document.notes ? (
              <p className="mt-[var(--s-5)] whitespace-pre-line text-[length:var(--t--1)] text-ink-70">
                {full.document.notes}
              </p>
            ) : null}
          </Card>

          {editable ? (
            <Card variant="raised">
              <SectionTitle hint={t("editHint")}>{t("editTitle")}</SectionTitle>
              <InvoiceForm
                mode="edit"
                customers={options.customers}
                products={options.products}
                values={{
                  id: full.document.id,
                  type: full.document.type as "invoice_contado" | "invoice_credito",
                  customerId: String(full.document.customerId),
                  docLocale: full.document.docLocale,
                  currency: full.document.currency,
                  issueDate: full.document.issueDate ?? today,
                  creditDays:
                    full.document.issueDate && full.document.dueDate
                      ? String(
                          creditDaysBetween(full.document.issueDate, full.document.dueDate),
                        )
                      : "",
                  notes: full.document.notes ?? "",
                  lines: full.lines.map((line) => ({
                    productId: line.productId ? String(line.productId) : "",
                    description: line.description,
                    unit: line.unit,
                    qty: formatQty(line.qty),
                    unitAmount: formatAmount(line.unitAmount, full.document.currency),
                    taxRate: line.taxRate,
                  })),
                }}
              />
            </Card>
          ) : null}

          {issued ? (
            <Card variant="hair">
              <p className="eyebrow m-0">{t("immutableTitle")}</p>
              <p className="m-0 mt-[var(--s-2)] text-[length:var(--t--1)] text-ink-70">
                {t("immutableBody")}
              </p>
            </Card>
          ) : null}
        </div>

        <div className="flex flex-col gap-[var(--s-4)]">
          <Card variant="hair">
            <p className="eyebrow m-0">{t("status")}</p>
            <div className="mt-[var(--s-3)] flex flex-wrap gap-[var(--s-2)]">
              <Badge tone={overdue ? "danger" : statusTone(full.document.status)}>
                {overdue ? t("statuses.vencida") : t(`statuses.${full.document.status}`)}
              </Badge>
            </div>
            {full.document.issuedAt ? (
              <p className="m-0 mt-[var(--s-4)] text-[length:var(--t--1)] text-ink-55">
                {t("issuedAt", { date: formatDateTime(full.document.issuedAt) })}
              </p>
            ) : null}
          </Card>

          {isIssuable(full.document) && mayIssue ? (
            <Card variant="accent">
              <p className="eyebrow m-0">{t("issueTitle")}</p>
              <p className="m-0 mb-[var(--s-4)] mt-[var(--s-2)] text-[length:var(--t--1)] text-ink-55">
                {t("issueHint")}
              </p>
              <IssueInvoiceForm
                documentId={full.document.id}
                timbrados={timbrados.map((timbrado) => {
                  const status = timbradoStatus(toSnapshot(timbrado), today);
                  return {
                    id: timbrado.id,
                    label: timbrado.number,
                    nextNumber: previewNextNumber(toSnapshot(timbrado), today),
                    issuable: status.issuable,
                  };
                })}
              />
            </Card>
          ) : null}

          <Card variant="hair">
            <p className="eyebrow m-0">{t("share")}</p>
            <div className="mt-[var(--s-3)] flex flex-col gap-[var(--s-3)]">
              <a
                href={`/admin/facturas/${full.document.id}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center justify-center rounded-sm border border-hairline-strong px-[var(--s-4)] text-[length:var(--t--1)] no-underline"
              >
                {t("downloadPdf")}
              </a>

              {publicUrl ? (
                <>
                  <a
                    href={publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center justify-center rounded-sm border border-hairline-strong px-[var(--s-4)] text-[length:var(--t--1)] no-underline"
                  >
                    {t("openPublicLink")}
                  </a>
                  {full.customer?.whatsapp ? (
                    <a
                      href={waMeLink(
                        full.customer.whatsapp,
                        share("invoice", {
                          name: full.customer.name,
                          total: formatMoneyParts(
                            full.document.total,
                            full.document.currency,
                          ),
                          link: publicUrl,
                        }),
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center justify-center rounded-sm bg-accent px-[var(--s-4)] text-[length:var(--t--1)] font-medium text-accent-contrast no-underline"
                    >
                      {t("sendWhatsapp")}
                    </a>
                  ) : null}
                </>
              ) : null}
            </div>
          </Card>

          {full.document.relatedDocumentId ? (
            <Card variant="hair">
              <p className="eyebrow m-0">{t("fromQuoteTitle")}</p>
              <Link
                href={`/admin/presupuestos/${full.document.relatedDocumentId}`}
                className="mt-[var(--s-2)] inline-block text-[length:var(--t--1)] text-accent no-underline hover:underline"
              >
                {t("fromQuoteLink", { id: full.document.relatedDocumentId })}
              </Link>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
