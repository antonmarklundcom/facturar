import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Badge, Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui/page";
import { inputClass } from "@/components/ui/field";
import { requireSession } from "@/lib/auth/guards";
import { can } from "@/lib/auth/roles";
import { listCustomers } from "@/lib/customers/data";
import { getTenant } from "@/lib/settings/tenant";
import { formatRuc } from "@/domain/ruc";
import { formatWhatsapp, waMeLink } from "@/domain/whatsapp";
import type { DocumentLocale } from "@/db/schema";
import { CreateCustomerForm } from "./customer-forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("customers");
  return { title: t("title") };
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; inactive?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;

  const search = params.q?.trim() ?? "";
  const includeInactive = params.inactive === "1";

  const [t, tenant, rows] = await Promise.all([
    getTranslations("customers"),
    getTenant(session.tenantId),
    listCustomers(session.tenantId, { search, includeInactive }),
  ]);

  // The WhatsApp greeting is document-facing text, so it follows the
  // customer's document language, not the language of the user clicking it
  // (guardrail 5).
  const greetings: Record<DocumentLocale, (name: string) => string> = {
    es: await greetingFor("es", tenant?.name),
    en: await greetingFor("en", tenant?.name),
  };

  const mayWrite = can(session.role, "catalog.write");

  return (
    <>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} description={t("intro")} />

      <div className="grid gap-[var(--s-6)] lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-[var(--s-4)]">
          <form method="get" className="flex flex-wrap items-center gap-[var(--s-3)]">
            <input
              type="search"
              name="q"
              defaultValue={search}
              placeholder={t("searchPlaceholder")}
              aria-label={t("search")}
              className={`${inputClass} max-w-xs flex-1`}
            />
            <label className="flex min-h-11 items-center gap-[var(--s-2)] text-[length:var(--t--1)] text-ink-70">
              <input
                type="checkbox"
                name="inactive"
                value="1"
                defaultChecked={includeInactive}
                className="size-5"
              />
              {t("showInactive")}
            </label>
            <button
              type="submit"
              className="min-h-11 rounded-sm border border-hairline-strong px-[var(--s-4)] text-[length:var(--t--1)]"
            >
              {t("search")}
            </button>
          </form>

          {rows.length === 0 ? (
            <Card variant="raised">
              <EmptyState
                title={search ? t("noResults.title") : t("empty.title")}
                body={search ? t("noResults.body") : t("empty.body")}
              />
            </Card>
          ) : (
            <Card variant="raised" className="overflow-x-auto p-0">
              <table className="w-full border-collapse text-[length:var(--t-0)]">
                <caption className="sr-only">{t("title")}</caption>
                <thead>
                  <tr className="border-b border-hairline text-left">
                    <Th>{t("name")}</Th>
                    <Th>{t("ruc")}</Th>
                    <Th>{t("whatsapp")}</Th>
                    <Th className="text-right">{t("actions")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((customer) => {
                    const ruc = formatRuc(customer.rucBase, customer.rucDv);

                    return (
                      <tr key={customer.id} className="border-b border-hairline last:border-0">
                        <td className="p-[var(--s-3)] align-top">
                          <Link
                            href={`/admin/clientes/${customer.id}`}
                            className="font-medium no-underline hover:underline"
                          >
                            {customer.name}
                          </Link>
                          <div className="mt-[var(--s-1)] flex flex-wrap gap-[var(--s-2)]">
                            {customer.isConsumidorFinal ? (
                              <Badge tone="info">{t("consumidorFinalShort")}</Badge>
                            ) : null}
                            {customer.active ? null : (
                              <Badge tone="muted">{t("inactive")}</Badge>
                            )}
                          </div>
                        </td>
                        <td className="tabular p-[var(--s-3)] align-top text-ink-70">
                          {ruc ?? "—"}
                        </td>
                        <td className="tabular p-[var(--s-3)] align-top">
                          {customer.whatsapp ? (
                            <a
                              href={waMeLink(
                                customer.whatsapp,
                                greetings[customer.docLocale](customer.name),
                              )}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="no-underline hover:underline"
                            >
                              {formatWhatsapp(customer.whatsapp)}
                            </a>
                          ) : (
                            <span className="text-ink-55">—</span>
                          )}
                        </td>
                        <td className="p-[var(--s-3)] text-right align-top">
                          <Link
                            href={`/admin/clientes/${customer.id}`}
                            className="text-[length:var(--t--1)] no-underline text-accent hover:underline"
                          >
                            {mayWrite ? t("edit") : t("view")}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </div>

        {mayWrite ? (
          <Card variant="accent" className="lg:sticky lg:top-[var(--s-6)]">
            <SectionTitle hint={t("createHint")}>{t("createTitle")}</SectionTitle>
            <CreateCustomerForm />
          </Card>
        ) : (
          <Card variant="hair">
            <p className="m-0 text-[length:var(--t--1)] text-ink-55">{t("readOnly")}</p>
          </Card>
        )}
      </div>
    </>
  );
}

/** Greeting builder in one document language. */
async function greetingFor(
  locale: DocumentLocale,
  tenantName: string | null | undefined,
): Promise<(name: string) => string> {
  const t = await getTranslations({ locale, namespace: "customers" });
  return (name: string) =>
    t("waGreeting", { name, company: tenantName ?? t("waFallbackCompany") });
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
