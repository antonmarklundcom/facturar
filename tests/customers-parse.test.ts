import { describe, expect, it } from "vitest";
import { CUSTOMER_FIELDS, parseCustomer } from "@/lib/customers/parse";
import { CONSUMIDOR_FINAL_RUC, computeRucDv } from "@/domain/ruc";

const VALID_RUC = `80012345-${computeRucDv("80012345")}`;

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.append(name, value);
  return data;
}

const BASE = {
  name: "Ferretería San Blas S.A.",
  ruc: VALID_RUC,
  docLocale: "es",
};

describe("parseCustomer", () => {
  it("accepts a complete customer and normalises what it stores", () => {
    const parsed = parseCustomer(
      form({
        ...BASE,
        whatsapp: "0981 123456",
        email: "ventas@sanblas.com.py",
        address: "Avda. Mcal. López 1234, Asunción",
        notes: "Paga a 30 días.",
      }),
    );

    expect(parsed).toEqual({
      ok: true,
      values: {
        name: "Ferretería San Blas S.A.",
        rucBase: "80012345",
        rucDv: String(computeRucDv("80012345")),
        isConsumidorFinal: false,
        whatsapp: "+595981123456",
        email: "ventas@sanblas.com.py",
        address: "Avda. Mcal. López 1234, Asunción",
        docLocale: "es",
        notes: "Paga a 30 días.",
      },
    });
  });

  it("stores absent optional fields as NULL rather than empty strings", () => {
    const parsed = parseCustomer(
      form({ ...BASE, whatsapp: "", email: "", address: "", notes: "" }),
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.values.whatsapp).toBeNull();
    expect(parsed.values.email).toBeNull();
    expect(parsed.values.address).toBeNull();
    expect(parsed.values.notes).toBeNull();
  });

  it("requires a RUC unless the customer is a consumidor final", () => {
    const withoutRuc = parseCustomer(form({ ...BASE, ruc: "" }));
    expect(withoutRuc).toEqual({ ok: false, fieldErrors: { ruc: "required" } });

    const consumidorFinal = parseCustomer(
      form({ ...BASE, ruc: "", isConsumidorFinal: "on" }),
    );
    expect(consumidorFinal.ok).toBe(true);
    if (!consumidorFinal.ok) return;
    expect(consumidorFinal.values.rucBase).toBeNull();
    expect(consumidorFinal.values.isConsumidorFinal).toBe(true);
  });

  it("infers the consumidor final flag from the conventional RUC", () => {
    const parsed = parseCustomer(form({ ...BASE, ruc: CONSUMIDOR_FINAL_RUC }));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.values.isConsumidorFinal).toBe(true);
    expect(parsed.values.rucBase).toBe("44444401");
  });

  it("still validates a RUC supplied alongside the consumidor final flag", () => {
    const parsed = parseCustomer(
      form({ ...BASE, ruc: "80012345-9", isConsumidorFinal: "on" }),
    );

    expect(parsed).toEqual({ ok: false, fieldErrors: { ruc: "wrong_dv" } });
  });

  it("rejects a RUC whose check digit is wrong (guardrail 7)", () => {
    expect(parseCustomer(form({ ...BASE, ruc: "80012345-9" }))).toEqual({
      ok: false,
      fieldErrors: { ruc: "wrong_dv" },
    });
  });

  it("rejects a landline in the WhatsApp field", () => {
    expect(parseCustomer(form({ ...BASE, whatsapp: "021 205000" }))).toEqual({
      ok: false,
      fieldErrors: { whatsapp: "not_mobile" },
    });
  });

  it("requires a name", () => {
    expect(parseCustomer(form({ ...BASE, name: "   " }))).toEqual({
      ok: false,
      fieldErrors: { name: "required" },
    });
  });

  it("rejects a document language outside the catalog", () => {
    expect(parseCustomer(form({ ...BASE, docLocale: "pt" }))).toEqual({
      ok: false,
      fieldErrors: { docLocale: "invalid" },
    });
  });

  it("reports every bad field at once, so the form is fixed in one pass", () => {
    const parsed = parseCustomer(
      form({
        name: "",
        ruc: "80012345-9",
        whatsapp: "+46701234567",
        email: "not-an-email",
        docLocale: "es",
      }),
    );

    expect(parsed).toEqual({
      ok: false,
      fieldErrors: {
        name: "required",
        ruc: "wrong_dv",
        whatsapp: "wrong_country",
        email: "invalid",
      },
    });
  });

  it("enforces the column lengths the schema declares", () => {
    expect(parseCustomer(form({ ...BASE, name: "x".repeat(201) })).ok).toBe(false);
    expect(parseCustomer(form({ ...BASE, address: "x".repeat(301) })).ok).toBe(false);
    expect(parseCustomer(form({ ...BASE, name: "x".repeat(200) })).ok).toBe(true);
  });

  it("echoes exactly the fields the form submits", () => {
    // If a field is added to the form but not to this list, a validation
    // error would silently blank it (React 19 resets the form on settle).
    expect([...CUSTOMER_FIELDS]).toEqual([
      "name",
      "ruc",
      "isConsumidorFinal",
      "whatsapp",
      "email",
      "address",
      "docLocale",
      "notes",
    ]);
  });
});
