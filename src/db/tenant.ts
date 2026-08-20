import { and, eq, type SQL } from "drizzle-orm";
import type { MySqlColumn, MySqlTable } from "drizzle-orm/mysql-core";

/**
 * Tenancy helper (guardrail 2). Every read and every write goes through this —
 * the tenant id comes from the session, never from the client.
 *
 * ```ts
 * const session = await requireRole("read");
 * await db.select().from(customers)
 *   .where(tenantScoped(customers, session.tenantId, eq(customers.active, true)));
 * ```
 */

/** A table that can be tenant-scoped: it must actually have `tenant_id`. */
export type TenantTable = MySqlTable & { tenantId: MySqlColumn };

/**
 * Build the WHERE clause for a tenant-scoped query. Extra conditions are ANDed
 * on, so there is no way to write a filtered query that forgets the tenant.
 *
 * @throws if `tenantId` is not a positive integer — a `NaN` or a
 * client-supplied string must never silently widen the query.
 */
export function tenantScoped(
  table: TenantTable,
  tenantId: number,
  ...conditions: (SQL | undefined)[]
): SQL {
  assertTenantId(tenantId);

  const scope = eq(table.tenantId, tenantId);
  const extra = conditions.filter((condition): condition is SQL => condition !== undefined);

  // `and()` returns `SQL | undefined`; with `scope` always present it cannot be
  // undefined, but the non-null assertion is avoided for clarity.
  return extra.length === 0 ? scope : (and(scope, ...extra) as SQL);
}

/**
 * Stamp `tenant_id` onto values being inserted. Any `tenantId` already present
 * on the payload is overwritten with the session's — a client-supplied tenant
 * id is never trusted, not even as a hint.
 */
export function withTenant<T extends Record<string, unknown>>(
  tenantId: number,
  values: T,
): T & { tenantId: number } {
  assertTenantId(tenantId);
  return { ...values, tenantId };
}

/** Same, for a batch insert. */
export function withTenantAll<T extends Record<string, unknown>>(
  tenantId: number,
  rows: readonly T[],
): (T & { tenantId: number })[] {
  return rows.map((row) => withTenant(tenantId, row));
}

/**
 * Defence in depth for rows that arrive from somewhere other than a scoped
 * query — a public-token lookup, a cache, a join result.
 */
export function assertRowTenant(
  row: { tenantId: number } | null | undefined,
  tenantId: number,
): void {
  assertTenantId(tenantId);
  if (!row || row.tenantId !== tenantId) {
    throw new CrossTenantError();
  }
}

/**
 * The `tenants` table is the one table with no `tenant_id` column — its
 * primary key *is* the tenant id. This helper exists so that reading or
 * writing a tenant's own row still goes through the same validation as every
 * other query rather than an ad-hoc `eq(tenants.id, ...)` at the call site.
 */
export function ownTenant(idColumn: MySqlColumn, tenantId: number): SQL {
  assertTenantId(tenantId);
  return eq(idColumn, tenantId);
}

export class CrossTenantError extends Error {
  constructor(message = "Cross-tenant access denied") {
    super(message);
    this.name = "CrossTenantError";
  }
}

export class InvalidTenantError extends Error {
  constructor(message = "Invalid tenant id") {
    super(message);
    this.name = "InvalidTenantError";
  }
}

export function assertTenantId(tenantId: unknown): asserts tenantId is number {
  if (typeof tenantId !== "number" || !Number.isInteger(tenantId) || tenantId <= 0) {
    throw new InvalidTenantError();
  }
}
