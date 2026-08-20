import "server-only";

import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { createElement, type ReactElement } from "react";
import type { Tenant } from "@/db/schema";
import type { FullDocument } from "@/lib/documents/data";
import { DocumentPdf } from "./document-pdf";
import { pdfLabels } from "./labels";

/**
 * Render a document to PDF bytes. Kept apart from the component so the
 * component stays a pure view and this file owns the side effects — label
 * resolution and the logo fetch.
 */

const LOGO_TIMEOUT_MS = 3_000;
const LOGO_MAX_BYTES = 1_000_000;
const LOGO_TYPES = ["image/png", "image/jpeg"];

/**
 * Fetch the tenant logo as a data URI. `@react-pdf/renderer` would fetch a
 * remote URL itself, but a slow or broken logo host would then take the whole
 * PDF down; here a failure just means no logo.
 */
export async function fetchLogoDataUri(logoUrl: string | null): Promise<string | null> {
  if (!logoUrl || !/^https?:\/\//i.test(logoUrl)) return null;

  try {
    const response = await fetch(logoUrl, {
      signal: AbortSignal.timeout(LOGO_TIMEOUT_MS),
      cache: "force-cache",
    });
    if (!response.ok) return null;

    const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!LOGO_TYPES.includes(contentType)) return null;

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > LOGO_MAX_BYTES) return null;

    return `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;
  } catch {
    // A logo is decoration. Never let it fail a document.
    return null;
  }
}

export async function renderDocumentPdf(
  full: FullDocument,
  tenant: Tenant,
): Promise<Buffer> {
  const [labels, logoDataUri] = await Promise.all([
    pdfLabels(full.document.docLocale),
    fetchLogoDataUri(tenant.logoUrl),
  ]);

  // `renderToBuffer` is typed to take the library's own <Document> element.
  // `DocumentPdf` returns exactly that, but the component's own prop type is
  // what TypeScript sees at the call site, so the shape is restated here.
  const element = createElement(DocumentPdf, {
    tenant,
    document: full.document,
    lines: full.lines,
    customer: full.customer,
    labels,
    logoDataUri,
  }) as unknown as ReactElement<DocumentProps>;

  return renderToBuffer(element);
}

/** `presupuesto-2026-08-20-Talleres-Guarani.pdf` — a filename a human can file. */
export function pdfFilename(full: FullDocument, kind: string): string {
  const parts = [
    kind,
    full.document.number ?? full.document.issueDate ?? String(full.document.id),
    full.customer?.name ?? "",
  ];

  const slug = parts
    .join("-")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return `${slug || "documento"}.pdf`;
}
