import { describe, expect, it } from "vitest";
import {
  MAX_SEQUENCE,
  NumberingError,
  documentNumberSortKey,
  formatDocumentNumber,
  formatPoint,
  parseDocumentNumber,
  previewNextNumber,
} from "@/domain/numbering";
import type { TimbradoSnapshot } from "@/domain/timbrado";

const timbrado: TimbradoSnapshot = {
  number: "12345678",
  validFrom: "2026-01-01",
  validTo: "2026-12-31",
  establishment: "001",
  expeditionPoint: "001",
  rangeStart: 1,
  rangeEnd: 1000,
  nextSequence: 123,
  active: true,
};

describe("formatPoint", () => {
  it.each([
    ["1", "001"],
    ["01", "001"],
    ["001", "001"],
    [1, "001"],
    [42, "042"],
    ["999", "999"],
  ])("pads %s to %s", (input, expected) => {
    expect(formatPoint(input)).toBe(expected);
  });

  it("refuses a point longer than three digits", () => {
    expect(() => formatPoint("1234")).toThrow(NumberingError);
  });

  it("refuses a point with no digits", () => {
    expect(() => formatPoint("")).toThrow(NumberingError);
    expect(() => formatPoint("abc")).toThrow(NumberingError);
  });
});

describe("formatDocumentNumber", () => {
  it("builds the legal format", () => {
    expect(formatDocumentNumber("001", "001", 123)).toBe("001-001-0000123");
  });

  it.each([
    [1, "001-001-0000001"],
    [9, "001-001-0000009"],
    [1000, "001-001-0001000"],
    [9_999_999, "001-001-9999999"],
  ])("zero-pads sequence %s to %s", (sequence, expected) => {
    expect(formatDocumentNumber("001", "001", sequence)).toBe(expected);
  });

  it("pads the establishment and expedition point too", () => {
    expect(formatDocumentNumber(2, 7, 5)).toBe("002-007-0000005");
  });

  it("refuses a sequence below 1 — correlatives start at 1", () => {
    expect(() => formatDocumentNumber("001", "001", 0)).toThrow(NumberingError);
    expect(() => formatDocumentNumber("001", "001", -1)).toThrow(NumberingError);
  });

  it("refuses a fractional sequence", () => {
    expect(() => formatDocumentNumber("001", "001", 1.5)).toThrow(NumberingError);
  });

  it("refuses a sequence past seven digits", () => {
    expect(formatDocumentNumber("001", "001", MAX_SEQUENCE)).toBe("001-001-9999999");
    expect(() => formatDocumentNumber("001", "001", MAX_SEQUENCE + 1)).toThrow(
      NumberingError,
    );
  });
});

describe("parseDocumentNumber", () => {
  it("reads a number back into its parts", () => {
    expect(parseDocumentNumber("001-001-0000123")).toEqual({
      establishment: "001",
      expeditionPoint: "001",
      sequence: 123,
    });
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseDocumentNumber("  002-007-0000005  ")?.sequence).toBe(5);
  });

  it.each([
    "1-1-1",
    "001-001-123",
    "001-0001-0000123",
    "0001-001-0000123",
    "001-001-00001234",
    "001-001-0000000",
    "abc",
    "",
  ])("rejects %s", (input) => {
    expect(parseDocumentNumber(input)).toBeNull();
  });

  it("round-trips every formatted number", () => {
    for (const sequence of [1, 2, 99, 1000, 123_456, MAX_SEQUENCE]) {
      const formatted = formatDocumentNumber("003", "012", sequence);
      expect(parseDocumentNumber(formatted)).toEqual({
        establishment: "003",
        expeditionPoint: "012",
        sequence,
      });
    }
  });
});

describe("previewNextNumber", () => {
  it("shows what the next number would be without consuming it", () => {
    expect(previewNextNumber(timbrado, "2026-06-01")).toBe("001-001-0000123");
    // Calling it twice gives the same answer — nothing was consumed.
    expect(previewNextNumber(timbrado, "2026-06-01")).toBe("001-001-0000123");
    expect(timbrado.nextSequence).toBe(123);
  });

  it("refuses to preview against an expired timbrado (guardrail 6)", () => {
    expect(() => previewNextNumber(timbrado, "2027-06-01")).toThrow(NumberingError);
  });

  it("carries the blockers on the error so the UI can explain why", () => {
    try {
      previewNextNumber({ ...timbrado, active: false }, "2027-06-01");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(NumberingError);
      expect((error as NumberingError).blockers).toEqual(
        expect.arrayContaining(["inactive", "expired"]),
      );
    }
  });

  it("refuses when the range is exhausted", () => {
    expect(() =>
      previewNextNumber({ ...timbrado, nextSequence: 1001 }, "2026-06-01"),
    ).toThrow(NumberingError);
  });
});

describe("documentNumberSortKey", () => {
  it("orders by establishment, then point, then sequence", () => {
    const numbers = [
      "002-001-0000001",
      "001-002-0000001",
      "001-001-0000010",
      "001-001-0000002",
    ];

    const sorted = [...numbers].sort(
      (a, b) => documentNumberSortKey(a)! - documentNumberSortKey(b)!,
    );

    expect(sorted).toEqual([
      "001-001-0000002",
      "001-001-0000010",
      "001-002-0000001",
      "002-001-0000001",
    ]);
  });

  it("returns null for something that is not a document number", () => {
    expect(documentNumberSortKey("not-a-number")).toBeNull();
  });

  it("agrees with string ordering within one establishment and point", () => {
    // Zero-padding means lexical order already matches; the key must not
    // disagree with it.
    const numbers = Array.from({ length: 50 }, (_, i) =>
      formatDocumentNumber("001", "001", i + 1),
    );
    const byKey = [...numbers].sort(
      (a, b) => documentNumberSortKey(a)! - documentNumberSortKey(b)!,
    );
    expect(byKey).toEqual([...numbers].sort());
  });
});
