"use server";

import { revalidatePath } from "next/cache";
import { isLocale } from "@/i18n/config";
import { setUserLocale } from "@/i18n/locale";

/**
 * Switch the UI language. Read-only preference — no tenant data is touched, so
 * no `requireRole()` gate applies here. PR-5 additionally persists the choice
 * on the signed-in user's `ui_locale` column.
 */
export async function switchLocaleAction(formData: FormData): Promise<void> {
  const requested = formData.get("locale");
  if (!isLocale(requested)) return;

  await setUserLocale(requested);
  revalidatePath("/", "layout");
}
