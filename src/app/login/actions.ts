"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { logActivity } from "@/lib/activity";
import { APP_PATH, CHANGE_PASSWORD_PATH, LOGIN_PATH } from "@/lib/auth/guards";
import { fakeVerifyDelay, verifyPassword } from "@/lib/auth/password";
import { getSession } from "@/lib/auth/session";
import { clearThrottle, countAttempt, pruneStaleThrottles } from "@/lib/auth/throttle";
import { findLoginCandidate, markLoggedIn, normalizeEmail } from "@/lib/auth/users";
import { parseClientIp } from "@/lib/client-ip";
import { echo, field, formError, type FormState } from "@/lib/forms";
import { loginRejected } from "@/domain/throttle";
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

  const now = new Date();
  const requestHeaders = await headers();
  const ip = parseClientIp(
    requestHeaders.get("x-forwarded-for"),
    requestHeaders.get("x-real-ip"),
  );

  // Count this attempt before checking anything, and act on the verdict only
  // at the end. Counting first is what makes the limit hold against a burst of
  // simultaneous requests rather than only against attempts made one after
  // another. Acting last is what keeps a throttled attempt on the same code
  // path, and therefore the same clock, as a wrong password — short-circuiting
  // here would turn the limiter into its own account-existence oracle. A
  // successful login clears the counter below, so this costs a real user
  // nothing.
  const throttle = await countAttempt(email, ip, now);

  const candidate = await findLoginCandidate(email);

  // Spend the same time as a real comparison when the address has no account,
  // so response timing does not reveal which addresses are real.
  let passwordOk = false;
  if (candidate) {
    passwordOk = await verifyPassword(password, candidate.passwordHash);
  } else {
    await fakeVerifyDelay();
  }

  // One generic answer for every way this can fail: wrong password, unknown
  // address, deactivated account, and locked out. "This account is disabled"
  // and "too many attempts" are both account-existence oracles, and the
  // limiter must not become the thing that leaks what the rest of this
  // function is careful not to. The domain owns that decision so the four
  // cases cannot drift apart — including the one where a locked-out attempt
  // carries the *correct* password and still fails.
  if (
    loginRejected({
      locked: throttle.locked,
      accountExists: candidate !== null,
      passwordOk,
      accountActive: candidate?.active ?? false,
    })
  ) {
    return formError("invalidCredentials", undefined, { values, previous });
  }

  // `loginRejected` has already returned for a missing account; TypeScript
  // cannot see that through the call, so this restates it. It is unreachable.
  if (!candidate) return formError("invalidCredentials", undefined, { values, previous });

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

  // A successful login clears this address's failure count — a person who
  // finally remembers their password should not stay locked out. The IP
  // counter deliberately survives; see `clearThrottle`.
  await clearThrottle(email);
  await pruneStaleThrottles(now);

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
