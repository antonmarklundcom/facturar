import { describe, expect, it } from "vitest";
import {
  PAYMENT_METHOD_ORDER,
  creditProblem,
  creditableAmount,
  derivePaymentStatus,
  outstanding,
  overpaid,
  paidTotal,
  paymentProblem,
} from "@/domain/payments";
import { paymentMethodValues } from "@/db/schema";

const TODAY = "2026-09-20";

/** A ₲ 1.100.000 invoice due on the 19th — one day overdue today. */
const base = {
  total: 1_100_000,
  paid: 0,
  credited: 0,
  dueDate: "2026-09-19",
  today: TODAY,
};

describe("paidTotal", () => {
  it("sums payments", () => {
    expect(
      paidTotal([
        { amount: 500_000, currency: "PYG" },
        { amount: 300_000, currency: "PYG" },
      ]),
    ).toBe(800_000);
  });

  it("is zero for no payments", () => {
    expect(paidTotal([])).toBe(0);
  });
});

describe("outstanding", () => {
  it("subtracts payments and credits", () => {
    expect(outstanding(1_100_000, 400_000, 100_000)).toBe(600_000);
  });

  it("never goes negative", () => {
    expect(outstanding(1_100_000, 1_500_000, 0)).toBe(0);
    expect(outstanding(1_100_000, 600_000, 600_000)).toBe(0);
  });

  it("reports the excess separately", () => {
    expect(overpaid(1_100_000, 1_500_000, 0)).toBe(400_000);
    expect(overpaid(1_100_000, 500_000, 0)).toBe(0);
  });
});

describe("derivePaymentStatus", () => {
  it("is pendiente when nothing is paid and nothing is due yet", () => {
    expect(derivePaymentStatus({ ...base, today: "2026-09-01" })).toBe("pendiente");
  });

  it("is parcial once something is paid", () => {
    expect(
      derivePaymentStatus({ ...base, paid: 400_000, today: "2026-09-01" }),
    ).toBe("parcial");
  });

  it("is pagada when payments cover the total exactly", () => {
    expect(derivePaymentStatus({ ...base, paid: 1_100_000 })).toBe("pagada");
  });

  it("is pagada when payments and credits together cover it", () => {
    expect(
      derivePaymentStatus({ ...base, paid: 900_000, credited: 200_000 }),
    ).toBe("pagada");
  });

  it("is anulada when credit notes cover the whole invoice", () => {
    expect(derivePaymentStatus({ ...base, credited: 1_100_000 })).toBe("anulada");
  });

  it("prefers anulada over pagada when both would apply", () => {
    // Fully credited and fully paid: the document was undone, and that is the
    // fact that matters for the books.
    expect(
      derivePaymentStatus({ ...base, paid: 1_100_000, credited: 1_100_000 }),
    ).toBe("anulada");
  });

  it("is vencida once past the due date and still owing", () => {
    expect(derivePaymentStatus(base)).toBe("vencida");
  });

  it("prefers vencida over parcial — half paid and late is a collections problem", () => {
    expect(derivePaymentStatus({ ...base, paid: 400_000 })).toBe("vencida");
  });

  it("is not vencida on the due date itself", () => {
    expect(derivePaymentStatus({ ...base, today: "2026-09-19" })).toBe("pendiente");
  });

  it("never marks a settled invoice vencida", () => {
    expect(
      derivePaymentStatus({ ...base, paid: 1_100_000, today: "2027-01-01" }),
    ).toBe("pagada");
    expect(
      derivePaymentStatus({ ...base, credited: 1_100_000, today: "2027-01-01" }),
    ).toBe("anulada");
  });

  it("never marks a contado invoice vencida — it has no due date", () => {
    expect(derivePaymentStatus({ ...base, dueDate: null })).toBe("pendiente");
    expect(derivePaymentStatus({ ...base, dueDate: null, paid: 400_000 })).toBe("parcial");
  });

  it("treats an overpayment as settled, not as still owing", () => {
    expect(derivePaymentStatus({ ...base, paid: 1_500_000 })).toBe("pagada");
  });

  it("calls a zero-total document paid rather than dividing by nothing", () => {
    expect(derivePaymentStatus({ ...base, total: 0 })).toBe("pagada");
  });
});

