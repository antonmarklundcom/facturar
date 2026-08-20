import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { listPeriodDocuments } from "@/lib/documents/data";
import { csvDocument, csvFilename } from "@/lib/csv";
import { asuncionDateString } from "@/domain/format";
import { formatRuc } from "@/domain/ruc";
import { ivaSummaries, monthPeriod, type Period } from "@/domain/reports";

export const runtime = "nodejs";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * CSV export (PR-13). Gated on `export`, which a viewer has — reading and
 * exporting are the same right.
 *
 * The rows come from the same `listPeriodDocuments` + `domain/reports` path
 * the screen uses, so a downloaded file always matches what was on screen.
 */
export async function GET(request: Request) {
  const session = await requireRole("export");
  const url = new URL(request.url);

  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  const period: Period =
    DATE.test(from) && DATE.test(to)
      ? { from, to }
      : monthPeriod(asuncionDateString(new Date()));

  const kind = url.searchParams.get("kind") === "documentos" ? "documentos" : "iva";
  const rows = await listPeriodDocuments(session.tenantId, period);

  const csv =
    kind === "iva"
      ? csvDocument(
          [
            "moneda",
            "facturas",
            "notas_credito",
            "gravadas_10",
            "gravadas_5",
            "exentas",
            "iva_10",
            "iva_5",
            "iva_total",
            "total",
          ],
          ivaSummaries(rows).map((summary) => [
            summary.currency,
            summary.documents,
            summary.creditNotes,
            summary.gravadas10,
            summary.gravadas5,
            summary.exentas,
            summary.iva10,
            summary.iva5,
            summary.ivaTotal,
            summary.total,
          ]),
        )
      : csvDocument(
          [
            "fecha",
            "tipo",
            "numero",
            "estado",
            "cliente",
            "ruc",
            "moneda",
            "gravadas_10",
            "gravadas_5",
            "exentas",
            "iva_10",
            "iva_5",
            "total",
          ],
          rows.map((row) => [
            row.issueDate,
            row.type,
            row.number,
            row.status,
            row.customer?.name ?? "",
            formatRuc(row.customer?.rucBase, row.customer?.rucDv) ?? "",
            row.currency,
            row.subtotal10,
            row.subtotal5,
            row.subtotalExenta,
            row.iva10,
            row.iva5,
            row.total,
          ]),
        );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename(
        kind === "iva" ? "informe-iva" : "documentos",
        period,
      )}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
