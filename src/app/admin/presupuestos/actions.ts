"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  documentStatusValues,
  type DocumentStatus,
} from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { requireRole } from "@/lib/auth/guards";
import { findCustomer } from "@/lib/customers/data";
import {
  convertQuoteToInvoice,
  findConversion,
  findDocument,
  insertQuote,
  replaceQuote,
  updateDocumentStatus,
} from "@/lib/documents/data";
import { QUOTE_FIELDS, parseQuote } from "@/lib/documents/parse";
import { echo, field, formError, formSuccess, type FormState } from "@/lib/forms";
import { enumValue, idField } from "@/lib/validation";
import { asuncionDateString } from "@/domain/format";
import {
  canTransition,
  isConvertible,
  isQuoteEditable,
  effectiveQuoteStatus,
} from "@/domain/documents";

const QUOTES_PATH = "/admin/presupuestos";

/** Today in Asunción civil time — every date rule in the domain takes it. */
function today(): string {
  return asuncionDateString(new Date());
}

export async function createQuoteAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireRole("documents.write");
  const values = echo(formData, QUOTE_FIELDS);

  const parsed = parseQuote(formData, today());
  if (!parsed.ok) return formError("invalid", parsed.fieldErrors, { values, previous });

  // The customer id comes from a form, so it is re-read scoped before it is
  // written onto a document (guardrail 2).
  const customer = await findCustomer(session.tenantId, parsed.values.customerId);
  if (!customer) {
    return formError("invalid", { customerId: "notFound" }, { values, previous });
  }

  const quoteId = await insertQuote(session.tenantId, parsed.values, session.userId);

  await logActivity({
    tenantId: session.tenantId,
    userId: session.userId,
    entityType: "document",
    entityId: quoteId,
    action: "created",
    detail: { type: "quote", customerId: customer.id, lines: parsed.values.lines.length },
  });

  revalidatePath(QUOTES_PATH);
  redirect(`${QUOTES_PATH}/${quoteId}`);
}

export async function updateQuoteAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireRole("documents.write");
  const values = echo(formData, QUOTE_FIELDS);

  const id = idField(field(formData, "documentId"));
  if (!id.ok) return formError("invalid", undefined, { values, previous });

  const existing = await findDocument(session.tenantId, id.value);
  if (!existing || existing.document.type !== "quote") {
    return formError("notFound", undefined, { values, previous });
  }

  // A decided quote is the record of what the customer agreed to. Hiding the
  // form is UX; this is the check.
  if (!isQuoteEditable(existing.document.status)) {
    return formError("notEditable", undefined, { values, previous });
  }

  const parsed = parseQuote(formData, today());
  if (!parsed.ok) return formError("invalid", parsed.fieldErrors, { values, previous });

  const customer = await findCustomer(session.tenantId, parsed.values.customerId);
  if (!customer) {
    return formError("invalid", { customerId: "notFound" }, { values, previous });
  }

  await replaceQuote(session.tenantId, id.value, parsed.values, session.userId);

  await logActivity({
    tenantId: session.tenantId,
    userId: session.userId,
    entityType: "document",
    entityId: id.value,
    action: "updated",
    detail: { lines: parsed.values.lines.length },
  });

  revalidatePath(QUOTES_PATH);
  revalidatePath(`${QUOTES_PATH}/${id.value}`);
  return formSuccess("updated");
}

/**
 * Move a quote along its lifecycle. Every transition is checked against the
 * domain's table — an invoice state can never be written onto a quote, and a
 * decided quote cannot be rewound.
 */
export async function setQuoteStatusAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireRole("documents.write");

  const id = idField(field(formData, "documentId"));
  if (!id.ok) return formError("invalid", undefined, { previous });

  const target = enumValue(field(formData, "status"), documentStatusValues);
  if (!target.ok) return formError("invalid", undefined, { previous });

  const existing = await findDocument(session.tenantId, id.value);
  if (!existing || existing.document.type !== "quote") {
    return formError("notFound", undefined, { previous });
  }

  // Expiry is derived from the calendar on read, so the transition is checked
  // from the status the user is actually looking at.
  const from = effectiveQuoteStatus(
    existing.document.status,
    existing.document.validUntil,
    today(),
  );

  if (!canTransition("quote", from, target.value as DocumentStatus)) {
    return formError("badTransition", undefined, { previous });
  }

  await updateDocumentStatus(
    session.tenantId,
    id.value,
    target.value as DocumentStatus,
    session.userId,
  );

  await logActivity({
    tenantId: session.tenantId,
    userId: session.userId,
    entityType: "document",
    entityId: id.value,
    action: "updated",
    detail: { from, to: target.value },
  });

  revalidatePath(QUOTES_PATH);
  revalidatePath(`${QUOTES_PATH}/${id.value}`);
  return formSuccess(`status_${target.value}`);
}

/**
 * Turn an accepted quote into a **draft** invoice carrying every line.
 * Numbering and issuing are not done here: a number comes only from the PR-4
 * generator, at issue time (guardrail 6). PR-10 owns that step.
 */
export async function convertQuoteAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireRole("documents.write");

  const id = idField(field(formData, "documentId"));
  if (!id.ok) return formError("invalid", undefined, { previous });

  const type = field(formData, "invoiceType") === "invoice_credito"
    ? "invoice_credito"
    : "invoice_contado";

  const quote = await findDocument(session.tenantId, id.value);
  if (!quote || quote.document.type !== "quote") {
    return formError("notFound", undefined, { previous });
  }

  const alreadyConverted = (await findConversion(session.tenantId, id.value)) !== null;
  if (!isConvertible("quote", quote.document.status, alreadyConverted)) {
    return formError(alreadyConverted ? "alreadyConverted" : "notAccepted", undefined, {
      previous,
    });
  }

  const invoiceId = await convertQuoteToInvoice(session.tenantId, quote, type, session.userId);

  await logActivity({
    tenantId: session.tenantId,
    userId: session.userId,
    entityType: "document",
    entityId: invoiceId,
    action: "created",
    detail: { type, fromQuote: id.value, lines: quote.lines.length },
  });

  revalidatePath(QUOTES_PATH);
  revalidatePath(`${QUOTES_PATH}/${id.value}`);
  return formSuccess("converted");
}
