import { describe, expect, it } from "vitest";
import { INVOICE_FIELDS, creditDaysBetween, parseInvoice } from "@/lib/documents/parse";

const TODAY = "2026-08-20";

function form(header: Record<string, string>, lines: Record<string, string>[] = []): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(header)) data.append(name, value);

  for (const line of lines) {
    data.append("lineProductId", line.productId ?? "");
    data.append("lineDescription", line.description ?? "");
    data.append("lineUnit", line.unit ?? "");
    data.append("lineQty", line.qty ?? "1");
    data.append("lineUnitAmount", line.unitAmount ?? "");
    data.append("lineTaxRate", line.taxRate ?? "10");
  }

  return data;
}

const HEADER = {
  type: "invoice_contado",
  customerId: "7",
  docLocale: "es",
  currency: "PYG",
  issueDate: TODAY,
};

const LINE = { description: "Chapa galvanizada", unit: "unidad", qty: "10", unitAmount: "150.000" };

describe("parseInvoice", () => {
  it("reads a contado invoice with no due date", () => {
    const parsed = parseInvoice(form(HEADER, [LINE]), TODAY);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.values.type).toBe("invoice_contado");
    expect(parsed.values.dueDate).toBeNull();
    expect(parsed.values.lines).toHaveLength(1);
  });

  it("derives the due date of a crédito invoice from the agreed days", () => {
    const parsed = parseInvoice(
      form({ ...HEADER, type: "invoice_credito", creditDays: "45" }, [LINE]),
      TODAY,
    );

    expect(parsed.ok && parsed.values.dueDate).toBe("2026-10-04");
  });

  it("defaults a crédito invoice to 30 days", () => {
    const parsed = parseInvoice(form({ ...HEADER, type: "invoice_credito" }, [LINE]), TODAY);
    expect(parsed.ok && parsed.values.dueDate).toBe("2026-09-19");
  });

  it("ignores credit terms typed on a contado invoice", () => {
    const parsed = parseInvoice(form({ ...HEADER, creditDays: "45" }, [LINE]), TODAY);
    expect(parsed.ok && parsed.values.dueDate).toBeNull();
  });

  it("never produces a number — that comes from the generator at issue time", () => {
    const parsed = parseInvoice(form({ ...HEADER, number: "001-001-0000123" }, [LINE]), TODAY);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(Object.keys(parsed.values)).not.toContain("number");
  });

  it("rejects a document type that is not an invoice", () => {
    const parsed = parseInvoice(form({ ...HEADER, type: "quote" }, [LINE]), TODAY);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.fieldErrors.type).toBe("invalid");
  });

  it("refuses an implausible credit term", () => {
    for (const creditDays of ["0", "-10", "400", "un mes"]) {
      const parsed = parseInvoice(
        form({ ...HEADER, type: "invoice_credito", creditDays }, [LINE]),
        TODAY,
      );
      expect(parsed.ok, creditDays).toBe(false);
    }
  });

  it("still applies every line rule quotes have", () => {
    expect(parseInvoice(form(HEADER, []), TODAY)).toEqual({
      ok: false,
      fieldErrors: { lines: "required" },
    });

    const badLine = parseInvoice(form(HEADER, [{ ...LINE, qty: "0" }]), TODAY);
    expect(badLine.ok).toBe(false);
    if (badLine.ok) return;
    expect(badLine.fieldErrors["lines.0.qty"]).toBe("positive");
  });

  it("reports header and line problems together, so the form is fixed in one pass", () => {
    const parsed = parseInvoice(
      form({ ...HEADER, type: "", customerId: "" }, [{ ...LINE, description: "" }]),
      TODAY,
    );

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.fieldErrors).toMatchObject({
      type: "invalid",
      customerId: "required",
      "lines.0.description": "required",
    });
  });

  it("echoes exactly the fields the form submits", () => {
    expect([...INVOICE_FIELDS]).toEqual([
      "type",
      "customerId",
      "docLocale",
      "currency",
      "issueDate",
      "creditDays",
      "notes",
    ]);
  });
});

describe("creditDaysBetween", () => {
  it("recovers the term a stored invoice was written with", () => {
    expect(creditDaysBetween("2026-08-20", "2026-09-19")).toBe(30);
  });
});
