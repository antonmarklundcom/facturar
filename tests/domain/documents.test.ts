import { describe, expect, it } from "vitest";
import {
  DEFAULT_VALIDITY_DAYS,
  INVOICE_STATUSES,
  QUOTE_STATUSES,
  canTransition,
  daysOfValidityLeft,
  effectiveQuoteStatus,
  isConvertible,
  isCreditNote,
  isInvoice,
  isQuote,
  isQuoteEditable,
  isStatusAllowed,
  statusesFor,
  validUntilFrom,
} from "@/domain/documents";
import { documentStatusValues, documentTypeValues } from "@/db/schema";

describe("document types", () => {
  it("classifies every type in the schema", () => {
    for (const type of documentTypeValues) {
      const flags = [isQuote(type), isInvoice(type), isCreditNote(type)].filter(Boolean);
      expect(flags.length, `${type} matched ${flags.length} classes`).toBe(1);
    }
  });
});

describe("statuses per type (the guard the enum cannot give)", () => {
  it("keeps invoice states off a quote and quote states off an invoice", () => {
    expect(isStatusAllowed("quote", "aceptado")).toBe(true);
    expect(isStatusAllowed("quote", "pagada")).toBe(false);
    expect(isStatusAllowed("quote", "pendiente")).toBe(false);

    expect(isStatusAllowed("invoice_contado", "aceptado")).toBe(false);
    expect(isStatusAllowed("invoice_credito", "pagada")).toBe(true);
    expect(isStatusAllowed("credit_note", "anulada")).toBe(true);
  });

  it("only uses statuses that exist in the schema enum", () => {
    for (const status of [...QUOTE_STATUSES, ...INVOICE_STATUSES]) {
      expect(documentStatusValues).toContain(status);
    }
  });

  it("covers every schema status between the two sets", () => {
    const covered = new Set([...QUOTE_STATUSES, ...INVOICE_STATUSES]);
    expect([...documentStatusValues].filter((status) => !covered.has(status))).toEqual([]);
  });

  it("gives every document type a status list", () => {
    for (const type of documentTypeValues) {
      expect(statusesFor(type).length).toBeGreaterThan(0);
    }
  });
});

describe("canTransition", () => {
  it("walks a quote through its life", () => {
    expect(canTransition("quote", "borrador", "enviado")).toBe(true);
    expect(canTransition("quote", "enviado", "aceptado")).toBe(true);
    expect(canTransition("quote", "enviado", "rechazado")).toBe(true);
    expect(canTransition("quote", "vencido", "enviado")).toBe(true);
  });

  it("treats acceptance and rejection as terminal", () => {
    for (const to of QUOTE_STATUSES) {
      expect(canTransition("quote", "aceptado", to), `aceptado → ${to}`).toBe(false);
      expect(canTransition("quote", "rechazado", to), `rechazado → ${to}`).toBe(false);
    }
  });

  it("refuses a no-op transition", () => {
    expect(canTransition("quote", "enviado", "enviado")).toBe(false);
  });

  it("refuses an invoice state on a quote, whichever direction", () => {
    expect(canTransition("quote", "borrador", "pagada")).toBe(false);
    expect(canTransition("quote", "pendiente", "enviado")).toBe(false);
  });

  it("moves an invoice only from draft to outstanding — issuing", () => {
    // The rest of an invoice's life is derived from payments and credit notes
    // (PR-11), never typed in by a person.
    expect(canTransition("invoice_contado", "borrador", "pendiente")).toBe(true);
    expect(canTransition("invoice_contado", "pendiente", "pagada")).toBe(false);
    expect(canTransition("invoice_contado", "pendiente", "borrador")).toBe(false);
  });
});

describe("isQuoteEditable", () => {
  it("allows editing until the customer has decided", () => {
    expect(isQuoteEditable("borrador")).toBe(true);
    expect(isQuoteEditable("enviado")).toBe(true);
    expect(isQuoteEditable("vencido")).toBe(true);
    expect(isQuoteEditable("aceptado")).toBe(false);
    expect(isQuoteEditable("rechazado")).toBe(false);
  });
});

describe("isConvertible", () => {
  it("converts an accepted quote exactly once", () => {
    expect(isConvertible("quote", "aceptado", false)).toBe(true);
    expect(isConvertible("quote", "aceptado", true)).toBe(false);
  });

  it("refuses a quote the customer has not accepted", () => {
    for (const status of ["borrador", "enviado", "rechazado", "vencido"] as const) {
      expect(isConvertible("quote", status, false), status).toBe(false);
    }
  });

  it("refuses to convert something that is not a quote", () => {
    expect(isConvertible("invoice_contado", "aceptado", false)).toBe(false);
  });
});

describe("validUntilFrom", () => {
  it("adds whole days", () => {
    expect(validUntilFrom("2026-08-20", 15)).toBe("2026-09-04");
    expect(validUntilFrom("2026-08-20", 0)).toBe("2026-08-20");
  });

  it("crosses month and year boundaries", () => {
    expect(validUntilFrom("2026-12-28", 10)).toBe("2027-01-07");
    // 2028 is a leap year.
    expect(validUntilFrom("2028-02-27", 3)).toBe("2028-03-01");
  });

  it("refuses a negative or fractional window", () => {
    expect(() => validUntilFrom("2026-08-20", -1)).toThrow();
    expect(() => validUntilFrom("2026-08-20", 1.5)).toThrow();
    expect(() => validUntilFrom("20/08/2026", 5)).toThrow();
  });

  it("offers a sensible default", () => {
    expect(DEFAULT_VALIDITY_DAYS).toBeGreaterThan(0);
    expect(DEFAULT_VALIDITY_DAYS).toBeLessThanOrEqual(30);
  });
});

describe("daysOfValidityLeft", () => {
  it("counts the last valid day as zero, not as expired", () => {
    expect(daysOfValidityLeft("2026-09-04", "2026-09-04")).toBe(0);
    expect(daysOfValidityLeft("2026-09-04", "2026-09-03")).toBe(1);
    expect(daysOfValidityLeft("2026-09-04", "2026-09-05")).toBe(-1);
  });
});

describe("effectiveQuoteStatus", () => {
  it("expires a quote that is still waiting for an answer", () => {
    expect(effectiveQuoteStatus("enviado", "2026-08-19", "2026-08-20")).toBe("vencido");
    expect(effectiveQuoteStatus("borrador", "2026-08-19", "2026-08-20")).toBe("vencido");
  });

  it("does not expire it on its last valid day", () => {
    expect(effectiveQuoteStatus("enviado", "2026-08-20", "2026-08-20")).toBe("enviado");
  });

  it("never overrides a decision the customer already made", () => {
    expect(effectiveQuoteStatus("aceptado", "2026-08-19", "2026-08-20")).toBe("aceptado");
    expect(effectiveQuoteStatus("rechazado", "2026-08-19", "2026-08-20")).toBe("rechazado");
  });

  it("leaves a quote with no validity date alone", () => {
    expect(effectiveQuoteStatus("enviado", null, "2026-08-20")).toBe("enviado");
  });
});
