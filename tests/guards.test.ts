import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "@/db/schema";
import type { SessionData } from "@/lib/auth/session";

const currentSession = vi.hoisted(() => ({ value: null as SessionData | null }));
const redirected = vi.hoisted(() => ({ to: null as string | null }));

/**
 * The live `users` row behind the session. The guards re-read it on every
 * request and believe it over the cookie (PR-18 security review), so these
 * tests have to be able to move it out from under a signed-in session.
 */
const liveUser = vi.hoisted(() => ({
  value: null as { role: Role; active: boolean; mustChangePassword: boolean } | null,
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/session")>();
  return {
    ...actual,
    getSession: async () => currentSession.value ?? {},
  };
});

vi.mock("@/lib/auth/users", () => ({
  findSessionUser: async () => liveUser.value,
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    redirected.to = path;
    // The real `redirect()` throws to unwind the render; mirror that so a
    // caller can never keep executing past a redirect.
    throw new Error(`NEXT_REDIRECT:${path}`);
  },
}));

const {
  CHANGE_PASSWORD_PATH,
  ForbiddenError,
  LOGIN_PATH,
  LOGIN_PATH_ENDED,
  UnauthenticatedError,
  getCurrentSession,
  requireRole,
  requireSession,
} = await import("@/lib/auth/guards");

function signIn(role: Role, extra: Partial<SessionData> = {}) {
  // By default the database agrees with the cookie; a test that cares makes
  // them disagree by writing to `liveUser` afterwards.
  liveUser.value = {
    role,
    active: true,
    mustChangePassword: extra.mustChangePassword === true,
  };
  currentSession.value = {
    userId: 1,
    tenantId: 42,
    role,
    email: `${role}@ykua.com.py`,
    name: role,
    uiLocale: "es",
    mustChangePassword: false,
    ...extra,
  };
}

beforeEach(() => {
  currentSession.value = null;
  liveUser.value = null;
  redirected.to = null;
});

describe("requireRole", () => {
  it("returns the session when the role has the capability", async () => {
    signIn("admin");
    await expect(requireRole("users.manage")).resolves.toMatchObject({
      tenantId: 42,
      role: "admin",
    });
  });

  it("throws for an anonymous caller rather than redirecting", async () => {
    await expect(requireRole("read")).rejects.toBeInstanceOf(UnauthenticatedError);
    expect(redirected.to).toBeNull();
  });

  it.each([
    ["viewer", "catalog.write"],
    ["viewer", "documents.issue"],
    ["viewer", "payments.write"],
    ["viewer", "users.manage"],
    ["employee", "users.manage"],
    ["employee", "tenant.manage"],
    ["employee", "timbrados.manage"],
    ["employee", "drafts.delete.any"],
  ] as const)("denies %s the %s capability", async (role, capability) => {
    signIn(role);
    await expect(requireRole(capability)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("denies every role the right to mutate an issued document", async () => {
    for (const role of ["admin", "employee", "viewer"] as const) {
      signIn(role);
      await expect(requireRole("documents.mutateIssued")).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    }
  });

  it("also accepts an explicit role list", async () => {
    signIn("employee");
    await expect(requireRole(["admin", "employee"])).resolves.toMatchObject({
      role: "employee",
    });
    await expect(requireRole(["admin"])).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("never leaks the tenant id from the client — it comes from the session", async () => {
    signIn("admin");
    const session = await requireRole("read");
    expect(session.tenantId).toBe(42);
  });

  it("bounces a user who owes a password change to the change screen", async () => {
    signIn("admin", { mustChangePassword: true });
    await expect(requireRole("users.manage")).rejects.toThrow("NEXT_REDIRECT");
    expect(redirected.to).toBe(CHANGE_PASSWORD_PATH);
  });

  it("checks the capability before the password-change bounce", async () => {
    // A viewer owing a password change must still be refused the capability,
    // not quietly redirected as though the request were merely mistimed.
    signIn("viewer", { mustChangePassword: true });
    await expect(requireRole("users.manage")).rejects.toBeInstanceOf(ForbiddenError);
    expect(redirected.to).toBeNull();
  });
});

describe("requireSession", () => {
  it("redirects an anonymous visitor to /login, flagged so the cookie is cleared", async () => {
    // The middleware turns away /admin requests carrying no cookie at all, so
    // anything reaching here holds one that has just been judged unusable.
    // The flag is what lets the middleware delete it instead of bouncing the
    // request back to /admin forever.
    await expect(requireSession()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirected.to).toBe(LOGIN_PATH_ENDED);
    expect(LOGIN_PATH_ENDED.startsWith(LOGIN_PATH)).toBe(true);
  });

  it("returns the session for a signed-in user", async () => {
    signIn("viewer");
    await expect(requireSession()).resolves.toMatchObject({ role: "viewer" });
  });
});

describe("getCurrentSession", () => {
  it("returns null rather than throwing when there is no session", async () => {
    await expect(getCurrentSession()).resolves.toBeNull();
  });

  it("returns null for a half-written session with no tenant", async () => {
    currentSession.value = { userId: 1, role: "admin" };
    await expect(getCurrentSession()).resolves.toBeNull();
  });
});

/**
 * The cookie says who you are; the database says what you may do.
 *
 * A sealed session carries a copy of the role and the active flag from the
 * moment of login. Nothing invalidates that copy, so unless the guards re-read
 * the row, an admin who deactivates a fired employee changes nothing about the
 * tab that person already has open (PR-18 security review).
 */
describe("the session is re-checked against the user row", () => {
  it("is no session at all once the user is deactivated", async () => {
    signIn("admin");
    await expect(requireRole("users.manage")).resolves.toBeTruthy();

    // The admin deactivates them while their tab is still open.
    liveUser.value = { role: "admin", active: false, mustChangePassword: false };

    await expect(getCurrentSession()).resolves.toBeNull();
    await expect(requireRole("users.manage")).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("is no session at all once the user row is gone", async () => {
    signIn("employee");
    liveUser.value = null;

    await expect(getCurrentSession()).resolves.toBeNull();
    await expect(requireRole("documents.issue")).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
  });

  it("takes the role from the row, so a demotion applies immediately", async () => {
    signIn("admin");
    // Demoted to viewer; the cookie still says admin.
    liveUser.value = { role: "viewer", active: true, mustChangePassword: false };

    await expect(getCurrentSession()).resolves.toMatchObject({ role: "viewer" });
    await expect(requireRole("users.manage")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(requireRole("payments.delete")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("takes a promotion from the row too, not only a demotion", async () => {
    signIn("viewer");
    liveUser.value = { role: "admin", active: true, mustChangePassword: false };

    await expect(getCurrentSession()).resolves.toMatchObject({ role: "admin" });
  });

  it("forces a password change ordered after the session was created", async () => {
    signIn("employee");
    // An admin resets the password of a compromised account.
    liveUser.value = { role: "employee", active: true, mustChangePassword: true };

    await expect(requireRole("documents.issue")).rejects.toThrow(/NEXT_REDIRECT/);
    expect(redirected.to).toBe(CHANGE_PASSWORD_PATH);
  });

  it("keeps identity fields from the session — they are display, not authority", async () => {
    signIn("employee");
    await expect(getCurrentSession()).resolves.toMatchObject({
      tenantId: 42,
      userId: 1,
      email: "employee@ykua.com.py",
      uiLocale: "es",
    });
  });
});
