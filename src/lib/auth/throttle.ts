import "server-only";

import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { loginThrottle } from "@/db/schema";
import {
  isLockedOut,
  nextFailureCount,
  retryAfterSeconds,
  THROTTLE_LIMITS,
  throttleScopes,
  type ThrottleRecord,
  type ThrottleScope,
} from "@/domain/throttle";

/**
 * Storage for the login limiter (PR-16).
 *
 * **Why a table and not an in-memory map.** A map is free and needs no
 * migration, and it is the wrong choice here for two concrete reasons: it
 * empties on every deploy, so a lockout is lifted by any push, and it is
 * per-process, so a slot running more than one Node process counts each
 * attacker's attempts several times over and locks nobody out. Both of those
 * are exactly the conditions this app ships into. The cost is one upsert per
 * *failed* attempt — a successful login writes nothing but a delete, and a
 * successful login is the common case. On a tenant of five people that is a
 * handful of rows a week.
 *
 * This module holds the database handle without `tenantScoped()`, which is the
 * documented exception in `tests/data-access-scoped.test.ts`: the limiter runs
 * before a session exists, so there is no tenant id to scope by, and asking
 * the database which tenant an address belongs to before deciding whether to
 * throttle it would be the account-existence oracle the limiter must not be.
 */

/** Emails and IPs are stored at the column's width; see the schema comment. */
const MAX_IDENTIFIER = 190;

function normalizeIdentifier(value: string): string {
  return value.trim().slice(0, MAX_IDENTIFIER);
}

/** The counters for one login attempt, both scopes at once. */
export type ThrottleSnapshot = {
  email: ThrottleRecord;
  ip: ThrottleRecord;
  /** True when either scope is over its limit right now. */
  locked: boolean;
  /** Seconds until the longest-running lock lifts; 0 when not locked. */
  retryAfter: number;
  /** Which scope caused the lock, for the server log. */
  lockedScope: ThrottleScope | null;
};

async function readRecord(
  scope: ThrottleScope,
  identifier: string,
): Promise<ThrottleRecord> {
  const rows = await db
    .select({
      failures: loginThrottle.failures,
      lastFailureAt: loginThrottle.lastFailureAt,
    })
    .from(loginThrottle)
    .where(
      and(
        eq(loginThrottle.scope, scope),
        eq(loginThrottle.identifier, normalizeIdentifier(identifier)),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Read both counters. The caller decides what to do with the verdict — this
 * never throws and never short-circuits the login, so that a throttled attempt
 * takes the same code path, and therefore the same time, as a wrong password.
 */
export async function readThrottle(
  email: string,
  ip: string | null,
  now: Date,
): Promise<ThrottleSnapshot> {
  const [emailRecord, ipRecord] = await Promise.all([
    readRecord("email", email),
    ip ? readRecord("ip", ip) : Promise.resolve(null),
  ]);

  const records: Record<ThrottleScope, ThrottleRecord> = {
    email: emailRecord,
    ip: ipRecord,
  };

  let lockedScope: ThrottleScope | null = null;
  let retryAfter = 0;

  for (const scope of throttleScopes) {
    const limit = THROTTLE_LIMITS[scope];
    if (!isLockedOut(records[scope], now, limit)) continue;

    const seconds = retryAfterSeconds(records[scope], now, limit);
    if (seconds >= retryAfter) {
      retryAfter = seconds;
      lockedScope = scope;
    }
  }

  return {
    email: emailRecord,
    ip: ipRecord,
    locked: lockedScope !== null,
    retryAfter,
    lockedScope,
  };
}

async function recordOne(
  scope: ThrottleScope,
  identifier: string,
  previous: ThrottleRecord,
  now: Date,
): Promise<void> {
  const failures = nextFailureCount(previous, now, THROTTLE_LIMITS[scope]);

  await db
    .insert(loginThrottle)
    .values({
      scope,
      identifier: normalizeIdentifier(identifier),
      failures,
      lastFailureAt: now,
    })
    .onDuplicateKeyUpdate({
      // Recomputed in SQL rather than trusting the value we just read: two
      // concurrent attempts must not both write "1".
      //
      // `<=` and not `<`, matching `isStale()` exactly: a counter whose last
      // failure is precisely one window old has already expired, so the
      // attempt that lands on that boundary starts a fresh count rather than
      // resuming the old one.
      set: {
        failures: sql`if(${loginThrottle.lastFailureAt} <= ${new Date(
          now.getTime() - THROTTLE_LIMITS[scope].windowMinutes * 60_000,
        )}, 1, ${loginThrottle.failures} + 1)`,
        lastFailureAt: now,
      },
    });
}

/**
 * Count one failed attempt against both scopes.
 *
 * Every rejected login is recorded, including one rejected *because* it was
 * already locked out (so hammering the form extends the lock) and one for an
 * address that has no account (so the limiter behaves identically whether or
 * not the account exists).
 */
export async function recordFailure(
  email: string,
  ip: string | null,
  snapshot: ThrottleSnapshot,
  now: Date,
): Promise<void> {
  await Promise.all([
    recordOne("email", email, snapshot.email, now),
    ip ? recordOne("ip", ip, snapshot.ip, now) : Promise.resolve(),
  ]);
}

/**
 * Clear the email counter after a successful login.
 *
 * The IP counter is deliberately *not* cleared. Someone who holds one valid
 * account would otherwise be able to reset the address-wide budget between
 * every burst of guesses at everyone else's, which is the one thing the IP
 * scope exists to stop. Its limit is set high enough that a shared office
 * address never reaches it by accident.
 */
export async function clearThrottle(email: string): Promise<void> {
  await db
    .delete(loginThrottle)
    .where(
      and(
        eq(loginThrottle.scope, "email"),
        eq(loginThrottle.identifier, normalizeIdentifier(email)),
      ),
    );
}

/**
 * Drop counters that have been quiet for far longer than any window, so a
 * spray across thousands of addresses does not leave the table to grow
 * forever. Called on a successful login: rare, indexed, and off the path of
 * anything a person is waiting for.
 */
export async function pruneStaleThrottles(now: Date): Promise<void> {
  const longestWindow = Math.max(
    ...throttleScopes.map((scope) => THROTTLE_LIMITS[scope].windowMinutes),
  );
  // Ten windows back: long past the point where a row can still lock anyone
  // out, and long enough that pruning never races an attempt in flight.
  const cutoff = new Date(now.getTime() - longestWindow * 10 * 60_000);

  await db.delete(loginThrottle).where(lt(loginThrottle.lastFailureAt, cutoff));
}
