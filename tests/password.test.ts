import { describe, expect, it } from "vitest";
import {
  MIN_PASSWORD_LENGTH,
  checkPassword,
  hashPassword,
  verifyPassword,
} from "@/lib/auth/password";

describe("checkPassword", () => {
  it("accepts a reasonable password", () => {
    expect(checkPassword("ferreteria-ykua-2026")).toEqual([]);
  });

  it("rejects anything shorter than the minimum", () => {
    expect(checkPassword("a".repeat(MIN_PASSWORD_LENGTH - 1))).toContain("too_short");
    expect(checkPassword("a".repeat(MIN_PASSWORD_LENGTH))).not.toContain("too_short");
  });

  it("rejects obvious guesses regardless of case", () => {
    expect(checkPassword("Password123")).toContain("too_common");
    expect(checkPassword("CONTRASENA1")).toContain("too_common");
  });

  it("rejects reusing the current password", () => {
    expect(
      checkPassword("ferreteria-ykua-2026", { currentHashMatches: true }),
    ).toContain("unchanged");
  });

  it("returns problems, never user-facing text", () => {
    for (const problem of checkPassword("abc")) {
      expect(problem).toMatch(/^[a-z_]+$/);
    }
  });
});

describe("hashing", () => {
  it("round-trips a password", async () => {
    const hash = await hashPassword("ferreteria-ykua-2026");
    expect(await verifyPassword("ferreteria-ykua-2026", hash)).toBe(true);
    expect(await verifyPassword("ferreteria-ykua-2027", hash)).toBe(false);
  });

  it("never stores the password in the hash", async () => {
    const hash = await hashPassword("ferreteria-ykua-2026");
    expect(hash).not.toContain("ferreteria");
    expect(hash.startsWith("$2")).toBe(true);
  });

  it("salts, so the same password hashes differently every time", async () => {
    const [a, b] = await Promise.all([hashPassword("same-password-1"), hashPassword("same-password-1")]);
    expect(a).not.toBe(b);
  });

  it("treats a corrupt hash as a wrong password rather than throwing", async () => {
    await expect(verifyPassword("anything", "not-a-bcrypt-hash")).resolves.toBe(false);
    await expect(verifyPassword("anything", "")).resolves.toBe(false);
  });
});
