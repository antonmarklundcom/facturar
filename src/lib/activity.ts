import "server-only";

import { db } from "@/db";
import { activityLog, type ActivityAction } from "@/db/schema";
import { withTenant } from "@/db/tenant";

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
