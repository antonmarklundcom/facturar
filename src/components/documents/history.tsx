import { getTranslations } from "next-intl/server";
import { listActivity } from "@/lib/activity";
import { formatDateTime } from "@/domain/format";

/**
 * The per-document history panel (PR-12; PR-13 extends the same log into the
 * dashboard). Append-only by construction — `activity_log` has no update or
 * delete path — so this is a record, not a status field.
 */
export async function DocumentHistory({
  tenantId,
  documentId,
}: {
  tenantId: number;
  documentId: number;
}) {
  const [t, entries] = await Promise.all([
    getTranslations("history"),
    listActivity(tenantId, "document", documentId),
  ]);

  if (entries.length === 0) {
    return <p className="m-0 text-[length:var(--t--1)] text-ink-55">{t("empty")}</p>;
  }

  return (
    <ol className="m-0 flex list-none flex-col gap-[var(--s-3)] p-0">
      {entries.map((entry) => (
        <li key={entry.id} className="flex flex-wrap items-baseline gap-[var(--s-2)]">
          <span className="tabular text-[length:var(--t--1)] text-ink-55">
            {formatDateTime(entry.createdAt)}
          </span>
          <span className="text-[length:var(--t--1)]">{t(`actions.${entry.action}`)}</span>
          {detailOf(entry.detail) ? (
            <span className="text-[length:var(--t--1)] text-ink-55">
              · {detailOf(entry.detail)}
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/**
 * A short, safe summary of the JSON detail. Only known keys are shown — the
 * column is free-form, and rendering it wholesale would eventually print
 * something that should not be on screen.
 */
function detailOf(detail: unknown): string | null {
  if (!detail || typeof detail !== "object") return null;
  const record = detail as Record<string, unknown>;

  for (const key of ["number", "to", "subject"]) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
  }

  return null;
}
