import "server-only";

import { db } from "@/db";
import { tenants, type Currency, type Tenant } from "@/db/schema";
import { ownTenant } from "@/db/tenant";

/**
 * Tenant settings (company data). Every read and write is scoped by the
 * session's tenant id — a tenant can only ever see or edit its own row.
 */
export async function getTenant(tenantId: number): Promise<Tenant | null> {
  const rows = await db
    .select()
    .from(tenants)
    .where(ownTenant(tenants.id, tenantId))
    .limit(1);

  return rows[0] ?? null;
}

export type TenantSettingsInput = {
  name: string;
  rucBase: string | null;
  rucDv: string | null;
  logoUrl: string | null;
  defaultCurrency: Currency;
  address: string | null;
  phone: string | null;
  email: string | null;
};

export async function updateTenantSettings(
  tenantId: number,
  values: TenantSettingsInput,
  updatedBy: number,
): Promise<void> {
  await db
    .update(tenants)
    .set({ ...values, updatedBy })
    .where(ownTenant(tenants.id, tenantId));
}
