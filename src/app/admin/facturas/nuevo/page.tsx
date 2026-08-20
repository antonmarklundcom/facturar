import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Card, PageHeader } from "@/components/ui/page";
import { APP_PATH, requireSession } from "@/lib/auth/guards";
import { can } from "@/lib/auth/roles";
import { documentEditorOptions } from "@/lib/documents/options";
import { getTenant } from "@/lib/settings/tenant";
import { emptyLine } from "@/lib/documents/line-values";
import { asuncionDateString } from "@/domain/format";
import { DEFAULT_CREDIT_DAYS } from "@/domain/documents";
import { InvoiceForm } from "../invoice-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("invoices");
  return { title: t("new") };
}

export default async function NewInvoicePage() {
  const session = await requireSession();
  if (!can(session.role, "documents.write")) redirect(APP_PATH);

  const [t, tenant, options] = await Promise.all([
    getTranslations("invoices"),
    getTenant(session.tenantId),
    documentEditorOptions(session.tenantId),
  ]);

  return (
    <>
      <PageHeader eyebrow={t("eyebrow")} title={t("new")} description={t("newIntro")} />

      <Card variant="raised">
        <InvoiceForm
          mode="create"
          customers={options.customers}
          products={options.products}
          values={{
            type: "invoice_contado",
            customerId: "",
            docLocale: "es",
            currency: tenant?.defaultCurrency ?? "PYG",
            issueDate: asuncionDateString(new Date()),
            creditDays: String(DEFAULT_CREDIT_DAYS),
            notes: "",
            lines: [emptyLine()],
          }}
        />
      </Card>
    </>
  );
}
