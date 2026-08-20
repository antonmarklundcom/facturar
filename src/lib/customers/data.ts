import "server-only";

import { asc, desc, eq, like, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { customers, type Customer } from "@/db/schema";
import { tenantScoped } from "@/db/tenant";
import type { CustomerInput } from "./parse";

/**
 * Customer data access. Every statement goes through `tenantScoped()`
 * (guardrail 2) — there is no unscoped read or write in this file, and none
 * should ever be added.
 */

export type CustomerFilter = {
  /** Free text over name, RUC and WhatsApp. */
  search?: string;
  /** Deactivated customers are hidden unless asked for. */
  includeInactive?: boolean;
};

/** Escape the LIKE wildcards so a `%` typed in the search box is literal. */
function likeTerm(search: string): string {
  return `%${search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

export async function listCustomers(
  tenantId: number,
  filter: CustomerFilter = {},
): Promise<Customer[]> {
  const conditions: (SQL | undefined)[] = [];

  if (!filter.includeInactive) conditions.push(eq(customers.active, true));

  const search = filter.search?.trim();
  if (search) {
    const term = likeTerm(search);
    conditions.push(
      or(
        like(customers.name, term),
        like(customers.rucBase, term),
        like(customers.whatsapp, term),
        like(customers.email, term),
      ),
    );
  }

  return db
    .select()
    .from(customers)
    .where(tenantScoped(customers, tenantId, ...conditions))
    .orderBy(desc(customers.active), asc(customers.name))
    .limit(200);
}

export async function findCustomer(
  tenantId: number,
  customerId: number,
): Promise<Customer | null> {
  const rows = await db
    .select()
    .from(customers)
    .where(tenantScoped(customers, tenantId, eq(customers.id, customerId)))
    .limit(1);

  return rows[0] ?? null;
}

export async function insertCustomer(
  tenantId: number,
  values: CustomerInput,
  updatedBy: number,
): Promise<number> {
  const [result] = await db.insert(customers).values({ ...values, tenantId, updatedBy });
  return result.insertId;
}

export async function updateCustomer(
  tenantId: number,
  customerId: number,
  values: Partial<CustomerInput & { active: boolean }>,
  updatedBy: number,
): Promise<void> {
  await db
    .update(customers)
    .set({ ...values, updatedBy })
    .where(tenantScoped(customers, tenantId, eq(customers.id, customerId)));
}

/**
 * Customers are deactivated, never deleted: they are referenced by issued
 * documents, which are immutable (guardrail 4).
 */
export async function setCustomerActive(
  tenantId: number,
  customerId: number,
  active: boolean,
  updatedBy: number,
): Promise<void> {
  await db
    .update(customers)
    .set({ active, updatedBy })
    .where(tenantScoped(customers, tenantId, eq(customers.id, customerId)));
}
