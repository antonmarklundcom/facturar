import { getTranslations } from "next-intl/server";

/**
 * The loading state every list screen shows while its data is being fetched.
 *
 * Shaped like the content it replaces — a header block and a few rows — so the
 * page does not jump when the real thing arrives. The animation is a quiet
 * pulse rather than a spinner, and it is announced to screen readers once.
 */
export async function ListSkeleton({ rows = 5 }: { rows?: number }) {
  const t = await getTranslations("common");

  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-[var(--s-6)]">
      <span className="sr-only">{t("loading")}</span>

      <div className="flex flex-col gap-[var(--s-3)]">
        <Bar className="h-3 w-24" />
        <Bar className="h-8 w-64 max-w-full" />
        <Bar className="h-4 w-full max-w-[var(--measure)]" />
      </div>

      <div className="rounded-md border border-hairline p-[var(--s-5)]">
        <div className="flex flex-col gap-[var(--s-4)]">
          {Array.from({ length: rows }, (_, index) => (
            <div key={index} className="flex items-center justify-between gap-[var(--s-4)]">
              <Bar className="h-4 w-1/3" />
              <Bar className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Bar({ className }: { className: string }) {
  return (
    <span
      aria-hidden
      className={`block animate-pulse rounded-sm bg-surface-2 ${className}`}
    />
  );
}
