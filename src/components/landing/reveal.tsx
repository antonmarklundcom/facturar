"use client";

import { useEffect } from "react";

/**
 * Scroll reveal for the landing page (web-design-system step 5), ported from
 * the skill's `motion.js`: 280 ms, `cubic-bezier(.16,1,.3,1)`, 70 ms stagger
 * capped at six siblings, and nothing at all under
 * `prefers-reduced-motion: reduce`.
 *
 * It runs on `[data-reveal]` elements only — the motion budget is at most 15 %
 * of the page, and the hero deliberately carries none of it, because animating
 * above-the-fold text delays LCP and reads slow on a phone.
 */
export function Reveal() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const items = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (items.length === 0) return;

    if (reduce || !("IntersectionObserver" in window)) {
      for (const element of items) {
        element.style.opacity = "1";
        element.style.transform = "none";
      }
      return;
    }

    for (const element of items) {
      element.style.opacity = "0";
      element.style.transform = "translateY(18px)";
      element.style.transition =
        "opacity 280ms cubic-bezier(.16,1,.3,1), transform 280ms cubic-bezier(.16,1,.3,1)";
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const element = entry.target as HTMLElement;
          const index = Math.min(Number(element.dataset.reveal ?? 0), 6);
          element.style.transitionDelay = `${index * 70}ms`;
          element.style.opacity = "1";
          element.style.transform = "none";
          observer.unobserve(element);
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.15 },
    );

    for (const element of items) observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return null;
}

/**
 * The analytics shim (web-design-system step 6.5). It loads nothing and needs
 * no account: every CTA carries `data-ev` / `data-ev-loc`, and the clicks land
 * in `window.dataLayer`, so GA4, GTM or Plausible can be switched on later
 * with one paste and no markup changes.
 */
export function AnalyticsPrep() {
  useEffect(() => {
    const target = window as unknown as { dataLayer?: Record<string, unknown>[] };
    target.dataLayer = target.dataLayer ?? [];

    const onClick = (event: MouseEvent) => {
      const element = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-ev]");
      if (!element) return;

      target.dataLayer?.push({
        event: element.dataset.ev,
        ev_loc: element.dataset.evLoc ?? "",
        page_path: window.location.pathname,
        site: window.location.hostname,
      });
    };

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return null;
}
