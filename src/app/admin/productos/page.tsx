import Link from "next/link";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge, Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui/page";
import { inputClass } from "@/components/ui/field";
import { requireSession } from "@/lib/auth/guards";
import { can } from "@/lib/auth/roles";
import { listProducts } from "@/lib/products/data";
import { getTenant } from "@/lib/settings/tenant";
import { formatMoneyParts, formatTaxRate } from "@/domain/format";
import { ivaIncludedIn } from "@/domain/iva";
import { CreateProductForm } from "./product-forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("products");
  return { title: t("title") };
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; inactive?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;

  const search = params.q?.trim() ?? "";
  const includeInactive = params.inactive === "1";

  const [t, locale, tenant, rows] = await Promise.all([
    getTranslations("products"),
    getLocale(),
    getTenant(session.tenantId),
    listProducts(session.tenantId, { search, includeInactive }),
  ]);

  const uiLocale = locale === "en" ? "en" : "es";
  const mayWrite = can(session.role, "catalog.write");

  return (
    <>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} description={t("intro")} />

      <div className="grid gap-[var(--s-6)] lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <div className="flex flex-col gap-[var(--s-4)]">
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
                    <Th className="text-right">{t("unitAmount")}</Th>
                    <Th>{t("taxRate")}</Th>
                    <Th className="text-right">{t("actions")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((product) => (
                    <tr key={product.id} className="border-b border-hairline last:border-0">
                      <td className="p-[var(--s-3)] align-top">
                        <Link
                          href={`/admin/productos/${product.id}`}
                          className="font-medium no-underline hover:underline"
                        >
                          {product.name}
                        </Link>
                        <div className="mt-[var(--s-1)] flex flex-wrap items-center gap-[var(--s-2)] text-[length:var(--t--1)] text-ink-55">
                          <span>{t("perUnit", { unit: product.unit })}</span>
                          {product.active ? null : (
                            <Badge tone="muted">{t("inactive")}</Badge>
                          )}
                        </div>
                      </td>
                      <td className="tabular p-[var(--s-3)] text-right align-top">
                        {formatMoneyParts(product.unitAmount, product.currency)}
                        {product.taxRate === "exenta" ? null : (
                          <div className="mt-[var(--s-1)] text-[length:var(--t--1)] text-ink-55">
                            {t("ivaShort", {
                              iva: formatMoneyParts(
                                ivaIncludedIn(product.unitAmount, product.taxRate),
                                product.currency,
                              ),
                            })}
                          </div>
                        )}
                      </td>
                      <td className="p-[var(--s-3)] align-top text-ink-70">
                        {formatTaxRate(product.taxRate, uiLocale)}
                      </td>
                      <td className="p-[var(--s-3)] text-right align-top">
                        <Link
                          href={`/admin/productos/${product.id}`}
                          className="text-[length:var(--t--1)] text-accent no-underline hover:underline"
                        >
                          {mayWrite ? t("edit") : t("view")}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>

        {mayWrite ? (
          <Card variant="accent" className="lg:sticky lg:top-[var(--s-6)]">
            <SectionTitle hint={t("createHint")}>{t("createTitle")}</SectionTitle>
            <CreateProductForm defaultCurrency={tenant?.defaultCurrency ?? "PYG"} />
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
