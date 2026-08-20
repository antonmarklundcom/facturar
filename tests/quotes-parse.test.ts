import { describe, expect, it } from "vitest";
import { MAX_LINES, parseQuote, validityDaysBetween } from "@/lib/documents/parse";
import { computeTotals } from "@/domain/iva";

const TODAY = "2026-08-20";

function form(
  header: Record<string, string>,
  lines: Record<string, string>[] = [],
): FormData {
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
  customerId: "7",
  docLocale: "es",
  currency: "PYG",
  issueDate: TODAY,
  validityDays: "15",
};

const LINE = { description: "Chapa galvanizada", unit: "unidad", qty: "10", unitAmount: "150.000" };

describe("parseQuote", () => {
  it("reads a quote with its lines", () => {
    const parsed = parseQuote(form(HEADER, [LINE]), TODAY);

    expect(parsed).toEqual({
      ok: true,
      values: {
        customerId: 7,
        docLocale: "es",
        currency: "PYG",
        issueDate: TODAY,
        validUntil: "2026-09-04",
        notes: null,
        lines: [
          {
            productId: null,
            description: "Chapa galvanizada",
            unit: "unidad",
            qty: 10_000,
            unitAmount: 150_000,
            taxRate: "10",
            position: 0,
          },
        ],
      },
    });
  });

  it("derives valid-until from the validity window", () => {
    const parsed = parseQuote(form({ ...HEADER, validityDays: "30" }, [LINE]), TODAY);
    expect(parsed.ok && parsed.values.validUntil).toBe("2026-09-19");
  });

  it("defaults the issue date to today when the field is empty", () => {
    const parsed = parseQuote(form({ ...HEADER, issueDate: "" }, [LINE]), TODAY);
    expect(parsed.ok && parsed.values.issueDate).toBe(TODAY);
  });

  it("keeps quantities as fixed-point ×1000", () => {
    const parsed = parseQuote(form(HEADER, [{ ...LINE, qty: "1,5" }]), TODAY);
    expect(parsed.ok && parsed.values.lines[0].qty).toBe(1_500);
  });

  it("reads line prices in the document's currency, not a default", () => {
    const pyg = parseQuote(form(HEADER, [{ ...LINE, unitAmount: "1.500" }]), TODAY);
    const usd = parseQuote(
      form({ ...HEADER, currency: "USD" }, [{ ...LINE, unitAmount: "1.500" }]),
      TODAY,
    );

    expect(pyg.ok && pyg.values.lines[0].unitAmount).toBe(1_500);
    expect(usd.ok && usd.values.lines[0].unitAmount).toBe(150_000);
  });

  it("numbers the lines in the order they were submitted", () => {
    const parsed = parseQuote(
      form(HEADER, [LINE, { ...LINE, description: "Mano de obra" }]),
      TODAY,
    );

    expect(parsed.ok && parsed.values.lines.map((line) => line.position)).toEqual([0, 1]);
  });

  it("drops a row the user never filled in", () => {
    const parsed = parseQuote(form(HEADER, [LINE, {}]), TODAY);
    expect(parsed.ok && parsed.values.lines.length).toBe(1);
  });

  it("requires at least one line", () => {
    expect(parseQuote(form(HEADER, []), TODAY)).toEqual({
      ok: false,
      fieldErrors: { lines: "required" },
    });
    expect(parseQuote(form(HEADER, [{}]), TODAY)).toEqual({
      ok: false,
      fieldErrors: { lines: "required" },
    });
  });

  it("caps the number of lines", () => {
    const many = Array.from({ length: MAX_LINES + 1 }, (_, index) => ({
      ...LINE,
      description: `Línea ${index}`,
    }));

    const parsed = parseQuote(form(HEADER, many), TODAY);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.fieldErrors.lines).toBe("too_many");
  });

  it("reports the offending line by index", () => {
    const parsed = parseQuote(
      form(HEADER, [LINE, { ...LINE, description: "", unitAmount: "10.000" }]),
      TODAY,
    );

    expect(parsed).toEqual({
      ok: false,
      fieldErrors: { "lines.1.description": "required" },
    });
  });

  it("rejects a zero or negative quantity", () => {
    expect(parseQuote(form(HEADER, [{ ...LINE, qty: "0" }]), TODAY)).toEqual({
      ok: false,
      fieldErrors: { "lines.0.qty": "positive" },
    });
    expect(parseQuote(form(HEADER, [{ ...LINE, qty: "-2" }]), TODAY)).toEqual({
      ok: false,
      fieldErrors: { "lines.0.qty": "positive" },
    });
  });

  it("rejects a negative price", () => {
    expect(parseQuote(form(HEADER, [{ ...LINE, unitAmount: "-1000" }]), TODAY)).toEqual({
      ok: false,
      fieldErrors: { "lines.0.unitAmount": "negative" },
    });
  });

  it("requires a customer", () => {
    expect(parseQuote(form({ ...HEADER, customerId: "" }, [LINE]), TODAY)).toEqual({
      ok: false,
      fieldErrors: { customerId: "required" },
    });
  });

  it("refuses an implausible validity window", () => {
    for (const validityDays of ["0", "-5", "400", "cinco"]) {
      const parsed = parseQuote(form({ ...HEADER, validityDays }, [LINE]), TODAY);
      expect(parsed.ok, validityDays).toBe(false);
    }
  });

  it("carries a catalogue product id when one was picked", () => {
    const parsed = parseQuote(form(HEADER, [{ ...LINE, productId: "12" }]), TODAY);
    expect(parsed.ok && parsed.values.lines[0].productId).toBe(12);
  });

  it("produces lines the IVA engine totals up consistently", () => {
    const parsed = parseQuote(
      form(HEADER, [
        LINE,
        { description: "Alquiler", unit: "día", qty: "2", unitAmount: "105.000", taxRate: "5" },
        { description: "Flete", unit: "servicio", qty: "1", unitAmount: "50.000", taxRate: "exenta" },
      ]),
      TODAY,
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const totals = computeTotals(parsed.values.lines, parsed.values.currency);
    expect(totals.subtotal10).toBe(1_500_000);
    expect(totals.subtotal5).toBe(210_000);
    expect(totals.subtotalExenta).toBe(50_000);
    expect(totals.iva10).toBe(136_364);
    expect(totals.iva5).toBe(10_000);
    expect(totals.total).toBe(1_760_000);
  });
});

describe("validityDaysBetween", () => {
  it("recovers the window a stored quote was written with", () => {
    expect(validityDaysBetween("2026-08-20", "2026-09-04")).toBe(15);
    expect(validityDaysBetween("2026-12-28", "2027-01-07")).toBe(10);
  });
});
