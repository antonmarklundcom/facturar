"use server";

import { redirect } from "next/navigation";
import { logActivity } from "@/lib/activity";
import { APP_PATH, requireSessionForPasswordChange } from "@/lib/auth/guards";
import { checkPassword, hashPassword, verifyPassword } from "@/lib/auth/password";
import { getSession } from "@/lib/auth/session";
import { findTenantUser, updateTenantUser } from "@/lib/auth/users";
import { formError, type FormState } from "@/lib/forms";

/**
 * Change your own password. This is the single mutation a user carrying
 * `must_change_password` is allowed to perform (decision 19) — hence
 * `requireSessionForPasswordChange` rather than `requireRole`, which would
 * bounce them straight back to this screen.
 *
 * The current password is always required, including right after an admin
 * reset: the admin hands the user a temporary password out of band, and
 * proving they have it is what makes the reset safe.
 */
export async function changeOwnPasswordAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireSessionForPasswordChange();

  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirmation = String(formData.get("confirmPassword") ?? "");

  if (!current || !next) {
    return formError("invalid", {
      ...(current ? {} : { currentPassword: "required" }),
      ...(next ? {} : { newPassword: "required" }),
    });
  }

  if (next !== confirmation) {
    return formError("invalid", { confirmPassword: "mismatch" });
  }

  const user = await findTenantUser(session.tenantId, session.userId);
  if (!user) return formError("invalid");

  if (!(await verifyPassword(current, user.passwordHash))) {
    return formError("invalid", { currentPassword: "wrong" });
  }

  const problems = checkPassword(next, {
    currentHashMatches: await verifyPassword(next, user.passwordHash),
  });
  if (problems.length > 0) {
    return formError("invalid", { newPassword: problems[0] });
  }

  await updateTenantUser(
    session.tenantId,
    session.userId,
    { passwordHash: await hashPassword(next), mustChangePassword: false },
    session.userId,
  );

  const ironSession = await getSession();
  ironSession.mustChangePassword = false;
  await ironSession.save();

  await logActivity({
    tenantId: session.tenantId,
    userId: session.userId,
    entityType: "user",
    entityId: session.userId,
    action: "updated",
    detail: { event: "password_changed_self" },
  });

  redirect(APP_PATH);
}
