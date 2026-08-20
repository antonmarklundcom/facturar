import "server-only";

import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { activityLog, type ActivityAction, type ActivityLogEntry } from "@/db/schema";
import { tenantScoped, withTenant } from "@/db/tenant";

/**
 * Append an audit entry (decision 14). `activity_log` is append-only — there is
 * deliberately no update or delete helper here.
 *
 * Never put a password, hash or token in `detail`; it is rendered in the
 * per-document history panel in PR-13.
 */
export async function logActivity(entry: {
  tenantId: number;
  userId: number | null;
  entityType: string;
  entityId: number;
  action: ActivityAction;
  detail?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(activityLog).values(
    withTenant(entry.tenantId, {
      userId: entry.userId,
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      detail: entry.detail ?? null,
    }),
  );
}

/**
 * The history of one entity, newest first — the per-document panel (PR-12,
 * extended in PR-13). Tenant-scoped like every other read.
 */
export async function listActivity(
  tenantId: number,
  entityType: string,
  entityId: number,
  limit = 50,
): Promise<ActivityLogEntry[]> {
  return db
    .select()
    .from(activityLog)
    .where(
      tenantScoped(
        activityLog,
        tenantId,
        eq(activityLog.entityType, entityType),
        eq(activityLog.entityId, entityId),
      ),
    )
    .orderBy(desc(activityLog.createdAt), desc(activityLog.id))
    .limit(limit);
}
