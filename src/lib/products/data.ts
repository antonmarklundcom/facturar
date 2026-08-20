import "server-only";

import { asc, desc, eq, like, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { products, type Product } from "@/db/schema";
import { tenantScoped } from "@/db/tenant";
import type { ProductInput } from "./parse";

/**
 * Product data access. Every statement goes through `tenantScoped()`
 * (guardrail 2) — there is no unscoped read or write in this file.
 */

export type ProductFilter = {
  search?: string;
  includeInactive?: boolean;
};

/** Escape the LIKE wildcards so a `%` typed in the search box is literal. */
function likeTerm(search: string): string {
  return `%${search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

export async function listProducts(
  tenantId: number,
  filter: ProductFilter = {},
): Promise<Product[]> {
  const conditions: (SQL | undefined)[] = [];

  if (!filter.includeInactive) conditions.push(eq(products.active, true));

  const search = filter.search?.trim();
  if (search) {
    const term = likeTerm(search);
    conditions.push(or(like(products.name, term), like(products.description, term)));
  }

  return db
    .select()
    .from(products)
    .where(tenantScoped(products, tenantId, ...conditions))
    .orderBy(desc(products.active), asc(products.name))
    .limit(200);
}

export async function findProduct(
  tenantId: number,
  productId: number,
): Promise<Product | null> {
  const rows = await db
    .select()
    .from(products)
    .where(tenantScoped(products, tenantId, eq(products.id, productId)))
    .limit(1);

  return rows[0] ?? null;
}

export async function insertProduct(
  tenantId: number,
  values: ProductInput,
  updatedBy: number,
): Promise<number> {
  const [result] = await db.insert(products).values({ ...values, tenantId, updatedBy });
  return result.insertId;
}

export async function updateProduct(
  tenantId: number,
  productId: number,
  values: Partial<ProductInput & { active: boolean }>,
  updatedBy: number,
): Promise<void> {
  await db
    .update(products)
    .set({ ...values, updatedBy })
    .where(tenantScoped(products, tenantId, eq(products.id, productId)));
}

/**
 * Products are deactivated, never deleted: `document_lines` keeps a snapshot
 * of the description and price, but the `product_id` link on documents already
 * issued must stay resolvable (guardrail 4).
 */
export async function setProductActive(
  tenantId: number,
  productId: number,
  active: boolean,
  updatedBy: number,
): Promise<void> {
  await db
    .update(products)
    .set({ active, updatedBy })
    .where(tenantScoped(products, tenantId, eq(products.id, productId)));
}
