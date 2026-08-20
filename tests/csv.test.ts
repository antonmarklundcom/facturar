import { describe, expect, it } from "vitest";
import { CSV_SEPARATOR, csvCell, csvDocument, csvFilename, csvRow } from "@/lib/csv";

describe("csvCell", () => {
  it("passes ordinary values through", () => {
    expect(csvCell("Ferretería San Blas")).toBe("Ferretería San Blas");
    expect(csvCell(1_500_000)).toBe("1500000");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("quotes anything containing the separator, a quote or a newline", () => {
    expect(csvCell("San Blas; Luque")).toBe('"San Blas; Luque"');
    expect(csvCell('El "Rey" S.A.')).toBe('"El ""Rey"" S.A."');
    expect(csvCell("línea 1\nlínea 2")).toBe('"línea 1\nlínea 2"');
  });

  it("neutralises a spreadsheet formula — an export must never execute", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("+41 masajes")).toBe("'+41 masajes");
    expect(csvCell("-x")).toBe("'-x");
    expect(csvCell("@import")).toBe("'@import");
    expect(csvCell('=cmd|"/c calc"!A1')).toBe('"\'=cmd|""/c calc""!A1"');
  });
});

describe("csvRow", () => {
  it("joins with a semicolon — es-PY Excel does not split on commas", () => {
    expect(CSV_SEPARATOR).toBe(";");
    expect(csvRow(["001-001-0000123", "Talleres Guaraní", 1_100_000, "PYG"])).toBe(
      "001-001-0000123;Talleres Guaraní;1100000;PYG",
    );
  });
});

describe("csvDocument", () => {
  it("starts with a BOM so Excel reads it as UTF-8", () => {
    const csv = csvDocument(["numero"], [["001-001-0000001"]]);
    expect(csv.startsWith("﻿")).toBe(true);
  });

  it("uses CRLF line endings and ends with one", () => {
    const csv = csvDocument(["a", "b"], [["1", "2"], ["3", "4"]]);
    expect(csv).toBe("﻿a;b\r\n1;2\r\n3;4\r\n");
  });

  it("writes amounts as plain integers a spreadsheet can sum", () => {
    const csv = csvDocument(["total", "moneda"], [[1_500_000, "PYG"]]);
    expect(csv).toContain("1500000;PYG");
    expect(csv).not.toContain("₲");
    expect(csv).not.toContain("1.500.000");
  });

  it("survives a header with no rows", () => {
    expect(csvDocument(["a"], [])).toBe("﻿a\r\n");
  });
});

describe("csvFilename", () => {
  it("names a single-month export by its month", () => {
    expect(csvFilename("informe-iva", { from: "2026-08-01", to: "2026-08-31" })).toBe(
      "informe-iva-2026-08.csv",
    );
  });

  it("names a longer range by both ends", () => {
    expect(csvFilename("ventas", { from: "2026-01-01", to: "2026-12-31" })).toBe(
      "ventas-2026-01-01_2026-12-31.csv",
    );
  });
});
