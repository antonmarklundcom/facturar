"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
};

/**
 * Active-state logic lives in one place: a link is active when the path
 * matches it exactly, or when it is a section root the current path sits
 * inside. `/admin` is special-cased — every route starts with it, so it would
 * otherwise always look active.
 */
export function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = isActive(pathname, item.href);

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={[
        "group relative flex min-h-11 items-center gap-[var(--s-3)] rounded-sm",
        "px-[var(--s-3)] text-[length:var(--t-0)] no-underline",
        "transition-colors duration-[var(--dur-fast)] ease-(--ease-io)",
        active
          ? "bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] font-medium text-accent"
          : "text-ink-70 hover:bg-surface-2 hover:text-ink",
      ].join(" ")}
    >
      {/* The active marker is a rail, not a filled pill — quieter, and it
          survives dark mode without a second accent value. */}
      <span
        aria-hidden
        className={[
          "absolute inset-y-1 -left-[var(--s-3)] w-[3px] rounded-full",
          active ? "bg-accent" : "bg-transparent",
        ].join(" ")}
      />
      <span aria-hidden className="grid size-5 shrink-0 place-items-center">
        {item.icon}
      </span>
      {item.label}
    </Link>
  );
}
