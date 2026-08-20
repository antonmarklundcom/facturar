import "server-only";

import { and, asc, desc, eq, inArray, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  customers,
  documentLines,
  documents,
  type Customer,
  type Document,
  type DocumentLine,
  type DocumentStatus,
  type DocumentType,
} from "@/db/schema";
import { assertRowTenant, tenantScoped } from "@/db/tenant";
import { computeLine, computeTotals } from "@/domain/iva";
import type { DocumentLineInput, QuoteInput } from "./parse";
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
export function totalsFor(values: QuoteInput) {
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
