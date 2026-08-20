import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/guards";
import { findDocument } from "@/lib/documents/data";
import { pdfFilename, renderDocumentPdf } from "@/lib/pdf/render";
import { readSnapshot } from "@/lib/pdf/storage";
import { getTenant } from "@/lib/settings/tenant";

export const runtime = "nodejs";

/**
 * The staff-facing invoice PDF.
 *
 * An issued invoice serves its **snapshot** — the bytes frozen at issue time
 * (guardrail 4). Re-rendering it would quietly follow the tenant's current
 * logo, address or wording, and that is not the document the customer was
 * given. A draft has no snapshot and renders live.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession();
  const { id } = await params;

  const documentId = Number(id);
  if (!Number.isInteger(documentId) || documentId <= 0) {
    return new NextResponse(null, { status: 404 });
  }

  const [full, tenant] = await Promise.all([
    findDocument(session.tenantId, documentId),
    getTenant(session.tenantId),
  ]);

  if (!full || !tenant) return new NextResponse(null, { status: 404 });

  // A missing snapshot file — an older document, a restored database — falls
  // back to rendering rather than failing the download.
  const body =
    (await readSnapshot(full.document.pdfSnapshot)) ??
    (await renderDocumentPdf(full, tenant));

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pdfFilename(full, full.document.type)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
