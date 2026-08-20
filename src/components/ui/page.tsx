import type { ReactNode } from "react";

/**
 * Page furniture shared by every admin screen: an eyebrow + title block, a
 * card surface, and a section heading.
 *
 * Kept deliberately small — three primitives that all screens use beats a
 * generic layout abstraction nobody can read.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-[var(--s-8)] flex flex-wrap items-end justify-between gap-[var(--s-4)]">
      <div className="min-w-0">
        <p className="eyebrow m-0">{eyebrow}</p>
        <h1 className="m-0 mt-[var(--s-2)] text-[length:var(--t-3)]">{title}</h1>
        {description ? (
          <p className="m-0 mt-[var(--s-3)] max-w-[var(--measure)] text-ink-70">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex gap-[var(--s-3)]">{actions}</div> : null}
    </header>
  );
}

export function Card({
  children,
  variant = "raised",
  className = "",
}: {
  children: ReactNode;
  /** Three of the five variants from the design system are in play app-wide. */
  variant?: "raised" | "hair" | "accent" | "ink";
  className?: string;
}) {
  const variants = {
    raised: "bg-surface border border-hairline shadow-[var(--shadow-1)]",
    hair: "bg-transparent border border-hairline",
    accent: "bg-surface border border-hairline border-t-[3px] border-t-accent",
    ink: "bg-ink text-base border border-transparent",
  } as const;

  return (
    <section className={`rounded-md p-[var(--s-6)] ${variants[variant]} ${className}`}>
      {children}
    </section>
  );
}

export function SectionTitle({
  children,
  hint,
}: {
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-[var(--s-5)]">
      <h2 className="m-0 text-[length:var(--t-1)]">{children}</h2>
      {hint ? (
        <p className="m-0 mt-[var(--s-2)] text-[length:var(--t--1)] text-ink-55">{hint}</p>
      ) : null}
    </div>
  );
}

/** Small status pill. `tone` maps onto the semantic tokens, never the accent. */
export function Badge({
  tone,
  children,
}: {
  tone: "ok" | "warn" | "danger" | "info" | "muted";
  children: ReactNode;
}) {
  const tones = {
    ok: "bg-ok-soft text-ok",
    warn: "bg-warn-soft text-warn",
    danger: "bg-danger-soft text-danger",
    info: "bg-info-soft text-info",
    muted: "bg-surface-2 text-ink-55",
  } as const;

  return (
    <span
      className={`inline-flex items-center rounded-sm px-[var(--s-2)] py-[2px] text-[length:var(--t--1)] leading-tight ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** Empty state for a list that has nothing in it yet. */
export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-dashed border-hairline-strong p-[var(--s-8)] text-center">
      <p className="m-0 mx-auto font-medium">{title}</p>
      <p className="m-0 mx-auto mt-[var(--s-2)] max-w-[42ch] text-[length:var(--t--1)] text-ink-55">
        {body}
      </p>
    </div>
  );
}
