import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

/**
 * PDF snapshots (guardrail 4). At issue time the rendered bytes are frozen on
 * disk and the document row keeps a reference. Re-rendering an issued invoice
 * later would silently follow the tenant's *current* logo, address or product
 * names — the snapshot is what was actually sent, so that is what is served.
 *
 * Files live outside the app directory so a deploy never overwrites them; the
 * path is configurable because Hostinger's persistent path differs per slot.
 */

const DEFAULT_DIR = "storage/documents";

/** A stored reference: `<tenantId>/<name>.pdf`, and never anything else. */
const REFERENCE_PATTERN = /^\d+\/[A-Za-z0-9._-]+\.pdf$/;

export function snapshotRoot(): string {
  return resolve(process.env.DOCUMENT_STORAGE_DIR?.trim() || DEFAULT_DIR);
}

/** Build the reference stored in `documents.pdf_snapshot`. */
export function snapshotReference(
  tenantId: number,
  documentId: number,
  number: string | null,
): string {
  const suffix = (number ?? String(documentId)).replace(/[^A-Za-z0-9-]/g, "-");
  return `${tenantId}/${documentId}-${suffix}.pdf`;
}

export async function saveSnapshot(reference: string, bytes: Buffer): Promise<void> {
  if (!REFERENCE_PATTERN.test(reference)) {
    throw new Error(`Refusing to write a snapshot at "${reference}"`);
  }

  const target = join(snapshotRoot(), reference);
  await mkdir(dirname(target), { recursive: true });
  // `wx` — a snapshot is written once. A second write would mean an issued
  // document changed, which must never happen silently.
  await writeFile(target, new Uint8Array(bytes), { flag: "wx" });
}

/**
 * Read a stored snapshot, or `null` when it is missing — an older document,
 * a restored database without the files, a failed write at issue time. The
 * caller falls back to rendering, so a missing file degrades rather than 500s.
 */
export async function readSnapshot(reference: string | null): Promise<Buffer | null> {
  if (!reference || !REFERENCE_PATTERN.test(reference)) return null;

  // Belt and braces on top of the pattern: the resolved path must still be
  // inside the root, so no reference can climb out of it.
  const root = snapshotRoot();
  const target = resolve(join(root, reference));
  if (!target.startsWith(`${root}/`)) return null;

  try {
    return await readFile(target);
  } catch {
    return null;
  }
}
