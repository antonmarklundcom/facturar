import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "@/db/schema";
import type { SessionData } from "@/lib/auth/session";

const currentSession = vi.hoisted(() => ({ value: null as SessionData | null }));
const redirected = vi.hoisted(() => ({ to: null as string | null }));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/session")>();
  return {
    ...actual,
    getSession: async () => currentSession.value ?? {},
  };
});

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
  UnauthenticatedError,
  getCurrentSession,
  requireRole,
  requireSession,
} = await import("@/lib/auth/guards");

function signIn(role: Role, extra: Partial<SessionData> = {}) {
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
  it("redirects an anonymous visitor to /login", async () => {
    await expect(requireSession()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirected.to).toBe(LOGIN_PATH);
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
