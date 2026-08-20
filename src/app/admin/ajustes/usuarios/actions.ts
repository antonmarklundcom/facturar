"use server";

import { revalidatePath } from "next/cache";
import { roleValues, type Role } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { requireRole } from "@/lib/auth/guards";
import { checkPassword, hashPassword } from "@/lib/auth/password";
import {
  countOtherActiveAdmins,
  findTenantUser,
  insertUser,
  isEmailAvailable,
  normalizeEmail,
  updateTenantUser,
} from "@/lib/auth/users";
import { checkboxField, field, formError, formSuccess, type FormState } from "@/lib/forms";
import { isLocale, type Locale } from "@/i18n/config";

const USERS_PATH = "/admin/ajustes/usuarios";

function parseRole(value: string): Role | null {
  return (roleValues as readonly string[]).includes(value) ? (value as Role) : null;
}

function parseLocale(value: string): Locale {
  return isLocale(value) ? value : "es";
}

/** Create a user in the caller's tenant. Admin only. */
export async function createUserAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireRole("users.manage");

  const email = normalizeEmail(field(formData, "email"));
  const name = field(formData, "name");
  const role = parseRole(field(formData, "role"));
  const uiLocale = parseLocale(field(formData, "uiLocale"));
  const password = String(formData.get("password") ?? "");

  const fieldErrors: Record<string, string> = {};
  if (!email.includes("@")) fieldErrors.email = "invalid";
  if (!name) fieldErrors.name = "required";
  if (!role) fieldErrors.role = "invalid";

  const problems = checkPassword(password);
  if (problems.length > 0) fieldErrors.password = problems[0];

  if (Object.keys(fieldErrors).length > 0) return formError("invalid", fieldErrors);

  if (!(await isEmailAvailable(email))) {
    return formError("invalid", { email: "taken" });
  }

  const userId = await insertUser({
    tenantId: session.tenantId,
    email,
    name,
    role: role!,
    uiLocale,
    passwordHash: await hashPassword(password),
    // The admin picks the first password and hands it over out of band, so the
    // user must replace it the first time they sign in (decision 19).
    mustChangePassword: true,
    updatedBy: session.userId,
  });

  await logActivity({
    tenantId: session.tenantId,
    userId: session.userId,
    entityType: "user",
    entityId: userId,
    action: "created",
    detail: { email, role },
  });

  revalidatePath(USERS_PATH);
  return formSuccess("userCreated");
}

/** Update name / role / active for a user in the caller's tenant. Admin only. */
export async function updateUserAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireRole("users.manage");

  const userId = Number(field(formData, "userId"));
  const name = field(formData, "name");
  const role = parseRole(field(formData, "role"));
  const active = checkboxField(formData, "active");

  if (!Number.isInteger(userId) || userId <= 0 || !role || !name) {
    return formError("invalid");
  }

  // Scoped read: a user id from another tenant simply does not resolve.
  const target = await findTenantUser(session.tenantId, userId);
  if (!target) return formError("notFound");

  // Do not let the tenant lock itself out of its own settings.
  const losesAdmin = target.role === "admin" && (role !== "admin" || !active);
  if (losesAdmin && (await countOtherActiveAdmins(session.tenantId, userId)) === 0) {
    return formError("lastAdmin");
  }

  await updateTenantUser(
    session.tenantId,
    userId,
    { name, role, active },
    session.userId,
  );

  await logActivity({
    tenantId: session.tenantId,
    userId: session.userId,
    entityType: "user",
    entityId: userId,
    action: "updated",
    detail: { name, role, active },
  });

  revalidatePath(USERS_PATH);
  return formSuccess("userUpdated");
}

/**
 * Admin-only password reset (decision 19). The admin sets a new password and
 * communicates it out of band; the user is forced to replace it at next login.
 * There is no public reset route and no reset email in v1.
 */
export async function resetUserPasswordAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireRole("users.manage");

  const userId = Number(field(formData, "userId"));
  const password = String(formData.get("password") ?? "");

  if (!Number.isInteger(userId) || userId <= 0) return formError("invalid");

  const problems = checkPassword(password);
  if (problems.length > 0) return formError("invalid", { password: problems[0] });

  const target = await findTenantUser(session.tenantId, userId);
  if (!target) return formError("notFound");

  await updateTenantUser(
    session.tenantId,
    userId,
    { passwordHash: await hashPassword(password), mustChangePassword: true },
    session.userId,
  );

  await logActivity({
    tenantId: session.tenantId,
    userId: session.userId,
    entityType: "user",
    entityId: userId,
    action: "updated",
    detail: { event: "password_reset_by_admin" },
  });

  revalidatePath(USERS_PATH);
  return formSuccess("passwordReset");
}
