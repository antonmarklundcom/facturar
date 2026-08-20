import type { DocumentLocale, DocumentType } from "@/db/schema";

/**
 * Outbound email content, in the **document's** language (guardrail 5).
 *
 * The text lives here rather than in the next-intl catalogues because it is
 * not UI: it is the body of a message to a customer, it needs both a plain
 * and an HTML form, and the two must stay identical in wording. Keeping them
 * side by side is how that stays true.
 *
 * Deliberately plain: a Paraguayan SMB's invoice email competes with WhatsApp,
 * and a heavy template full of images is more likely to land in spam than to
 * impress anyone.
 */

export type EmailKind = "quote" | "invoice" | "credit_note";

export function emailKindFor(type: DocumentType): EmailKind {
  if (type === "quote") return "quote";
  if (type === "credit_note") return "credit_note";
  return "invoice";
}

export type EmailContent = {
  subject: string;
  text: string;
  html: string;
};

export type EmailInput = {
  locale: DocumentLocale;
  kind: EmailKind;
  company: string;
  customerName: string;
  /** Already formatted for the document's currency. */
  total: string;
  /** Absolute buyer URL. */
  link: string;
  /** Document number, or null while it has none. */
  number: string | null;
  /** `dd/mm/yyyy`, quotes only. */
  validUntil?: string | null;
  /** `dd/mm/yyyy`, credit invoices only. */
  dueDate?: string | null;
};

const COPY = {
  es: {
    subjects: {
      quote: (input: EmailInput) => `Presupuesto de ${input.company}`,
      invoice: (input: EmailInput) =>
        input.number
          ? `Factura ${input.number} de ${input.company}`
          : `Factura de ${input.company}`,
      credit_note: (input: EmailInput) =>
        input.number
          ? `Nota de crédito ${input.number} de ${input.company}`
          : `Nota de crédito de ${input.company}`,
    },
    greeting: (name: string) => `Hola ${name},`,
    lead: {
      quote: (input: EmailInput) =>
        `Te mandamos el presupuesto por ${input.total}.`,
      invoice: (input: EmailInput) => `Te mandamos la factura por ${input.total}.`,
      credit_note: (input: EmailInput) =>
        `Te mandamos la nota de crédito por ${input.total}.`,
    },
    validUntil: (date: string) => `El presupuesto es válido hasta el ${date}.`,
    dueDate: (date: string) => `El vencimiento es el ${date}.`,
    cta: "Ver el documento",
    fallback: "Si el botón no funciona, copiá y pegá este enlace:",
    signature: (company: string) => `Saludos,\n${company}`,
  },
  en: {
    subjects: {
      quote: (input: EmailInput) => `Quote from ${input.company}`,
      invoice: (input: EmailInput) =>
        input.number
          ? `Invoice ${input.number} from ${input.company}`
          : `Invoice from ${input.company}`,
      credit_note: (input: EmailInput) =>
        input.number
          ? `Credit note ${input.number} from ${input.company}`
          : `Credit note from ${input.company}`,
    },
    greeting: (name: string) => `Hello ${name},`,
    lead: {
      quote: (input: EmailInput) => `Here is your quote for ${input.total}.`,
      invoice: (input: EmailInput) => `Here is your invoice for ${input.total}.`,
      credit_note: (input: EmailInput) => `Here is your credit note for ${input.total}.`,
    },
    validUntil: (date: string) => `The quote is valid until ${date}.`,
    dueDate: (date: string) => `Payment is due on ${date}.`,
    cta: "View the document",
    fallback: "If the button does not work, copy and paste this link:",
    signature: (company: string) => `Best regards,\n${company}`,
  },
} as const;

/** Escape text that goes into the HTML part. Never trust a customer's name. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderDocumentEmail(input: EmailInput): EmailContent {
  const copy = COPY[input.locale];

  const lines = [copy.greeting(input.customerName), "", copy.lead[input.kind](input)];

  if (input.kind === "quote" && input.validUntil) {
    lines.push(copy.validUntil(input.validUntil));
  }
  if (input.kind === "invoice" && input.dueDate) {
    lines.push(copy.dueDate(input.dueDate));
  }

  lines.push("", input.link, "", copy.signature(input.company));

  const html = [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.6;color:#111827">',
    `<p>${escapeHtml(copy.greeting(input.customerName))}</p>`,
    `<p>${escapeHtml(copy.lead[input.kind](input))}`,
    input.kind === "quote" && input.validUntil
      ? `<br>${escapeHtml(copy.validUntil(input.validUntil))}`
      : "",
    input.kind === "invoice" && input.dueDate
      ? `<br>${escapeHtml(copy.dueDate(input.dueDate))}`
      : "",
    "</p>",
    `<p><a href="${escapeHtml(input.link)}" style="display:inline-block;background:#0F766E;color:#ffffff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600">${escapeHtml(copy.cta)}</a></p>`,
    `<p style="font-size:13px;color:#6B7280">${escapeHtml(copy.fallback)}<br>${escapeHtml(input.link)}</p>`,
    `<p style="font-size:13px;color:#6B7280">${escapeHtml(input.company)}</p>`,
    "</div>",
  ].join("");

  return {
    subject: copy.subjects[input.kind](input),
    text: lines.join("\n"),
    html,
  };
}
