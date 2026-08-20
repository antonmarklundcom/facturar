"use server";

import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/activity";
import { requireRole } from "@/lib/auth/guards";
import {
  findCustomer,
  insertCustomer,
  setCustomerActive,
  updateCustomer,
} from "@/lib/customers/data";
import { CUSTOMER_FIELDS, parseCustomer } from "@/lib/customers/parse";
import { checkboxField, echo, field, formError, formSuccess, type FormState } from "@/lib/forms";
import { idField } from "@/lib/validation";

const CUSTOMERS_PATH = "/admin/clientes";

export async function createCustomerAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireRole("catalog.write");
  const values = echo(formData, CUSTOMER_FIELDS);

  const parsed = parseCustomer(formData);
  if (!parsed.ok) return formError("invalid", parsed.fieldErrors, { values, previous });

  const customerId = await insertCustomer(session.tenantId, parsed.values, session.userId);

  await logActivity({
    tenantId: session.tenantId,
    userId: session.userId,
    entityType: "customer",
    entityId: customerId,
    action: "created",
    detail: { name: parsed.values.name },
  });

  revalidatePath(CUSTOMERS_PATH);
  return formSuccess("created");
}

export async function updateCustomerAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireRole("catalog.write");
  const values = echo(formData, CUSTOMER_FIELDS);

  const id = idField(field(formData, "customerId"));
  if (!id.ok) return formError("invalid", undefined, { values, previous });

  // Scoped read first: a customer id from another tenant must look missing,
  // not forbidden.
  const existing = await findCustomer(session.tenantId, id.value);
  if (!existing) return formError("notFound", undefined, { values, previous });

  const parsed = parseCustomer(formData);
  if (!parsed.ok) return formError("invalid", parsed.fieldErrors, { values, previous });

  await updateCustomer(
    session.tenantId,
    id.value,
    { ...parsed.values, active: checkboxField(formData, "active") },
    session.userId,
  );

  await logActivity({
    tenantId: session.tenantId,
    userId: session.userId,
    entityType: "customer",
    entityId: id.value,
    action: "updated",
    detail: { name: parsed.values.name },
  });

  revalidatePath(CUSTOMERS_PATH);
  revalidatePath(`${CUSTOMERS_PATH}/${id.value}`);
  return formSuccess("updated");
}

/**
 * Deactivate or restore a customer. Deletion is deliberately absent —
 * customers are referenced by issued documents, which are immutable
 * (guardrail 4).
 */
export async function setCustomerActiveAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireRole("catalog.write");

  const id = idField(field(formData, "customerId"));
  if (!id.ok) return formError("invalid", undefined, { previous });

  const existing = await findCustomer(session.tenantId, id.value);
  if (!existing) return formError("notFound", undefined, { previous });

  const active = checkboxField(formData, "active");
  await setCustomerActive(session.tenantId, id.value, active, session.userId);

  await logActivity({
    tenantId: session.tenantId,
    userId: session.userId,
    entityType: "customer",
    entityId: id.value,
    action: "updated",
    detail: { active },
  });

  revalidatePath(CUSTOMERS_PATH);
  revalidatePath(`${CUSTOMERS_PATH}/${id.value}`);
  return formSuccess(active ? "restored" : "deactivated");
}
