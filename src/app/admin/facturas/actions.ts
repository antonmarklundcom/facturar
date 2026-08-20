"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logActivity } from "@/lib/activity";
import { requireRole } from "@/lib/auth/guards";
import { findCustomer } from "@/lib/customers/data";
import {
  ImmutableDocumentError,
  createAndIssueCreditNote,
  findDocument,
  insertInvoice,
  insertPayment,
  invoiceBalance,
  issueInvoice,
  refreshInvoiceStatus,
  replaceDraftInvoice,
  setPdfSnapshot,
} from "@/lib/documents/data";
import {
  INVOICE_FIELDS,
  PAYMENT_FIELDS,
  parseCreditNote,
  parseInvoice,
  parsePayment,
} from "@/lib/documents/parse";
import { renderDocumentPdf } from "@/lib/pdf/render";
import { saveSnapshot, snapshotReference } from "@/lib/pdf/storage";
import { findTimbrado, toSnapshot } from "@/lib/settings/timbrados";
import { getTenant } from "@/lib/settings/tenant";
import { echo, field, formError, formSuccess, type FormState } from "@/lib/forms";
import { idField } from "@/lib/validation";
import { asuncionDateString } from "@/domain/format";
import { isDocumentEditable, isIssuable, isIssued } from "@/domain/documents";
import { computeTotals } from "@/domain/iva";
import { creditProblem, paymentProblem } from "@/domain/payments";
import { issuingBlockers } from "@/domain/timbrado";
import { NumberingError } from "@/domain/numbering";

const INVOICES_PATH = "/admin/facturas";

function today(): string {
  return asuncionDateString(new Date());
}

export async function createInvoiceAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireRole("documents.write");
  const values = echo(formData, INVOICE_FIELDS);

  const parsed = parseInvoice(formData, today());
  if (!parsed.ok) return formError("invalid", parsed.fieldErrors, { values, previous });

  const customer = await findCustomer(session.tenantId, parsed.values.customerId);
  if (!customer) {
    return formError("invalid", { customerId: "notFound" }, { values, previous });
  }

  const invoiceId = await insertInvoice(session.tenantId, parsed.values, session.userId);

  await logActivity({
    tenantId: session.tenantId,
    userId: session.userId,
    entityType: "document",
    entityId: invoiceId,
    action: "created",
    detail: { type: parsed.values.type, customerId: customer.id },
  });

  revalidatePath(INVOICES_PATH);
  redirect(`${INVOICES_PATH}/${invoiceId}`);
}

/**
 * Edit a **draft**. An issued invoice is never edited (guardrail 4) — the
 * domain says so here, and `replaceDraftInvoice` says so again in its WHERE
 * clause, so neither a stale page nor a future caller can get round it.
 */
export async function updateInvoiceAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireRole("documents.write");
  const values = echo(formData, INVOICE_FIELDS);

  const id = idField(field(formData, "documentId"));
  if (!id.ok) return formError("invalid", undefined, { values, previous });

  const existing = await findDocument(session.tenantId, id.value);
  if (!existing) return formError("notFound", undefined, { values, previous });
  if (!isDocumentEditable(existing.document)) {
    return formError("immutable", undefined, { values, previous });
  }

  const parsed = parseInvoice(formData, today());
  if (!parsed.ok) return formError("invalid", parsed.fieldErrors, { values, previous });

  const customer = await findCustomer(session.tenantId, parsed.values.customerId);
  if (!customer) {
    return formError("invalid", { customerId: "notFound" }, { values, previous });
  }

  try {
    await replaceDraftInvoice(session.tenantId, id.value, parsed.values, session.userId);
  } catch (error) {
    if (error instanceof ImmutableDocumentError) {
      return formError("immutable", undefined, { values, previous });
    }
    throw error;
  }

  await logActivity({
    tenantId: session.tenantId,
    userId: session.userId,
    entityType: "document",
    entityId: id.value,
    action: "updated",
    detail: { lines: parsed.values.lines.length },
  });

  revalidatePath(INVOICES_PATH);
  revalidatePath(`${INVOICES_PATH}/${id.value}`);
  return formSuccess("updated");
}

