import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LocaleSwitch } from "@/components/locale-switch";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("login");
  return { title: t("title") };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const [t, params] = await Promise.all([getTranslations("login"), searchParams]);

  // Only a path inside the authenticated app survives; the action re-checks.
  const next =
    typeof params.next === "string" && params.next.startsWith("/admin")
      ? params.next
      : undefined;

  return (
    <main className="flex min-h-dvh items-center justify-center px-[var(--gutter)] py-[var(--s-12)]">
      <div className="w-full max-w-[26rem]">
        <p className="eyebrow m-0">{t("eyebrow")}</p>
        <h1 className="mt-[var(--s-3)] mb-[var(--s-6)] text-[length:var(--t-3)]">
          {t("title")}
        </h1>

        <div className="rounded-lg border border-hairline bg-surface p-[var(--s-8)] shadow-[var(--shadow-1)]">
          <LoginForm next={next} />
        </div>

        <div className="mt-[var(--s-6)]">
          <LocaleSwitch />
        </div>
      </div>
    </main>
  );
}
