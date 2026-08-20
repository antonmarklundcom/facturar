import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("../src", import.meta.url));

function sourceFiles(directory = SRC, prefix = ""): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) return sourceFiles(`${directory}/${entry.name}`, relative);
      return entry.name.endsWith(".tsx") ? [relative] : [];
    })
    .sort();
}

/**
 * Guardrail 5 — no hardcoded user-facing strings.
 *
 * A grep gate, not a parser: it looks for text sitting directly between JSX
 * tags. That catches the mistake this rule is actually about (typing a label
 * instead of calling `t()`), without pretending to understand TypeScript.
 *
 * Symbols, separators and single letters are allowed — an em dash between two
 * translated values is not a string anyone translates.
 */
const ALLOWED = new Set(["—", "·", "/", "|", ":", "-", "%", "×", "→"]);

/** Files that legitimately contain literal text, with a reason each. */
const ALLOWLIST: Record<string, string> = {
  "lib/pdf/document-pdf.tsx":
    "The PDF is built from a resolved label dictionary rather than a hook, " +
    "because a @react-pdf tree renders outside React's request context. Its " +
    "only literals are `{labels.x}` interpolations and symbols.",
};

function jsxTextNodes(source: string): string[] {
  // Drop comments and template literals so a URL or a class name inside one
  // is not mistaken for visible text.
  const cleaned = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/`[^`]*`/g, "``");

  const nodes: string[] = [];
  for (const match of cleaned.matchAll(/>([^<>{}\n]+)</g)) {
    const text = match[1].trim();
    if (text === "" || ALLOWED.has(text)) continue;
    // Two or more letters in a row is a word; "e.g. 12 / 30" is not.
    if (!/\p{L}{2,}/u.test(text)) continue;
    nodes.push(text);
  }

  return nodes;
}

describe("guardrail 5 — every user-facing string comes from a catalogue", () => {
  it("has no literal text between JSX tags", () => {
    const offenders: string[] = [];

    for (const relative of sourceFiles()) {
      if (relative in ALLOWLIST) continue;
      const found = jsxTextNodes(readFileSync(`${SRC}/${relative}`, "utf8"));
      for (const text of found) offenders.push(`${relative}: ${text}`);
    }

    expect(offenders, "hardcoded user-facing text").toEqual([]);
  });

  it("keeps the allowlist honest — every entry exists and has a reason", () => {
    const files = sourceFiles();
    for (const [file, reason] of Object.entries(ALLOWLIST)) {
      expect(files, `${file} no longer exists`).toContain(file);
      expect(reason.length, `${file} has no reason`).toBeGreaterThan(40);
    }
  });
});
