import bcrypt from "bcryptjs";

/**
 * bcryptjs rather than the native `bcrypt`: Hostinger's managed Node slots have
 * no toolchain for native rebuilds, and a pure-JS hash keeps deploys boring.
 */
const COST = 12;

/** Minimum password length accepted anywhere in the app. */
export const MIN_PASSWORD_LENGTH = 10;

export type PasswordProblem = "too_short" | "too_common" | "unchanged";

const COMMON = new Set([
  "contrasena1",
  "contraseña1",
  "password12",
  "password123",
  "1234567890",
  "12345678901",
  "facturar12",
  "qwertyuiop",
  "administrador",
]);

/**
 * Validate a candidate password. Returns the problems found, empty when it
 * passes. The caller maps each problem to a translation key — this function
 * deliberately returns no user-facing text.
 */
export function checkPassword(
  candidate: string,
  options: { currentHashMatches?: boolean } = {},
): PasswordProblem[] {
  const problems: PasswordProblem[] = [];

  if (candidate.length < MIN_PASSWORD_LENGTH) problems.push("too_short");
  if (COMMON.has(candidate.toLowerCase())) problems.push("too_common");
  if (options.currentHashMatches) problems.push("unchanged");

  return problems;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  // bcryptjs throws on a malformed hash; a corrupt row must read as "wrong
  // password", never as a crash that leaks which accounts exist.
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

/**
 * Burn roughly the same time as a real bcrypt comparison when the email does
 * not exist, so login response time does not reveal which accounts are real.
 */
export async function fakeVerifyDelay(): Promise<void> {
  await bcrypt.compare(
    "unknown-account",
    "$2b$12$C6UzMDM.H6dfI/f/IKcEe.rXTOD.J/HYJ0Zy1lTBTfMHPBcTfKQGO",
  );
}
