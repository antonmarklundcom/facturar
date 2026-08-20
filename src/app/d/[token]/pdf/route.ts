import { NextResponse } from "next/server";
import { findDocumentByToken } from "@/lib/documents/data";
import { isPublicTokenShape } from "@/lib/documents/token";
import { pdfFilename, renderDocumentPdf } from "@/lib/pdf/render";
import { readSnapshot } from "@/lib/pdf/storage";
import { getTenant } from "@/lib/settings/tenant";

export const runtime = "nodejs";

/**
 * The buyer's PDF (decision 4 — no customer login). The token is the only
 * credential, so it is shape-checked before it reaches a query and a miss is
 * an ordinary 404: the response must not reveal whether a token exists.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!isPublicTokenShape(token)) return new NextResponse(null, { status: 404 });

  const full = await findDocumentByToken(token);
  if (!full) return new NextResponse(null, { status: 404 });

  const tenant = await getTenant(full.document.tenantId);
  if (!tenant) return new NextResponse(null, { status: 404 });

  // An issued document serves the bytes frozen at issue time (guardrail 4);
  // a quote, or a document whose snapshot file is missing, renders live.
  const body =
    (await readSnapshot(full.document.pdfSnapshot)) ??
    (await renderDocumentPdf(full, tenant));

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pdfFilename(full, full.document.type)}"`,
      "Cache-Control": "private, no-store",
      // A buyer link should never end up in a search index.
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