/**
 * Issue a draft: take a number from a timbrado and freeze the document.
 *
 * The number and the document write share one transaction inside
 * `issueInvoice` (guardrail 6). The PDF snapshot is taken afterwards, on
 * purpose: rendering is slow, and holding the timbrado's row lock while it
 * runs would serialise every concurrent issue behind it. A snapshot that
 * fails to write leaves an issued invoice that still renders live — the
 * reverse (a snapshot for a number that rolled back) would be worse.
 */
export async function issueInvoiceAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireRole("documents.issue");

  const id = idField(field(formData, "documentId"));
  const timbradoId = idField(field(formData, "timbradoId"));
  if (!id.ok) return formError("invalid", undefined, { previous });
  if (!timbradoId.ok) return formError("noTimbrado", undefined, { previous });

  const existing = await findDocument(session.tenantId, id.value);
  if (!existing) return formError("notFound", undefined, { previous });
  if (!isIssuable(existing.document)) return formError("immutable", undefined, { previous });
  if (existing.lines.length === 0) return formError("noLines", undefined, { previous });

  const timbrado = await findTimbrado(session.tenantId, timbradoId.value);
  if (!timbrado) return formError("noTimbrado", undefined, { previous });

  // Checked here so the user gets a translated reason rather than a thrown
  // error; the generator checks again inside its own row lock, which is the
  // check that actually decides (guardrail 6).
  const blockers = issuingBlockers(toSnapshot(timbrado), today());
  if (blockers.length > 0) {
    return formError(`blocked_${blockers[0]}`, undefined, { previous });
  }

  let issued;
  try {
    issued = await issueInvoice({
      tenantId: session.tenantId,
      documentId: id.value,
      timbradoId: timbradoId.value,
      userId: session.userId,
      today: today(),
    });
  } catch (error) {
    if (error instanceof ImmutableDocumentError) {
      return formError("immutable", undefined, { previous });
    }
    if (error instanceof NumberingError) {
      return formError("numbering", undefined, { previous });
    }
    throw error;
  }

  await logActivity({
    tenantId: session.tenantId,
    userId: session.userId,
    entityType: "document",
    entityId: id.value,
    action: "issued",
    detail: { number: issued.number, timbrado: timbrado.number, sequence: issued.sequence },
  });

  await storeSnapshot(session.tenantId, id.value, issued.number);

  revalidatePath(INVOICES_PATH);
  revalidatePath(`${INVOICES_PATH}/${id.value}`);
  return formSuccess("issued");
}

