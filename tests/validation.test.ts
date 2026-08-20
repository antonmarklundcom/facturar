import { describe, expect, it } from "vitest";
import {
  Errors,
  enumValue,
  idField,
  isConsumidorFinalRuc,
  moneyField,
  optionalEmail,
  optionalText,
  optionalUrl,
  requiredText,
  rucField,
  whatsappField,
} from "@/lib/validation";
import { CONSUMIDOR_FINAL_RUC, computeRucDv } from "@/domain/ruc";

describe("Errors", () => {
  it("keeps the first error for a field", () => {
    const errors = new Errors();
    errors.set("ruc", "wrong_dv");
    errors.set("ruc", "invalid");

    expect(errors.all).toEqual({ ruc: "wrong_dv" });
    expect(errors.any).toBe(true);
  });

  it("starts empty", () => {
    const errors = new Errors();
    expect(errors.any).toBe(false);
    expect(errors.all).toEqual({});
  });

  it("hands out a copy, not the live bag", () => {
    const errors = new Errors();
    errors.set("name", "required");
    const snapshot = errors.all;
    errors.set("email", "invalid");

    expect(snapshot).toEqual({ name: "required" });
  });
});

describe("requiredText", () => {
  it("accepts text within the limit", () => {
    expect(requiredText("Ferretería San Blas", 200)).toEqual({
      ok: true,
      value: "Ferretería San Blas",
    });
  });

  it("rejects empty and over-long text with distinct keys", () => {
    expect(requiredText("", 200)).toEqual({ ok: false, error: "required" });
    expect(requiredText("x".repeat(201), 200)).toEqual({ ok: false, error: "too_long" });
    expect(requiredText("x".repeat(200), 200).ok).toBe(true);
  });
});

describe("optionalText", () => {
  it("turns an empty field into NULL, not an empty string", () => {
    expect(optionalText("", 300)).toEqual({ ok: true, value: null });
  });

  it("still enforces the length limit", () => {
    expect(optionalText("x".repeat(301), 300)).toEqual({ ok: false, error: "too_long" });
  });
});

describe("optionalEmail", () => {
  it("accepts ordinary addresses", () => {
    for (const email of [
      "ana@ferreteria.com.py",
      "ANA+facturas@empresa.com",
      "a.b-c_d@sub.dominio.com.py",
    ]) {
      expect(optionalEmail(email).ok, email).toBe(true);
    }
  });

  it("rejects addresses with no domain, no user or a space", () => {
    for (const email of ["ana@", "@empresa.com", "ana@empresa", "an a@empresa.com", "ana"]) {
      expect(optionalEmail(email), email).toEqual({ ok: false, error: "invalid" });
    }
  });

  it("treats empty as absent", () => {
    expect(optionalEmail("")).toEqual({ ok: true, value: null });
  });
});

describe("enumValue", () => {
  it("accepts a member and rejects anything else", () => {
    expect(enumValue("es", ["es", "en"] as const)).toEqual({ ok: true, value: "es" });
    expect(enumValue("pt", ["es", "en"] as const)).toEqual({ ok: false, error: "invalid" });
    expect(enumValue("", ["es", "en"] as const)).toEqual({ ok: false, error: "invalid" });
  });
});

describe("optionalUrl", () => {
  it("accepts http and https only", () => {
    expect(optionalUrl("https://cdn.example.com/logo.png").ok).toBe(true);
    expect(optionalUrl("http://example.com/a.png").ok).toBe(true);
  });

  it("rejects a javascript: href", () => {
    expect(optionalUrl("javascript:alert(1)")).toEqual({ ok: false, error: "invalid" });
    expect(optionalUrl("data:image/png;base64,AAA")).toEqual({ ok: false, error: "invalid" });
  });
});

describe("rucField", () => {
  const validRuc = `80012345-${computeRucDv("80012345")}`;

  it("accepts a valid RUC and returns its parts", () => {
    expect(rucField(validRuc, true)).toEqual({
      ok: true,
      value: { base: "80012345", dv: String(computeRucDv("80012345")) },
    });
  });

  it("passes the domain's problem through as the error key", () => {
    expect(rucField("80012345-9", true)).toEqual({ ok: false, error: "wrong_dv" });
    expect(rucField("ab", true)).toEqual({ ok: false, error: "malformed" });
  });

  it("only demands a RUC when the caller says it is required", () => {
    expect(rucField("", true)).toEqual({ ok: false, error: "required" });
    expect(rucField("", false)).toEqual({ ok: true, value: null });
  });
});

describe("isConsumidorFinalRuc", () => {
  it("recognises the conventional RUC", () => {
    const [base, dv] = CONSUMIDOR_FINAL_RUC.split("-");
    expect(isConsumidorFinalRuc({ base, dv })).toBe(true);
    expect(isConsumidorFinalRuc({ base: "80012345", dv: "0" })).toBe(false);
    expect(isConsumidorFinalRuc(null)).toBe(false);
  });
});

describe("whatsappField", () => {
  it("stores the normalised form", () => {
    expect(whatsappField("0981 123456")).toEqual({ ok: true, value: "+595981123456" });
  });

  it("passes the normaliser's problem through", () => {
    expect(whatsappField("021 205000")).toEqual({ ok: false, error: "not_mobile" });
    expect(whatsappField("+46701234567")).toEqual({ ok: false, error: "wrong_country" });
  });

  it("treats empty as absent", () => {
    expect(whatsappField("")).toEqual({ ok: true, value: null });
  });
});

describe("moneyField", () => {
  it("reads es-PY guaraníes as whole minor units", () => {
    expect(moneyField("1.500.000", "PYG")).toEqual({ ok: true, value: 1_500_000 });
    expect(moneyField("1500000", "PYG")).toEqual({ ok: true, value: 1_500_000 });
    expect(moneyField("₲ 1.500.000", "PYG")).toEqual({ ok: true, value: 1_500_000 });
  });

  it("reads USD as cents", () => {
    expect(moneyField("1.234,56", "USD")).toEqual({ ok: true, value: 123_456 });
    expect(moneyField("10", "USD")).toEqual({ ok: true, value: 1_000 });
  });

  it("rejects an empty, negative or unreadable amount", () => {
    expect(moneyField("", "PYG")).toEqual({ ok: false, error: "required" });
    expect(moneyField("-5000", "PYG")).toEqual({ ok: false, error: "negative" });
    expect(moneyField("abc", "PYG")).toEqual({ ok: false, error: "invalid" });
  });

  it("can insist on a non-zero amount", () => {
    expect(moneyField("0", "PYG")).toEqual({ ok: true, value: 0 });
    expect(moneyField("0", "PYG", { allowZero: false })).toEqual({
      ok: false,
      error: "required",
    });
  });

  it("refuses an amount past the safe-integer ceiling", () => {
    expect(moneyField("99.999.999.999.999.999.999", "PYG")).toEqual({
      ok: false,
      error: "too_large",
    });
  });
});

describe("idField", () => {
  it("accepts a positive integer id", () => {
    expect(idField("42")).toEqual({ ok: true, value: 42 });
  });

  it("rejects zero, negatives, decimals and junk", () => {
    for (const raw of ["0", "-1", "1.5", "", "abc", "NaN"]) {
      expect(idField(raw), raw).toEqual({ ok: false, error: "invalid" });
    }
  });
});
