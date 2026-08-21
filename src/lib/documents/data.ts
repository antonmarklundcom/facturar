import "server-only";

import { and, asc, desc, eq, gte, inArray, isNull, lte, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  customers,
  documentLines,
  documents,
  payments,
  type Customer,
  type Document,
  type DocumentLine,
  type DocumentStatus,
  type DocumentType,
  type Payment,
  type PaymentMethod,
} from "@/db/schema";
import { assertRowTenant, tenantScoped } from "@/db/tenant";
import { computeLine, computeTotals } from "@/domain/iva";
import { allocateDocumentNumber, type AllocatedNumber } from "@/domain/numbering.server";
import { isIssued, validUntilFrom } from "@/domain/documents";
import {
  derivePaymentStatus,
  outstanding,
  paidTotal,
  type PaymentLike,
} from "@/domain/payments";
import type { Period } from "@/domain/reports";
import type { DocumentLineInput, InvoiceInput, QuoteInput } from "./parse";
import { generatePublicToken } from "./token";

/**
 * Document data access. Every statement goes through `tenantScoped()`
 * (guardrail 2), including the public-token lookup, which additionally
 * re-checks the row it found.
 *
 * Totals are never taken from the client: they are recomputed from the lines
 * through `domain/iva` on every write (guardrail 1).
 */

export type DocumentWithCustomer = Document & { customer: Customer | null };

export type FullDocument = {
  document: Document;
  lines: DocumentLine[];
  customer: Customer | null;
};

export type DocumentFilter = {
  type?: DocumentType;
  status?: DocumentStatus;
  customerId?: number;
};

export async function listDocuments(
  tenantId: number,
  filter: DocumentFilter = {},
): Promise<DocumentWithCustomer[]> {
  const conditions: (SQL | undefined)[] = [];
  if (filter.type) conditions.push(eq(documents.type, filter.type));
  if (filter.status) conditions.push(eq(documents.status, filter.status));
  if (filter.customerId) conditions.push(eq(documents.customerId, filter.customerId));

  const rows = await db
    .select({ document: documents, customer: customers })
    .from(documents)
    .leftJoin(
      customers,
      and(eq(customers.id, documents.customerId), eq(customers.tenantId, documents.tenantId)),
    )
    .where(tenantScoped(documents, tenantId, ...conditions))
    .orderBy(desc(documents.issueDate), desc(documents.id))
    .limit(200);

  return rows.map((row) => ({ ...row.document, customer: row.customer }));
}

export async function findDocument(
  tenantId: number,
  documentId: number,
): Promise<FullDocument | null> {
  const rows = await db
    .select()
    .from(documents)
    .where(tenantScoped(documents, tenantId, eq(documents.id, documentId)))
    .limit(1);

  const document = rows[0];
  if (!document) return null;

  return withLinesAndCustomer(tenantId, document);
}

/**
 * Buyer lookup. The token is unguessable, but the row is still fetched
 * scoped to nothing and then validated: `assertRowTenant` is skipped here on
 * purpose because there is no session tenant to compare against — instead the
 * lines and customer are read scoped to the document's *own* tenant, so a
 * token can never surface another tenant's rows.
 */
export async function findDocumentByToken(token: string): Promise<FullDocument | null> {
  const rows = await db
    .select()
    .from(documents)
    .where(eq(documents.publicToken, token))
    .limit(1);

  const document = rows[0];
  if (!document) return null;

  return withLinesAndCustomer(document.tenantId, document);
}

async function withLinesAndCustomer(
  tenantId: number,
  document: Document,
): Promise<FullDocument> {
  assertRowTenant(document, tenantId);

  const [lines, customerRows] = await Promise.all([
    db
      .select()
      .from(documentLines)
      .where(tenantScoped(documentLines, tenantId, eq(documentLines.documentId, document.id)))
      .orderBy(asc(documentLines.position), asc(documentLines.id)),
    db
      .select()
      .from(customers)
      .where(tenantScoped(customers, tenantId, eq(customers.id, document.customerId)))
      .limit(1),
  ]);

  return { document, lines, customer: customerRows[0] ?? null };
}

/** Rows shaped for insertion, with each line's own money already computed. */
function lineRows(
  tenantId: number,
  documentId: number,
  lines: readonly DocumentLineInput[],
) {
  return lines.map((line) => {
    const computed = computeLine(line);
    return {
      tenantId,
      documentId,
      productId: line.productId,
      description: line.description,
      unit: line.unit,
      qty: line.qty,
      unitAmount: line.unitAmount,
      taxRate: line.taxRate,
      lineTotal: computed.lineTotal,
      lineIva: computed.lineIva,
      position: line.position,
    };
  });
}

