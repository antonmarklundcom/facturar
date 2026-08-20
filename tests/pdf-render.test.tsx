import { inflateSync } from "node:zlib";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { createElement, type ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { DocumentPdf } from "@/lib/pdf/document-pdf";
import type { Customer, Document, DocumentLine, Tenant } from "@/db/schema";

/**
 * A real render, not a snapshot of props: the PDF is the artefact a customer
 * receives and an accountant reads, so the test asserts on text actually
 * present in the produced file.
 *
 * It also pins the reason the guaraní sign is written `Gs.` on documents —
 * the PDF standard fonts encode WinAnsi, which has no U+20B2.
 */

const tenant = {
  id: 1,
  name: "Ferretería San Blas S.A.",
  rucBase: "80012345",
  rucDv: "0",
  logoUrl: null,
  marketProfile: "py",
  defaultCurrency: "PYG",
  address: "Avda. Mcal. López 1234, Asunción",
  phone: "+595981123456",
  email: "ventas@sanblas.com.py",
  status: "demo",
  createdAt: new Date(),
  updatedAt: new Date(),
  updatedBy: null,
} as Tenant;

const customer = {
  id: 2,
  tenantId: 1,
  name: "Talleres Guaraní S.R.L.",
  rucBase: "80098765",
  rucDv: "1",
  isConsumidorFinal: false,
  whatsapp: "+595981777888",
  email: null,
  address: "Luque",
  docLocale: "es",
  notes: null,
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  updatedBy: null,
} as Customer;

const document = {
  id: 5,
  tenantId: 1,
  type: "quote",
  status: "enviado",
  number: null,
  timbradoId: null,
  customerId: 2,
  docLocale: "es",
  currency: "PYG",
  exchangeRate: null,
  issueDate: "2026-08-20",
  dueDate: null,
  validUntil: "2026-09-04",
  relatedDocumentId: null,
  publicToken: "token",
  subtotal10: 1_500_000,
  subtotal5: 210_000,
  subtotalExenta: 50_000,
  iva10: 136_364,
  iva5: 10_000,
  total: 1_760_000,
  pdfSnapshot: null,
  issuedAt: null,
  issuedBy: null,
  notes: null,
  createdBy: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  updatedBy: 1,
} as Document;

const lines = [
  {
    id: 1,
    tenantId: 1,
    documentId: 5,
    productId: null,
    description: "Chapa galvanizada N°26",
    unit: "unidad",
    qty: 10_000,
    unitAmount: 150_000,
    taxRate: "10",
    lineTotal: 1_500_000,
    lineIva: 136_364,
    position: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
] as DocumentLine[];

const labels: Record<string, string> = {
  quote: "Presupuesto",
  invoice: "Factura",
  creditNote: "Nota de crédito",
  number: "Número",
  draft: "BORRADOR",
  issueDate: "Fecha",
  validUntil: "Válido hasta",
  validityNote: "Presupuesto válido hasta el {date}.",
  dueDate: "Vencimiento",
  customer: "Cliente",
  ruc: "RUC",
  address: "Dirección",
  whatsapp: "WhatsApp",
  email: "Correo",
  description: "Detalle",
  qty: "Cant.",
  unit: "Unidad",
  unitPrice: "Precio unit.",
  taxRate: "IVA",
  lineTotal: "Total",
  exempt: "Exenta",
  subtotal10: "Gravado 10%",
  subtotal5: "Gravado 5%",
  subtotalExenta: "Exentas",
  iva10: "IVA 10%",
  iva5: "IVA 5%",
  ivaTotal: "Total IVA",
  total: "TOTAL",
  notes: "Observaciones",
  consumidorFinal: "Consumidor final",
  ivaIncludedNote: "El IVA está incluido en los importes.",
  notAnInvoice: "Este documento no es una factura.",
  page: "Página {page} de {total}",
};

/** Pull the visible text out of the first content stream of a PDF. */
function pdfText(bytes: Buffer): string {
  const start = bytes.indexOf(Buffer.from("stream"));
  const end = bytes.indexOf(Buffer.from("endstream"), start);
  const raw = bytes.subarray(start + "stream".length, end);
  const trimmed = raw.subarray(raw[0] === 0x0d ? 2 : 1);
  const content = inflateSync(trimmed).toString("latin1");

  return [...content.matchAll(/\[([\s\S]*?)\]\s*TJ/g)]
    .map((match) =>
      [...match[1].matchAll(/<([0-9a-fA-F]*)>/g)]
        .map((hex) => Buffer.from(hex[1], "hex").toString("latin1"))
        .join(""),
    )
    .join(" | ");
}

async function render(props: Partial<Parameters<typeof DocumentPdf>[0]> = {}) {
  const element = createElement(DocumentPdf, {
    tenant,
    document,
    lines,
    customer,
    labels,
    ...props,
  }) as unknown as ReactElement<DocumentProps>;

  return pdfText(await renderToBuffer(element));
}

describe("the printed document", () => {
  it("prints the company, the customer and their RUCs", async () => {
    const text = await render();

    expect(text).toContain("Ferretería San Blas S.A.");
    expect(text).toContain("80012345-0");
    expect(text).toContain("Talleres Guaraní S.R.L.");
    expect(text).toContain("80098765-1");
  });

  it("prints money as Gs. — the PDF standard fonts have no ₲ glyph", async () => {
    const text = await render();

    expect(text).toContain("Gs. 1.760.000");
    expect(text).not.toContain("₲");
  });

  it("prints the IVA contained in the total, per rate", async () => {
    const text = await render();

    expect(text).toContain("IVA 10%");
    expect(text).toContain("Gs. 136.364");
    expect(text).toContain("IVA 5%");
    expect(text).toContain("Gs. 10.000");
    expect(text).toContain("El IVA está incluido en los importes.");
  });

  it("dates it dd/mm/yyyy and states the validity", async () => {
    const text = await render();

    expect(text).toContain("20/08/2026");
    expect(text).toContain("Presupuesto válido hasta el 04/09/2026.");
    expect(text).toContain("Este documento no es una factura.");
  });

  it("marks an unnumbered document as a draft rather than printing nothing", async () => {
    const text = await render();
    expect(text).toContain("BORRADOR");
  });

  it("falls back to consumidor final when there is no customer row", async () => {
    const text = await render({ customer: null });
    expect(text).toContain("Consumidor final");
    expect(text).toContain("44444401-7");
  });

  it("prints in the document's language, not the app's", async () => {
    const text = await render({
      labels: {
        ...labels,
        quote: "Quote",
        customer: "Customer",
        validityNote: "This quote is valid until {date}.",
      },
    });

    // The heading is set in caps by the stylesheet, not by the catalogue.
    expect(text).toContain("QUOTE");
    expect(text).toContain("This quote is valid until 04/09/2026.");
    expect(text).not.toContain("Presupuesto");
  });
});
