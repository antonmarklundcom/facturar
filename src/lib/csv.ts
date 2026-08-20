/**
 * CSV export (PR-13).
 *
 * Two Paraguayan details decide the shape:
 *
 * 1. **The separator is `;`**, not a comma. Excel in an es-PY locale reads a
 *    comma-separated file as one column per row, and the file is opened in
 *    Excel roughly always.
 * 2. **Amounts are written unformatted**, as plain integers of minor units in
 *    their own column, with the currency in another. A spreadsheet should get
 *    numbers it can sum, not `₲ 1.500.000` — the presentation belongs on
 *    screen and on the PDF.
 *
 * A leading BOM makes Excel read the file as UTF-8, without which every
 * accented name arrives mangled.
 */

export const CSV_SEPARATOR = ";";
const BOM = "﻿";

/**
 * Quote a value for CSV. Also neutralises the spreadsheet-formula characters:
 * a customer named `=cmd|...` must never be executed by whoever opens the
 * export.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";

  const text = String(value);
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;

  if (/["\r\n;]/.test(guarded)) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }

  return guarded;
}

export function csvRow(cells: readonly (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(CSV_SEPARATOR);
}

/** Build a complete document, ready to be returned as a file. */
export function csvDocument(
  header: readonly string[],
  rows: readonly (readonly (string | number | null | undefined)[])[],
): string {
  // CRLF: what Excel expects, and harmless everywhere else.
  return BOM + [csvRow(header), ...rows.map(csvRow)].join("\r\n") + "\r\n";
}

/** `informe-iva-2026-08.csv` — a filename that sorts and files itself. */
export function csvFilename(kind: string, period: { from: string; to: string }): string {
  const suffix = period.from.slice(0, 7) === period.to.slice(0, 7)
    ? period.from.slice(0, 7)
    : `${period.from}_${period.to}`;

  return `${kind}-${suffix}.csv`;
}
