"use server";

import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/activity";
import { requireRole } from "@/lib/auth/guards";
import { findDocument, updateDocumentStatus } from "@/lib/documents/data";
import { publicDocumentUrl } from "@/lib/documents/token";
import { emailKindFor, renderDocumentEmail } from "@/lib/email/templates";
import { emailEnabled, sendEmail } from "@/lib/email/send";
import { getTenant } from "@/lib/settings/tenant";
import { field, formError, formSuccess, type FormState } from "@/lib/forms";
import { idField } from "@/lib/validation";
import { formatDateOnly, formatMoneyParts } from "@/domain/format";
import { canTransition } from "@/domain/documents";

/**
 * Sending a document (PR-12). Both channels do the same three things: build
 * the buyer link, hand it over, and write the send to `activity_log` so the
 * document's history answers "did we ever send this, and when?".
 */

function pathFor(type: string, id: number): string {
  if (type === "quote") return `/admin/presupuestos/${id}`;
  if (type === "credit_note") return `/admin/notas-credito/${id}`;
  return `/admin/facturas/${id}`;
}

/**
 * Sending a quote is what makes it "sent". The transition goes through the
 * domain's table like every other one, so a quote that has already been
 * accepted is not quietly rewound by a re-send.
 */
async function markQuoteSent(
  tenantId: number,
  document: { id: number; type: string; status: string },
  userId: number,
): Promise<void> {
  if (document.type !== "quote") return;
  if (!canTransition("quote", document.status as "borrador", "enviado")) return;

  await updateDocumentStatus(tenantId, document.id, "enviado", userId);
}

export async function sendDocumentEmailAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireRole("documents.write");

  const id = idField(field(formData, "documentId"));
  if (!id.ok) return formError("invalid", undefined, { previous });

  if (!emailEnabled()) return formError("emailDisabled", undefined, { previous });

  const [full, tenant] = await Promise.all([
    findDocument(session.tenantId, id.value),
    getTenant(session.tenantId),
  ]);

  if (!full || !tenant) return formError("notFound", undefined, { previous });
  if (!full.customer?.email) return formError("noEmail", undefined, { previous });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!baseUrl) return formError("noBaseUrl", undefined, { previous });
  if (!full.document.publicToken) return formError("noLink", undefined, { previous });

  const content = renderDocumentEmail({
    locale: full.document.docLocale,
    kind: emailKindFor(full.document.type),
    company: tenant.name,
    customerName: full.customer.name,
    total: formatMoneyParts(full.document.total, full.document.currency),
    link: publicDocumentUrl(full.document.publicToken, baseUrl),
    number: full.document.number,
    validUntil: full.document.validUntil ? formatDateOnly(full.document.validUntil) : null,
    dueDate: full.document.dueDate ? formatDateOnly(full.document.dueDate) : null,
  });

  const result = await sendEmail({
    to: full.customer.email,
    content,
    replyTo: tenant.email,
  });

  if (!result.ok) return formError(`email_${result.reason}`, undefined, { previous });

  await logActivity({
    tenantId: session.tenantId,
    userId: session.userId,
    entityType: "document",
    entityId: id.value,
    action: "sent_email",
    detail: { to: full.customer.email, subject: content.subject, providerId: result.id },
  });

  await markQuoteSent(session.tenantId, full.document, session.userId);

  revalidatePath(pathFor(full.document.type, id.value));
  return formSuccess("emailSent");
}

/**
 * Record that the WhatsApp composer was opened. The message itself is sent
 * from the user's own WhatsApp — a `wa.me` deeplink, not an API — so this is
 * the only moment the app can observe. `sent_whatsapp` therefore means "we
 * handed it to WhatsApp", which is what the history claims.
 */
export async function markWhatsappSentAction(documentId: number): Promise<void> {
  const session = await requireRole("documents.write");

  const full = await findDocument(session.tenantId, documentId);
  if (!full) return;

  await logActivity({
    tenantId: session.tenantId,
    userId: session.userId,
    entityType: "document",
    entityId: documentId,
    action: "sent_whatsapp",
    detail: { to: full.customer?.whatsapp ?? null },
  });

  await markQuoteSent(session.tenantId, full.document, session.userId);
  revalidatePath(pathFor(full.document.type, documentId));
}
