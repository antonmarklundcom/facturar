import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/guards";
import { findDocument } from "@/lib/documents/data";
import { pdfFilename, renderDocumentPdf } from "@/lib/pdf/render";
import { getTenant } from "@/lib/settings/tenant";

/** `@react-pdf/renderer` needs Node APIs — never the edge runtime. */
export const runtime = "nodejs";

/**
 * The staff-facing PDF. Same renderer as the buyer's copy, behind the session
 * so a draft is not readable by URL guessing before it is sent.
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

  const body = await renderDocumentPdf(full, tenant);

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pdfFilename(full, full.document.type)}"`,
      // A draft changes as it is edited; never let a proxy hold on to it.
      "Cache-Control": "private, no-store",
    },
  });
}
