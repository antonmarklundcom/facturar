import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { THEME_COOKIE, defaultTheme, isTheme, themeAttribute } from "@/lib/theme";
import "./globals.css";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
});

const text = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app");
  return {
    title: { default: t("name"), template: `%s · ${t("name")}` },
    description: t("tagline"),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [locale, cookieStore] = await Promise.all([getLocale(), cookies()]);

  // Resolved server-side and rendered straight onto <html>, so there is no
  // flash of the wrong theme and no blocking inline script. "system" renders
  // no attribute at all and lets prefers-color-scheme decide.
  const stored = cookieStore.get(THEME_COOKIE)?.value;
  const theme = isTheme(stored) ? stored : defaultTheme;

  return (
    <html
      lang={locale}
      data-theme={themeAttribute(theme)}
      className={`${display.variable} ${text.variable}`}
    >
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
