import { describe, expect, it } from "vitest";
import { roleValues, type Role } from "@/db/schema";
import { can, capabilities, rolesWith, type Capability } from "@/lib/auth/roles";

/**
 * The permission matrix from ARCHITECTURE.md, transcribed independently of the
 * implementation so a change to `roles.ts` has to be a deliberate change here
 * too.
 */
const EXPECTED: Record<Capability, Role[]> = {
  "tenant.manage": ["admin"],
  "users.manage": ["admin"],
  "timbrados.manage": ["admin"],
  "catalog.write": ["admin", "employee"],
  "documents.write": ["admin", "employee"],
  "documents.issue": ["admin", "employee"],
  "payments.write": ["admin", "employee"],
  "drafts.delete.any": ["admin"],
  "drafts.delete.own": ["admin", "employee"],
  "documents.mutateIssued": [],
  read: ["admin", "employee", "viewer"],
  export: ["admin", "employee", "viewer"],
};

describe("role capability matrix", () => {
  it.each(capabilities)("matches ARCHITECTURE.md for %s", (capability) => {
    expect(rolesWith(capability)).toEqual(EXPECTED[capability]);
  });

  it("covers every capability in the expectation table", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...capabilities].sort());
  });
});

describe("viewer cannot mutate anything", () => {
  const mutating: Capability[] = [
    "tenant.manage",
    "users.manage",
    "timbrados.manage",
    "catalog.write",
    "documents.write",
    "documents.issue",
    "payments.write",
    "drafts.delete.any",
    "drafts.delete.own",
    "documents.mutateIssued",
  ];

  it.each(mutating)("denies viewer %s", (capability) => {
    expect(can("viewer", capability)).toBe(false);
  });

  it("still lets a viewer read and export", () => {
    expect(can("viewer", "read")).toBe(true);
    expect(can("viewer", "export")).toBe(true);
  });
});

describe("guardrail 4 — issued documents are immutable", () => {
  it.each(roleValues)("denies %s the right to mutate an issued document", (role) => {
    expect(can(role, "documents.mutateIssued")).toBe(false);
  });
});

describe("employee limits", () => {
  it("may delete only its own drafts, never anyone's", () => {
    expect(can("employee", "drafts.delete.own")).toBe(true);
    expect(can("employee", "drafts.delete.any")).toBe(false);
  });

  it("may not touch tenant settings, timbrados or users", () => {
    expect(can("employee", "tenant.manage")).toBe(false);
    expect(can("employee", "timbrados.manage")).toBe(false);
    expect(can("employee", "users.manage")).toBe(false);
  });
});
