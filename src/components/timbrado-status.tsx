import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/page";
import { WarningIcon } from "@/components/shell/icons";
import type { Timbrado } from "@/db/schema";
import { formatDateOnly } from "@/domain/format";
import { timbradoStatus } from "@/domain/timbrado";
import { toSnapshot } from "@/lib/settings/timbrados";

/**
 * Renders a timbrado's health. The thresholds are the domain's — under 30 days
 * of validity or under 10 % of the authorised range left (PR-4) — so this
 * component decides nothing, it only presents.
 */
export async function TimbradoStatusBadges({
  timbrado,
  today,
}: {
  timbrado: Timbrado;
  today: string;
}) {
  const t = await getTranslations("timbrados");
  const status = timbradoStatus(toSnapshot(timbrado), today);

  return (
    <div className="flex flex-wrap items-center gap-[var(--s-2)]">
      {status.blockers.map((blocker) => (
        <Badge key={blocker} tone="danger">
          {t(`blockers.${blocker}`)}
        </Badge>
      ))}

      {status.warnings.map((warning) => (
        <Badge key={warning} tone="warn">
          {warning === "expiring_soon"
            ? t("warnings.expiring_soon", { days: status.daysRemaining })
            : t("warnings.range_low", { remaining: status.numbersRemaining })}
        </Badge>
      ))}

      {status.issuable && status.warnings.length === 0 ? (
        <Badge tone="ok">{t("status.ok")}</Badge>
      ) : null}
    </div>
  );
}

/**
 * The dashboard banner. Renders nothing when every timbrado is healthy — an
 * always-present "all good" panel trains people to ignore the space where the
 * warning will appear.
 */
export async function TimbradoAlerts({
  timbrados,
  today,
}: {
  timbrados: Timbrado[];
  today: string;
}) {
  const t = await getTranslations("timbrados");

  const flagged = timbrados
    .filter((timbrado) => timbrado.active)
    .map((timbrado) => ({ timbrado, status: timbradoStatus(toSnapshot(timbrado), today) }))
    .filter(({ status }) => status.blockers.length > 0 || status.warnings.length > 0);

  if (flagged.length === 0) return null;

  const worst = flagged.some(({ status }) => status.blockers.length > 0);

  return (
    <div
      role="status"
      className={[
        "flex flex-col gap-[var(--s-3)] rounded-md border p-[var(--s-5)]",
        worst
          ? "border-danger/30 bg-danger-soft"
          : "border-warn/30 bg-warn-soft",
      ].join(" ")}
    >
      <p
        className={`m-0 flex items-center gap-[var(--s-2)] font-medium ${
          worst ? "text-danger" : "text-warn"
        }`}
      >
        <span aria-hidden className="grid size-5 place-items-center">
          <WarningIcon />
        </span>
        {worst ? t("alerts.blocked") : t("alerts.attention")}
      </p>

      <ul className="m-0 flex list-none flex-col gap-[var(--s-2)] p-0">
        {flagged.map(({ timbrado, status }) => (
          <li key={timbrado.id} className="text-[length:var(--t--1)] text-ink-70">
            <span className="tabular font-medium text-ink">
              {t("label", {
                number: timbrado.number,
                establishment: timbrado.establishment,
                point: timbrado.expeditionPoint,
              })}
            </span>{" "}
            —{" "}
            {status.blockers.map((blocker) => t(`blockers.${blocker}`)).join(", ") ||
              status.warnings
                .map((warning) =>
                  warning === "expiring_soon"
                    ? t("warnings.expiring_soon", { days: status.daysRemaining })
                    : t("warnings.range_low", { remaining: status.numbersRemaining }),
                )
                .join(", ")}
            {status.blockers.length === 0 ? (
              <span className="text-ink-55">
                {" "}
                · {t("validUntil", { date: formatDateOnly(timbrado.validTo) })}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
