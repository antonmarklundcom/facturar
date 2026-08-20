import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("../src", import.meta.url));

function sourceFiles(directory = SRC, prefix = ""): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) return sourceFiles(`${directory}/${entry.name}`, relative);
      return /\.tsx?$/.test(entry.name) ? [relative] : [];
    })
    .sort();
}

const read = (relative: string) => readFileSync(`${SRC}/${relative}`, "utf8");

/**
 * Guardrail 4 — issued documents are immutable. The domain answers "may this
 * change?", but the answer only holds if every write goes through it, so this
 * checks the shape of the code as well as its logic.
 */
describe("guardrail 4 — issued documents are never rewritten", () => {
  it("keeps every write to `documents` in one module", () => {
    const writers = sourceFiles().filter((relative) => {
      const source = read(relative);
      return /\b(update|delete)\s*\(\s*documents\s*\)/.test(source);
    });

    expect(writers).toEqual(["lib/documents/data.ts"]);
  });

  it("guards the draft-invoice rewrite with number IS NULL and issued_at IS NULL", () => {
    const source = read("lib/documents/data.ts");
    const body = source.slice(source.indexOf("export async function replaceDraftInvoice"));
    const clause = body.slice(0, body.indexOf("ImmutableDocumentError"));

    expect(clause).toContain("isNull(documents.number)");
    expect(clause).toContain("isNull(documents.issuedAt)");
  });

  it("refuses to allocate a number for a document that already has one", () => {
    const source = read("lib/documents/data.ts");
    const body = source.slice(source.indexOf("export async function issueInvoice"));

    // The row is locked before the check, so two clicks cannot both pass it.
    expect(body).toContain('.for("update")');
    expect(body).toContain("isIssued(document)");
    expect(body).toContain("ImmutableDocumentError");
  });

  it("never deletes a document row anywhere", () => {
    const deleters = sourceFiles().filter((relative) =>
      /\bdelete\s*\(\s*documents\s*\)/.test(read(relative)),
    );

    expect(deleters).toEqual([]);
  });

  it("only ever writes a document number from the PR-4 generator", () => {
    const settingNumber = sourceFiles().filter((relative) =>
      /\bnumber:\s*allocated\.number/.test(read(relative)),
    );

    expect(settingNumber).toEqual(["lib/documents/data.ts"]);

    // And nothing builds a number by hand on its way into a document
    // (guardrail 6). Formatting one for display is fine and is listed here.
    const DISPLAY_ONLY: Record<string, string> = {
      "domain/numbering.ts": "The formatter itself.",
      "domain/numbering.server.ts": "The allocator, inside its row lock.",
      "domain/market/index.ts": "The market profile exposes the formatter.",
      "app/admin/ajustes/timbrados/page.tsx":
        "Shows the next number a timbrado would hand out; writes nothing.",
    };

    const adHoc = sourceFiles().filter(
      (relative) =>
        !(relative in DISPLAY_ONLY) && /formatDocumentNumber\s*\(/.test(read(relative)),
    );

    expect(adHoc).toEqual([]);
  });

  it("writes the PDF snapshot once, and only while it is empty", () => {
    const source = read("lib/documents/data.ts");
    const body = source.slice(source.indexOf("export async function setPdfSnapshot"));

    expect(body).toContain("isNull(documents.pdfSnapshot)");
    expect(read("lib/pdf/storage.ts")).toContain('flag: "wx"');
  });
});
