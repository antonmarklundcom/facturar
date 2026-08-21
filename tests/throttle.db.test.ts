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
    await db.delete(loginThrottle).where(eq(loginThrottle.scope, "email"));
  });

  /** One attempt, exactly as the login action performs it. */
  const attempt = (now: Date, email = EMAIL) => throttle.countAttempt(email, IP, now);

  /** The stored counter, without touching it. */
  const stored = async (scope: "email" | "ip", identifier: string) => {
    const rows = await db
      .select({ failures: loginThrottle.failures })
      .from(loginThrottle)
      .where(
        and(eq(loginThrottle.scope, scope), eq(loginThrottle.identifier, identifier)),
      );
    return rows[0]?.failures ?? null;
  };

  it("counts the attempt in hand, and allows exactly maxFailures of them", async () => {
    const limit = THROTTLE_LIMITS.email.maxFailures;

    for (let n = 1; n <= limit; n += 1) {
      const snapshot = await attempt(at(n));
      expect(snapshot.email?.failures).toBe(n);
      expect(snapshot.locked, `refused on attempt ${n} of ${limit}`).toBe(false);
    }

    // The one after the limit is refused.
    const refused = await attempt(at(limit + 1));
    expect(refused.email?.failures).toBe(limit + 1);
    expect(refused.locked).toBe(true);
    expect(refused.lockedScope).toBe("email");
    expect(refused.retryAfter).toBe(THROTTLE_LIMITS.email.windowMinutes * 60);
  });

  it("holds against a burst of simultaneous attempts, not only sequential ones", async () => {
    // The whole reason the counter is incremented *before* the decision.
    // Read-then-decide would let all fifty of these read "0 failures", find
    // themselves under the limit, and go through — the limit would only ever
    // apply to attempts made one after another, which is not how anyone
    // attacks a login form.
    const burst = 50;
    const snapshots = await Promise.all(
      Array.from({ length: burst }, () => attempt(T0)),
    );

    // Every attempt is counted: none is lost to a lost update.
    expect(await stored("email", EMAIL)).toBe(burst);

    // And most of them are refused. The exact number that slips through
    // depends on interleaving, so this asserts the property that matters:
    // far fewer than all of them, and no more than the limit allows.
    const allowed = snapshots.filter((s) => !s.locked).length;
    expect(allowed).toBeLessThanOrEqual(THROTTLE_LIMITS.email.maxFailures);
    expect(allowed).toBeLessThan(burst);
  });

  it("resets the stored counter when the window has gone quiet", async () => {
    const { maxFailures, windowMinutes } = THROTTLE_LIMITS.email;

    for (let n = 1; n <= maxFailures + 1; n += 1) await attempt(at(n));
    expect((await attempt(at(maxFailures + 2))).locked).toBe(true);

    // A full window after the last attempt, the count has expired: the next
    // attempt restarts at 1 in the database itself rather than resuming from
    // the stale value, and is allowed.
    const later = at(maxFailures + 2 + windowMinutes);
    const restarted = await attempt(later);
    expect(restarted.email?.failures).toBe(1);
    expect(restarted.locked).toBe(false);
  });

  it("clears the address counter on a successful login, but not the IP one", async () => {
    for (let n = 1; n <= 3; n += 1) await attempt(at(n));

    await throttle.clearThrottle(EMAIL);

    expect(await stored("email", EMAIL)).toBeNull();
    // The IP budget deliberately survives: holding one valid account must not
    // reset the address-wide count between bursts of guesses at other people's.
    expect(await stored("ip", IP)).toBe(3);
  });

  it("locks on the IP scope alone once it passes its own, higher limit", async () => {
    const { maxFailures } = THROTTLE_LIMITS.ip;

    // Spraying distinct addresses from one IP: no single address gets near its
    // own limit, but the address-wide count does.
    for (let n = 0; n <= maxFailures; n += 1) {
      await attempt(T0, `spray-${n}@x.py`);
    }

    const fresh = await attempt(T0, "someone-else@sanblas.com.py");
    expect(fresh.email?.failures).toBe(1);
    expect(fresh.locked).toBe(true);
    expect(fresh.lockedScope).toBe("ip");

    await db.delete(loginThrottle).where(eq(loginThrottle.scope, "email"));
  });

  it("prunes counters far older than any window and keeps recent ones", async () => {
    await attempt(T0);
    await throttle.pruneStaleThrottles(at(1));
    expect(await stored("email", EMAIL)).toBe(1);

    await throttle.pruneStaleThrottles(at(60 * 24));
    expect(await stored("email", EMAIL)).toBeNull();
  });
});
