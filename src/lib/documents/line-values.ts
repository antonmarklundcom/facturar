import type { TaxRate } from "@/db/schema";

/**
 * The shape a line takes **in a form** — strings, because that is what an
 * input holds; the parsing into integers happens server-side in
 * `lib/documents/parse.ts` (guardrail 1).
 *
 * This lives outside the client component that renders it so a server
 * component can build the initial rows: a function exported from a
 * `"use client"` module cannot be *called* on the server, only rendered.
 */
export type LineValues = {
  productId: string;
  description: string;
  unit: string;
  qty: string;
  unitAmount: string;
  taxRate: TaxRate;
};

export function emptyLine(): LineValues {
  return { productId: "", description: "", unit: "", qty: "1", unitAmount: "", taxRate: "10" };
}
