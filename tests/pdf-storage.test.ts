import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  readSnapshot,
  saveSnapshot,
  snapshotReference,
  snapshotRoot,
} from "@/lib/pdf/storage";

/**
 * The snapshot store is the mechanical half of guardrail 4: what a customer
 * was given must still be what they are shown a year later.
 */

let root: string;
const original = process.env.DOCUMENT_STORAGE_DIR;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "facturar-snapshots-"));
  process.env.DOCUMENT_STORAGE_DIR = root;
});

afterEach(() => {
  if (original === undefined) delete process.env.DOCUMENT_STORAGE_DIR;
  else process.env.DOCUMENT_STORAGE_DIR = original;
});

describe("snapshotReference", () => {
  it("files a document under its tenant, named by its number", () => {
    expect(snapshotReference(3, 42, "001-001-0000123")).toBe("3/42-001-001-0000123.pdf");
  });

  it("falls back to the id when there is no number yet", () => {
    expect(snapshotReference(3, 42, null)).toBe("3/42-42.pdf");
  });

  it("strips anything that could escape the directory", () => {
    const reference = snapshotReference(3, 42, "../../etc/passwd");
    expect(reference.startsWith("3/42-")).toBe(true);
    expect(reference).not.toContain("/etc");
    expect(reference).not.toContain("..");
  });
});

describe("saveSnapshot", () => {
  it("writes the bytes where the reference says", async () => {
    const reference = snapshotReference(1, 5, "001-001-0000001");
    await saveSnapshot(reference, Buffer.from("%PDF-1.7 fake"));

    const written = await readFile(join(snapshotRoot(), reference));
    expect(written.toString()).toBe("%PDF-1.7 fake");
  });

  it("refuses to overwrite — an issued document never changes", async () => {
    const reference = snapshotReference(1, 5, "001-001-0000001");
    await saveSnapshot(reference, Buffer.from("original"));

    await expect(saveSnapshot(reference, Buffer.from("tampered"))).rejects.toThrow();

    const written = await readFile(join(snapshotRoot(), reference));
    expect(written.toString()).toBe("original");
  });

  it("refuses a reference that is not the shape it writes", async () => {
    for (const reference of [
      "../escape.pdf",
      "1/../../escape.pdf",
      "1/note.txt",
      "no-tenant.pdf",
      "1/sub/dir.pdf",
    ]) {
      await expect(saveSnapshot(reference, Buffer.from("x")), reference).rejects.toThrow();
    }
  });
});

describe("readSnapshot", () => {
  it("returns what was written", async () => {
    const reference = snapshotReference(2, 9, "001-001-0000009");
    await saveSnapshot(reference, Buffer.from("bytes"));

    const read = await readSnapshot(reference);
    expect(read?.toString()).toBe("bytes");
  });

  it("returns null rather than throwing when the file is gone", async () => {
    expect(await readSnapshot("1/404-001-001-0000404.pdf")).toBeNull();
    expect(await readSnapshot(null)).toBeNull();
  });

  it("never reads outside its root, even for a file that exists", async () => {
    const outside = join(root, "..", "secret.pdf");
    await writeFile(outside, "secret");

    expect(await readSnapshot("../secret.pdf")).toBeNull();
    expect(await readSnapshot("1/../../secret.pdf")).toBeNull();
  });
});
