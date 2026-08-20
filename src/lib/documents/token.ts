import { randomBytes } from "node:crypto";

/**
 * Buyer tokens for `GET /d/[token]` (decision 4 — no customer login).
 *
 * 24 random bytes, base64url: 192 bits of entropy in 32 URL-safe characters.
 * Long enough that guessing one is not a threat model, short enough to sit in
 * a WhatsApp message without wrapping.
 */
export const PUBLIC_TOKEN_BYTES = 24;
export const PUBLIC_TOKEN_LENGTH = 32;

export function generatePublicToken(): string {
  return randomBytes(PUBLIC_TOKEN_BYTES).toString("base64url");
}

/** Shape check before a token ever reaches a query. */
export function isPublicTokenShape(value: string): boolean {
  return value.length === PUBLIC_TOKEN_LENGTH && /^[A-Za-z0-9_-]+$/.test(value);
}

/** Absolute buyer URL for a token, from `NEXT_PUBLIC_APP_URL`. */
export function publicDocumentUrl(token: string, baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/d/${token}`;
}
