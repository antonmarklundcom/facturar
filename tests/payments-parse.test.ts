import { describe, expect, it } from "vitest";
import { PAYMENT_FIELDS, parseCreditNote, parsePayment } from "@/lib/documents/parse";
import { computeTotals } from "@/domain/iva";

const TODAY = "2026-09-20";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.append(name, value);
  return data;
}

describe("parsePayment", () => {
  const base = { amount: "500.000", method: "transferencia", paidAt: "2026-09-18" };

  it("reads a payment in the invoice's currency", () => {
    const parsed = parsePayment(form(base), "PYG", TODAY);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.values.amount).toBe(500_000);
    expect(parsed.values.currency).toBe("PYG");
    expect(parsed.values.method).toBe("transferencia");
  });

  it("scales the amount by the invoice's currency, not a default", () => {
    const usd = parsePayment(form({ ...base, amount: "500" }), "USD", TODAY);
    expect(usd.ok && usd.values.amount).toBe(50_000);
  });

  it("defaults the payment date to today", () => {
    const parsed = parsePayment(form({ ...base, paidAt: "" }), "PYG", TODAY);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.values.paidAt.toISOString().slice(0, 10)).toBe(TODAY);
  });

  it("refuses a payment dated in the future", () => {
    expect(parsePayment(form({ ...base, paidAt: "2026-09-21" }), "PYG", TODAY)).toEqual({
      ok: false,
      fieldErrors: { paidAt: "future" },
    });
  });

  it("refuses a zero, negative or unreadable amount", () => {
    expect(parsePayment(form({ ...base, amount: "0" }), "PYG", TODAY).ok).toBe(false);
    expect(parsePayment(form({ ...base, amount: "-1000" }), "PYG", TODAY).ok).toBe(false);
    expect(parsePayment(form({ ...base, amount: "" }), "PYG", TODAY).ok).toBe(false);
    expect(parsePayment(form({ ...base, amount: "algo" }), "PYG", TODAY).ok).toBe(false);
  });

  it("refuses a method that is not in the schema", () => {
    expect(parsePayment(form({ ...base, method: "bitcoin" }), "PYG", TODAY)).toEqual({
      ok: false,
      fieldErrors: { method: "invalid" },
    });
  });

  it("stores the date away from midnight, so it cannot drift a day in UTC", () => {
    const parsed = parsePayment(form(base), "PYG", TODAY);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    // Asunción is UTC-3/-4, so a midday-UTC instant is the same calendar day
    // in both zones.
    expect(parsed.values.paidAt.toISOString()).toBe("2026-09-18T15:00:00.000Z");
  });

  it("keeps an empty reference as NULL", () => {
    const parsed = parsePayment(form({ ...base, reference: "" }), "PYG", TODAY);
    expect(parsed.ok && parsed.values.reference).toBeNull();
  });

  it("echoes exactly the fields the form submits", () => {
    expect([...PAYMENT_FIELDS]).toEqual([
      "amount",
      "method",
      "paidAt",
      "reference",
      "paymentNotes",
    ]);
  });
});

describe("parseCreditNote", () => {
  function creditForm(lines: Record<string, string>[], notes = ""): FormData {
    const data = new FormData();
    data.append("creditNotes", notes);

    for (const line of lines) {
      data.append("lineProductId", "");
      data.append("lineDescription", line.description ?? "");
      data.append("lineUnit", line.unit ?? "unidad");
      data.append("lineQty", line.qty ?? "1");
      data.append("lineUnitAmount", line.unitAmount ?? "");
      data.append("lineTaxRate", line.taxRate ?? "10");
    }

    return data;
  }

  it("reads the lines being credited", () => {
    const parsed = parseCreditNote(
      creditForm([{ description: "Chapa devuelta", qty: "2", unitAmount: "150.000" }]),
      "PYG",
      TODAY,
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.values.lines).toHaveLength(1);
    expect(parsed.values.lines[0].unitAmount).toBe(150_000);
    expect(parsed.values.lines[0].qty).toBe(2_000);
  });

  it("breaks IVA down per rate exactly as the invoice does", () => {
    const parsed = parseCreditNote(
      creditForm([
        { description: "Chapa", qty: "1", unitAmount: "1.500.000" },
        { description: "Alquiler", qty: "1", unitAmount: "210.000", taxRate: "5" },
      ]),
      "PYG",
      TODAY,
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const totals = computeTotals(parsed.values.lines, "PYG");
    expect(totals.iva10).toBe(136_364);
    expect(totals.iva5).toBe(10_000);
    expect(totals.total).toBe(1_710_000);
  });

  it("keeps the reason as the document's notes", () => {
    const parsed = parseCreditNote(
      creditForm([{ description: "Devolución", unitAmount: "100.000" }], "Producto fallado"),
      "PYG",
      TODAY,
    );

    expect(parsed.ok && parsed.values.notes).toBe("Producto fallado");
  });

  it("requires at least one line", () => {
    expect(parseCreditNote(creditForm([]), "PYG", TODAY)).toEqual({
      ok: false,
      fieldErrors: { lines: "required" },
    });
  });

  it("never asks the form for a customer — it is the invoice's", () => {
    const parsed = parseCreditNote(creditForm([{ description: "", unitAmount: "1" }]), "PYG", TODAY);

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(Object.keys(parsed.fieldErrors)).not.toContain("customerId");
  });

  it("reads the amounts in the invoice's currency", () => {
    const parsed = parseCreditNote(
      creditForm([{ description: "Refund", unitAmount: "1.500" }]),
      "USD",
      TODAY,
    );

    expect(parsed.ok && parsed.values.lines[0].unitAmount).toBe(150_000);
  });
});
