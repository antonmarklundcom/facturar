import { localeValues, type DocumentLocale } from "@/db/schema";
import { checkboxField, field } from "@/lib/forms";
import {
  Errors,
  enumValue,
  isConsumidorFinalRuc,
  optionalEmail,
  optionalText,
  requiredText,
  rucField,
  whatsappField,
  type FieldErrors,
} from "@/lib/validation";

/**
 * Customer form parsing — pure, so the rules are unit-testable without a
 * database or a session. The server action owns the gate and the write; this
 * owns "is what they typed a customer".
 */

export type CustomerInput = {
  name: string;
  rucBase: string | null;
  rucDv: string | null;
  isConsumidorFinal: boolean;
  /** Already normalised to `+5959XXXXXXXX` (guardrail 7). */
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  docLocale: DocumentLocale;
  notes: string | null;
};

/** Fields echoed back on error so a validation failure never blanks the form. */
export const CUSTOMER_FIELDS = [
  "name",
  "ruc",
  "isConsumidorFinal",
  "whatsapp",
  "email",
  "address",
  "docLocale",
  "notes",
] as const;

export type ParsedCustomer =
  | { ok: true; values: CustomerInput }
  | { ok: false; fieldErrors: FieldErrors };

export function parseCustomer(formData: FormData): ParsedCustomer {
  const errors = new Errors();

  const name = requiredText(field(formData, "name"), 200);
  if (!name.ok) errors.set("name", name.error);

  // A buyer with no RUC is, by definition, a consumidor final — so the RUC is
  // required unless that box is ticked. Ticking it and entering a RUC anyway
  // is fine: shops do keep the RUC of a walk-in customer on file.
  const consumidorFinalChecked = checkboxField(formData, "isConsumidorFinal");
  const ruc = rucField(field(formData, "ruc"), !consumidorFinalChecked);
  if (!ruc.ok) errors.set("ruc", ruc.error);

  const whatsapp = whatsappField(field(formData, "whatsapp"));
  if (!whatsapp.ok) errors.set("whatsapp", whatsapp.error);

  const email = optionalEmail(field(formData, "email"));
  if (!email.ok) errors.set("email", email.error);

  const address = optionalText(field(formData, "address"), 300);
  if (!address.ok) errors.set("address", address.error);

  const docLocale = enumValue(field(formData, "docLocale"), localeValues);
  if (!docLocale.ok) errors.set("docLocale", docLocale.error);

  const notes = optionalText(field(formData, "notes"), 2000);
  if (!notes.ok) errors.set("notes", notes.error);

  if (errors.any) return { ok: false, fieldErrors: errors.all };
  if (!name.ok || !ruc.ok || !whatsapp.ok || !email.ok) throw new Error("unreachable");
  if (!address.ok || !docLocale.ok || !notes.ok) throw new Error("unreachable");

  return {
    ok: true,
    values: {
      name: name.value,
      rucBase: ruc.value?.base ?? null,
      rucDv: ruc.value?.dv ?? null,
      // Someone who types 44444401-7 means consumidor final whether or not
      // they found the checkbox.
      isConsumidorFinal: consumidorFinalChecked || isConsumidorFinalRuc(ruc.value),
      whatsapp: whatsapp.value,
      email: email.value,
      address: address.value,
      docLocale: docLocale.value,
      notes: notes.value,
    },
  };
}
