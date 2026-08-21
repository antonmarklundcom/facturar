import { and, eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * The login limiter's *storage* (PR-16), against a real MySQL.
 *
 * The domain decision is covered without a database in
 * `tests/domain/throttle.test.ts`. What needs a real engine is the upsert: the
 * failure counter is recomputed in SQL rather than from the value the request
 * just read, so that two simultaneous attempts cannot both write "1" and hand
 * an attacker a free retry. That expression can only be trusted by running it.
 *
 * Skipped — loudly — when `TEST_DATABASE_URL` is unset, like the numbering
 * test, so the pre-push gate stays runnable without a local MySQL.
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeWithDb = TEST_DATABASE_URL ? describe : describe.skip;

describeWithDb("login throttle storage (requires TEST_DATABASE_URL)", () => {
  let db: typeof import("@/db").db;
  let loginThrottle: typeof import("@/db/schema").loginThrottle;
  let throttle: typeof import("@/lib/auth/throttle");
  let THROTTLE_LIMITS: typeof import("@/domain/throttle").THROTTLE_LIMITS;

  const EMAIL = "throttle-test@sanblas.com.py";
  const IP = "203.0.113.7";
  const T0 = new Date("2026-08-21T12:00:00.000Z");
  const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    ({ db } = await import("@/db"));
    ({ loginThrottle } = await import("@/db/schema"));
    throttle = await import("@/lib/auth/throttle");
    ({ THROTTLE_LIMITS } = await import("@/domain/throttle"));
  });

  afterEach(async () => {
    await db.delete(loginThrottle).where(eq(loginThrottle.identifier, EMAIL));
    await db.delete(loginThrottle).where(eq(loginThrottle.identifier, IP));
  });

  /** One rejected attempt, exactly as the login action performs it. */
  async function fail(now: Date) {
    const snapshot = await throttle.readThrottle(EMAIL, IP, now);
    await throttle.recordFailure(EMAIL, IP, snapshot, now);
  }

  it("starts with no counters at all", async () => {
    const snapshot = await throttle.readThrottle(EMAIL, IP, T0);

    expect(snapshot.email).toBeNull();
    expect(snapshot.ip).toBeNull();
    expect(snapshot.locked).toBe(false);
    expect(snapshot.lockedScope).toBeNull();
  });

  it("counts failures up and locks the address at the limit", async () => {
    const limit = THROTTLE_LIMITS.email.maxFailures;

    for (let attempt = 1; attempt < limit; attempt += 1) {
      await fail(at(attempt));
      const snapshot = await throttle.readThrottle(EMAIL, IP, at(attempt));
      expect(snapshot.email?.failures).toBe(attempt);
      expect(snapshot.locked, `locked after only ${attempt} failures`).toBe(false);
    }

    await fail(at(limit));
    const locked = await throttle.readThrottle(EMAIL, IP, at(limit));

    expect(locked.email?.failures).toBe(limit);
    expect(locked.locked).toBe(true);
    expect(locked.lockedScope).toBe("email");
    expect(locked.retryAfter).toBe(THROTTLE_LIMITS.email.windowMinutes * 60);
  });

  it("resets the stored counter when the window has gone quiet", async () => {
    const { maxFailures, windowMinutes } = THROTTLE_LIMITS.email;

    for (let attempt = 1; attempt <= maxFailures; attempt += 1) await fail(at(attempt));
    expect((await throttle.readThrottle(EMAIL, IP, at(maxFailures))).locked).toBe(true);

    // A full window later, the lock has lifted on read...
    const later = at(maxFailures + windowMinutes);
    expect((await throttle.readThrottle(EMAIL, IP, later)).locked).toBe(false);

    // ...and the next failure restarts the count at 1 in the database itself,
    // rather than resuming from the stale value.
    await fail(later);
    const restarted = await throttle.readThrottle(EMAIL, IP, later);
    expect(restarted.email?.failures).toBe(1);
    expect(restarted.locked).toBe(false);
  });

  it("clears the address counter on a successful login, but not the IP one", async () => {
    for (let attempt = 1; attempt <= 3; attempt += 1) await fail(at(attempt));

    await throttle.clearThrottle(EMAIL);
    const after = await throttle.readThrottle(EMAIL, IP, at(4));

    expect(after.email).toBeNull();
    // The IP budget deliberately survives: holding one valid account must not
    // reset the address-wide count between bursts of guesses at other people's.
    expect(after.ip?.failures).toBe(3);
  });

  it("counts concurrent failures once each rather than losing them", async () => {
    // Six requests reading the same counter and writing at the same moment.
    // A read-modify-write in JavaScript would land on "1"; the upsert does
    // its arithmetic in SQL, so all six are counted.
    const snapshot = await throttle.readThrottle(EMAIL, IP, T0);
    await Promise.all(
      Array.from({ length: 6 }, () => throttle.recordFailure(EMAIL, IP, snapshot, T0)),
    );

    const after = await throttle.readThrottle(EMAIL, IP, T0);
    expect(after.email?.failures).toBe(6);
    expect(after.locked).toBe(true);
  });

  it("locks on the IP scope alone once it passes its own, higher limit", async () => {
    const { maxFailures } = THROTTLE_LIMITS.ip;
    const now = T0;

    // Spraying distinct addresses from one IP: no single address gets near
    // its own limit, but the address-wide count does.
    for (let attempt = 0; attempt < maxFailures; attempt += 1) {
      const snapshot = await throttle.readThrottle(`spray-${attempt}@x.py`, IP, now);
      await throttle.recordFailure(`spray-${attempt}@x.py`, IP, snapshot, now);
    }

    const fresh = await throttle.readThrottle("someone-else@sanblas.com.py", IP, now);
    expect(fresh.email).toBeNull();
    expect(fresh.locked).toBe(true);
    expect(fresh.lockedScope).toBe("ip");

    await db.delete(loginThrottle).where(eq(loginThrottle.scope, "email"));
  });

  it("prunes counters far older than any window and keeps recent ones", async () => {
    await fail(T0);
    await throttle.pruneStaleThrottles(at(1));
    expect((await throttle.readThrottle(EMAIL, IP, at(1))).email?.failures).toBe(1);

    await throttle.pruneStaleThrottles(at(60 * 24));
    const rows = await db
      .select()
      .from(loginThrottle)
      .where(and(eq(loginThrottle.scope, "email"), eq(loginThrottle.identifier, EMAIL)));
    expect(rows).toEqual([]);
  });
});
