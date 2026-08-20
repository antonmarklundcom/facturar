import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui/page";
import { TimbradoStatusBadges } from "@/components/timbrado-status";
import { APP_PATH, requireSession } from "@/lib/auth/guards";
import { can } from "@/lib/auth/roles";
import { listTimbrados } from "@/lib/settings/timbrados";
import { asuncionDateString, formatDateOnly } from "@/domain/format";
import { formatDocumentNumber } from "@/domain/numbering";
import { timbradoStatus } from "@/domain/timbrado";
import { toSnapshot } from "@/lib/settings/timbrados";
import { CreateTimbradoForm, EditTimbradoForm } from "./timbrado-forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("timbrados");
  return { title: t("title") };
}

export default async function TimbradosPage() {
  const session = await requireSession();
  if (!can(session.role, "timbrados.manage")) redirect(APP_PATH);

  const [t, timbrados] = await Promise.all([
    getTranslations("timbrados"),
    listTimbrados(session.tenantId),
  ]);

  const today = asuncionDateString(new Date());

  return (
    <>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("intro")}
        actions={
          <Link
            href="/admin/ajustes"
            className="inline-flex min-h-11 items-center rounded-sm border border-hairline-strong px-[var(--s-4)] text-[length:var(--t--1)] no-underline"
          >
            {t("backToSettings")}
          </Link>
        }
      />

      <div className="grid gap-[var(--s-6)] lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="flex flex-col gap-[var(--s-4)]">
          {timbrados.length === 0 ? (
            <Card variant="raised">
              <EmptyState title={t("empty.title")} body={t("empty.body")} />
            </Card>
          ) : null}

          {timbrados.map((timbrado) => {
            const status = timbradoStatus(toSnapshot(timbrado), today);

            return (
              <Card key={timbrado.id} variant={timbrado.active ? "raised" : "hair"}>
                <div className="mb-[var(--s-4)] flex flex-wrap items-start justify-between gap-[var(--s-3)]">
                  <div className="min-w-0">
                    <p className="eyebrow m-0">{t("number")}</p>
                    <p className="tabular m-0 mt-[var(--s-1)] font-[family-name:var(--font-display)] text-[length:var(--t-2)] leading-none">
                      {timbrado.number}
                    </p>
                    <p className="tabular m-0 mt-[var(--s-2)] text-[length:var(--t--1)] text-ink-55">
                      {t("nextNumber")}:{" "}
                      {formatDocumentNumber(
                        timbrado.establishment,
                        timbrado.expeditionPoint,
                        Math.min(timbrado.nextSequence, timbrado.rangeEnd),
                      )}
                    </p>
                  </div>
                  <TimbradoStatusBadges timbrado={timbrado} today={today} />
                </div>

                <dl className="m-0 grid grid-cols-2 gap-[var(--s-3)] border-y border-hairline py-[var(--s-4)] sm:grid-cols-4">
                  <Stat label={t("validFrom")} value={formatDateOnly(timbrado.validFrom)} />
                  <Stat label={t("validTo")} value={formatDateOnly(timbrado.validTo)} />
                  <Stat
                    label={t("daysRemaining")}
                    value={
                      status.daysRemaining >= 0 ? String(status.daysRemaining) : t("expired")
                    }
                  />
                  <Stat
                    label={t("numbersRemaining")}
                    value={`${status.numbersRemaining} / ${status.rangeSize}`}
                  />
                </dl>

                {/* Range consumption as a bar rather than another number —
                    "how much is left" is the question this screen answers. */}
                <div
                  className="mt-[var(--s-4)] h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
                  role="img"
                  aria-label={t("rangeUsed", {
                    percent: Math.round(status.rangeUsedFraction * 100),
                  })}
                >
                  <div
                    className={`h-full rounded-full ${
                      status.warnings.includes("range_low") ? "bg-warn" : "bg-accent"
                    }`}
                    style={{ width: `${Math.min(100, status.rangeUsedFraction * 100)}%` }}
                  />
                </div>

                <details className="mt-[var(--s-5)]">
                  <summary className="cursor-pointer text-[length:var(--t--1)] text-ink-70">
                    {t("edit")}
                  </summary>
                  <div className="mt-[var(--s-4)]">
                    <EditTimbradoForm
                      values={{
                        id: timbrado.id,
                        number: timbrado.number,
                        validFrom: timbrado.validFrom,
                        validTo: timbrado.validTo,
                        establishment: timbrado.establishment,
                        expeditionPoint: timbrado.expeditionPoint,
                        rangeStart: String(timbrado.rangeStart),
                        rangeEnd: String(timbrado.rangeEnd),
                        active: timbrado.active,
                      }}
                    />
                  </div>
                </details>
              </Card>
            );
          })}
        </div>

        <Card variant="accent" className="lg:sticky lg:top-[var(--s-6)]">
          <SectionTitle hint={t("createHint")}>{t("createTitle")}</SectionTitle>
          <CreateTimbradoForm />
        </Card>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="m-0 text-[length:var(--t--1)] text-ink-55">{label}</dt>
      <dd className="tabular m-0 mt-[var(--s-1)]">{value}</dd>
    </div>
  );
}
