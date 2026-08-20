"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { updateTenantUser } from "@/lib/auth/users";
import { isLocale } from "@/i18n/config";
import { setUserLocale } from "@/i18n/locale";
import { THEME_COOKIE, isTheme } from "@/lib/theme";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Set the signed-in user's UI language and persist it on their row, so the
 * preference follows them to another browser (decision 6).
 *
 * Gated on `read`: it is the lowest capability every role has, and this is a
 * write to the caller's *own* user row rather than to tenant data. A viewer
 * changing their own language is not a privilege escalation.
 */
export async function setUiLocaleAction(formData: FormData): Promise<void> {
  const session = await requireRole("read");

  const requested = formData.get("locale");
  if (!isLocale(requested)) return;

  await setUserLocale(requested);
  await updateTenantUser(
    session.tenantId,
    session.userId,
    { uiLocale: requested },
    session.userId,
  );

  const ironSession = await getSession();
  ironSession.uiLocale = requested;
  await ironSession.save();

  revalidatePath("/admin", "layout");
}

/**
 * Set the theme. Stored in a cookie only — it is a property of the device, not
 * of the person, so it deliberately does not follow the user to another
 * browser the way the language does.
 */
export async function setThemeAction(formData: FormData): Promise<void> {
  await requireRole("read");

  const requested = formData.get("theme");
  if (!isTheme(requested)) return;

  const store = await cookies();
  store.set(THEME_COOKIE, requested, {
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    sameSite: "lax",
  });

  revalidatePath("/admin", "layout");
}
