import { describe, expect, it } from "vitest";
import {
  emailKindFor,
  renderDocumentEmail,
  type EmailInput,
} from "@/lib/email/templates";

const base: EmailInput = {
  locale: "es",
  kind: "quote",
  company: "Ferretería San Blas S.A.",
  customerName: "Talleres Guaraní S.R.L.",
  total: "₲ 1.760.000",
  link: "https://facturar.clientes.com.py/d/abc123",
  number: null,
  validUntil: "04/09/2026",
};

describe("emailKindFor", () => {
  it("maps every document type to a template", () => {
    expect(emailKindFor("quote")).toBe("quote");
    expect(emailKindFor("invoice_contado")).toBe("invoice");
    expect(emailKindFor("invoice_credito")).toBe("invoice");
    expect(emailKindFor("credit_note")).toBe("credit_note");
  });
});

describe("renderDocumentEmail", () => {
  it("writes a quote in Spanish", () => {
    const email = renderDocumentEmail(base);

    expect(email.subject).toBe("Presupuesto de Ferretería San Blas S.A.");
    expect(email.text).toContain("Hola Talleres Guaraní S.R.L.");
    expect(email.text).toContain("₲ 1.760.000");
    expect(email.text).toContain("válido hasta el 04/09/2026");
    expect(email.text).toContain(base.link);
  });

  it("writes the same quote in English when the document is in English", () => {
    const email = renderDocumentEmail({ ...base, locale: "en" });

    expect(email.subject).toBe("Quote from Ferretería San Blas S.A.");
    expect(email.text).toContain("Hello Talleres Guaraní S.R.L.");
    expect(email.text).toContain("valid until 04/09/2026");
    expect(email.text).not.toContain("Hola");
  });

  it("puts an invoice number in the subject once it has one", () => {
    const email = renderDocumentEmail({
      ...base,
      kind: "invoice",
      number: "001-001-0000123",
      validUntil: null,
      dueDate: "19/09/2026",
    });

    expect(email.subject).toBe("Factura 001-001-0000123 de Ferretería San Blas S.A.");
    expect(email.text).toContain("El vencimiento es el 19/09/2026.");
  });

  it("falls back to a subject without a number when there is none", () => {
    const email = renderDocumentEmail({ ...base, kind: "invoice", number: null });
    expect(email.subject).toBe("Factura de Ferretería San Blas S.A.");
  });

  it("says nothing about a due date a document does not have", () => {
    const email = renderDocumentEmail({ ...base, kind: "invoice", dueDate: null });
    expect(email.text).not.toContain("vencimiento");
  });

  it("has the same wording in the text and the HTML part", () => {
    const email = renderDocumentEmail(base);
    expect(email.html).toContain("Hola Talleres Guaraní S.R.L.");
    expect(email.html).toContain("₲ 1.760.000");
    expect(email.html).toContain(base.link);
  });

  it("escapes a customer name that contains markup", () => {
    const email = renderDocumentEmail({
      ...base,
      customerName: '<script>alert("x")</script> & Cía.',
    });

    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).toContain("&amp; Cía.");
    // The plain-text part is not markup, so it stays as typed.
    expect(email.text).toContain('<script>alert("x")</script> & Cía.');
  });

  it("always carries the link in a form that survives a broken button", () => {
    const email = renderDocumentEmail(base);
    const occurrences = email.html.split(base.link).length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it("writes a credit note with its own wording", () => {
    const es = renderDocumentEmail({ ...base, kind: "credit_note", number: "001-001-0000009" });
    const en = renderDocumentEmail({
      ...base,
      kind: "credit_note",
      locale: "en",
      number: "001-001-0000009",
    });

    expect(es.subject).toContain("Nota de crédito 001-001-0000009");
    expect(en.subject).toContain("Credit note 001-001-0000009");
  });
});
