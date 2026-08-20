import "server-only";

import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { users, type Role, type User } from "@/db/schema";
import { tenantScoped } from "@/db/tenant";
import type { Locale } from "@/i18n/config";

/**
 * Normalise an email for storage and lookup. Addresses are compared
 * case-insensitively; the local part is lowercased too, which is what every
 * mail provider these tenants use actually does.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type LoginCandidate = Pick<
  User,
  "id" | "tenantId" | "email" | "name" | "role" | "uiLocale" | "passwordHash" | "active"
> & { mustChangePassword: boolean };

/**
 * Look up the account to authenticate. `users.email` is unique *per tenant*
 * (ARCHITECTURE.md), so in principle two tenants could share an address and a
 * bare email would be ambiguous. Two guards handle that:
 *
 *  - `assertEmailAvailable` below refuses to create a second account with the
 *    same address in any tenant, so it cannot happen through the app, and
 *  - this lookup fails closed if it ever does happen anyway.
 */
export async function findLoginCandidate(email: string): Promise<LoginCandidate | null> {
  const rows = await db
    .select({
      id: users.id,
      tenantId: users.tenantId,
      email: users.email,
      name: users.name,
      role: users.role,
      uiLocale: users.uiLocale,
      passwordHash: users.passwordHash,
      active: users.active,
      mustChangePassword: users.mustChangePassword,
    })
    .from(users)
    .where(eq(users.email, normalizeEmail(email)))
    .limit(2);

  return rows.length === 1 ? rows[0] : null;
}

/** Users of one tenant, for the admin management screen. */
export async function listTenantUsers(tenantId: number) {
  return db
    .select({
      id: users.id,
      tenantId: users.tenantId,
      email: users.email,
      name: users.name,
      role: users.role,
      uiLocale: users.uiLocale,
      active: users.active,
      mustChangePassword: users.mustChangePassword,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .where(tenantScoped(users, tenantId))
    .orderBy(users.name);
}

/** A single user, scoped to the caller's tenant. `null` if it belongs elsewhere. */
export async function findTenantUser(tenantId: number, userId: number) {
  const rows = await db
    .select({
      id: users.id,
      tenantId: users.tenantId,
      email: users.email,
      name: users.name,
      role: users.role,
      uiLocale: users.uiLocale,
      passwordHash: users.passwordHash,
      active: users.active,
      mustChangePassword: users.mustChangePassword,
    })
    .from(users)
    .where(tenantScoped(users, tenantId, eq(users.id, userId)))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Is this address free? Checked across *all* tenants so that login by email
 * alone stays unambiguous — see `findLoginCandidate`.
 */
export async function isEmailAvailable(
  email: string,
  exceptUserId?: number,
): Promise<boolean> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(
      exceptUserId === undefined
        ? eq(users.email, normalizeEmail(email))
        : and(eq(users.email, normalizeEmail(email)), ne(users.id, exceptUserId)),
    )
    .limit(1);

  return rows.length === 0;
}

/**
 * How many active admins the tenant has, ignoring `exceptUserId`. Used to stop
 * the last admin from demoting or deactivating themselves and locking the
 * tenant out of its own settings.
 */
export async function countOtherActiveAdmins(
  tenantId: number,
  exceptUserId: number,
): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(
      tenantScoped(
        users,
        tenantId,
        eq(users.role, "admin"),
        eq(users.active, true),
        ne(users.id, exceptUserId),
      ),
    );

  return Number(rows[0]?.count ?? 0);
}

export async function insertUser(values: {
  tenantId: number;
  email: string;
  name: string;
  role: Role;
  uiLocale: Locale;
  passwordHash: string;
  mustChangePassword: boolean;
  updatedBy: number;
}): Promise<number> {
  const [result] = await db.insert(users).values({
    tenantId: values.tenantId,
    email: normalizeEmail(values.email),
    name: values.name,
    role: values.role,
    uiLocale: values.uiLocale,
    passwordHash: values.passwordHash,
    mustChangePassword: values.mustChangePassword,
    updatedBy: values.updatedBy,
  });

  return result.insertId;
}

/** Scoped update — the WHERE always carries the tenant. */
export async function updateTenantUser(
  tenantId: number,
  userId: number,
  values: Partial<{
    name: string;
    role: Role;
    active: boolean;
    uiLocale: Locale;
    passwordHash: string;
    mustChangePassword: boolean;
  }>,
  updatedBy: number,
): Promise<void> {
  await db
    .update(users)
    .set({ ...values, updatedBy })
    .where(tenantScoped(users, tenantId, eq(users.id, userId)));
}

export async function markLoggedIn(tenantId: number, userId: number): Promise<void> {
  await db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(tenantScoped(users, tenantId, eq(users.id, userId)));
}
