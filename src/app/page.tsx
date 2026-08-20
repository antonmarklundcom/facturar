import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LocaleSwitch } from "@/components/locale-switch";
import { AnalyticsPrep, Reveal } from "@/components/landing/reveal";
import { waMeLink } from "@/domain/whatsapp";

/**
 * The public landing page (decision 22, PR-15).
 *
 * Design decisions, per web-design-system:
 *
 * - **Palette is the product's own** (`globals.css`: CLINICAL track, accent
 *   `#6741aa`). The registry step in that skill exists to stop two *client*
 *   sites colliding; a product's marketing page must match the product, or the
 *   screenshot below would look like someone else's software.
 * - **Section patterns**, none repeated twice in a row: P1 asymmetric split
 *   (hero) → P8 full-bleed ribbon (facts) → P3 staggered-weight grid
 *   (benefits) → P5 numbered rail (how it works) → P6 bleed-image overlap
 *   (the panel crossing into the next section) → P2 offset stack (close).
 * - **No testimonials and no invented numbers.** There are no customers yet;
 *   a fabricated quote would be the one thing a Paraguayan SMB owner would
 *   spot instantly. The proof on this page is a real screenshot of a real
 *   invoice.
 * - Nothing here imports from `/admin`, so the marketing page never pulls the
 *   authenticated app's bundle.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("landing");

  return {
    title: t("meta.title"),
    description: t("meta.description"),
    openGraph: {
      title: t("meta.title"),
      description: t("meta.description"),
      type: "website",
    },
  };
}

/** The number the CTA writes to. Configured per deployment. */
function contactWhatsapp(): string | null {
  const raw = process.env.NEXT_PUBLIC_CONTACT_WHATSAPP?.trim();
  return raw ? raw : null;
}

