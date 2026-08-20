import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Card, PageHeader, SectionTitle } from "@/components/ui/page";
import { StampIcon, UsersIcon } from "@/components/shell/icons";
import { APP_PATH, requireSession } from "@/lib/auth/guards";
import { can } from "@/lib/auth/roles";
import { getTenant } from "@/lib/settings/tenant";
import { formatRuc } from "@/domain/ruc";
import { TenantForm } from "./tenant-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("title") };
}

export default async function SettingsPage() {
  const session = await requireSession();
  if (!can(session.role, "tenant.manage")) redirect(APP_PATH);

  const [t, tenant] = await Promise.all([
    getTranslations("settings"),
    getTenant(session.tenantId),
  ]);

  if (!tenant) redirect(APP_PATH);

  return (
    <>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} description={t("intro")} />

      <div className="flex flex-col gap-[var(--s-6)]">
        <Card variant="raised">
          <SectionTitle hint={t("companyHint")}>{t("company")}</SectionTitle>
          <TenantForm
            tenant={{
              name: tenant.name,
              ruc: formatRuc(tenant.rucBase, tenant.rucDv) ?? "",
              logoUrl: tenant.logoUrl ?? "",
              defaultCurrency: tenant.defaultCurrency,
              address: tenant.address ?? "",
              phone: tenant.phone ?? "",
              email: tenant.email ?? "",
            }}
          />
        </Card>

        <div className="grid gap-[var(--s-4)] sm:grid-cols-2">
          <SettingsLink
            href="/admin/ajustes/timbrados"
            icon={<StampIcon />}
            title={t("links.timbrados")}
            body={t("links.timbradosBody")}
          />
          <SettingsLink
            href="/admin/ajustes/usuarios"
            icon={<UsersIcon />}
            title={t("links.users")}
            body={t("links.usersBody")}
          />
        </div>
      </div>
    </>
  );
}

function SettingsLink({
  href,
  icon,
  title,
  body,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-md border border-hairline bg-surface p-[var(--s-6)] no-underline shadow-[var(--shadow-1)] transition-[transform,box-shadow] duration-[var(--dur-fast)] ease-(--ease-io) hover:-translate-y-1 hover:shadow-[var(--shadow-2)]"
    >
      <span
        aria-hidden
        className="grid size-10 place-items-center rounded-sm bg-surface-2 text-accent"
      >
        {icon}
      </span>
      <p className="m-0 mt-[var(--s-4)] font-medium">{title}</p>
      <p className="m-0 mt-[var(--s-2)] text-[length:var(--t--1)] text-ink-55">{body}</p>
    </Link>
  );
}
