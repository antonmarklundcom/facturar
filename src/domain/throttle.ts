/**
 * Login throttling — the pure decision, with no database and no clock.
 *
 * Failed logins are counted per email address and per client IP. Passing a
 * scope's limit inside its window locks that scope out until the window has
 * been quiet again for its full length: every further attempt while locked
 * still counts, so hammering the form keeps extending the lockout rather than
 * running it down.
 *
 * The two scopes answer different questions and so carry different limits:
 *
 *  - **email** is the one that matters. Five wrong passwords for one address
 *    inside a quarter of an hour is a guessing attempt, not a typo streak.
 *  - **ip** is a backstop against someone spraying one common password across
 *    many addresses. It is set far higher because a Paraguayan SMB office —
 *    or a phone on mobile data — shares one address between everybody on it,
 *    and locking the office out because a colleague fumbled is worse than the
 *    attack it would prevent.
 *
 * Everything here is a function of a stored counter and a `now` handed in, so
 * the window, the lockout and the reset are unit-testable without a database
 * and without waiting fifteen minutes (guardrail 8).
 */

export const throttleScopes = ["email", "ip"] as const;
export type ThrottleScope = (typeof throttleScopes)[number];

export type ThrottleLimit = {
  /** Failures allowed inside the window before the scope locks. */
  maxFailures: number;
  /** Length of the sliding window, in minutes. */
  windowMinutes: number;
};

export const THROTTLE_LIMITS: Record<ThrottleScope, ThrottleLimit> = {
  email: { maxFailures: 5, windowMinutes: 15 },
  ip: { maxFailures: 20, windowMinutes: 15 },
};

/** The stored counter for one scope + identifier. `null` when there is none. */
export type ThrottleRecord = {
  failures: number;
  lastFailureAt: Date;
} | null;

const MINUTE_MS = 60_000;

function windowMs(limit: ThrottleLimit): number {
  return limit.windowMinutes * MINUTE_MS;
}

/**
 * Has the counter gone quiet for a full window? A stale counter is treated as
 * absent rather than deleted on read — the next failure overwrites it, and a
 * successful login clears it outright.
 */
export function isStale(record: ThrottleRecord, now: Date, limit: ThrottleLimit): boolean {
  if (!record) return true;
  return now.getTime() - record.lastFailureAt.getTime() >= windowMs(limit);
}

/** Failures that still count against the limit right now. */
export function activeFailures(
  record: ThrottleRecord,
  now: Date,
  limit: ThrottleLimit,
): number {
  if (!record || isStale(record, now, limit)) return 0;
  return record.failures;
}

/**
 * Should the attempt that produced this count be refused?
 *
 * **Strictly greater than, not "at least".** The counter is incremented before
 * the decision is taken — that ordering is what makes the limit hold against a
 * burst of simultaneous requests rather than only against attempts made one
 * after another — so the count already includes the attempt being judged.
 * `maxFailures: 5` therefore means "five wrong passwords are allowed and the
 * sixth is refused", which is what it reads as.
 */
export function overLimit(
  record: ThrottleRecord,
  now: Date,
  limit: ThrottleLimit,
): boolean {
  return activeFailures(record, now, limit) > limit.maxFailures;
}

/**
 * Seconds until a locked scope unlocks, assuming no further attempts. Zero
 * when it is not locked. Not shown to the user today — the login form answers
 * a throttled attempt with the same generic error as a wrong password, so
 * that the limiter cannot be used to test whether an address has an account —
 * but it is what a server log needs to be readable.
 */
export function retryAfterSeconds(
  record: ThrottleRecord,
  now: Date,
  limit: ThrottleLimit,
): number {
  if (!overLimit(record, now, limit) || !record) return 0;

  const unlocksAt = record.lastFailureAt.getTime() + windowMs(limit);
  return Math.max(0, Math.ceil((unlocksAt - now.getTime()) / 1000));
}

/**
 * The counter to store after one more failure. A stale counter restarts at 1
 * rather than resuming where an hour-old attempt left off.
 */
export function nextFailureCount(
  record: ThrottleRecord,
  now: Date,
  limit: ThrottleLimit,
): number {
  return activeFailures(record, now, limit) + 1;
}

/**
 * Is either scope over its limit? The login action checks both and treats a
 * lock on either as a failed attempt.
 */
export function anyOverLimit(
  records: Record<ThrottleScope, ThrottleRecord>,
  now: Date,
): boolean {
  return throttleScopes.some((scope) =>
    overLimit(records[scope], now, THROTTLE_LIMITS[scope]),
  );
}

/** Everything the login action knows once it has checked the credentials. */
export type LoginAttempt = {
  /** Either scope is over its limit. */
  locked: boolean;
  /** An account exists for the submitted address. */
  accountExists: boolean;
  /** The password matched that account's hash. */
  passwordOk: boolean;
  /** The account has not been deactivated by an admin. */
  accountActive: boolean;
};

/**
 * Should this login attempt be refused?
 *
 * All four reasons are one boolean on purpose. The caller must answer every
 * rejected attempt identically — same message, same timing — because "wrong
 * password", "no such account", "account disabled" and "too many attempts"
 * are each an oracle telling an attacker something about an address they do
 * not have the password for. Collapsing them into one function is what stops
 * a later edit from handling one of them separately by accident.
 *
 * Note that `locked` is checked alongside the password rather than before it:
 * an attempt made during a lockout is refused **even when the password is
 * correct**, which is the whole point of locking an account out.
 */
export function loginRejected(attempt: LoginAttempt): boolean {
  return (
    attempt.locked ||
    !attempt.accountExists ||
    !attempt.passwordOk ||
    !attempt.accountActive
  );
}
