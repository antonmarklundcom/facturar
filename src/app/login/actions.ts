"use server";

import { redirect } from "next/navigation";
import { logActivity } from "@/lib/activity";
import { APP_PATH, CHANGE_PASSWORD_PATH, LOGIN_PATH } from "@/lib/auth/guards";
import { fakeVerifyDelay, verifyPassword } from "@/lib/auth/password";
import { getSession } from "@/lib/auth/session";
import { findLoginCandidate, markLoggedIn, normalizeEmail } from "@/lib/auth/users";
import { echo, field, formError, type FormState } from "@/lib/forms";
import { setUserLocale } from "@/i18n/locale";

/**
 * Where to land after a successful login. Only same-origin paths inside the
 * authenticated app are honoured — anything else (a protocol-relative URL, an
 * absolute URL, a path outside /admin) falls back to the app root, so the
 * `next` parameter can never be turned into an open redirect.
 */
function safeNextPath(candidate: string): string {
  if (!candidate.startsWith("/admin")) return APP_PATH;
  if (candidate.startsWith("//") || candidate.includes("\\")) return APP_PATH;
  return candidate;
}

/**
 * Authentication entry point. This is the one mutating action in the app with
 * no `requireRole()` gate, by definition — it is what creates the session that
 * every other gate reads. See `tests/actions-guarded.test.ts`, which enforces
 * the rule for every other action and allow-lists this file explicitly.
 */
export async function loginAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = normalizeEmail(field(formData, "email"));
  // The email is echoed back so a failed attempt does not clear it; the
  // password deliberately is not.
  const values = echo(formData, ["email"]);
  const password = String(formData.get("password") ?? "");

  const fieldErrors: Record<string, string> = {};
  if (!email) fieldErrors.email = "required";
  if (!password) fieldErrors.password = "required";
  if (Object.keys(fieldErrors).length > 0) {
    return formError("invalidCredentials", fieldErrors, { values, previous });
  }

  const candidate = await findLoginCandidate(email);

  if (!candidate) {
    // Spend the same time as a real comparison so response timing does not
    // reveal which addresses have accounts.
    await fakeVerifyDelay();
    return formError("invalidCredentials", undefined, { values, previous });
  }

  const passwordOk = await verifyPassword(password, candidate.passwordHash);

  // An inactive account gets the same generic answer as a wrong password —
  // "this account is disabled" is an account-existence oracle.
  if (!passwordOk || !candidate.active) {
    return formError("invalidCredentials", undefined, { values, previous });
  }

  const session = await getSession();
  session.userId = candidate.id;
  session.tenantId = candidate.tenantId;
  session.role = candidate.role;
  session.email = candidate.email;
  session.name = candidate.name;
  session.uiLocale = candidate.uiLocale;
  session.mustChangePassword = candidate.mustChangePassword;
  await session.save();

  // Adopt the user's stored UI language, so their preference wins over whatever
  // locale cookie this browser happened to be carrying.
  await setUserLocale(candidate.uiLocale);

  await markLoggedIn(candidate.tenantId, candidate.id);
  await logActivity({
    tenantId: candidate.tenantId,
    userId: candidate.id,
    entityType: "user",
    entityId: candidate.id,
    action: "updated",
    detail: { event: "login" },
  });

  redirect(
    candidate.mustChangePassword
      ? CHANGE_PASSWORD_PATH
      : safeNextPath(field(formData, "next")),
  );
}

/** Destroy the session. Requires nothing but a session — it only removes rights. */
export async function logoutAction(): Promise<void> {
  const session = await getSession();
  session.destroy();
  redirect(LOGIN_PATH);
}
