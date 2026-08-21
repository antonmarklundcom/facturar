import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * Deleting a recorded payment and re-deriving the invoice's status (PR-17),
 * against a real MySQL.
 *
 * The arithmetic is covered without a database in
 * `tests/domain/payments.test.ts`. What needs a real engine is the round trip:
 * `refreshInvoiceStatus()` is the only writer of an issued invoice's status,
 * and the point of this feature is that removing a payment sends that stored
 * column back down the ladder — pagada → parcial → pendiente — rather than
 * leaving an invoice claiming to be settled by money that was never received.
 *
 * It also pins the two things a status refresh must NOT do: touch the
 * document's content (guardrail 4), or reach across tenants.
 *
 * Skipped — loudly — when `TEST_DATABASE_URL` is unset, like the numbering and
 * throttle tests.
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeWithDb = TEST_DATABASE_URL ? describe : describe.skip;

describeWithDb("payment deletion and status refresh (requires TEST_DATABASE_URL)", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db/schema");
  let data: typeof import("@/lib/documents/data");

  const TODAY = "2026-09-01";
  const TOTAL = 1_100_000;

  let tenantId: number;
  let otherTenantId: number;
  let customerId: number;
  let userId: number;
  let invoiceId: number;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    ({ db } = await import("@/db"));
    schema = await import("@/db/schema");
    data = await import("@/lib/documents/data");

    const [tenant] = await db
      .insert(schema.tenants)
      .values({ name: "Pagos test SA" });
    tenantId = tenant.insertId;

    const [other] = await db
      .insert(schema.tenants)
      .values({ name: "Otra ferretería SA" });
    otherTenantId = other.insertId;

    const [customer] = await db
      .insert(schema.customers)
      .values({ tenantId, name: "Cliente de prueba", docLocale: "es" });
    customerId = customer.insertId;

    // `payments.created_by` is a real foreign key, so the recorder has to exist.
    const [user] = await db.insert(schema.users).values({
      tenantId,
      email: `pagos-test-${tenantId}@sanblas.com.py`,
      passwordHash: "not-a-real-hash",
      name: "Admin de prueba",
      role: "admin",
    });
    userId = user.insertId;
  });

  afterAll(async () => {
    for (const id of [tenantId, otherTenantId]) {
      await db.delete(schema.payments).where(eq(schema.payments.tenantId, id));
      await db.delete(schema.documents).where(eq(schema.documents.tenantId, id));
      await db.delete(schema.customers).where(eq(schema.customers.tenantId, id));
      await db.delete(schema.users).where(eq(schema.users.tenantId, id));
      await db.delete(schema.tenants).where(eq(schema.tenants.id, id));
    }
  });

  /** A fresh issued invoice of ₲ 1.100.000, due well after TODAY. */
  async function issuedInvoice(dueDate: string | null = "2026-10-15") {
    const [inserted] = await db.insert(schema.documents).values({
      tenantId,
      type: "invoice_credito",
      status: "pendiente",
      number: `001-001-${String(Date.now() % 10_000_000).padStart(7, "0")}`,
      customerId,
      docLocale: "es",
      currency: "PYG",
      issueDate: "2026-08-15",
      dueDate,
      subtotal10: 1_000_000,
      subtotal5: 0,
      subtotalExenta: 0,
      iva10: 100_000,
      iva5: 0,
      total: TOTAL,
      issuedAt: new Date(),
    });

    return inserted.insertId;
  }

  async function pay(documentId: number, amount: number) {
    return data.insertPayment(
      tenantId,
      {
        documentId,
        amount,
        currency: "PYG",
        method: "transferencia",
        paidAt: new Date("2026-08-20T12:00:00Z"),
        reference: null,
        notes: null,
      },
      userId,
    );
  }

  const storedStatus = async (id: number) => {
    const rows = await db
      .select({ status: schema.documents.status })
      .from(schema.documents)
      .where(eq(schema.documents.id, id));
    return rows[0]?.status;
  };

  it("walks the stored status back down as payments are deleted", async () => {
    invoiceId = await issuedInvoice();

    const first = await pay(invoiceId, 700_000);
    await data.refreshInvoiceStatus(tenantId, invoiceId, TODAY);
    expect(await storedStatus(invoiceId)).toBe("parcial");

    const second = await pay(invoiceId, 400_000);
    await data.refreshInvoiceStatus(tenantId, invoiceId, TODAY);
    expect(await storedStatus(invoiceId)).toBe("pagada");

    // pagada → parcial: the invoice is no longer settled by money that,
    // it turns out, was never received.
    expect(await data.deletePayment(tenantId, second)).toBe(true);
    expect(await data.refreshInvoiceStatus(tenantId, invoiceId, TODAY)).toBe("parcial");
    expect(await storedStatus(invoiceId)).toBe("parcial");

    // parcial → pendiente: owed in full again.
    expect(await data.deletePayment(tenantId, first)).toBe(true);
    expect(await data.refreshInvoiceStatus(tenantId, invoiceId, TODAY)).toBe("pendiente");
    expect(await storedStatus(invoiceId)).toBe("pendiente");

    expect(await data.listPayments(tenantId, invoiceId)).toEqual([]);
  });

  it("re-derives to vencida rather than pendiente when the due date has passed", async () => {
    const id = await issuedInvoice("2026-08-20");
    const paymentId = await pay(id, TOTAL);
    await data.refreshInvoiceStatus(tenantId, id, TODAY);
    expect(await storedStatus(id)).toBe("pagada");

    await data.deletePayment(tenantId, paymentId);
    // TODAY is past the due date, and `vencida` outranks `pendiente`: an
    // invoice whose settling payment was a mistake is late, not merely unpaid.
    expect(await data.refreshInvoiceStatus(tenantId, id, TODAY)).toBe("vencida");
    expect(await storedStatus(id)).toBe("vencida");
  });

  it("leaves the document's own content untouched (guardrail 4)", async () => {
    const id = await issuedInvoice();
    const before = (await data.findDocument(tenantId, id))?.document;
    const paymentId = await pay(id, TOTAL);
    // The status does move, in both directions...
    expect(await data.refreshInvoiceStatus(tenantId, id, TODAY)).toBe("pagada");
    await data.deletePayment(tenantId, paymentId);
    expect(await data.refreshInvoiceStatus(tenantId, id, TODAY)).toBe("pendiente");

    const after = (await data.findDocument(tenantId, id))?.document;

    // ...and nothing else does. The invoice is the same legal document it was
    // before a payment was recorded against it wrongly and taken back.
    expect(after?.number).toBe(before?.number);
    expect(after?.total).toBe(before?.total);
    expect(after?.iva10).toBe(before?.iva10);
    expect(after?.issuedAt).toEqual(before?.issuedAt);
    expect(after?.status).toBe(before?.status);
  });

  it("refuses to delete another tenant's payment", async () => {
    const id = await issuedInvoice();
    const paymentId = await pay(id, 500_000);

    expect(await data.findPayment(otherTenantId, paymentId)).toBeNull();
    expect(await data.deletePayment(otherTenantId, paymentId)).toBe(false);
    // Still there, and still counted.
    expect(await data.findPayment(tenantId, paymentId)).not.toBeNull();
  });

  it("reports a second delete of the same payment as already gone", async () => {
    const id = await issuedInvoice();
    const paymentId = await pay(id, 500_000);

    expect(await data.deletePayment(tenantId, paymentId)).toBe(true);
    // Two admins in two tabs: the outcome they wanted has happened, but the
    // action must not go on to log a deletion this request did not perform.
    expect(await data.deletePayment(tenantId, paymentId)).toBe(false);
  });
});
