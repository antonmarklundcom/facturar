import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { findDocumentByToken } from "@/lib/documents/data";
import { isPublicTokenShape } from "@/lib/documents/token";
import { getTenant } from "@/lib/settings/tenant";
import {
  asuncionDateString,
  formatDateOnly,
  formatMoneyParts,
  formatQty,
  formatTaxRate,
} from "@/domain/format";
import { effectiveQuoteStatus } from "@/domain/documents";
import { CONSUMIDOR_FINAL_RUC, formatRuc } from "@/domain/ruc";

/**
 * The buyer's view (decision 4 — token instead of a login). Deliberately
 * outside `/admin`, so the middleware never sees it.
 *
 * Everything on this page is rendered in the **document's** language, not the
 * viewer's: the buyer never chose a UI language here (guardrail 5).
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  if (!isPublicTokenShape(token)) return { title: "" };

  const full = await findDocumentByToken(token);
  if (!full) return { title: "" };

  const t = await getTranslations({
    locale: full.document.docLocale,
    namespace: "publicDocument",
  });

  return {
    title: t(full.document.type === "quote" ? "quote" : "invoice"),
    // A buyer link is not for search engines.
    robots: { index: false, follow: false },
  };
}

export default async function PublicDocumentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  // Shape-checked before it reaches a query; a miss is an ordinary 404 so the
  // page never reveals whether a token exists.
  if (!isPublicTokenShape(token)) notFound();

  const full = await findDocumentByToken(token);
  if (!full) notFound();

  const tenant = await getTenant(full.document.tenantId);
  if (!tenant) notFound();

  const locale = full.document.docLocale;
  // No client components on this page and no message provider: the buyer's
  // browser should not download the whole catalogue to read one document.
  const t = await getTranslations({ locale, namespace: "publicDocument" });

  const today = asuncionDateString(new Date());
  const status =
    full.document.type === "quote"
      ? effectiveQuoteStatus(full.document.status, full.document.validUntil, today)
      : full.document.status;

  const customerRuc = full.customer?.isConsumidorFinal
    ? CONSUMIDOR_FINAL_RUC
    : formatRuc(full.customer?.rucBase, full.customer?.rucDv);

  const currency = full.document.currency;

  return (
      <main className="mx-auto flex max-w-3xl flex-col gap-[var(--s-6)] p-[var(--s-5)] sm:p-[var(--s-8)]">
        <header className="flex flex-wrap items-start justify-between gap-[var(--s-4)]">
          <div className="min-w-0">
            <p className="eyebrow m-0">{tenant.name}</p>
            <h1 className="m-0 mt-[var(--s-2)] text-[length:var(--t-3)]">
              {t(full.document.type === "quote" ? "quote" : "invoice")}
            </h1>
            <p className="m-0 mt-[var(--s-2)] text-ink-70">
              {full.document.number ?? t("draft")}
            </p>
          </div>
          <a
            href={`/d/${token}/pdf`}
            className="inline-flex min-h-12 items-center rounded-sm bg-accent px-[var(--s-6)] font-medium text-accent-contrast no-underline"
          >
            {t("downloadPdf")}
          </a>
        </header>

        <section className="grid gap-[var(--s-4)] rounded-md border border-hairline p-[var(--s-5)] sm:grid-cols-2">
          <div>
            <p className="eyebrow m-0">{t("from")}</p>
            <p className="m-0 mt-[var(--s-2)] font-medium">{tenant.name}</p>
            {formatRuc(tenant.rucBase, tenant.rucDv) ? (
              <p className="m-0 text-[length:var(--t--1)] text-ink-55">
                {t("ruc")}: {formatRuc(tenant.rucBase, tenant.rucDv)}
              </p>
            ) : null}
            {tenant.address ? (
              <p className="m-0 text-[length:var(--t--1)] text-ink-55">{tenant.address}</p>
            ) : null}
          </div>
          <div>
            <p className="eyebrow m-0">{t("to")}</p>
            <p className="m-0 mt-[var(--s-2)] font-medium">
              {full.customer?.name ?? t("consumidorFinal")}
            </p>
            <p className="m-0 text-[length:var(--t--1)] text-ink-55">
              {t("ruc")}: {customerRuc ?? CONSUMIDOR_FINAL_RUC}
            </p>
          </div>
          <div>
            <p className="eyebrow m-0">{t("issueDate")}</p>
            <p className="tabular m-0 mt-[var(--s-2)]">
              {full.document.issueDate ? formatDateOnly(full.document.issueDate) : "—"}
            </p>
          </div>
          {full.document.validUntil ? (
            <div>
              <p className="eyebrow m-0">{t("validUntil")}</p>
              <p className="tabular m-0 mt-[var(--s-2)]">
                {formatDateOnly(full.document.validUntil)}
              </p>
              {status === "vencido" ? (
                <p className="m-0 mt-[var(--s-1)] text-[length:var(--t--1)] text-warn">
                  {t("expired")}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="overflow-x-auto rounded-md border border-hairline">
          <table className="w-full border-collapse text-[length:var(--t-0)]">
            <caption className="sr-only">{t("lines")}</caption>
            <thead>
              <tr className="border-b border-hairline text-left">
                <Th>{t("description")}</Th>
                <Th className="text-right">{t("qty")}</Th>
                <Th className="text-right">{t("unitPrice")}</Th>
                <Th>{t("taxRate")}</Th>
                <Th className="text-right">{t("lineTotal")}</Th>
              </tr>
            </thead>
            <tbody>
              {full.lines.map((line) => (
                <tr key={line.id} className="border-b border-hairline last:border-0">
                  <td className="p-[var(--s-3)] align-top">
                    {line.description}
                    <span className="block text-[length:var(--t--1)] text-ink-55">
                      {line.unit}
                    </span>
                  </td>
                  <td className="tabular p-[var(--s-3)] text-right align-top">
                    {formatQty(line.qty)}
                  </td>
                  <td className="tabular p-[var(--s-3)] text-right align-top">
                    {formatMoneyParts(line.unitAmount, currency)}
                  </td>
                  <td className="p-[var(--s-3)] align-top text-ink-70">
                    {formatTaxRate(line.taxRate, locale)}
                  </td>
                  <td className="tabular p-[var(--s-3)] text-right align-top">
                    {formatMoneyParts(line.lineTotal, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="ml-auto w-full max-w-sm rounded-md border border-hairline p-[var(--s-5)]">
          <Row
            label={t("ivaTotal")}
            value={formatMoneyParts(full.document.iva10 + full.document.iva5, currency)}
            muted
          />
          <Row
            label={t("total")}
            value={formatMoneyParts(full.document.total, currency)}
            strong
          />
          <p className="m-0 mt-[var(--s-3)] text-[length:var(--t--1)] text-ink-55">
            {t("ivaIncludedNote")}
          </p>
        </section>

        {full.document.notes ? (
          <section className="rounded-md border border-hairline p-[var(--s-5)]">
            <p className="eyebrow m-0">{t("notes")}</p>
            <p className="m-0 mt-[var(--s-2)] whitespace-pre-line text-ink-70">
              {full.document.notes}
            </p>
          </section>
        ) : null}

        <footer className="text-[length:var(--t--1)] text-ink-55">
          <p className="m-0">{t("footer", { company: tenant.name })}</p>
        </footer>
      </main>
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
      <span className={`text-[length:var(--t--1)] ${muted ? "text-ink-55" : "text-ink-70"}`}>
        {label}
      </span>
      <span className={`tabular ${strong ? "text-[length:var(--t-1)] font-medium" : ""}`}>
        {value}
      </span>
    </div>
  );
}