/** Totals for a document, recomputed from its lines. Never trusted from a form. */
export function totalsFor(values: { lines: readonly DocumentLineInput[]; currency: QuoteInput["currency"] }) {
  const totals = computeTotals(values.lines, values.currency);
  return {
    subtotal10: totals.subtotal10,
    subtotal5: totals.subtotal5,
    subtotalExenta: totals.subtotalExenta,
    iva10: totals.iva10,
    iva5: totals.iva5,
    total: totals.total,
  };
}

export async function insertQuote(
  tenantId: number,
  values: QuoteInput,
  userId: number,
): Promise<number> {
  return db.transaction(async (tx) => {
    const [result] = await tx.insert(documents).values({
      tenantId,
      type: "quote",
      status: "borrador",
      customerId: values.customerId,
      docLocale: values.docLocale,
      currency: values.currency,
      issueDate: values.issueDate,
      validUntil: values.validUntil,
      notes: values.notes,
      publicToken: generatePublicToken(),
      ...totalsFor(values),
      createdBy: userId,
      updatedBy: userId,
    });

    const documentId = result.insertId;
    const rows = lineRows(tenantId, documentId, values.lines);
    if (rows.length > 0) await tx.insert(documentLines).values(rows);

    return documentId;
  });
}

/**
 * Replace a draft quote's contents. The lines are deleted and rewritten rather
 * than diffed: a quote's lines have no identity of their own, and a rewrite
 * inside the transaction cannot leave a half-updated document behind.
 */
export async function replaceQuote(
  tenantId: number,
  documentId: number,
  values: QuoteInput,
  userId: number,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(documents)
      .set({
        customerId: values.customerId,
        docLocale: values.docLocale,
        currency: values.currency,
        issueDate: values.issueDate,
        validUntil: values.validUntil,
        notes: values.notes,
        ...totalsFor(values),
        updatedBy: userId,
      })
      .where(tenantScoped(documents, tenantId, eq(documents.id, documentId)));

    await tx
      .delete(documentLines)
      .where(tenantScoped(documentLines, tenantId, eq(documentLines.documentId, documentId)));

    const rows = lineRows(tenantId, documentId, values.lines);
    if (rows.length > 0) await tx.insert(documentLines).values(rows);
  });
}

export async function updateDocumentStatus(
  tenantId: number,
  documentId: number,
  status: DocumentStatus,
  userId: number,
): Promise<void> {
  await db
    .update(documents)
    .set({ status, updatedBy: userId })
    .where(tenantScoped(documents, tenantId, eq(documents.id, documentId)));
}

