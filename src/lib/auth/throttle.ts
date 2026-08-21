import "server-only";

import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { loginThrottle } from "@/db/schema";
import {
  overLimit,
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
  /** True when either scope is over its limit, counting this attempt. */
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
 * Count this attempt and report where that leaves both scopes.
 *
 * **The increment happens first, and that ordering is the control.** Reading
 * the counter, deciding, and only then incrementing looks equivalent and is
 * not: a thousand requests fired at once would all read the same pre-attempt
 * value, all find themselves under the limit, and all proceed — the limit
 * would only ever apply to attempts made one after another, which is not how
 * anyone attacks a login form (PR-18 security review). Incrementing first
 * makes each concurrent attempt observe a count that already includes itself,
 * so a burst of a thousand gets a handful through rather than all thousand.
 *
 * A successful login deletes the row afterwards, so the attempt this counted
 * costs a legitimate user nothing.
 *
 * This never throws and never short-circuits the login: the caller runs the
 * whole credential check regardless, so a throttled attempt takes the same
 * path — and the same time — as a wrong password.
 */
export async function countAttempt(
  email: string,
  ip: string | null,
  now: Date,
): Promise<ThrottleSnapshot> {
  await Promise.all([
    bumpOne("email", email, now),
    ip ? bumpOne("ip", ip, now) : Promise.resolve(),
  ]);

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
    if (!overLimit(records[scope], now, limit)) continue;

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

/**
 * Add one to a counter, atomically.
 *
 * The new value is computed by the database from the stored row, never from a
 * value this process read a moment ago: `INSERT … ON DUPLICATE KEY UPDATE` on
 * a unique key is a single row operation, so N concurrent attempts produce N,
 * not one. Reading the total back afterwards can only ever see an equal or
 * higher count, which errs towards locking — the safe direction.
 */
async function bumpOne(
  scope: ThrottleScope,
  identifier: string,
  now: Date,
): Promise<void> {
  const staleBefore = new Date(
    now.getTime() - THROTTLE_LIMITS[scope].windowMinutes * 60_000,
  );

  await db
    .insert(loginThrottle)
    .values({
      scope,
      identifier: normalizeIdentifier(identifier),
      failures: 1,
      lastFailureAt: now,
    })
    .onDuplicateKeyUpdate({
      // `<=` and not `<`, matching `isStale()` exactly: a counter whose last
      // failure is precisely one window old has already expired, so the
      // attempt landing on that boundary starts a fresh count rather than
      // resuming the old one. (Written with `<` first; the database test
      // caught it.)
      set: {
        failures: sql`if(${loginThrottle.lastFailureAt} <= ${staleBefore}, 1, ${loginThrottle.failures} + 1)`,
        lastFailureAt: now,
      },
    });
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
