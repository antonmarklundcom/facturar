import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge, Card, PageHeader, SectionTitle } from "@/components/ui/page";
import { requireSession } from "@/lib/auth/guards";
import { can } from "@/lib/auth/roles";
import { findProduct } from "@/lib/products/data";
import { formatAmount, formatDateTime, formatMoneyParts, formatTaxRate } from "@/domain/format";
import { ivaIncludedIn } from "@/domain/iva";
import { EditProductForm, ProductActiveToggle } from "../product-forms";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const session = await requireSession();
  const { id } = await params;
  const product = await findProduct(session.tenantId, Number(id));

  return { title: product?.name ?? "" };
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;

  const productId = Number(id);
  if (!Number.isInteger(productId) || productId <= 0) notFound();

  // Scoped read: another tenant's id is a 404 here, never a 403 (guardrail 2).
  const product = await findProduct(session.tenantId, productId);
  if (!product) notFound();

  const [t, locale] = await Promise.all([getTranslations("products"), getLocale()]);
  const uiLocale = locale === "en" ? "en" : "es";
  const mayWrite = can(session.role, "catalog.write");

  const iva =
    product.taxRate === "exenta"
      ? null
      : ivaIncludedIn(product.unitAmount, product.taxRate);

  return (
    <>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={product.name}
        description={t("perUnit", { unit: product.unit })}
        actions={
          <Link
            href="/admin/productos"
            className="inline-flex min-h-11 items-center rounded-sm border border-hairline-strong px-[var(--s-4)] text-[length:var(--t--1)] no-underline"
          >
            {t("backToList")}
          </Link>
        }
      />

      <div className="grid gap-[var(--s-6)] lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <Card variant="raised" className="min-w-0">
          <SectionTitle>{mayWrite ? t("editTitle") : t("detailsTitle")}</SectionTitle>

          {mayWrite ? (
            <EditProductForm
              values={{
                id: product.id,
                name: product.name,
                description: product.description ?? "",
                unit: product.unit,
                // Back into the shape a human types, so the form round-trips.
                unitAmount: formatAmount(product.unitAmount, product.currency),
                currency: product.currency,
                taxRate: product.taxRate,
                active: product.active,
              }}
            />
          ) : (
            <dl className="m-0 grid gap-[var(--s-4)] sm:grid-cols-2">
              <Detail
                label={t("unitAmount")}
                value={formatMoneyParts(product.unitAmount, product.currency)}
              />
              <Detail label={t("taxRate")} value={formatTaxRate(product.taxRate, uiLocale)} />
              <Detail label={t("unit")} value={product.unit} />
              <Detail label={t("description")} value={product.description} />
            </dl>
          )}
        </Card>

        <div className="flex min-w-0 flex-col gap-[var(--s-4)]">
          <Card variant="hair">
            <p className="eyebrow m-0">{t("priceBreakdown")}</p>
            <p className="money-display m-0 mt-[var(--s-2)] text-[length:var(--t-2)]">
              {formatMoneyParts(product.unitAmount, product.currency)}
            </p>
            <p className="m-0 mt-[var(--s-3)] text-[length:var(--t--1)] text-ink-55">
              {iva === null
                ? t("preview.exempt")
                : t("preview.ivaIncluded", {
                    iva: formatMoneyParts(iva, product.currency),
                  })}
            </p>
            <div className="mt-[var(--s-4)] flex flex-wrap gap-[var(--s-2)]">
              <Badge tone={product.active ? "ok" : "muted"}>
                {product.active ? t("active") : t("inactive")}
              </Badge>
              <Badge tone="info">{formatTaxRate(product.taxRate, uiLocale)}</Badge>
            </div>
            <p className="m-0 mt-[var(--s-4)] text-[length:var(--t--1)] text-ink-55">
              {t("updatedAt", { date: formatDateTime(product.updatedAt) })}
            </p>
          </Card>

          {mayWrite ? (
            <Card variant="hair">
              <p className="eyebrow m-0">{product.active ? t("deactivate") : t("restore")}</p>
              <p className="m-0 mb-[var(--s-4)] mt-[var(--s-2)] text-[length:var(--t--1)] text-ink-55">
                {t("deactivateHint")}
              </p>
              <ProductActiveToggle id={product.id} active={product.active} />
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
