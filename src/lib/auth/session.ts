import "server-only";

import { cookies } from "next/headers";
import { getIronSession, type IronSession, type SessionOptions } from "iron-session";
import type { Role } from "@/db/schema";
import type { Locale } from "@/i18n/config";

export const SESSION_COOKIE = "facturar_session";

export type SessionData = {
  userId?: number;
  tenantId?: number;
  role?: Role;
  email?: string;
  name?: string;
  uiLocale?: Locale;
  /** Set by an admin password reset (decision 19). Blocks the app until cleared. */
  mustChangePassword?: boolean;
};

/**
 * A session that has actually been authenticated. Server code should hold this
 * type rather than `SessionData`, so `tenantId` is never `undefined` by the
 * time it reaches a query.
 */
export type AuthenticatedSession = {
  userId: number;
  tenantId: number;
  role: Role;
  email: string;
  name: string;
  uiLocale: Locale;
  mustChangePassword: boolean;
};

export function sessionOptions(): SessionOptions {
  const password = process.env.SESSION_SECRET;

  if (!password || password.length < 32) {
    throw new Error(
      "SESSION_SECRET is missing or shorter than 32 characters — see .env.example.",
    );
  }

  // Eight hours, stated twice on purpose. `ttl` is how long the sealed value
  // stays cryptographically valid; `cookieOptions.maxAge` is only when the
  // browser throws it away. iron-session derives one from the other *unless*
  // `maxAge` is given explicitly — which it is here — in which case `ttl`
  // silently keeps its 14-day default (see its `index.js`, the `"maxAge" in
  // cookieOptions` branch). A cookie copied off an unlocked machine would then
  // still authenticate for another thirteen days after the browser that owned
  // it had forgotten it. Both are set, and they must stay equal.
  const EIGHT_HOURS = 60 * 60 * 8;

  return {
    password,
    ttl: EIGHT_HOURS,
    cookieName: SESSION_COOKIE,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      // An invoicing app is used during the working day, and a stale session
      // on a shared office machine is a real risk.
      maxAge: EIGHT_HOURS,
    },
  };
}

export async function getSession(): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(await cookies(), sessionOptions());
}

/** Narrow a raw session to an authenticated one, or `null`. */
export function toAuthenticated(session: SessionData): AuthenticatedSession | null {
  if (
    typeof session.userId !== "number" ||
    typeof session.tenantId !== "number" ||
    !session.role
  ) {
    return null;
  }

  return {
    userId: session.userId,
    tenantId: session.tenantId,
    role: session.role,
    email: session.email ?? "",
    name: session.name ?? "",
    uiLocale: session.uiLocale ?? "es",
    mustChangePassword: session.mustChangePassword === true,
  };
}
