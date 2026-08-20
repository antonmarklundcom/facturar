"use server";

import { revalidatePath } from "next/cache";
import { currencyValues, type Currency } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { requireRole } from "@/lib/auth/guards";
import { echo, field, formError, formSuccess, type FormState } from "@/lib/forms";
import { updateTenantSettings } from "@/lib/settings/tenant";
import { validateRuc } from "@/domain/ruc";

function parseCurrency(value: string): Currency | null {
  return (currencyValues as readonly string[]).includes(value) ? (value as Currency) : null;
}

/** Optional field: an empty string is stored as NULL, not as "". */
function optional(value: string): string | null {
  return value === "" ? null : value;
}

const TENANT_FIELDS = [
  "name",
  "ruc",
  "logoUrl",
  "defaultCurrency",
  "address",
  "phone",
  "email",
] as const;

/**
 * Update the tenant's own company data. Admin only — `tenant.manage` is not
 * granted to employee or viewer.
 */
export async function updateTenantAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireRole("tenant.manage");
  const echoed = echo(formData, TENANT_FIELDS);

  const name = field(formData, "name");
  const rucInput = field(formData, "ruc");
  const logoUrl = field(formData, "logoUrl");
  const defaultCurrency = parseCurrency(field(formData, "defaultCurrency"));

  const fieldErrors: Record<string, string> = {};

  if (!name) fieldErrors.name = "required";
  if (!defaultCurrency) fieldErrors.defaultCurrency = "invalid";

  // The tenant's own RUC prints on every document it issues, so it goes
  // through the same modulo-11 check as a customer's (guardrail 7).
  let rucBase: string | null = null;
  let rucDv: string | null = null;

  if (rucInput !== "") {
    const ruc = validateRuc(rucInput);
    if (!ruc.valid) {
      fieldErrors.ruc = ruc.problem;
    } else {
      rucBase = ruc.parts.base;
      rucDv = ruc.parts.dv;
    }
  }

  const email = field(formData, "email");
  if (email !== "" && !email.includes("@")) fieldErrors.email = "invalid";

  if (logoUrl !== "" && !/^https?:\/\//i.test(logoUrl)) {
    fieldErrors.logoUrl = "invalid";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return formError("invalid", fieldErrors, { values: echoed, previous });
  }

  await updateTenantSettings(
    session.tenantId,
    {
      name,
      rucBase,
      rucDv,
      logoUrl: optional(logoUrl),
      defaultCurrency: defaultCurrency!,
      address: optional(field(formData, "address")),
      phone: optional(field(formData, "phone")),
      email: optional(email),
    },
    session.userId,
  );

  await logActivity({
    tenantId: session.tenantId,
    userId: session.userId,
    entityType: "tenant",
    entityId: session.tenantId,
    action: "updated",
    detail: { name, defaultCurrency },
  });

  revalidatePath("/admin", "layout");
  return formSuccess("saved");
}
