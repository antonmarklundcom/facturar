import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Badge, Card, PageHeader, SectionTitle } from "@/components/ui/page";
import { requireSession } from "@/lib/auth/guards";
import { can } from "@/lib/auth/roles";
import { findCustomer } from "@/lib/customers/data";
import { getTenant } from "@/lib/settings/tenant";
import { formatDateTime } from "@/domain/format";
import { formatRuc } from "@/domain/ruc";
import { formatWhatsapp, waMeLink } from "@/domain/whatsapp";
import { CustomerActiveToggle, EditCustomerForm } from "../customer-forms";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const session = await requireSession();
  const { id } = await params;
  const customer = await findCustomer(session.tenantId, Number(id));

  return { title: customer?.name ?? "" };
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;

  const customerId = Number(id);
  if (!Number.isInteger(customerId) || customerId <= 0) notFound();

  // Scoped read: another tenant's id is a 404 here, never a 403 — the app
  // does not confirm that a row it may not see exists (guardrail 2).
  const customer = await findCustomer(session.tenantId, customerId);
  if (!customer) notFound();

  const [t, tenant] = await Promise.all([
    getTranslations("customers"),
    getTenant(session.tenantId),
  ]);

  const mayWrite = can(session.role, "catalog.write");
  const ruc = formatRuc(customer.rucBase, customer.rucDv);
  const greeting = await getTranslations({
    locale: customer.docLocale,
    namespace: "customers",
  });

  return (
    <>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={customer.name}
        description={ruc ?? t("noRuc")}
        actions={
          <Link
            href="/admin/clientes"
            className="inline-flex min-h-11 items-center rounded-sm border border-hairline-strong px-[var(--s-4)] text-[length:var(--t--1)] no-underline"
          >
            {t("backToList")}
          </Link>
        }
      />

      <div className="grid gap-[var(--s-6)] lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <Card variant="raised">
          <SectionTitle>{mayWrite ? t("editTitle") : t("detailsTitle")}</SectionTitle>

          {mayWrite ? (
            <EditCustomerForm
              values={{
                id: customer.id,
                name: customer.name,
                ruc: ruc ?? "",
                isConsumidorFinal: customer.isConsumidorFinal,
                whatsapp: customer.whatsapp ?? "",
                email: customer.email ?? "",
                address: customer.address ?? "",
                docLocale: customer.docLocale,
                notes: customer.notes ?? "",
                active: customer.active,
              }}
            />
          ) : (
            <dl className="m-0 grid gap-[var(--s-4)] sm:grid-cols-2">
              <Detail label={t("ruc")} value={ruc} />
              <Detail label={t("whatsapp")} value={formatWhatsapp(customer.whatsapp)} />
              <Detail label={t("email")} value={customer.email} />
              <Detail label={t("address")} value={customer.address} />
              <Detail label={t("docLocale")} value={t(`locales.${customer.docLocale}`)} />
              <Detail label={t("notes")} value={customer.notes} />
            </dl>
          )}
        </Card>

        <div className="flex flex-col gap-[var(--s-4)]">
          <Card variant="hair">
            <p className="eyebrow m-0">{t("status")}</p>
            <div className="mt-[var(--s-3)] flex flex-wrap gap-[var(--s-2)]">
              <Badge tone={customer.active ? "ok" : "muted"}>
                {customer.active ? t("active") : t("inactive")}
              </Badge>
              {customer.isConsumidorFinal ? (
                <Badge tone="info">{t("consumidorFinalShort")}</Badge>
              ) : null}
            </div>
            <p className="m-0 mt-[var(--s-4)] text-[length:var(--t--1)] text-ink-55">
              {t("updatedAt", { date: formatDateTime(customer.updatedAt) })}
            </p>
          </Card>

          {customer.whatsapp ? (
            <Card variant="hair">
              <p className="eyebrow m-0">{t("whatsapp")}</p>
              <p className="tabular m-0 mt-[var(--s-2)]">
                {formatWhatsapp(customer.whatsapp)}
              </p>
              <a
                href={waMeLink(
                  customer.whatsapp,
                  greeting("waGreeting", {
                    name: customer.name,
                    company: tenant?.name ?? greeting("waFallbackCompany"),
                  }),
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-[var(--s-4)] inline-flex min-h-11 items-center rounded-sm bg-accent px-[var(--s-5)] text-[length:var(--t--1)] font-medium text-accent-contrast no-underline transition-transform duration-[var(--dur-fast)] ease-(--ease-io) hover:-translate-y-0.5"
              >
                {t("openWhatsapp")}
              </a>
            </Card>
          ) : null}

          {mayWrite ? (
            <Card variant="hair">
              <p className="eyebrow m-0">{customer.active ? t("deactivate") : t("restore")}</p>
              <p className="m-0 mb-[var(--s-4)] mt-[var(--s-2)] text-[length:var(--t--1)] text-ink-55">
                {t("deactivateHint")}
              </p>
              <CustomerActiveToggle id={customer.id} active={customer.active} />
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="m-0 text-[length:var(--t--1)] text-ink-55">{label}</dt>
      <dd className="m-0 mt-[var(--s-1)]">{value ?? "—"}</dd>
    </div>
  );
}
