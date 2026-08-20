import "server-only";

import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { timbrados, type Timbrado } from "@/db/schema";
import { tenantScoped } from "@/db/tenant";
import type { TimbradoSnapshot } from "@/domain/timbrado";

export async function listTimbrados(tenantId: number): Promise<Timbrado[]> {
  return db
    .select()
    .from(timbrados)
    .where(tenantScoped(timbrados, tenantId))
    .orderBy(desc(timbrados.active), desc(timbrados.validTo));
}

export async function findTimbrado(
  tenantId: number,
  timbradoId: number,
): Promise<Timbrado | null> {
  const rows = await db
    .select()
    .from(timbrados)
    .where(tenantScoped(timbrados, tenantId, eq(timbrados.id, timbradoId)))
    .limit(1);

  return rows[0] ?? null;
}

export type TimbradoInput = {
  number: string;
  validFrom: string;
  validTo: string;
  establishment: string;
  expeditionPoint: string;
  rangeStart: number;
  rangeEnd: number;
};

export async function insertTimbrado(
  tenantId: number,
  values: TimbradoInput & { nextSequence: number },
  updatedBy: number,
): Promise<number> {
  const [result] = await db
    .insert(timbrados)
    .values({ ...values, tenantId, updatedBy });

  return result.insertId;
}

/**
 * Update a timbrado. `nextSequence` is deliberately not updatable here — the
 * correlative cursor is only ever advanced by the PR-4 generator inside its
 * row lock (guardrail 6). Editing it from a settings form could reissue a
 * number that has already been given to a customer.
 */
export async function updateTimbrado(
  tenantId: number,
  timbradoId: number,
  values: Partial<TimbradoInput & { active: boolean }>,
  updatedBy: number,
): Promise<void> {
  await db
    .update(timbrados)
    .set({ ...values, updatedBy })
    .where(tenantScoped(timbrados, tenantId, eq(timbrados.id, timbradoId)));
}

/** Shape the domain's `timbradoStatus()` expects. */
export function toSnapshot(timbrado: Timbrado): TimbradoSnapshot {
  return {
    number: timbrado.number,
    validFrom: timbrado.validFrom,
    validTo: timbrado.validTo,
    establishment: timbrado.establishment,
    expeditionPoint: timbrado.expeditionPoint,
    rangeStart: timbrado.rangeStart,
    rangeEnd: timbrado.rangeEnd,
    nextSequence: timbrado.nextSequence,
    active: timbrado.active,
  };
}
