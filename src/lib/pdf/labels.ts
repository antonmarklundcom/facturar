import { getTranslations } from "next-intl/server";
import type { DocumentLocale } from "@/db/schema";

/**
 * PDF text is **document-facing**, so it is resolved in the document's own
 * locale rather than the viewer's UI language (guardrail 5). The labels are
 * flattened into a plain object here because a `@react-pdf/renderer` tree is
 * rendered outside React's request context, where the next-intl hooks are not
 * available.
 */
export type PdfLabels = Record<string, string>;

const KEYS = [
  "quote",
  "invoice",
  "creditNote",
  "number",
  "draft",
  "issueDate",
  "validUntil",
  "validityNote",
  "dueDate",
  "customer",
  "ruc",
  "address",
  "whatsapp",
  "email",
  "description",
  "qty",
  "unit",
  "unitPrice",
  "taxRate",
  "lineTotal",
  "exempt",
  "subtotal10",
  "subtotal5",
  "subtotalExenta",
  "iva10",
  "iva5",
  "ivaTotal",
  "total",
  "notes",
  "consumidorFinal",
  "ivaIncludedNote",
  "notAnInvoice",
  "page",
] as const;

export async function pdfLabels(locale: DocumentLocale): Promise<PdfLabels> {
  const t = await getTranslations({ locale, namespace: "documentPdf" });
  return Object.fromEntries(KEYS.map((key) => [key, t(key)]));
}
