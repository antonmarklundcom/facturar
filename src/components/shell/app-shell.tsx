"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { NavLink, type NavItem } from "./nav";
import { CloseIcon, MenuIcon } from "./icons";

/**
 * Mobile-first app shell.
 *
 * Under 1024px the navigation is a drawer behind a menu button; at 1024px and
 * up it is a permanent 260px rail. The main column is capped and the rail is
 * fixed-width, so the layout is deliberately asymmetric rather than an even
 * split — an even split is what makes an admin read as a template.
 */
export function AppShell({
  items,
  brand,
  identity,
  preferences,
  children,
}: {
  items: NavItem[];
  brand: { title: string; subtitle: string | null };
  identity: ReactNode;
  preferences: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Navigating inside the drawer must close it, or the destination renders
  // underneath an open overlay on a phone.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Escape closes the drawer; the body must not scroll behind it.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const navigation = (
    <nav className="flex flex-col gap-[var(--s-1)] ps-[var(--s-3)]" aria-label={brand.title}>
      {items.map((item) => (
        <NavLink key={item.href} item={item} />
      ))}
    </nav>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      {/* ---- desktop rail ---- */}
      <aside className="hidden border-e border-hairline bg-surface lg:flex lg:h-dvh lg:flex-col lg:gap-[var(--s-8)] lg:sticky lg:top-0 lg:p-[var(--s-6)]">
        <Brand subtitle={brand.subtitle} />
        <div className="flex-1 overflow-y-auto">{navigation}</div>
        <div className="flex flex-col gap-[var(--s-4)] border-t border-hairline pt-[var(--s-4)]">
          {preferences}
          {identity}
        </div>
      </aside>

      {/* ---- mobile bar ---- */}
      <header className="sticky top-0 z-30 flex items-center gap-[var(--s-3)] border-b border-hairline bg-surface px-[var(--gutter)] py-[var(--s-3)] lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="app-drawer"
          className="grid size-11 place-items-center rounded-sm border border-hairline-strong text-ink"
        >
          <MenuIcon />
          <span className="sr-only">{brand.title}</span>
        </button>
        <Link
          href="/admin"
          className="font-[family-name:var(--font-display)] text-[length:var(--t-1)] leading-none no-underline"
        >
          facturar
        </Link>
      </header>

      {/* ---- mobile drawer ---- */}
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="close"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-[color-mix(in_srgb,var(--ink)_45%,transparent)]"
          />
          <div
            id="app-drawer"
            className="relative flex h-full w-[min(20rem,85vw)] flex-col gap-[var(--s-6)] overflow-y-auto bg-surface p-[var(--s-6)] shadow-[var(--shadow-2)]"
          >
            <div className="flex items-start justify-between gap-[var(--s-4)]">
              <Brand subtitle={brand.subtitle} />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid size-11 shrink-0 place-items-center rounded-sm border border-hairline-strong"
              >
                <CloseIcon />
                <span className="sr-only">×</span>
              </button>
            </div>
            <div className="flex-1">{navigation}</div>
            <div className="flex flex-col gap-[var(--s-4)] border-t border-hairline pt-[var(--s-4)]">
              {preferences}
              {identity}
            </div>
          </div>
        </div>
      ) : null}

      <main className="min-w-0 px-[var(--gutter)] py-[var(--s-8)] lg:py-[var(--s-12)]">
        <div className="mx-auto max-w-[64rem]">{children}</div>
      </main>
    </div>
  );
}

function Brand({ subtitle }: { subtitle: string | null }) {
  return (
    <div className="min-w-0">
      <Link
        href="/admin"
        className="font-[family-name:var(--font-display)] text-[length:var(--t-2)] leading-none no-underline"
      >
        facturar
      </Link>
      {subtitle ? (
        <p className="m-0 mt-[var(--s-2)] truncate text-[length:var(--t--1)] text-ink-55">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