export default async function HomePage() {
  const t = await getTranslations("landing");

  const whatsapp = contactWhatsapp();
  const whatsappHref = whatsapp ? waMeLink(whatsapp, t("cta.whatsappMessage")) : null;

  const benefits = ["whatsapp", "iva", "timbrado", "guaranies"] as const;
  const steps = ["quote", "invoice", "collect"] as const;
  const facts = ["ruc", "rates", "currencies", "roles"] as const;

  return (
    <>
      <Reveal />
      <AnalyticsPrep />

      <header className="mx-auto flex max-w-[var(--container)] flex-wrap items-center justify-between gap-[var(--s-3)] px-[var(--gutter)] py-[var(--s-5)]">
        <p className="m-0 font-[family-name:var(--font-display)] text-[length:var(--t-1)]">
          facturar
        </p>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-[var(--s-2)]">
          <LocaleSwitch />
          <Link
            href="/login"
            data-ev="login_click"
            data-ev-loc="header"
            className="inline-flex min-h-11 items-center rounded-sm border border-hairline-strong px-[var(--s-4)] text-[length:var(--t--1)] no-underline"
          >
            {t("nav.login")}
          </Link>
        </div>
      </header>

      <main>
        {/* 01 — P1 asymmetric split (7/5). No entrance animation above the
            fold: it delays LCP and reads slow on a phone. */}
        <section className="mx-auto grid max-w-[var(--container)] gap-[var(--s-10)] px-[var(--gutter)] pb-[var(--s-16)] pt-[var(--s-8)] lg:grid-cols-[7fr_5fr] lg:items-center lg:gap-[var(--s-12)]">
          <div className="min-w-0">
            <p className="eyebrow m-0">{t("hero.eyebrow")}</p>
            <h1 className="m-0 mt-[var(--s-4)] text-[length:var(--t-4)] leading-[1.02] sm:text-[length:var(--t-5)]">
              {t("hero.title")}
            </h1>
            <p className="m-0 mt-[var(--s-6)] max-w-[var(--measure)] text-[length:var(--t-1)] text-ink-70">
              {t("hero.body")}
            </p>

            <div className="mt-[var(--s-8)] flex flex-wrap gap-[var(--s-3)]">
              {whatsappHref ? (
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-ev="whatsapp_click"
                  data-ev-loc="hero"
                  className="inline-flex min-h-12 items-center gap-[var(--s-2)] rounded-sm bg-accent px-[var(--s-6)] font-medium text-accent-contrast no-underline transition-transform duration-[var(--dur-fast)] ease-(--ease-io) hover:-translate-y-1"
                >
                  <WhatsappGlyph />
                  {t("cta.whatsapp")}
                </a>
              ) : null}

              <Link
                href="/login"
                data-ev="login_click"
                data-ev-loc="hero"
                className="inline-flex min-h-12 items-center rounded-sm border border-hairline-strong px-[var(--s-6)] font-medium no-underline transition-transform duration-[var(--dur-fast)] ease-(--ease-io) hover:-translate-y-1"
              >
                {t("cta.login")}
              </Link>
            </div>

            <p className="m-0 mt-[var(--s-6)] max-w-[var(--measure)] text-[length:var(--t--1)] text-ink-55">
              {t("hero.note")}
            </p>
          </div>

          <figure className="m-0 min-w-0">
            <Image
              src="/producto-factura.png"
              alt={t("hero.screenshotAlt")}
              width={2880}
              height={2000}
              priority
              sizes="(max-width: 1024px) 100vw, 40vw"
              className="w-full rounded-md border border-hairline shadow-[var(--shadow-2)]"
            />
          </figure>
        </section>

        {/* 02 — P8 full-bleed ribbon. Facts, not adjectives. */}
        <section className="grain bg-ink text-base">
          <ul className="mx-auto flex max-w-[var(--container)] list-none flex-wrap justify-between gap-[var(--s-6)] px-[var(--gutter)] py-[var(--s-6)] p-0">
            {facts.map((fact) => (
              <li key={fact} className="text-[length:var(--t--1)] opacity-80">
                {t(`facts.${fact}`)}
              </li>
            ))}
          </ul>
        </section>

        {/* 03 — P3 staggered-weight grid: the first card spans two columns and
            uses the ink variant, so the row does not read as four boxes. */}
        <section className="mx-auto max-w-[var(--container)] px-[var(--gutter)] py-[var(--s-16)]">
          <p className="eyebrow m-0">{t("benefits.eyebrow")}</p>
          <h2 className="m-0 mt-[var(--s-3)] max-w-[var(--measure)] text-[length:var(--t-3)]">
            {t("benefits.title")}
          </h2>

          <div className="mt-[var(--s-8)] grid gap-[var(--s-4)] sm:grid-cols-2 lg:grid-cols-3">
            {benefits.map((benefit, index) => (
              <article
                key={benefit}
                data-reveal={index}
                className={
                  index === 0
                    ? "grain rounded-md border border-transparent bg-ink p-[var(--s-6)] text-base sm:col-span-2"
                    : index === 3
                      ? "rounded-md border border-hairline border-t-[3px] border-t-accent bg-surface p-[var(--s-6)]"
                      : index === 1
                        ? "rounded-md border border-hairline bg-surface p-[var(--s-6)] shadow-[var(--shadow-1)]"
                        : "rounded-md border border-hairline p-[var(--s-6)]"
                }
              >
                <h3 className="m-0 text-[length:var(--t-1)]">{t(`benefits.${benefit}.title`)}</h3>
                <p
                  className={`m-0 mt-[var(--s-3)] max-w-[var(--measure)] ${
                    index === 0 ? "opacity-80" : "text-ink-70"
                  }`}
                >
                  {t(`benefits.${benefit}.body`)}
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* 04 — P5 numbered process rail. */}
        <section className="mx-auto max-w-[var(--container)] px-[var(--gutter)] pb-[var(--s-16)]">
          <p className="eyebrow m-0">{t("how.eyebrow")}</p>
          <h2 className="m-0 mt-[var(--s-3)] max-w-[var(--measure)] text-[length:var(--t-3)]">
            {t("how.title")}
          </h2>

          <ol className="mt-[var(--s-8)] grid list-none gap-[var(--s-6)] p-0 lg:grid-cols-3">
            {steps.map((step, index) => (
              <li key={step} data-reveal={index} className="min-w-0">
                {/* The oversized step number sits in flow rather than behind
                    the title: at 390px an absolute one lands on top of the
                    words and reads as a rendering bug. */}
                <span
                  aria-hidden
                  className="block font-[family-name:var(--font-display)] text-[length:var(--t-4)] leading-none text-accent opacity-25"
                >
                  {index + 1}
                </span>
                <div className="mt-[var(--s-4)] border-t border-hairline-strong pt-[var(--s-5)]">
                  <h3 className="m-0 text-[length:var(--t-1)]">{t(`how.${step}.title`)}</h3>
                  <p className="m-0 mt-[var(--s-3)] max-w-[var(--measure)] text-ink-70">
                    {t(`how.${step}.body`)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* 05 — P6 bleed band with the panel crossing the boundary. This is
            the page's one overlap. */}
        <section className="grain relative bg-ink pb-[var(--s-16)] pt-[var(--s-16)] text-base">
          <div className="mx-auto max-w-[var(--container)] px-[var(--gutter)]">
            <p className="eyebrow m-0 opacity-70">{t("proof.eyebrow")}</p>
            <h2 className="m-0 mt-[var(--s-3)] max-w-[var(--measure)] text-[length:var(--t-3)]">
              {t("proof.title")}
            </h2>
            <p className="m-0 mt-[var(--s-4)] max-w-[var(--measure)] opacity-80">
              {t("proof.body")}
            </p>
          </div>

          <figure className="mx-auto mt-[var(--s-8)] max-w-[var(--container)] translate-y-[var(--s-16)] px-[var(--gutter)]">
            <Image
              src="/producto-panel.png"
              alt={t("proof.screenshotAlt")}
              width={2880}
              height={2000}
              sizes="(max-width: 1024px) 100vw, 1100px"
              className="w-full rounded-md border border-hairline shadow-[var(--shadow-2)]"
            />
          </figure>
        </section>

        {/* 06 — P2 offset stack, holding the close. */}
        <section className="mx-auto max-w-[var(--container)] px-[var(--gutter)] pb-[var(--s-16)] pt-[calc(var(--s-16)*2)]">
          <div className="ml-0 max-w-[var(--measure)] lg:ml-[clamp(0px,8vw,160px)]">
            <p className="eyebrow m-0">{t("close.eyebrow")}</p>
            <h2 className="m-0 mt-[var(--s-3)] text-[length:var(--t-3)]">{t("close.title")}</h2>
            <p className="m-0 mt-[var(--s-4)] text-ink-70">{t("close.body")}</p>

            <div className="mt-[var(--s-7)] flex flex-wrap gap-[var(--s-3)]">
              {whatsappHref ? (
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-ev="whatsapp_click"
                  data-ev-loc="close"
                  className="inline-flex min-h-12 items-center gap-[var(--s-2)] rounded-sm bg-accent px-[var(--s-6)] font-medium text-accent-contrast no-underline transition-transform duration-[var(--dur-fast)] ease-(--ease-io) hover:-translate-y-1"
                >
                  <WhatsappGlyph />
                  {t("cta.whatsapp")}
                </a>
              ) : null}
              <Link
                href="/login"
                data-ev="login_click"
                data-ev-loc="close"
                className="inline-flex min-h-12 items-center rounded-sm border border-hairline-strong px-[var(--s-6)] font-medium no-underline"
              >
                {t("cta.login")}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-hairline">
        <div className="mx-auto flex max-w-[var(--container)] flex-wrap items-center justify-between gap-[var(--s-4)] px-[var(--gutter)] py-[var(--s-6)] text-[length:var(--t--1)] text-ink-55">
          <p className="m-0">{t("footer.line")}</p>
          <p className="m-0">{t("footer.note")}</p>
        </div>
      </footer>
    </>
  );
}

/**
 * The WhatsApp mark. Its green appears **only** inside this glyph — never as a
 * section fill or a second button colour (web-design-system step 1).
 */
function WhatsappGlyph() {
  return (
    <svg
      aria-hidden
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="#25D366"
      className="shrink-0"
    >
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.19 8.19 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.14.16-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.12-.15.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.47c-.16 0-.43.06-.65.31-.22.25-.85.83-.85 2.03s.87 2.35.99 2.51c.12.16 1.71 2.61 4.15 3.66.58.25 1.03.4 1.39.51.58.19 1.11.16 1.53.1.47-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.17-.47-.29Z" />
    </svg>
  );
}
