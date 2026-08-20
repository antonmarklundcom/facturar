import "server-only";

import { redirect } from "next/navigation";
import type { Role } from "@/db/schema";
import { can, type Capability } from "./roles";
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

/** Session for the current request, or `null`. Never throws. */
export async function getCurrentSession(): Promise<AuthenticatedSession | null> {
  const session = await getSession();
  return toAuthenticated(session as SessionData);
}

/**
 * Session for the current request. Redirects to `/login` when there is none —
 * for use in pages and layouts, where a redirect is the right answer.
 */
export async function requireSession(): Promise<AuthenticatedSession> {
  const session = await getCurrentSession();
  if (!session) redirect(LOGIN_PATH);
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
