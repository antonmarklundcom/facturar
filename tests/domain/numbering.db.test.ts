import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * Gap-free numbering under concurrency, against a real MySQL.
 *
 * The row lock this depends on cannot be exercised without a database, so this
 * file runs only when `TEST_DATABASE_URL` is set:
 *
 *   TEST_DATABASE_URL="mysql://user:pass@127.0.0.1:3306/facturar_test" npm test
 *
 * It is skipped — loudly, in the vitest output — otherwise, so the pre-push
 * gate stays runnable without a local MySQL while the check still exists and
 * is run before anything depends on numbering (PR-10).
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeWithDb = TEST_DATABASE_URL ? describe : describe.skip;

describeWithDb("allocateDocumentNumber (requires TEST_DATABASE_URL)", () => {
  let db: typeof import("@/db").db;
  let timbrados: typeof import("@/db/schema").timbrados;
  let tenants: typeof import("@/db/schema").tenants;
  let allocateDocumentNumber: typeof import("@/domain/numbering.server").allocateDocumentNumber;
  let NumberingError: typeof import("@/domain/numbering").NumberingError;

  let tenantId: number;
  let timbradoId: number;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    ({ db } = await import("@/db"));
    ({ timbrados, tenants } = await import("@/db/schema"));
    ({ allocateDocumentNumber } = await import("@/domain/numbering.server"));
    ({ NumberingError } = await import("@/domain/numbering"));

    const [tenant] = await db.insert(tenants).values({ name: "Numbering test SA" });
    tenantId = tenant.insertId;

    const [timbrado] = await db.insert(timbrados).values({
      tenantId,
      number: "99999999",
      validFrom: "2020-01-01",
      validTo: "2099-12-31",
      establishment: "001",
      expeditionPoint: "001",
      rangeStart: 1,
      rangeEnd: 500,
      nextSequence: 1,
    });
    timbradoId = timbrado.insertId;
  });

  afterAll(async () => {
    await db.delete(timbrados).where(eq(timbrados.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  });

  it("hands out consecutive numbers", async () => {
    const first = await db.transaction((tx) =>
      allocateDocumentNumber(tx, { tenantId, timbradoId, today: "2026-08-20" }),
    );
    const second = await db.transaction((tx) =>
      allocateDocumentNumber(tx, { tenantId, timbradoId, today: "2026-08-20" }),
    );

    expect(first.number).toBe("001-001-0000001");
    expect(second.number).toBe("001-001-0000002");
  });

  it("stays gap-free and duplicate-free under concurrent issuing", async () => {
    const CONCURRENCY = 40;

    const allocated = await Promise.all(
      Array.from({ length: CONCURRENCY }, () =>
        db.transaction((tx) =>
          allocateDocumentNumber(tx, { tenantId, timbradoId, today: "2026-08-20" }),
        ),
      ),
    );

    const sequences = allocated.map((a) => a.sequence).sort((a, b) => a - b);

    // No duplicates: two invoices must never carry the same legal number.
    expect(new Set(sequences).size).toBe(CONCURRENCY);

    // No gaps: the correlative series must be unbroken.
    for (let i = 1; i < sequences.length; i += 1) {
      expect(sequences[i]).toBe(sequences[i - 1] + 1);
    }

    // Numbers are formatted, not just counted.
    expect(new Set(allocated.map((a) => a.number)).size).toBe(CONCURRENCY);
  });

  it("does not consume a number when the surrounding transaction rolls back", async () => {
    const [before] = await db
      .select({ next: timbrados.nextSequence })
      .from(timbrados)
      .where(eq(timbrados.id, timbradoId));

    await expect(
      db.transaction(async (tx) => {
        await allocateDocumentNumber(tx, { tenantId, timbradoId, today: "2026-08-20" });
        throw new Error("simulated failure after allocation");
      }),
    ).rejects.toThrow("simulated failure");

    const [after] = await db
      .select({ next: timbrados.nextSequence })
      .from(timbrados)
      .where(eq(timbrados.id, timbradoId));

    // An unused number is fine; a gap in the issued series would not be.
    expect(after.next).toBe(before.next);
  });

  it("refuses to issue against an expired timbrado", async () => {
    await expect(
      db.transaction((tx) =>
        allocateDocumentNumber(tx, { tenantId, timbradoId, today: "2100-01-01" }),
      ),
    ).rejects.toBeInstanceOf(NumberingError);
  });

  it("refuses a timbrado belonging to another tenant", async () => {
    await expect(
      db.transaction((tx) =>
        allocateDocumentNumber(tx, {
          tenantId: tenantId + 99_999,
          timbradoId,
          today: "2026-08-20",
        }),
      ),
    ).rejects.toBeInstanceOf(NumberingError);
  });

  it("refuses once the authorised range is exhausted", async () => {
    await db
      .update(timbrados)
      .set({ nextSequence: 501 })
      .where(eq(timbrados.id, timbradoId));

    await expect(
      db.transaction((tx) =>
        allocateDocumentNumber(tx, { tenantId, timbradoId, today: "2026-08-20" }),
      ),
    ).rejects.toBeInstanceOf(NumberingError);
  });
});
