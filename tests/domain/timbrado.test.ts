import { describe, expect, it } from "vitest";
import {
  EXPIRY_WARNING_DAYS,
  RANGE_WARNING_FRACTION,
  daysBetween,
  issuingBlockers,
  timbradoStatus,
  type TimbradoSnapshot,
} from "@/domain/timbrado";

const base: TimbradoSnapshot = {
  number: "12345678",
  validFrom: "2026-01-01",
  validTo: "2026-12-31",
  establishment: "001",
  expeditionPoint: "001",
  rangeStart: 1,
  rangeEnd: 1000,
  nextSequence: 1,
  active: true,
};

const on = (overrides: Partial<TimbradoSnapshot>) => ({ ...base, ...overrides });

describe("daysBetween", () => {
  it("counts whole days", () => {
    expect(daysBetween("2026-08-20", "2026-08-21")).toBe(1);
    expect(daysBetween("2026-08-20", "2026-08-20")).toBe(0);
    expect(daysBetween("2026-08-21", "2026-08-20")).toBe(-1);
  });

  it("crosses months and years", () => {
    expect(daysBetween("2026-01-31", "2026-02-01")).toBe(1);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
  });

  it("handles a leap day", () => {
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
    expect(daysBetween("2026-02-28", "2026-03-01")).toBe(1);
  });

  it("is unaffected by daylight-saving shifts", () => {
    // Paraguay has moved its clocks in October/March historically; a date-only
    // difference must not gain or lose a day because of it.
    expect(daysBetween("2026-10-01", "2026-10-31")).toBe(30);
    expect(daysBetween("2026-03-01", "2026-03-31")).toBe(30);
  });

  it("refuses a malformed date", () => {
    expect(() => daysBetween("20/08/2026", "2026-08-21")).toThrow();
  });
});

describe("issuing is blocked", () => {
  it("when the timbrado has expired", () => {
    const status = timbradoStatus(base, "2027-01-01");
    expect(status.issuable).toBe(false);
    expect(status.blockers).toContain("expired");
  });

  it("but not on the final day of validity — validTo is inclusive", () => {
    const status = timbradoStatus(base, "2026-12-31");
    expect(status.blockers).not.toContain("expired");
    expect(status.daysRemaining).toBe(0);
    expect(status.issuable).toBe(true);
  });

  it("when the timbrado is not yet valid", () => {
    const status = timbradoStatus(base, "2025-12-31");
    expect(status.issuable).toBe(false);
    expect(status.blockers).toContain("not_yet_valid");
  });

  it("but not on the first day of validity — validFrom is inclusive", () => {
    expect(timbradoStatus(base, "2026-01-01").blockers).not.toContain("not_yet_valid");
  });

  it("when the authorised range is exhausted", () => {
    const status = timbradoStatus(on({ nextSequence: 1001 }), "2026-06-01");
    expect(status.issuable).toBe(false);
    expect(status.blockers).toContain("range_exhausted");
    expect(status.numbersRemaining).toBe(0);
  });

  it("but not on the final number of the range", () => {
    const status = timbradoStatus(on({ nextSequence: 1000 }), "2026-06-01");
    expect(status.issuable).toBe(true);
    expect(status.numbersRemaining).toBe(1);
  });

  it("when the cursor sits below the authorised range", () => {
    // A misconfigured timbrado would otherwise issue a number DNIT never
    // authorised — that is worse than an exhausted range, not the same thing.
    const status = timbradoStatus(
      on({ rangeStart: 500, rangeEnd: 1000, nextSequence: 499 }),
      "2026-06-01",
    );
    expect(status.issuable).toBe(false);
    expect(status.blockers).toContain("sequence_out_of_range");
    expect(status.blockers).not.toContain("range_exhausted");
  });

  it("when the timbrado has been deactivated", () => {
    const status = timbradoStatus(on({ active: false }), "2026-06-01");
    expect(status.issuable).toBe(false);
    expect(status.blockers).toContain("inactive");
  });

  it("reports every blocker at once rather than stopping at the first", () => {
    const status = timbradoStatus(
      on({ active: false, nextSequence: 1001 }),
      "2027-06-01",
    );
    expect(status.blockers).toEqual(
      expect.arrayContaining(["inactive", "expired", "range_exhausted"]),
    );
  });
});

describe("expiry warning — under 30 days", () => {
  it("warns on the 30th day out", () => {
    // 2026-12-01 → 2026-12-31 is 30 days.
    const status = timbradoStatus(base, "2026-12-01");
    expect(status.daysRemaining).toBe(EXPIRY_WARNING_DAYS);
    expect(status.warnings).toContain("expiring_soon");
  });

  it("does not warn on the 31st day out", () => {
    const status = timbradoStatus(base, "2026-11-30");
    expect(status.daysRemaining).toBe(31);
    expect(status.warnings).not.toContain("expiring_soon");
  });

  it("still warns on the very last valid day", () => {
    expect(timbradoStatus(base, "2026-12-31").warnings).toContain("expiring_soon");
  });

  it("does not warn once expired — that is a blocker, not a warning", () => {
    const status = timbradoStatus(base, "2027-01-01");
    expect(status.warnings).toEqual([]);
  });
});

describe("range warning — under 10 % left", () => {
  it("warns when fewer than 10 % of the numbers remain", () => {
    // 1000 numbers, next 902 → 99 left = 9,9 %.
    const status = timbradoStatus(on({ nextSequence: 902 }), "2026-06-01");
    expect(status.numbersRemaining).toBe(99);
    expect(status.warnings).toContain("range_low");
  });

  it("does not warn at exactly 10 % remaining", () => {
    // next 901 → 100 left = 10 % exactly, which is not yet "under" 10 %.
    const status = timbradoStatus(on({ nextSequence: 901 }), "2026-06-01");
    expect(status.numbersRemaining).toBe(100);
    expect(status.numbersRemaining / status.rangeSize).toBe(RANGE_WARNING_FRACTION);
    expect(status.warnings).not.toContain("range_low");
  });

  it("does not warn on a fresh timbrado", () => {
    expect(timbradoStatus(base, "2026-06-01").warnings).toEqual([]);
  });

  it("reports how much of the range has been used", () => {
    expect(timbradoStatus(on({ nextSequence: 501 }), "2026-06-01").rangeUsedFraction).toBe(
      0.5,
    );
    expect(timbradoStatus(base, "2026-06-01").rangeUsedFraction).toBe(0);
  });

  it("counts a range that does not start at 1", () => {
    const status = timbradoStatus(
      on({ rangeStart: 5001, rangeEnd: 6000, nextSequence: 5001 }),
      "2026-06-01",
    );
    expect(status.rangeSize).toBe(1000);
    expect(status.numbersRemaining).toBe(1000);
    expect(status.issuable).toBe(true);
  });
});

describe("both warnings at once", () => {
  it("reports an expiring timbrado that is also running out of numbers", () => {
    const status = timbradoStatus(on({ nextSequence: 995 }), "2026-12-15");
    expect(status.warnings).toEqual(
      expect.arrayContaining(["expiring_soon", "range_low"]),
    );
    expect(status.issuable).toBe(true);
  });
});

describe("issuingBlockers", () => {
  it("is empty for a healthy timbrado", () => {
    expect(issuingBlockers(base, "2026-06-01")).toEqual([]);
  });

  it("returns keys, never user-facing text", () => {
    for (const blocker of issuingBlockers(on({ active: false }), "2027-06-01")) {
      expect(blocker).toMatch(/^[a-z_]+$/);
    }
  });
});
