"use server";

import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/activity";
import { requireRole } from "@/lib/auth/guards";
import {
  findProduct,
  insertProduct,
  setProductActive,
  updateProduct,
} from "@/lib/products/data";
import { PRODUCT_FIELDS, parseProduct } from "@/lib/products/parse";
import { checkboxField, echo, field, formError, formSuccess, type FormState } from "@/lib/forms";
import { idField } from "@/lib/validation";

const PRODUCTS_PATH = "/admin/productos";

export async function createProductAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireRole("catalog.write");
  const values = echo(formData, PRODUCT_FIELDS);

  const parsed = parseProduct(formData);
  if (!parsed.ok) return formError("invalid", parsed.fieldErrors, { values, previous });

  const productId = await insertProduct(session.tenantId, parsed.values, session.userId);

  await logActivity({
    tenantId: session.tenantId,
    userId: session.userId,
    entityType: "product",
    entityId: productId,
    action: "created",
    detail: {
      name: parsed.values.name,
      unitAmount: parsed.values.unitAmount,
      currency: parsed.values.currency,
    },
  });

  revalidatePath(PRODUCTS_PATH);
  return formSuccess("created");
}

export async function updateProductAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireRole("catalog.write");
  const values = echo(formData, PRODUCT_FIELDS);

  const id = idField(field(formData, "productId"));
  if (!id.ok) return formError("invalid", undefined, { values, previous });

  // Scoped read first: another tenant's id must look missing, not forbidden.
  const existing = await findProduct(session.tenantId, id.value);
  if (!existing) return formError("notFound", undefined, { values, previous });

  const parsed = parseProduct(formData);
  if (!parsed.ok) return formError("invalid", parsed.fieldErrors, { values, previous });

  await updateProduct(
    session.tenantId,
    id.value,
    { ...parsed.values, active: checkboxField(formData, "active") },
    session.userId,
  );

  await logActivity({
    tenantId: session.tenantId,
    userId: session.userId,
    entityType: "product",
    entityId: id.value,
    action: "updated",
    detail: {
      name: parsed.values.name,
      unitAmount: parsed.values.unitAmount,
      currency: parsed.values.currency,
    },
  });

  revalidatePath(PRODUCTS_PATH);
  revalidatePath(`${PRODUCTS_PATH}/${id.value}`);
  return formSuccess("updated");
}

/**
 * Deactivate or restore. Deletion is deliberately absent — issued documents
 * link back to the product row (guardrail 4).
 */
export async function setProductActiveAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireRole("catalog.write");

  const id = idField(field(formData, "productId"));
  if (!id.ok) return formError("invalid", undefined, { previous });

  const existing = await findProduct(session.tenantId, id.value);
  if (!existing) return formError("notFound", undefined, { previous });

  const active = checkboxField(formData, "active");
  await setProductActive(session.tenantId, id.value, active, session.userId);

  await logActivity({
    tenantId: session.tenantId,
    userId: session.userId,
    entityType: "product",
    entityId: id.value,
    action: "updated",
    detail: { active },
  });

  revalidatePath(PRODUCTS_PATH);
  revalidatePath(`${PRODUCTS_PATH}/${id.value}`);
  return formSuccess(active ? "restored" : "deactivated");
}
