import { issuingBlockers, type TimbradoBlocker, type TimbradoSnapshot } from "./timbrado";

/**
 * Paraguayan document numbering: `establecimiento-punto de expedición-número`,
 * e.g. `001-001-0000123`. The correlative is zero-padded to 7 digits and is
 * drawn from a timbrado's authorised range.
 *
 * This module holds the pure part — formatting, parsing and the pre-flight
 * checks. Actually handing out a number is `allocateDocumentNumber()` in
 * `@/domain/numbering.server`, which does it inside a transaction with a row
 * lock so the sequence stays gap-free under concurrent issuing.
 */

export const SEQUENCE_DIGITS = 7;
export const POINT_DIGITS = 3;
export const MAX_SEQUENCE = 10 ** SEQUENCE_DIGITS - 1;

export class NumberingError extends Error {
  readonly blockers: TimbradoBlocker[];

  constructor(message: string, blockers: TimbradoBlocker[] = []) {
    super(message);
    this.name = "NumberingError";
    this.blockers = blockers;
  }
}

/** Zero-pad an establishment or expedition point to three digits. */
export function formatPoint(value: string | number): string {
  const digits = String(value).replace(/\D/g, "");
  if (digits === "") throw new NumberingError(`"${value}" is not a valid point`);
  if (digits.length > POINT_DIGITS) {
    throw new NumberingError(`Point "${value}" is longer than ${POINT_DIGITS} digits`);
  }
  return digits.padStart(POINT_DIGITS, "0");
}

/** Build `001-001-0000123` from its parts. */
export function formatDocumentNumber(
  establishment: string | number,
  expeditionPoint: string | number,
  sequence: number,
): string {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new NumberingError(`Sequence must be a positive integer, got ${sequence}`);
  }
  if (sequence > MAX_SEQUENCE) {
    throw new NumberingError(`Sequence ${sequence} exceeds ${SEQUENCE_DIGITS} digits`);
  }

  return [
    formatPoint(establishment),
    formatPoint(expeditionPoint),
    String(sequence).padStart(SEQUENCE_DIGITS, "0"),
  ].join("-");
}

export type ParsedDocumentNumber = {
  establishment: string;
  expeditionPoint: string;
  sequence: number;
};

/** Read `001-001-0000123` back into its parts. `null` if it is not one. */
export function parseDocumentNumber(value: string): ParsedDocumentNumber | null {
  const match = /^(\d{3})-(\d{3})-(\d{7})$/.exec(value.trim());
  if (!match) return null;

  const [, establishment, expeditionPoint, sequence] = match;
  const parsed = Number(sequence);
  if (parsed < 1) return null;

  return { establishment, expeditionPoint, sequence: parsed };
}

/**
 * What the next number *would* be, without consuming it — for previews and for
 * the pre-flight check on an issue screen.
 *
 * @throws NumberingError carrying the blockers when the timbrado cannot issue.
 */
export function previewNextNumber(timbrado: TimbradoSnapshot, today: string): string {
  const blockers = issuingBlockers(timbrado, today);
  if (blockers.length > 0) {
    throw new NumberingError(
      `Timbrado ${timbrado.number} cannot issue: ${blockers.join(", ")}`,
      blockers,
    );
  }

  return formatDocumentNumber(
    timbrado.establishment,
    timbrado.expeditionPoint,
    timbrado.nextSequence,
  );
}

/**
 * Sort key for a document number, so a list ordered by number matches the
 * legal sequence rather than string order across establishments.
 */
export function documentNumberSortKey(value: string): number | null {
  const parsed = parseDocumentNumber(value);
  if (!parsed) return null;
  return (
    Number(parsed.establishment) * 10 ** 10 +
    Number(parsed.expeditionPoint) * 10 ** 7 +
    parsed.sequence
  );
}
