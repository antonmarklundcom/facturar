import "server-only";

import { redirect } from "next/navigation";
import type { Role } from "@/db/schema";
import { can, type Capability } from "./roles";
import { SESSION_ENDED_PARAM, SESSION_ENDED_VALUE } from "./session-ended";
import { findSessionUser } from "./users";
import {
  getSession,
  toAuthenticated,
  type AuthenticatedSession,
  type SessionData,
} from "./session";

/** Where an unauthenticated visitor is sent (decision 22). */
export const LOGIN_PATH = "/login";
/** Landing route of the authenticated app (decision 22). */
export const APP_PATH = "/admin";
/** Forced password change after an admin reset (decision 19). */
export const CHANGE_PASSWORD_PATH = "/admin/cambiar-contrasena";

/**
 * Where an unusable session is sent: the login screen, flagged so the
 * middleware deletes the dead cookie instead of bouncing it back here. See
 * `session-ended.ts` for why those two strings live in a module of their own.
 */
export const LOGIN_PATH_ENDED = `${LOGIN_PATH}?${SESSION_ENDED_PARAM}=${SESSION_ENDED_VALUE}`;

/** Thrown when an authenticated user lacks the capability for a mutation. */
export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Thrown when a mutation is attempted with no session at all. */
export class UnauthenticatedError extends Error {
  constructor(message = "Unauthenticated") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

/**
 * Session for the current request, or `null`. Never throws.
 *
 * The cookie says who the user is; the **database** says what they may do.
 * The sealed session carries a copy of the role and the active flag from the
 * moment of login, and nothing invalidates it — so an employee who is
 * deactivated, demoted, or has their password reset after a compromise would
 * otherwise keep every right they had, in the tab they already have open,
 * until the session expired. That is the wrong answer to "I fired someone this
 * morning" (PR-18 security review).
 *
 * So the user row is re-read on every request and it wins: a missing or
 * deactivated user is no session at all, and the role and password-change flag
 * are taken from the row rather than from the cookie. The identity fields
 * (tenant, email, name, language) still come from the session — they are
 * display, not authority.
 *
 * The cost is one indexed read per request, against a page that already makes
 * several. Fail-closed: any doubt is `null`.
 */
export async function getCurrentSession(): Promise<AuthenticatedSession | null> {
  const session = await getSession();
  const claimed = toAuthenticated(session as SessionData);
  if (!claimed) return null;

  const live = await findSessionUser(claimed.tenantId, claimed.userId);
  if (!live || !live.active) return null;

  return {
    ...claimed,
    role: live.role,
    // A reset done while the session was open must still force the change.
    mustChangePassword: live.mustChangePassword,
  };
}

/**
 * Session for the current request. Redirects to `/login` when there is none —
 * for use in pages and layouts, where a redirect is the right answer.
 */
export async function requireSession(): Promise<AuthenticatedSession> {
  const session = await getCurrentSession();
  // Always the "session ended" form: this is reached with a cookie in hand
  // (the middleware turns away requests without one), and that cookie has just
  // been judged unusable, so it needs clearing rather than following.
  if (!session) redirect(LOGIN_PATH_ENDED);
  return session;
}

/**
 * The gate every mutating server action and route handler must call
 * (guardrail 3). Throws rather than redirects: a mutation with no rights is an
 * error, not a navigation.
 *
 * Pass a capability from the matrix, or an explicit role list when a call site
 * genuinely needs one.
 */
export async function requireRole(
  allowed: Capability | readonly Role[],
): Promise<AuthenticatedSession> {
  const session = await getCurrentSession();
  if (!session) throw new UnauthenticatedError();

  const permitted = Array.isArray(allowed)
    ? (allowed as readonly Role[]).includes(session.role)
    : can(session.role, allowed as Capability);

  if (!permitted) {
    throw new ForbiddenError(
      `Role "${session.role}" may not perform "${String(allowed)}"`,
    );
  }

  // A user who owes a password change may only change it. Every other
  // mutation is bounced to the change-password screen until they do.
  if (session.mustChangePassword) redirect(CHANGE_PASSWORD_PATH);

  return session;
}

/**
 * Variant of `requireRole` for the forced-password-change flow itself, which is
 * the one mutation a `mustChangePassword` user is allowed to perform.
 */
export async function requireSessionForPasswordChange(): Promise<AuthenticatedSession> {
  const session = await getCurrentSession();
  if (!session) throw new UnauthenticatedError();
  return session;
}
