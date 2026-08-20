import type { ReactNode } from "react";

/**
 * Minimal form primitives on the PR-1 design tokens. The full component set
 * arrives with the app shell in PR-5 — these exist so the auth screens are not
 * unstyled, and so every input already meets the 48px touch target.
 */

export const inputClass =
  "min-h-12 w-full rounded-sm border border-hairline-strong bg-surface px-[var(--s-4)] " +
  "text-ink outline-none transition-[border-color,box-shadow] duration-[var(--dur-fast)] " +
  "focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/35";

export const buttonClass =
  "inline-flex min-h-12 items-center justify-center gap-[var(--s-2)] rounded-sm " +
  "bg-accent px-[var(--s-6)] font-medium text-accent-contrast " +
  "transition-[transform,box-shadow] duration-[var(--dur-fast)] ease-(--ease-io) " +
  "hover:-translate-y-0.5 hover:shadow-[var(--shadow-2)] disabled:pointer-events-none " +
  "disabled:opacity-60";

export const ghostButtonClass =
  "inline-flex min-h-12 items-center justify-center gap-[var(--s-2)] rounded-sm " +
  "border border-hairline-strong px-[var(--s-6)] font-medium text-ink " +
  "transition-[transform,box-shadow] duration-[var(--dur-fast)] ease-(--ease-io) " +
  "hover:-translate-y-0.5 hover:shadow-[var(--shadow-1)]";

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-[var(--s-2)]">
      <label
        htmlFor={htmlFor}
        className="text-[length:var(--t--1)] font-medium text-ink-70"
      >
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p className="m-0 text-[length:var(--t--1)] text-ink-55">{hint}</p>
      ) : null}
      {error ? (
        <p
          id={`${htmlFor}-error`}
          role="alert"
          className="m-0 text-[length:var(--t--1)] text-danger"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function FormMessage({ tone, children }: { tone: "error" | "success"; children: ReactNode }) {
  const styles =
    tone === "error"
      ? "border-danger/30 bg-danger-soft text-danger"
      : "border-ok/30 bg-ok-soft text-ok";

  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`m-0 rounded-sm border px-[var(--s-4)] py-[var(--s-3)] text-[length:var(--t--1)] ${styles}`}
    >
      {children}
    </p>
  );
}