describe("paymentProblem", () => {
  const ok = {
    status: "pendiente" as const,
    isIssued: true,
    currency: "PYG" as const,
    outstandingAmount: 600_000,
    payment: { amount: 100_000, currency: "PYG" as const },
  };

  it("accepts a payment within what is owed", () => {
    expect(paymentProblem(ok)).toBeNull();
    expect(paymentProblem({ ...ok, payment: { amount: 600_000, currency: "PYG" } })).toBeNull();
  });

  it("refuses a payment against a draft", () => {
    expect(paymentProblem({ ...ok, isIssued: false })).toBe("not_issued");
  });

  it("refuses a payment against a voided invoice", () => {
    expect(paymentProblem({ ...ok, status: "anulada" })).toBe("voided");
  });

  it("refuses a payment on an invoice with nothing left owing", () => {
    expect(paymentProblem({ ...ok, outstandingAmount: 0 })).toBe("already_paid");
  });

  it("refuses more than is owed — almost always a typo", () => {
    expect(paymentProblem({ ...ok, payment: { amount: 600_001, currency: "PYG" } })).toBe(
      "exceeds_outstanding",
    );
  });

  it("refuses a zero or negative amount", () => {
    expect(paymentProblem({ ...ok, payment: { amount: 0, currency: "PYG" } })).toBe(
      "not_positive",
    );
    expect(paymentProblem({ ...ok, payment: { amount: -1, currency: "PYG" } })).toBe(
      "not_positive",
    );
  });

  it("refuses a payment in another currency", () => {
    expect(paymentProblem({ ...ok, payment: { amount: 100, currency: "USD" } })).toBe(
      "wrong_currency",
    );
  });
});

describe("creditProblem", () => {
  const ok = {
    invoiceStatus: "pendiente" as const,
    invoiceIsIssued: true,
    invoiceTotal: 1_100_000,
    invoiceCurrency: "PYG" as const,
    alreadyCredited: 0,
    creditTotal: 500_000,
    creditCurrency: "PYG" as const,
  };

  it("accepts a partial credit", () => {
    expect(creditProblem(ok)).toBeNull();
  });

  it("accepts a credit for the exact remaining amount", () => {
    expect(creditProblem({ ...ok, alreadyCredited: 600_000, creditTotal: 500_000 })).toBeNull();
  });

  it("refuses crediting more than the invoice, across several notes", () => {
    expect(creditProblem({ ...ok, alreadyCredited: 700_000, creditTotal: 500_000 })).toBe(
      "exceeds_invoice",
    );
    expect(creditProblem({ ...ok, creditTotal: 1_100_001 })).toBe("exceeds_invoice");
  });

  it("refuses a credit note against a draft", () => {
    expect(creditProblem({ ...ok, invoiceIsIssued: false })).toBe("not_issued");
  });

  it("refuses a second full credit on an already voided invoice", () => {
    expect(creditProblem({ ...ok, invoiceStatus: "anulada" })).toBe("already_voided");
  });

  it("refuses a zero credit and a foreign-currency credit", () => {
    expect(creditProblem({ ...ok, creditTotal: 0 })).toBe("not_positive");
    expect(creditProblem({ ...ok, creditCurrency: "USD" })).toBe("wrong_currency");
  });
});

describe("creditableAmount", () => {
  it("is what is left of the invoice", () => {
    expect(creditableAmount(1_100_000, 0)).toBe(1_100_000);
    expect(creditableAmount(1_100_000, 400_000)).toBe(700_000);
    expect(creditableAmount(1_100_000, 1_100_000)).toBe(0);
    expect(creditableAmount(1_100_000, 2_000_000)).toBe(0);
  });
});

describe("PAYMENT_METHOD_ORDER", () => {
  it("lists every method the schema allows, exactly once", () => {
    expect([...PAYMENT_METHOD_ORDER].sort()).toEqual([...paymentMethodValues].sort());
  });
});
