import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Card, PageHeader } from "@/components/ui/page";
import { APP_PATH, requireSession } from "@/lib/auth/guards";
import { can } from "@/lib/auth/roles";
import { documentEditorOptions } from "@/lib/documents/options";
import { getTenant } from "@/lib/settings/tenant";
import { asuncionDateString } from "@/domain/format";
import { DEFAULT_VALIDITY_DAYS } from "@/domain/documents";
import { QuoteForm, emptyLine } from "../quote-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("quotes");
  return { title: t("new") };
}

export default async function NewQuotePage() {
  const session = await requireSession();
  if (!can(session.role, "documents.write")) redirect(APP_PATH);

  const [t, tenant, options] = await Promise.all([
    getTranslations("quotes"),
    getTenant(session.tenantId),
    documentEditorOptions(session.tenantId),
  ]);

  return (
    <>
      <PageHeader eyebrow={t("eyebrow")} title={t("new")} description={t("newIntro")} />

      <Card variant="raised">
        <QuoteForm
          mode="create"
          customers={options.customers}
          products={options.products}
          values={{
            customerId: "",
            docLocale: "es",
            currency: tenant?.defaultCurrency ?? "PYG",
            issueDate: asuncionDateString(new Date()),
            validityDays: String(DEFAULT_VALIDITY_DAYS),
            notes: "",
            lines: [emptyLine()],
          }}
        />
      </Card>
    </>
  );
}
