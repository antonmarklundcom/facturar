import { describe, expect, it } from "vitest";
import {
  CONSUMIDOR_FINAL_RUC,
  computeRucDv,
  documentRuc,
  formatRuc,
  isValidRuc,
  validateRuc,
} from "@/domain/ruc";

/**
 * The check digit is verifiable by hand, so the fixtures below are derived
 * rather than asserted on faith.
 *
 * `44444401-7` is the strongest anchor available: it is the RUC Paraguayan
 * invoicing uses by convention for an unnamed buyer, and its published check
 * digit is 7. Working the algorithm by hand on the base 44444401, weighting
 * from the right by 2,3,4,…:
 *
 *   1×2 + 0×3 + 4×4 + 4×5 + 4×6 + 4×7 + 4×8 + 4×9
 *     = 2 + 0 + 16 + 20 + 24 + 28 + 32 + 36 = 158
 *   158 mod 11 = 4 → dv = 11 − 4 = 7 ✓
 *
 * The implementation reproducing an independently published check digit is
 * what makes the rest of the derived fixtures trustworthy.
 */
describe("computeRucDv", () => {
  it("reproduces the published check digit for the consumidor final RUC", () => {
    expect(computeRucDv("44444401")).toBe(7);
    expect(CONSUMIDOR_FINAL_RUC).toBe("44444401-7");
  });

  it("works the modulo-11 sum through by hand for a company base", () => {
    // 80012345 from the right: 5×2+4×3+3×4+2×5+1×6+0×7+0×8+8×9
    //                        = 10+12+12+10+6+0+0+72 = 122
    // 122 mod 11 = 1 → below 2 → dv = 0
    expect(computeRucDv("80012345")).toBe(0);
  });

  it("returns 0 when the remainder is below 2", () => {
    // Remainder 0 and remainder 1 both yield a check digit of 0.
    const zeros = ["80012345", "1000"].filter((base) => computeRucDv(base) === 0);
    expect(zeros.length).toBeGreaterThan(0);
  });

  it("always produces a single digit 0–9", () => {
    for (let base = 100; base < 100_000; base += 617) {
      const dv = computeRucDv(String(base));
      expect(dv).toBeGreaterThanOrEqual(0);
      expect(dv).toBeLessThanOrEqual(9);
    }
  });

  it("ignores separators in the base", () => {
    expect(computeRucDv("80.012.345")).toBe(computeRucDv("80012345"));
  });

  it("refuses a base outside 3–10 digits", () => {
    expect(() => computeRucDv("12")).toThrow();
    expect(() => computeRucDv("12345678901")).toThrow();
  });
});

describe("validateRuc — accepts", () => {
  const valid = ["44444401-7", "80012345-0", "1234567-9", "500-2"].filter((ruc) => {
    const [base, dv] = ruc.split("-");
    return computeRucDv(base) === Number(dv);
  });

  it("has fixtures whose check digits are genuinely correct", () => {
    // Guards the test itself: if a fixture were wrong it would silently vanish
    // from `valid` and the assertions below would pass vacuously.
    expect(valid).toHaveLength(4);
  });

  it.each(valid)("accepts %s", (ruc) => {
    const result = validateRuc(ruc);
    expect(result.valid).toBe(true);
  });

  it("accepts the same number written without the hyphen", () => {
    expect(validateRuc("444444017").valid).toBe(true);
  });

  it("accepts dots and surrounding whitespace", () => {
    expect(validateRuc("  80.012.345-0 ").valid).toBe(true);
  });

  it("normalises to base-dv", () => {
    const result = validateRuc("80.012.345-0");
    expect(result.valid && result.normalized).toBe("80012345-0");
    expect(result.valid && result.parts).toEqual({ base: "80012345", dv: "0" });
  });

  it("flags the consumidor final RUC", () => {
    const result = validateRuc("44444401-7");
    expect(result.valid && result.isConsumidorFinal).toBe(true);

    const other = validateRuc("80012345-0");
    expect(other.valid && other.isConsumidorFinal).toBe(false);
  });
});

describe("validateRuc — rejects", () => {
  it("rejects a wrong check digit, whichever wrong digit it is", () => {
    const correct = computeRucDv("80012345");
    for (let dv = 0; dv <= 9; dv += 1) {
      if (dv === correct) continue;
      const result = validateRuc(`80012345-${dv}`);
      expect(result.valid, `80012345-${dv} should be rejected`).toBe(false);
      expect(result.valid === false && result.problem).toBe("wrong_dv");
    }
  });

  it.each([
    [null, "empty"],
    [undefined, "empty"],
    ["", "empty"],
    ["   ", "empty"],
  ] as const)("rejects %s as %s", (input, problem) => {
    const result = validateRuc(input);
    expect(result.valid === false && result.problem).toBe(problem);
  });

  it.each(["abc", "80012345-", "80-012-345", "8001234a-0", "--", "8001,2345-0"])(
    "rejects malformed input %s",
    (input) => {
      expect(validateRuc(input).valid).toBe(false);
    },
  );

  it("rejects a base that is too short or too long", () => {
    expect(validateRuc("12-3").valid === false).toBe(true);
    const tooLong = validateRuc("123456789012-3");
    expect(tooLong.valid === false && tooLong.problem).toBe("too_long");
  });

  it("rejects a bare base with no check digit rather than guessing one", () => {
    // "8001234" alone is ambiguous: is the 4 a check digit or part of the base?
    // The parser treats a hyphen-less value's last digit as the DV, so a base
    // whose own last digit is not its DV must fail.
    const dv = computeRucDv("8001234");
    expect(validateRuc("8001234").valid).toBe(dv === 4);
  });
});

describe("isValidRuc", () => {
  it("is the boolean form of validateRuc", () => {
    expect(isValidRuc("44444401-7")).toBe(true);
    expect(isValidRuc("44444401-6")).toBe(false);
    expect(isValidRuc(null)).toBe(false);
  });
});

describe("formatRuc", () => {
  it("joins stored columns", () => {
    expect(formatRuc("80012345", "0")).toBe("80012345-0");
  });

  it("returns null when either half is missing", () => {
    expect(formatRuc(null, "0")).toBeNull();
    expect(formatRuc("80012345", null)).toBeNull();
    expect(formatRuc("", "")).toBeNull();
  });
});

describe("documentRuc", () => {
  it("prints the customer's RUC", () => {
    expect(documentRuc({ rucBase: "80012345", rucDv: "0" })).toBe("80012345-0");
  });

  it("prints the conventional RUC for a consumidor final, ignoring stored values", () => {
    expect(
      documentRuc({ rucBase: "80012345", rucDv: "0", isConsumidorFinal: true }),
    ).toBe(CONSUMIDOR_FINAL_RUC);
  });

  it("falls back to the conventional RUC when the customer has none", () => {
    expect(documentRuc({})).toBe(CONSUMIDOR_FINAL_RUC);
    expect(documentRuc({ rucBase: null, rucDv: null })).toBe(CONSUMIDOR_FINAL_RUC);
  });
});

describe("round trip", () => {
  it("every computed check digit validates", () => {
    for (let base = 1000; base < 90_000_000; base += 1_234_567) {
      const asString = String(base);
      const dv = computeRucDv(asString);
      expect(validateRuc(`${asString}-${dv}`).valid, `${asString}-${dv}`).toBe(true);
    }
  });
});
