"use server";

import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/activity";
import { requireRole } from "@/lib/auth/guards";
import {
  checkboxField,
  echo,
  field,
  formError,
  formSuccess,
  type FormState,
} from "@/lib/forms";
import {
  findTimbrado,
  insertTimbrado,
  updateTimbrado,
  type TimbradoInput,
} from "@/lib/settings/timbrados";
import { MAX_SEQUENCE, formatPoint } from "@/domain/numbering";

const TIMBRADOS_PATH = "/admin/ajustes/timbrados";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Fields echoed back on error so a validation failure does not blank the form. */
const TIMBRADO_FIELDS = [
  "number",
  "validFrom",
  "validTo",
  "establishment",
  "expeditionPoint",
  "rangeStart",
  "rangeEnd",
  "nextSequence",
] as const;

type ParsedTimbrado =
  | { ok: true; values: TimbradoInput; startAt: number }
  | { ok: false; fieldErrors: Record<string, string> };

/**
 * Shared validation for create and edit. Everything a timbrado asserts about
 * itself is checked here: the validity window must be ordered, the authorised
 * range must be ordered and inside seven digits, and the establishment and
 * expedition point must be three digits.
 */
function parseTimbrado(formData: FormData, requireStart: boolean): ParsedTimbrado {
  const fieldErrors: Record<string, string> = {};

  const number = field(formData, "number").replace(/\s/g, "");
  const validFrom = field(formData, "validFrom");
  const validTo = field(formData, "validTo");
  const rangeStart = Number(field(formData, "rangeStart"));
  const rangeEnd = Number(field(formData, "rangeEnd"));

  let establishment = "";
  let expeditionPoint = "";

  if (!/^\d{6,10}$/.test(number)) fieldErrors.number = "invalid";
  if (!DATE_PATTERN.test(validFrom)) fieldErrors.validFrom = "invalid";
  if (!DATE_PATTERN.test(validTo)) fieldErrors.validTo = "invalid";

  if (!fieldErrors.validFrom && !fieldErrors.validTo && validFrom > validTo) {
    fieldErrors.validTo = "before_start";
  }

  try {
    establishment = formatPoint(field(formData, "establishment"));
  } catch {
    fieldErrors.establishment = "invalid";
  }

  try {
    expeditionPoint = formatPoint(field(formData, "expeditionPoint"));
  } catch {
    fieldErrors.expeditionPoint = "invalid";
  }

  if (!Number.isInteger(rangeStart) || rangeStart < 1 || rangeStart > MAX_SEQUENCE) {
    fieldErrors.rangeStart = "invalid";
  }
  if (!Number.isInteger(rangeEnd) || rangeEnd < 1 || rangeEnd > MAX_SEQUENCE) {
    fieldErrors.rangeEnd = "invalid";
  }
  if (!fieldErrors.rangeStart && !fieldErrors.rangeEnd && rangeEnd < rangeStart) {
    fieldErrors.rangeEnd = "before_start";
  }

  // Where to start issuing. Set once, at creation — a timbrado may already
  // have had numbers used elsewhere before it was loaded into facturar.
  let startAt = rangeStart;
  if (requireStart) {
    const raw = field(formData, "nextSequence");
    if (raw !== "") {
      startAt = Number(raw);
      if (
        !Number.isInteger(startAt) ||
        startAt < rangeStart ||
        startAt > rangeEnd ||
        Number.isNaN(startAt)
      ) {
        fieldErrors.nextSequence = "out_of_range";
      }
    }
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  return {
    ok: true,
    startAt,
    values: {
      number,
      validFrom,
      validTo,
      establishment,
      expeditionPoint,
      rangeStart,
      rangeEnd,
    },
  };
}

export async function createTimbradoAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireRole("timbrados.manage");
  const values = echo(formData, TIMBRADO_FIELDS);

  const parsed = parseTimbrado(formData, true);
  if (!parsed.ok) return formError("invalid", parsed.fieldErrors, { values, previous });

  const timbradoId = await insertTimbrado(
    session.tenantId,
    { ...parsed.values, nextSequence: parsed.startAt },
    session.userId,
  );

  await logActivity({
    tenantId: session.tenantId,
    userId: session.userId,
    entityType: "timbrado",
    entityId: timbradoId,
    action: "created",
    detail: { number: parsed.values.number, validTo: parsed.values.validTo },
  });

  revalidatePath(TIMBRADOS_PATH);
  revalidatePath("/admin");
  return formSuccess("created");
}

/**
 * Edit a timbrado. `next_sequence` is deliberately absent — the correlative
 * cursor is only ever advanced by the PR-4 generator inside its row lock
 * (guardrail 6). Letting a form rewind it would reissue a number that has
 * already gone to a customer.
 */
export async function updateTimbradoAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireRole("timbrados.manage");
  const values = echo(formData, TIMBRADO_FIELDS);

  const timbradoId = Number(field(formData, "timbradoId"));
  if (!Number.isInteger(timbradoId) || timbradoId <= 0) {
    return formError("invalid", undefined, { values, previous });
  }

  const existing = await findTimbrado(session.tenantId, timbradoId);
  if (!existing) return formError("notFound", undefined, { values, previous });

  const parsed = parseTimbrado(formData, false);
  if (!parsed.ok) return formError("invalid", parsed.fieldErrors, { values, previous });

  // The range may not be narrowed past numbers already issued, or the timbrado
  // would report itself exhausted while issued documents sit outside its range.
  if (parsed.values.rangeStart > existing.nextSequence) {
    return formError("invalid", { rangeStart: "already_issued" }, { values, previous });
  }

  await updateTimbrado(
    session.tenantId,
    timbradoId,
    { ...parsed.values, active: checkboxField(formData, "active") },
    session.userId,
  );

  await logActivity({
    tenantId: session.tenantId,
    userId: session.userId,
    entityType: "timbrado",
    entityId: timbradoId,
    action: "updated",
    detail: { number: parsed.values.number },
  });

  revalidatePath(TIMBRADOS_PATH);
  revalidatePath("/admin");
  return formSuccess("updated");
}