/** Freeze the issued PDF (guardrail 4). Never fails the issue itself. */
async function storeSnapshot(
  tenantId: number,
  documentId: number,
  number: string,
): Promise<void> {
  try {
    const [full, tenant] = await Promise.all([
      findDocument(tenantId, documentId),
      getTenant(tenantId),
    ]);
    if (!full || !tenant) return;

    const reference = snapshotReference(tenantId, documentId, number);
    await saveSnapshot(reference, await renderDocumentPdf(full, tenant));
    await setPdfSnapshot(tenantId, documentId, reference);
  } catch (error) {
    // The invoice is issued and legally exists; the snapshot is a copy of it.
    // Log loudly (decision 20 — structured server logs) and carry on.
    console.error("[facturar] failed to store PDF snapshot", {
      tenantId,
      documentId,
      number,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/* -------------------------------------------------------------------------- */
/* payments (PR-11)                                                            */
/* -------------------------------------------------------------------------- */

export async function recordPaymentAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireRole("payments.write");
  const values = echo(formData, PAYMENT_FIELDS);

  const id = idField(field(formData, "documentId"));
  if (!id.ok) return formError("invalid", undefined, { values, previous });

  const full = await findDocument(session.tenantId, id.value);
  if (!full) return formError("notFound", undefined, { values, previous });

  const parsed = parsePayment(formData, full.document.currency, today());
  if (!parsed.ok) return formError("invalid", parsed.fieldErrors, { values, previous });

  const balance = await invoiceBalance(session.tenantId, full.document, today());

  // The domain decides whether this payment may be recorded; the form only
  // asked the question.
  const problem = paymentProblem({
    status: balance.status,
    isIssued: isIssued(full.document),
    currency: full.document.currency,
    outstandingAmount: balance.outstanding,
    payment: { amount: parsed.values.amount, currency: parsed.values.currency },
  });

  if (problem) return formError(`payment_${problem}`, undefined, { values, previous });

  const paymentId = await insertPayment(
    session.tenantId,
    { ...parsed.values, documentId: id.value },
    session.userId,
  );

  const status = await refreshInvoiceStatus(session.tenantId, id.value, today());

  await logActivity({
    tenantId: session.tenantId,
    userId: session.userId,
    entityType: "document",
    entityId: id.value,
    action: "paid",
    detail: {
      paymentId,
      amount: parsed.values.amount,
      method: parsed.values.method,
      status,
    },
  });

  revalidatePath(INVOICES_PATH);
  revalidatePath(`${INVOICES_PATH}/${id.value}`);
  revalidatePath("/admin/pagos");
  return formSuccess("paid");
}

/* -------------------------------------------------------------------------- */
/* credit notes (PR-11)                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Issue a credit note against an issued invoice — the only way to correct one
 * (guardrail 4). It takes its own number from a timbrado, so all the issuing
 * rules apply to it as well.
 */
export async function issueCreditNoteAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireRole("documents.issue");

  const id = idField(field(formData, "documentId"));
  const timbradoId = idField(field(formData, "timbradoId"));
  if (!id.ok) return formError("invalid", undefined, { previous });
  if (!timbradoId.ok) return formError("noTimbrado", undefined, { previous });

  const invoice = await findDocument(session.tenantId, id.value);
  if (!invoice) return formError("notFound", undefined, { previous });

  const parsed = parseCreditNote(formData, invoice.document.currency, today());
  if (!parsed.ok) return formError("invalid", parsed.fieldErrors, { previous });

  const balance = await invoiceBalance(session.tenantId, invoice.document, today());
  const creditTotal = computeTotals(parsed.values.lines, invoice.document.currency).total;

  const problem = creditProblem({
    invoiceStatus: balance.status,
    invoiceIsIssued: isIssued(invoice.document),
    invoiceTotal: invoice.document.total,
    invoiceCurrency: invoice.document.currency,
    alreadyCredited: balance.credited,
    creditTotal,
    creditCurrency: invoice.document.currency,
  });

  if (problem) return formError(`credit_${problem}`, undefined, { previous });

  const timbrado = await findTimbrado(session.tenantId, timbradoId.value);
  if (!timbrado) return formError("noTimbrado", undefined, { previous });

  const blockers = issuingBlockers(toSnapshot(timbrado), today());
  if (blockers.length > 0) {
    return formError(`blocked_${blockers[0]}`, undefined, { previous });
  }

  let created;
  try {
    created = await createAndIssueCreditNote({
      tenantId: session.tenantId,
      invoice: invoice.document,
      lines: parsed.values.lines,
      timbradoId: timbradoId.value,
      userId: session.userId,
      today: today(),
      notes: parsed.values.notes,
    });
  } catch (error) {
    if (error instanceof NumberingError) {
      return formError("numbering", undefined, { previous });
    }
    throw error;
  }

  const status = await refreshInvoiceStatus(session.tenantId, id.value, today());

  await logActivity({
    tenantId: session.tenantId,
    userId: session.userId,
    entityType: "document",
    entityId: id.value,
    action: "credited",
    detail: {
      creditNoteId: created.creditNoteId,
      number: created.number,
      amount: creditTotal,
      status,
    },
  });

  await storeSnapshot(session.tenantId, created.creditNoteId, created.number);

  revalidatePath(INVOICES_PATH);
  revalidatePath(`${INVOICES_PATH}/${id.value}`);
  return formSuccess("credited");
}
