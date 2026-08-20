import { describe, expect, it } from "vitest";
import {
  formatWhatsapp,
  isValidWhatsapp,
  normalizeWhatsapp,
  waMeLink,
} from "@/domain/whatsapp";

/** Every spelling of the same Tigo number a Paraguayan might type. */
const SAME_NUMBER = [
  "0981123456",
  "0981 123456",
  "0981 123 456",
  "0981-123-456",
  "(0981) 123 456",
  "981123456",
  "981 123456",
  "595981123456",
  "595 981 123456",
  "+595981123456",
  "+595 981 123456",
  "+595 (981) 123-456",
  "00595981123456",
  "00 595 981 123 456",
  "  0981123456  ",
];

describe("normalizeWhatsapp", () => {
  it.each(SAME_NUMBER)("normalises %j to +595981123456", (input) => {
    const result = normalizeWhatsapp(input);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.normalized).toBe("+595981123456");
    expect(result.national).toBe("981123456");
  });

  it("accepts every live Paraguayan mobile prefix", () => {
    for (const prefix of ["961", "971", "972", "975", "981", "982", "983", "985", "991", "992", "994"]) {
      const result = normalizeWhatsapp(`0${prefix}123456`);
      expect(result.valid, prefix).toBe(true);
    }
  });

  it("reports an empty value rather than throwing", () => {
    for (const input of ["", "   ", null, undefined]) {
      expect(normalizeWhatsapp(input)).toEqual({ valid: false, problem: "empty" });
    }
  });

  it("rejects a landline — WhatsApp is a mobile identity", () => {
    // Asunción landlines are 021 followed by six or seven digits.
    expect(normalizeWhatsapp("021 205000")).toEqual({
      valid: false,
      problem: "not_mobile",
    });
    expect(normalizeWhatsapp("+595 21 205000")).toEqual({
      valid: false,
      problem: "not_mobile",
    });
    // Encarnación.
    expect(normalizeWhatsapp("071 203456")).toEqual({ valid: false, problem: "not_mobile" });
  });

  it("rejects a mobile whose operator digit is a zero", () => {
    expect(normalizeWhatsapp("0901123456")).toEqual({ valid: false, problem: "not_mobile" });
  });

  it("rejects another country's number", () => {
    expect(normalizeWhatsapp("+5511987654321")).toEqual({
      valid: false,
      problem: "wrong_country",
    });
    expect(normalizeWhatsapp("+46701234567")).toEqual({
      valid: false,
      problem: "wrong_country",
    });
    expect(normalizeWhatsapp("0046701234567")).toEqual({
      valid: false,
      problem: "wrong_country",
    });
  });

  it("rejects numbers of the wrong length", () => {
    expect(normalizeWhatsapp("098112345").valid).toBe(false); // one digit short
    expect(normalizeWhatsapp("09811234567").valid).toBe(false); // one digit long
    expect(normalizeWhatsapp("+5959811234567").valid).toBe(false);
    expect(normalizeWhatsapp("12").valid).toBe(false);
  });

  it("rejects text that contains no digits", () => {
    expect(normalizeWhatsapp("no tengo")).toEqual({ valid: false, problem: "malformed" });
  });

  it("is idempotent — normalising a stored number returns it unchanged", () => {
    const once = normalizeWhatsapp("0981123456");
    expect(once.valid).toBe(true);
    if (!once.valid) return;

    const twice = normalizeWhatsapp(once.normalized);
    expect(twice.valid).toBe(true);
    if (!twice.valid) return;
    expect(twice.normalized).toBe(once.normalized);
  });

  it("always produces the +5959XXXXXXXX shape required by guardrail 7", () => {
    for (const input of SAME_NUMBER) {
      const result = normalizeWhatsapp(input);
      if (!result.valid) throw new Error(`expected ${input} to be valid`);
      expect(result.normalized).toMatch(/^\+5959\d{8}$/);
    }
  });
});

describe("isValidWhatsapp", () => {
  it("mirrors normalizeWhatsapp", () => {
    expect(isValidWhatsapp("0981123456")).toBe(true);
    expect(isValidWhatsapp("021205000")).toBe(false);
    expect(isValidWhatsapp(null)).toBe(false);
  });
});

describe("waMeLink", () => {
  it("uses digits only — a + in the path would break the link", () => {
    expect(waMeLink("+595981123456")).toBe("https://wa.me/595981123456");
  });

  it("encodes the prefilled message", () => {
    expect(waMeLink("+595981123456", "Hola Ña Ramona, ¿todo bien?")).toBe(
      "https://wa.me/595981123456?text=Hola%20%C3%91a%20Ramona%2C%20%C2%BFtodo%20bien%3F",
    );
  });

  it("omits the query string when there is no message", () => {
    expect(waMeLink("+595981123456", undefined)).not.toContain("?");
  });
});

describe("formatWhatsapp", () => {
  it("groups a stored number for display", () => {
    expect(formatWhatsapp("+595981123456")).toBe("+595 981 123 456");
  });

  it("passes anything unexpected through untouched", () => {
    expect(formatWhatsapp("+46701234567")).toBe("+46701234567");
    expect(formatWhatsapp(null)).toBeNull();
    expect(formatWhatsapp("")).toBeNull();
  });
});
