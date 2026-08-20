import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge, Card, PageHeader, SectionTitle } from "@/components/ui/page";
import { requireSession } from "@/lib/auth/guards";
import { can } from "@/lib/auth/roles";
import { findConversion, findDocument } from "@/lib/documents/data";
import { documentEditorOptions } from "@/lib/documents/options";
import { validityDaysBetween } from "@/lib/documents/parse";
import { publicDocumentUrl } from "@/lib/documents/token";
import {
  asuncionDateString,
  formatAmount,
  formatDateOnly,
  formatMoneyParts,
  formatQty,
  formatTaxRate,
} from "@/domain/format";
import {
  canTransition,
  effectiveQuoteStatus,
  isConvertible,
  isQuoteEditable,
} from "@/domain/documents";
import { waMeLink } from "@/domain/whatsapp";
import { DocumentHistory } from "@/components/documents/history";
import {
  EmailSendForm,
  WhatsappSendLink,
} from "@/components/documents/send-controls";
import { emailEnabled } from "@/lib/email/send";
import { QUOTE_STATUSES } from "@/domain/documents";
import type { DocumentStatus } from "@/db/schema";
import { QuoteForm } from "../quote-form";
import { ConvertQuoteAction, QuoteStatusActions } from "../quote-actions";
import { statusTone } from "../status";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const session = await requireSession();
  const { id } = await params;
  const full = await findDocument(session.tenantId, Number(id));
  const t = await getTranslations("quotes");

  return { title: full ? `${t("title")} · ${full.customer?.name ?? ""}` : "" };
}

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;

  const documentId = Number(id);
  if (!Number.isInteger(documentId) || documentId <= 0) notFound();

  const full = await findDocument(session.tenantId, documentId);
  if (!full || full.document.type !== "quote") notFound();

  const [t, locale] = await Promise.all([getTranslations("quotes"), getLocale()]);
  const uiLocale = locale === "en" ? "en" : "es";
  const today = asuncionDateString(new Date());
  const status = effectiveQuoteStatus(full.document.status, full.document.validUntil, today);

  const mayWrite = can(session.role, "documents.write");
  const editable = mayWrite && isQuoteEditable(status);

  const [conversion, options, share] = await Promise.all([
    findConversion(session.tenantId, documentId),
    editable
      ? documentEditorOptions(session.tenantId)
      : Promise.resolve({ customers: [], products: [] }),
    // Share text is document-facing, so it is written in the document's own
    // language rather than the user's (guardrail 5).
    getTranslations({ locale: full.document.docLocale, namespace: "documentShare" }),
  ]);

  const transitions = mayWrite
    ? QUOTE_STATUSES.filter((candidate) => canTransition("quote", status, candidate))
    : [];

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const publicUrl = full.document.publicToken
    ? publicDocumentUrl(full.document.publicToken, baseUrl)
    : null;

  const shareText =
    publicUrl &&
    share("quote", {
      name: full.customer?.name ?? "",
      total: formatMoneyParts(full.document.total, full.document.currency),
      link: publicUrl,
    });

  return (
    <>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={full.customer?.name ?? t("noCustomer")}
        description={t("issuedOn", {
          date: full.document.issueDate ? formatDateOnly(full.document.issueDate) : "—",
        })}
        actions={
          <Link
            href="/admin/presupuestos"
            className="inline-flex min-h-11 items-center rounded-sm border border-hairline-strong px-[var(--s-4)] text-[length:var(--t--1)] no-underline"
          >
            {t("backToList")}
          </Link>
        }
      />

      <div className="grid gap-[var(--s-6)] lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-[var(--s-6)]">
          <Card variant="raised" className="min-w-0 overflow-x-auto">
            <SectionTitle
              hint={
                full.document.validUntil
                  ? t("validUntilOn", { date: formatDateOnly(full.document.validUntil) })
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
              <Row
                label={t("subtotal10")}
                value={formatMoneyParts(full.document.subtotal10, full.document.currency)}
              />
              <Row
                label={t("subtotal5")}
                value={formatMoneyParts(full.document.subtotal5, full.document.currency)}
              />
              <Row
                label={t("subtotalExenta")}
                value={formatMoneyParts(full.document.subtotalExenta, full.document.currency)}
              />
              <Row
                label={t("ivaTotal")}
                value={formatMoneyParts(
                  full.document.iva10 + full.document.iva5,
                  full.document.currency,
                )}
                muted
              />
              <Row
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
              <QuoteForm
                mode="edit"
                customers={options.customers}
                products={options.products}
                values={{
                  id: full.document.id,
                  customerId: String(full.document.customerId),
                  docLocale: full.document.docLocale,
                  currency: full.document.currency,
                  issueDate: full.document.issueDate ?? today,
                  validityDays:
                    full.document.issueDate && full.document.validUntil
                      ? String(
                          validityDaysBetween(
                            full.document.issueDate,
                            full.document.validUntil,
                          ),
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
        </div>

        <div className="flex min-w-0 flex-col gap-[var(--s-4)]">
          <Card variant="hair">
            <p className="eyebrow m-0">{t("status")}</p>
            <div className="mt-[var(--s-3)]">
              <Badge tone={statusTone(status)}>{t(`statuses.${status}`)}</Badge>
            </div>
            {transitions.length > 0 ? (
              <div className="mt-[var(--s-4)]">
                <QuoteStatusActions
                  documentId={full.document.id}
                  transitions={transitions as DocumentStatus[]}
                />
              </div>
            ) : null}
          </Card>

          <Card variant="hair">
            <p className="eyebrow m-0">{t("share")}</p>
            <div className="mt-[var(--s-3)] flex flex-col gap-[var(--s-3)]">
              <a
                href={`/admin/presupuestos/${full.document.id}/pdf`}
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
                  {full.customer?.whatsapp && shareText ? (
                    <WhatsappSendLink
                      documentId={full.document.id}
                      href={waMeLink(full.customer.whatsapp, shareText)}
                      label={t("sendWhatsapp")}
                    />
                  ) : null}
                  {mayWrite ? (
                    <EmailSendForm
                      documentId={full.document.id}
                      to={full.customer?.email ?? null}
                      enabled={emailEnabled()}
                    />
                  ) : null}
                  {baseUrl === "" ? (
                    <p className="m-0 text-[length:var(--t--1)] text-warn">
                      {t("missingBaseUrl")}
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>
          </Card>

          {mayWrite && isConvertible("quote", status, conversion !== null) ? (
            <Card variant="accent">
              <p className="eyebrow m-0">{t("convertTitle")}</p>
              <p className="m-0 mb-[var(--s-4)] mt-[var(--s-2)] text-[length:var(--t--1)] text-ink-55">
                {t("convertHint")}
              </p>
              <ConvertQuoteAction documentId={full.document.id} />
            </Card>
          ) : null}

          <Card variant="hair">
            <p className="eyebrow m-0 mb-[var(--s-3)]">{t("history")}</p>
            <DocumentHistory tenantId={session.tenantId} documentId={full.document.id} />
          </Card>

          {conversion ? (
            <Card variant="hair">
              <p className="eyebrow m-0">{t("convertedTitle")}</p>
              <Link
                href={`/admin/facturas/${conversion.id}`}
                className="mt-[var(--s-2)] inline-block text-[length:var(--t--1)] text-accent no-underline hover:underline"
              >
                {t("convertedBody", { id: conversion.id })}
              </Link>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

function Row({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-[var(--s-4)] py-[var(--s-1)] ${
        strong ? "mt-[var(--s-2)] border-t border-hairline-strong pt-[var(--s-3)]" : ""
      }`}
    >
      <dt className={`m-0 text-[length:var(--t--1)] ${muted ? "text-ink-55" : "text-ink-70"}`}>
        {label}
      </dt>
      <dd className={`tabular m-0 ${strong ? "text-[length:var(--t-1)] font-medium" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