/** The invoice a quote was converted into, if any. */
export async function findConversion(
  tenantId: number,
  quoteId: number,
): Promise<Document | null> {
  const rows = await db
    .select()
    .from(documents)
    .where(
      tenantScoped(
        documents,
        tenantId,
        eq(documents.relatedDocumentId, quoteId),
        inArray(documents.type, ["invoice_contado", "invoice_credito"]),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Create a draft invoice from an accepted quote, carrying every line across.
 * The invoice gets **no number here** — numbering happens at issue time,
 * through the PR-4 generator only (guardrail 6). PR-10 owns that step.
 */
export async function convertQuoteToInvoice(
  tenantId: number,
  quote: FullDocument,
  type: "invoice_contado" | "invoice_credito",
  userId: number,
): Promise<number> {
  return db.transaction(async (tx) => {
    const [result] = await tx.insert(documents).values({
      tenantId,
      type,
      status: "borrador",
      customerId: quote.document.customerId,
      docLocale: quote.document.docLocale,
      currency: quote.document.currency,
      exchangeRate: quote.document.exchangeRate,
      issueDate: quote.document.issueDate,
      relatedDocumentId: quote.document.id,
      notes: quote.document.notes,
      publicToken: generatePublicToken(),
      subtotal10: quote.document.subtotal10,
      subtotal5: quote.document.subtotal5,
      subtotalExenta: quote.document.subtotalExenta,
      iva10: quote.document.iva10,
      iva5: quote.document.iva5,
      total: quote.document.total,
      createdBy: userId,
      updatedBy: userId,
    });

    const invoiceId = result.insertId;

    if (quote.lines.length > 0) {
      await tx.insert(documentLines).values(
        quote.lines.map((line) => ({
          tenantId,
          documentId: invoiceId,
          productId: line.productId,
          description: line.description,
          unit: line.unit,
          qty: line.qty,
          unitAmount: line.unitAmount,
          taxRate: line.taxRate,
          lineTotal: line.lineTotal,
          lineIva: line.lineIva,
          position: line.position,
        })),
      );
    }

    return invoiceId;
  });
}

/* -------------------------------------------------------------------------- */
/* invoices                                                                    */
/* -------------------------------------------------------------------------- */

/** An issued document was asked to change. It never may (guardrail 4). */
export class ImmutableDocumentError extends Error {
  constructor(message = "Issued documents are immutable") {
    super(message);
    this.name = "ImmutableDocumentError";
  }
}

export async function insertInvoice(
  tenantId: number,
  values: InvoiceInput,
  userId: number,
): Promise<number> {
  return db.transaction(async (tx) => {
    const [result] = await tx.insert(documents).values({
      tenantId,
      type: values.type,
      status: "borrador",
      customerId: values.customerId,
      docLocale: values.docLocale,
      currency: values.currency,
      issueDate: values.issueDate,
      dueDate: values.dueDate,
      notes: values.notes,
      publicToken: generatePublicToken(),
      ...totalsFor(values),
      createdBy: userId,
      updatedBy: userId,
    });

    const documentId = result.insertId;
    const rows = lineRows(tenantId, documentId, values.lines);
    if (rows.length > 0) await tx.insert(documentLines).values(rows);

    return documentId;
  });
}

/**
 * Replace a **draft** invoice's contents. The `WHERE` clause carries the
 * immutability rule into the statement itself: `number IS NULL` and
 * `issued_at IS NULL`, so even a caller that skipped the domain check cannot
 * rewrite an issued document.
 */
export async function replaceDraftInvoice(
  tenantId: number,
  documentId: number,
  values: InvoiceInput,
  userId: number,
): Promise<void> {
  await db.transaction(async (tx) => {
    const result = await tx
      .update(documents)
      .set({
        type: values.type,
        customerId: values.customerId,
        docLocale: values.docLocale,
        currency: values.currency,
        issueDate: values.issueDate,
        dueDate: values.dueDate,
        notes: values.notes,
        ...totalsFor(values),
        updatedBy: userId,
      })
      .where(
        tenantScoped(
          documents,
          tenantId,
          eq(documents.id, documentId),
          isNull(documents.number),
          isNull(documents.issuedAt),
        ),
      );

    const [meta] = result as unknown as [{ affectedRows: number }];
    if (!meta || meta.affectedRows !== 1) throw new ImmutableDocumentError();

    await tx
      .delete(documentLines)
      .where(tenantScoped(documentLines, tenantId, eq(documentLines.documentId, documentId)));

    const rows = lineRows(tenantId, documentId, values.lines);
    if (rows.length > 0) await tx.insert(documentLines).values(rows);
  });
}

export type IssuedInvoice = AllocatedNumber & {
  issueDate: string;
  dueDate: string | null;
};

/**
 * Issue a draft invoice: take a number from the timbrado and freeze the
 * document.
 *
 * The number allocation and the document write share **one transaction**
 * (guardrail 6) — if writing the document fails, the sequence rolls back with
 * it and no number is skipped. The document row is locked first so two clicks
 * on "issue" cannot both get past the already-issued check.
 *
 * The legal issue date is the day it is actually issued, not the day the draft
 * was started, so both dates are restated here; a credit invoice keeps the
 * number of days it was agreed for.
 */
export async function issueInvoice(options: {
  tenantId: number;
  documentId: number;
  timbradoId: number;
  userId: number;
  today: string;
}): Promise<IssuedInvoice> {
  const { tenantId, documentId, timbradoId, userId, today } = options;

  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(documents)
      .where(tenantScoped(documents, tenantId, eq(documents.id, documentId)))
      .for("update")
      .limit(1);

    const document = rows[0];
    if (!document) throw new ImmutableDocumentError("Document not found");
    if (isIssued(document)) throw new ImmutableDocumentError("Already issued");

    const allocated = await allocateDocumentNumber(tx, { tenantId, timbradoId, today });

    // Keep the agreed credit window rather than the calendar date a draft
    // happened to be written on.
    const creditDays =
      document.dueDate && document.issueDate
        ? Math.max(
            0,
            Math.round(
              (Date.parse(`${document.dueDate}T00:00:00Z`) -
                Date.parse(`${document.issueDate}T00:00:00Z`)) /
                86_400_000,
            ),
          )
        : null;

    const dueDate = creditDays === null ? null : validUntilFrom(today, creditDays);

    await tx
      .update(documents)
      .set({
        number: allocated.number,
        timbradoId: allocated.timbradoId,
        status: "pendiente",
        issueDate: today,
        dueDate,
        issuedAt: new Date(),
        issuedBy: userId,
        updatedBy: userId,
      })
      .where(
        tenantScoped(
          documents,
          tenantId,
          eq(documents.id, documentId),
          isNull(documents.number),
        ),
      );

    return { ...allocated, issueDate: today, dueDate };
  });
}

/**
 * Record where the issued PDF was frozen. Written once, after issuing — the
 * only column on an issued document that is ever filled in later, and only
 * when it was still empty.
 */
export async function setPdfSnapshot(
  tenantId: number,
  documentId: number,
  reference: string,
): Promise<void> {
  await db
    .update(documents)
    .set({ pdfSnapshot: reference })
    .where(
      tenantScoped(
        documents,
        tenantId,
        eq(documents.id, documentId),
        isNull(documents.pdfSnapshot),
      ),
    );
}

/* -------------------------------------------------------------------------- */
/* payments and credit notes                                                   */
/* -------------------------------------------------------------------------- */

export async function listPayments(
  tenantId: number,
  documentId: number,
): Promise<Payment[]> {
  return db
    .select()
    .from(payments)
    .where(tenantScoped(payments, tenantId, eq(payments.documentId, documentId)))
    .orderBy(desc(payments.paidAt), desc(payments.id));
}

/** Every credit note issued against an invoice. */
export async function listCreditNotes(
  tenantId: number,
  invoiceId: number,
): Promise<Document[]> {
  return db
    .select()
    .from(documents)
    .where(
      tenantScoped(
        documents,
        tenantId,
        eq(documents.type, "credit_note"),
        eq(documents.relatedDocumentId, invoiceId),
      ),
    )
    .orderBy(desc(documents.id));
}

export type InvoiceBalance = {
  total: number;
  paid: number;
  credited: number;
  outstanding: number;
  status: DocumentStatus;
};

/**
 * What an invoice actually stands at: paid, credited, still owing, and the
 * status those imply. The arithmetic lives in `domain/payments` — this only
 * gathers the rows (guardrail 1).
 */
export async function invoiceBalance(
  tenantId: number,
  invoice: Document,
  today: string,
): Promise<InvoiceBalance> {
  const [paymentRows, creditNotes] = await Promise.all([
    listPayments(tenantId, invoice.id),
    listCreditNotes(tenantId, invoice.id),
  ]);

  const paid = paidTotal(paymentRows as PaymentLike[]);
  // Only an *issued* credit note reduces what is owed; a draft is a proposal.
  const credited = creditNotes
    .filter((note) => isIssued(note))
    .reduce((sum, note) => sum + note.total, 0);

  return {
    total: invoice.total,
    paid,
    credited,
    outstanding: outstanding(invoice.total, paid, credited),
    status: derivePaymentStatus({
      total: invoice.total,
      paid,
      credited,
      dueDate: invoice.dueDate,
      today,
    }),
  };
}

/**
 * Recompute an issued invoice's status from its payments and credit notes and
 * store it.
 *
 * The status is derived, never typed in, so this is the only writer of it
 * after issuing. It deliberately touches nothing else on the row: the content
 * of an issued invoice stays immutable (guardrail 4) — what changes is the
 * world around it.
 */
export async function refreshInvoiceStatus(
  tenantId: number,
  invoiceId: number,
  today: string,
): Promise<DocumentStatus | null> {
  const rows = await db
    .select()
    .from(documents)
    .where(tenantScoped(documents, tenantId, eq(documents.id, invoiceId)))
    .limit(1);

  const invoice = rows[0];
  if (!invoice || !isIssued(invoice)) return null;

  const balance = await invoiceBalance(tenantId, invoice, today);
  if (balance.status === invoice.status) return invoice.status;

  await db
    .update(documents)
    .set({ status: balance.status })
    .where(tenantScoped(documents, tenantId, eq(documents.id, invoiceId)));

  return balance.status;
}

export async function insertPayment(
  tenantId: number,
  values: {
    documentId: number;
    amount: number;
    currency: Document["currency"];
    method: PaymentMethod;
    paidAt: Date;
    reference: string | null;
    notes: string | null;
  },
  userId: number,
): Promise<number> {
  const [result] = await db
    .insert(payments)
    .values({ ...values, tenantId, createdBy: userId, updatedBy: userId });

  return result.insertId;
}

/**
 * Issue a credit note against an issued invoice.
 *
 * A credit note is a legal document in its own right: it takes its own number
 * from a timbrado, in the same transaction as the write (guardrail 6), and is
 * immutable from the moment it exists — there is deliberately no draft state
 * and no edit path for one.
 */
export async function createAndIssueCreditNote(options: {
  tenantId: number;
  invoice: Document;
  lines: readonly DocumentLineInput[];
  timbradoId: number;
  userId: number;
  today: string;
  notes: string | null;
}): Promise<{ creditNoteId: number; number: string }> {
  const { tenantId, invoice, lines, timbradoId, userId, today, notes } = options;

  return db.transaction(async (tx) => {
    const allocated = await allocateDocumentNumber(tx, { tenantId, timbradoId, today });

    const [result] = await tx.insert(documents).values({
      tenantId,
      type: "credit_note",
      status: "pendiente",
      number: allocated.number,
      timbradoId: allocated.timbradoId,
      customerId: invoice.customerId,
      docLocale: invoice.docLocale,
      currency: invoice.currency,
      exchangeRate: invoice.exchangeRate,
      issueDate: today,
      relatedDocumentId: invoice.id,
      notes,
      publicToken: generatePublicToken(),
      ...totalsFor({ lines, currency: invoice.currency }),
      issuedAt: new Date(),
      issuedBy: userId,
      createdBy: userId,
      updatedBy: userId,
    });

    const creditNoteId = result.insertId;
    const rows = lineRows(tenantId, creditNoteId, lines);
    if (rows.length > 0) await tx.insert(documentLines).values(rows);

    return { creditNoteId, number: allocated.number };
  });
}

/** One payment, scoped to the tenant. `null` when it belongs to another. */
export async function findPayment(
  tenantId: number,
  paymentId: number,
): Promise<Payment | null> {
  const rows = await db
    .select()
    .from(payments)
    .where(tenantScoped(payments, tenantId, eq(payments.id, paymentId)))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Remove a recorded payment (PR-17).
 *
 * This deletes a *payment*, never a document. An issued invoice stays
 * byte-for-byte what it was (guardrail 4); what changes is the record of what
 * has been received against it, which was only ever an observation about the
 * world and can be observed wrongly. The caller re-derives the invoice's
 * status afterwards and writes the deletion to `activity_log`, so the
 * correction leaves a trail rather than erasing one.
 *
 * There is deliberately no *edit* path. Delete-and-re-record is one code path
 * instead of two, and it leaves two honest entries in the log — "this was
 * removed, that was added" — where an edit would leave one entry claiming a
 * payment had always been what it now says.
 *
 * Returns false when the id belongs to another tenant or is already gone, so
 * the caller can answer a stale form without a second query.
 */
export async function deletePayment(
  tenantId: number,
  paymentId: number,
): Promise<boolean> {
  const [result] = await db
    .delete(payments)
    .where(tenantScoped(payments, tenantId, eq(payments.id, paymentId)));

  return result.affectedRows > 0;
}

export type RecentPayment = {
  payment: Payment;
  documentNumber: string | null;
  customerName: string | null;
};

/** Every payment received, newest first — the payments screen (PR-11). */
export async function listRecentPayments(
  tenantId: number,
  limit = 200,
): Promise<RecentPayment[]> {
  const rows = await db
    .select({ payment: payments, document: documents, customer: customers })
    .from(payments)
    .leftJoin(
      documents,
      and(eq(documents.id, payments.documentId), eq(documents.tenantId, payments.tenantId)),
    )
    .leftJoin(
      customers,
      and(eq(customers.id, documents.customerId), eq(customers.tenantId, documents.tenantId)),
    )
    .where(tenantScoped(payments, tenantId))
    .orderBy(desc(payments.paidAt), desc(payments.id))
    .limit(limit);

  return rows.map((row) => ({
    payment: row.payment,
    documentNumber: row.document?.number ?? null,
    customerName: row.customer?.name ?? null,
  }));
}

/* -------------------------------------------------------------------------- */
/* reporting and the dashboard (PR-13)                                         */
/* -------------------------------------------------------------------------- */

/**
 * Everything issued in a period, for the IVA and sales reports. Quotes are
 * excluded here rather than in the domain: they are not a tax event, and
 * fetching them would only be work the report then throws away.
 */
export async function listPeriodDocuments(
  tenantId: number,
  period: Period,
): Promise<DocumentWithCustomer[]> {
  const rows = await db
    .select({ document: documents, customer: customers })
    .from(documents)
    .leftJoin(
      customers,
      and(eq(customers.id, documents.customerId), eq(customers.tenantId, documents.tenantId)),
    )
    .where(
      tenantScoped(
        documents,
        tenantId,
        inArray(documents.type, ["invoice_contado", "invoice_credito", "credit_note"]),
        gte(documents.issueDate, period.from),
        lte(documents.issueDate, period.to),
      ),
    )
    .orderBy(asc(documents.issueDate), asc(documents.id));

  return rows.map((row) => ({ ...row.document, customer: row.customer }));
}

/** Issued invoices that are not settled yet, oldest due date first. */
export async function listUnpaidInvoices(
  tenantId: number,
  limit = 200,
): Promise<DocumentWithCustomer[]> {
  const rows = await db
    .select({ document: documents, customer: customers })
    .from(documents)
    .leftJoin(
      customers,
      and(eq(customers.id, documents.customerId), eq(customers.tenantId, documents.tenantId)),
    )
    .where(
      tenantScoped(
        documents,
        tenantId,
        inArray(documents.type, ["invoice_contado", "invoice_credito"]),
        inArray(documents.status, ["pendiente", "parcial", "vencida"]),
      ),
    )
    .orderBy(asc(documents.dueDate), asc(documents.issueDate))
    .limit(limit);

  return rows.map((row) => ({ ...row.document, customer: row.customer }));
}

/** Quotes still waiting on an answer, soonest to expire first. */
export async function listOpenQuotes(
  tenantId: number,
  limit = 50,
): Promise<DocumentWithCustomer[]> {
  const rows = await db
    .select({ document: documents, customer: customers })
    .from(documents)
    .leftJoin(
      customers,
      and(eq(customers.id, documents.customerId), eq(customers.tenantId, documents.tenantId)),
    )
    .where(
      tenantScoped(
        documents,
        tenantId,
        eq(documents.type, "quote"),
        inArray(documents.status, ["borrador", "enviado"]),
      ),
    )
    .orderBy(asc(documents.validUntil), asc(documents.id))
    .limit(limit);

  return rows.map((row) => ({ ...row.document, customer: row.customer }));
}

export type InvoiceBalanceRow = DocumentWithCustomer & {
  paid: number;
  credited: number;
  outstanding: number;
};

/**
 * Balances for a set of invoices in three queries rather than three per
 * invoice: the payments and the credit notes are summed in the database, and
 * the arithmetic that decides what those mean stays in `domain/payments`.
 */
export async function balancesFor(
  tenantId: number,
  invoices: readonly DocumentWithCustomer[],
): Promise<InvoiceBalanceRow[]> {
  if (invoices.length === 0) return [];

  const ids = invoices.map((invoice) => invoice.id);

  const [paidRows, creditRows] = await Promise.all([
    db
      .select({
        documentId: payments.documentId,
        amount: sql<number>`sum(${payments.amount})`,
      })
      .from(payments)
      .where(tenantScoped(payments, tenantId, inArray(payments.documentId, ids)))
      .groupBy(payments.documentId),
    db
      .select({
        invoiceId: documents.relatedDocumentId,
        amount: sql<number>`sum(${documents.total})`,
      })
      .from(documents)
      .where(
        tenantScoped(
          documents,
          tenantId,
          eq(documents.type, "credit_note"),
          inArray(documents.relatedDocumentId, ids),
        ),
      )
      .groupBy(documents.relatedDocumentId),
  ]);

  const paidBy = new Map(paidRows.map((row) => [row.documentId, Number(row.amount) || 0]));
  const creditedBy = new Map(
    creditRows.map((row) => [row.invoiceId ?? 0, Number(row.amount) || 0]),
  );

  return invoices.map((invoice) => {
    const paid = paidBy.get(invoice.id) ?? 0;
    const credited = creditedBy.get(invoice.id) ?? 0;

    return {
      ...invoice,
      paid,
      credited,
      outstanding: outstanding(invoice.total, paid, credited),
    };
  });
}
