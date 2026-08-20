import type { Role } from "@/db/schema";

/**
 * Server-enforced capability matrix (ARCHITECTURE.md "Roles & permissions").
 * Hiding a button is UX; this table is the security boundary.
 *
 * | Capability                                   | admin | employee | viewer |
 * |----------------------------------------------|-------|----------|--------|
 * | Tenant settings, timbrados, users            |  yes  |    no    |   no   |
 * | Create/edit customers, products, quotes      |  yes  |   yes    |   no   |
 * | Issue invoices / credit notes, record payments| yes  |   yes    |   no   |
 * | Delete drafts                                |  yes  | own only |   no   |
 * | Edit/delete issued documents                 |  no   |    no    |   no   |
 * | View + export everything                     |  yes  |   yes    |  yes   |
 */
export const capabilities = [
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
  "read",
  "export",
] as const;

export type Capability = (typeof capabilities)[number];

const MATRIX: Record<Role, ReadonlySet<Capability>> = {
  admin: new Set<Capability>([
    "tenant.manage",
    "users.manage",
    "timbrados.manage",
    "catalog.write",
    "documents.write",
    "documents.issue",
    "payments.write",
    "drafts.delete.any",
    "drafts.delete.own",
    "read",
    "export",
  ]),
  employee: new Set<Capability>([
    "catalog.write",
    "documents.write",
    "documents.issue",
    "payments.write",
    "drafts.delete.own",
    "read",
    "export",
  ]),
  viewer: new Set<Capability>(["read", "export"]),
};

/**
 * Nobody gets this one, ever — an issued invoice or credit note is corrected
 * with a new credit note, never edited (guardrail 4). It exists as a named
 * capability so the answer is a lookup rather than a forgotten `if`.
 */
export function can(role: Role, capability: Capability): boolean {
  if (capability === "documents.mutateIssued") return false;
  return MATRIX[role].has(capability);
}

/** Roles allowed to perform a capability — handy for `requireRole` call sites. */
export function rolesWith(capability: Capability): Role[] {
  return (Object.keys(MATRIX) as Role[]).filter((role) => can(role, capability));
}
