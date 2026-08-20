import { describe, expect, it } from "vitest";
import {
  DEFAULT_CREDIT_DAYS,
  canTransition,
  daysUntilDue,
  dueDateFrom,
  isDocumentEditable,
  isIssuable,
  isIssued,
  isOverdue,
  requiresDueDate,
} from "@/domain/documents";

const draft = {
  type: "invoice_contado",
  status: "borrador",
  number: null,
  issuedAt: null,
} as const;

const issued = {
  type: "invoice_contado",
  status: "pendiente",
  number: "001-001-0000123",
  issuedAt: new Date("2026-08-20T12:00:00Z"),
} as const;

describe("isIssued", () => {
  it("counts a document with a number or an issue timestamp as issued", () => {
    expect(isIssued(draft)).toBe(false);
    expect(isIssued(issued)).toBe(true);
    expect(isIssued({ number: "001-001-0000001", issuedAt: null })).toBe(true);
    expect(isIssued({ number: null, issuedAt: new Date() })).toBe(true);
  });
});

describe("isDocumentEditable — guardrail 4", () => {
  it("lets a draft invoice be edited", () => {
    expect(isDocumentEditable(draft)).toBe(true);
  });

  it("never lets an issued invoice be edited", () => {
    expect(isDocumentEditable(issued)).toBe(false);
  });

  it("refuses even a document whose status was somehow left at borrador", () => {
    // The defence that matters: a bad status write must not reopen an issued
    // document for editing.
    expect(
      isDocumentEditable({
        type: "invoice_credito",
        status: "borrador",
        number: "001-001-0000123",
        issuedAt: null,
      }),
    ).toBe(false);
  });

  it("refuses a credit note that has been issued", () => {
    expect(
      isDocumentEditable({
        type: "credit_note",
        status: "pendiente",
        number: "001-001-0000009",
        issuedAt: new Date(),
      }),
    ).toBe(false);
  });

  it("still uses the quote rules for a quote", () => {
    expect(
      isDocumentEditable({ type: "quote", status: "enviado", number: null, issuedAt: null }),
    ).toBe(true);
    expect(
      isDocumentEditable({ type: "quote", status: "aceptado", number: null, issuedAt: null }),
    ).toBe(false);
  });
});

describe("isIssuable", () => {
  it("issues a draft exactly once", () => {
    expect(isIssuable(draft)).toBe(true);
    expect(isIssuable(issued)).toBe(false);
  });

  it("never issues a quote", () => {
    expect(
      isIssuable({ type: "quote", status: "borrador", number: null, issuedAt: null }),
    ).toBe(false);
  });

  it("never issues a document already past draft", () => {
    expect(
      isIssuable({
        type: "invoice_contado",
        status: "pagada",
        number: null,
        issuedAt: null,
      }),
    ).toBe(false);
  });
});

describe("invoice transitions", () => {
  it("moves a draft to pendiente, which is what issuing does", () => {
    expect(canTransition("invoice_contado", "borrador", "pendiente")).toBe(true);
  });

  it("leaves payment states to PR-11 rather than letting a person type them", () => {
    expect(canTransition("invoice_contado", "pendiente", "pagada")).toBe(false);
    expect(canTransition("invoice_credito", "pendiente", "anulada")).toBe(false);
  });

  it("never rewinds an issued invoice to a draft", () => {
    expect(canTransition("invoice_contado", "pendiente", "borrador")).toBe(false);
  });

  it("keeps quote states off an invoice", () => {
    expect(canTransition("invoice_contado", "borrador", "aceptado")).toBe(false);
  });
});

describe("credit terms", () => {
  it("only a factura a crédito has a due date", () => {
    expect(requiresDueDate("invoice_credito")).toBe(true);
    expect(requiresDueDate("invoice_contado")).toBe(false);
    expect(requiresDueDate("quote")).toBe(false);
  });

  it("derives the due date from the issue date", () => {
    expect(dueDateFrom("2026-08-20", 30)).toBe("2026-09-19");
    expect(dueDateFrom("2026-12-15", 45)).toBe("2027-01-29");
  });

  it("offers a sensible default", () => {
    expect(DEFAULT_CREDIT_DAYS).toBe(30);
  });

  it("counts the due day itself as still in time", () => {
    expect(daysUntilDue("2026-09-19", "2026-09-19")).toBe(0);
    expect(daysUntilDue("2026-09-19", "2026-09-20")).toBe(-1);
  });
});

describe("isOverdue", () => {
  it("marks an unpaid invoice overdue the day after it falls due", () => {
    expect(isOverdue("pendiente", "2026-09-19", "2026-09-19")).toBe(false);
    expect(isOverdue("pendiente", "2026-09-19", "2026-09-20")).toBe(true);
    expect(isOverdue("parcial", "2026-09-19", "2026-09-20")).toBe(true);
  });

  it("never marks a paid or voided invoice overdue", () => {
    expect(isOverdue("pagada", "2026-09-19", "2027-01-01")).toBe(false);
    expect(isOverdue("anulada", "2026-09-19", "2027-01-01")).toBe(false);
  });

  it("says nothing about a contado invoice with no due date", () => {
    expect(isOverdue("pendiente", null, "2027-01-01")).toBe(false);
  });
});
