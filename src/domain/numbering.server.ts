import "server-only";

import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { timbrados } from "@/db/schema";
import { tenantScoped } from "@/db/tenant";
import { formatDocumentNumber, NumberingError } from "./numbering";
import { issuingBlockers, type TimbradoSnapshot } from "./timbrado";

/**
 * Hand out the next document number for a timbrado (guardrail 6).
 *
 * Gap-free and race-safe by construction:
 *
 *  1. Everything happens in one transaction.
 *  2. The timbrado row is read `FOR UPDATE`, so a concurrent issue blocks here
 *     rather than reading the same `next_sequence`.
 *  3. The validity and range checks run **inside** the lock, on the freshly
 *     read row — checking before taking the lock would let an exhausted range
 *     be overrun by whichever request checked first.
 *  4. `next_sequence` is advanced with a guarded `WHERE next_sequence = ?`, so
 *     even if the lock were somehow not held the update would affect no rows
 *     rather than silently reissue a number.
 *
 * The caller must write the document row **inside the same transaction** — pass
 * the `tx` this gives you. A number allocated in a transaction that then rolls
 * back leaves the sequence untouched, which is the behaviour we want: a gap
 * would be a legal problem, an unused number is not.
 */
export type AllocatedNumber = {
  number: string;
  sequence: number;
  timbradoId: number;
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function allocateDocumentNumber(
  tx: Tx,
  options: { tenantId: number; timbradoId: number; today: string },
): Promise<AllocatedNumber> {
  const rows = await tx
    .select({
      id: timbrados.id,
      number: timbrados.number,
      validFrom: timbrados.validFrom,
      validTo: timbrados.validTo,
      establishment: timbrados.establishment,
      expeditionPoint: timbrados.expeditionPoint,
      rangeStart: timbrados.rangeStart,
      rangeEnd: timbrados.rangeEnd,
      nextSequence: timbrados.nextSequence,
      active: timbrados.active,
    })
    .from(timbrados)
    .where(tenantScoped(timbrados, options.tenantId, eq(timbrados.id, options.timbradoId)))
    .for("update")
    .limit(1);

  const timbrado = rows[0];
  if (!timbrado) {
    throw new NumberingError(`Timbrado ${options.timbradoId} not found for this tenant`);
  }

  const snapshot: TimbradoSnapshot = timbrado;
  const blockers = issuingBlockers(snapshot, options.today);
  if (blockers.length > 0) {
    throw new NumberingError(
      `Timbrado ${timbrado.number} cannot issue: ${blockers.join(", ")}`,
      blockers,
    );
  }

  const sequence = timbrado.nextSequence;

  const result = await tx
    .update(timbrados)
    .set({ nextSequence: sql`${timbrados.nextSequence} + 1` })
    .where(
      tenantScoped(
        timbrados,
        options.tenantId,
        eq(timbrados.id, options.timbradoId),
        eq(timbrados.nextSequence, sequence),
      ),
    );

  const [meta] = result as unknown as [{ affectedRows: number }];
  if (!meta || meta.affectedRows !== 1) {
    // Belt and braces: the row lock should make this unreachable.
    throw new NumberingError(
      `Timbrado ${timbrado.number} moved underneath the allocation; retry`,
    );
  }

  return {
    number: formatDocumentNumber(
      timbrado.establishment,
      timbrado.expeditionPoint,
      sequence,
    ),
    sequence,
    timbradoId: timbrado.id,
  };
}
