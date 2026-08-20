import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge, Card, PageHeader, SectionTitle } from "@/components/ui/page";
import { TotalRow } from "@/components/documents/line-editor";
import { requireSession } from "@/lib/auth/guards";
import { findDocument } from "@/lib/documents/data";
import { publicDocumentUrl } from "@/lib/documents/token";
import {
  formatDateOnly,
  formatDateTime,
  formatMoneyParts,
  formatQty,
  formatTaxRate,
} from "@/domain/format";

/**
 * A credit note, read-only. There is deliberately no edit path: a credit note
 * is issued the moment it exists and is immutable from then on (guardrail 4) —
 * correcting one means issuing another document, not rewriting this.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const session = await requireSession();
  const { id } = await params;
  const full = await findDocument(session.tenantId, Number(id));

  return { title: full?.document.number ?? "" };
}

export default async function CreditNotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;

  const documentId = Number(id);
  if (!Number.isInteger(documentId) || documentId <= 0) notFound();

  const full = await findDocument(session.tenantId, documentId);
  if (!full || full.document.type !== "credit_note") notFound();

  const [t, locale] = await Promise.all([getTranslations("creditNotes"), getLocale()]);
  const uiLocale = locale === "en" ? "en" : "es";

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const publicUrl = full.document.publicToken
    ? publicDocumentUrl(full.document.publicToken, baseUrl)
    : null;

  return (
    <>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={full.document.number ?? t("draft")}
        description={full.customer?.name ?? ""}
        actions={
          full.document.relatedDocumentId ? (
            <Link
              href={`/admin/facturas/${full.document.relatedDocumentId}`}
              className="inline-flex min-h-11 items-center rounded-sm border border-hairline-strong px-[var(--s-4)] text-[length:var(--t--1)] no-underline"
            >
              {t("backToInvoice")}
            </Link>
          ) : undefined
        }
      />

      <div className="grid gap-[var(--s-6)] lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <Card variant="raised" className="overflow-x-auto">
          <SectionTitle
            hint={
              full.document.issueDate
                ? t("issuedOn", { date: formatDateOnly(full.document.issueDate) })
                : undefined
            }
          >
            {t("lines")}
          </SectionTitle>

          <table className="w-full border-collapse text-[length:var(--t-0)]">
            <thead>
              <tr className="border-b border-hairline text-left">
                <Th>{t("lineDescription")}</Th>
                <Th className="text-right">{t("lineQty")}</Th>
                <Th className="text-right">{t("lineUnitAmount")}</Th>
                <Th>{t("lineTaxRate")}</Th>
                <Th className="text-right">{t("lineTotal")}</Th>
              </tr>
            </thead>
            <tbody>
              {full.lines.map((line) => (
                <tr key={line.id} className="border-b border-hairline last:border-0">
                  <td className="p-[var(--s-2)] align-top">{line.description}</td>
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

        <div className="flex flex-col gap-[var(--s-4)]">
          <Card variant="hair">
            <p className="eyebrow m-0">{t("status")}</p>
            <div className="mt-[var(--s-3)]">
              <Badge tone="info">{t("issuedBadge")}</Badge>
            </div>
            {full.document.issuedAt ? (
              <p className="m-0 mt-[var(--s-4)] text-[length:var(--t--1)] text-ink-55">
                {t("issuedAt", { date: formatDateTime(full.document.issuedAt) })}
              </p>
            ) : null}
            <p className="m-0 mt-[var(--s-2)] text-[length:var(--t--1)] text-ink-55">
              {t("immutable")}
            </p>
          </Card>

          <Card variant="hair">
            <p className="eyebrow m-0">{t("share")}</p>
            <div className="mt-[var(--s-3)] flex flex-col gap-[var(--s-3)]">
              <a
                href={`/admin/notas-credito/${full.document.id}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center justify-center rounded-sm border border-hairline-strong px-[var(--s-4)] text-[length:var(--t--1)] no-underline"
              >
                {t("downloadPdf")}
              </a>
              {publicUrl ? (
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center justify-center rounded-sm border border-hairline-strong px-[var(--s-4)] text-[length:var(--t--1)] no-underline"
                >
                  {t("openPublicLink")}
                </a>
              ) : null}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={`p-[var(--s-2)] text-[length:var(--t--1)] font-medium text-ink-55 ${className}`}
    >
      {children}
    </th>
  );
}
