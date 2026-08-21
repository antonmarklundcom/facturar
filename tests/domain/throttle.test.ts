import { describe, expect, it } from "vitest";
import {
  activeFailures,
  anyOverLimit,
  isStale,
  loginRejected,
  nextFailureCount,
  overLimit,
  retryAfterSeconds,
  THROTTLE_LIMITS,
  type ThrottleRecord,
} from "@/domain/throttle";

/**
 * The login limiter's decision (PR-16). Everything here is a pure function of
 * a stored counter and a `now`, so the fifteen-minute window is testable in a
 * millisecond.
 */

const EMAIL = THROTTLE_LIMITS.email;
const IP = THROTTLE_LIMITS.ip;

const T0 = new Date("2026-08-21T12:00:00.000Z");
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);
const record = (failures: number, minutesAgo = 0): ThrottleRecord => ({
  failures,
  lastFailureAt: at(-minutesAgo),
});

describe("the counting window", () => {
  it("treats a missing counter as no failures", () => {
    expect(activeFailures(null, T0, EMAIL)).toBe(0);
    expect(overLimit(null, T0, EMAIL)).toBe(false);
  });

  it("counts failures inside the window", () => {
    expect(activeFailures(record(3, 5), T0, EMAIL)).toBe(3);
  });

  it("forgets a counter that has been quiet for a whole window", () => {
    const quiet = record(EMAIL.maxFailures + 2, EMAIL.windowMinutes);

    expect(isStale(quiet, T0, EMAIL)).toBe(true);
    expect(activeFailures(quiet, T0, EMAIL)).toBe(0);
    expect(overLimit(quiet, T0, EMAIL)).toBe(false);
  });

  it("still holds one second before the window closes", () => {
    const almost: ThrottleRecord = {
      failures: EMAIL.maxFailures + 1,
      lastFailureAt: new Date(T0.getTime() - EMAIL.windowMinutes * 60_000 + 1000),
    };

    expect(isStale(almost, T0, EMAIL)).toBe(false);
    expect(overLimit(almost, T0, EMAIL)).toBe(true);
  });

  it("restarts a stale counter at one rather than resuming it", () => {
    expect(nextFailureCount(record(4, EMAIL.windowMinutes + 1), T0, EMAIL)).toBe(1);
    expect(nextFailureCount(record(4, 1), T0, EMAIL)).toBe(5);
    expect(nextFailureCount(null, T0, EMAIL)).toBe(1);
  });
});

describe("the lockout", () => {
  it("allows exactly maxFailures attempts and refuses the next one", () => {
    // The counter is incremented before the decision, so the count being
    // judged already includes the attempt in hand: `maxFailures: 5` means
    // five wrong passwords go through and the sixth does not.
    expect(overLimit(record(EMAIL.maxFailures - 1), T0, EMAIL)).toBe(false);
    expect(overLimit(record(EMAIL.maxFailures), T0, EMAIL)).toBe(false);
    expect(overLimit(record(EMAIL.maxFailures + 1), T0, EMAIL)).toBe(true);
  });

  it("gives the IP scope a much longer leash than the email scope", () => {
    // A shared office address must not be locked out by one colleague's typos.
    expect(IP.maxFailures).toBeGreaterThan(EMAIL.maxFailures);
    expect(overLimit(record(EMAIL.maxFailures + 1), T0, IP)).toBe(false);
  });

  it("counts the window from the last failure, so hammering extends the lock", () => {
    const hammered = record(EMAIL.maxFailures + 20, 0);
    const patient = record(EMAIL.maxFailures + 1, EMAIL.windowMinutes - 1);

    expect(retryAfterSeconds(hammered, T0, EMAIL)).toBe(EMAIL.windowMinutes * 60);
    expect(retryAfterSeconds(patient, T0, EMAIL)).toBe(60);
  });

  it("reports no wait when nothing is locked", () => {
    expect(retryAfterSeconds(record(1), T0, EMAIL)).toBe(0);
    expect(retryAfterSeconds(null, T0, EMAIL)).toBe(0);
  });

  it("unlocks once the window has passed with no further attempts", () => {
    const locked = record(EMAIL.maxFailures + 1);

    expect(overLimit(locked, T0, EMAIL)).toBe(true);
    expect(overLimit(locked, at(EMAIL.windowMinutes), EMAIL)).toBe(false);
  });

  it("locks the attempt when either scope is over its limit", () => {
    expect(anyOverLimit({ email: null, ip: null }, T0)).toBe(false);
    expect(
      anyOverLimit({ email: record(EMAIL.maxFailures + 1), ip: null }, T0),
    ).toBe(true);
    expect(
      anyOverLimit({ email: null, ip: record(IP.maxFailures + 1) }, T0),
    ).toBe(true);
  });
});

describe("the login decision", () => {
  const good = {
    locked: false,
    accountExists: true,
    passwordOk: true,
    accountActive: true,
  };

  it("accepts a correct password on a live account that is not locked", () => {
    expect(loginRejected(good)).toBe(false);
  });

  it("refuses a locked-out attempt that carries the CORRECT password", () => {
    // The point of a lockout: knowing the password is not a way out of it.
    expect(loginRejected({ ...good, locked: true })).toBe(true);
  });

  it("refuses a wrong password, an unknown address and a disabled account alike", () => {
    expect(loginRejected({ ...good, passwordOk: false })).toBe(true);
    expect(loginRejected({ ...good, accountExists: false })).toBe(true);
    expect(loginRejected({ ...good, accountActive: false })).toBe(true);
  });
});
