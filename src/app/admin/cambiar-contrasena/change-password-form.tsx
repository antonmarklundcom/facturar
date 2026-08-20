"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { Field, FormMessage, buttonClass, inputClass } from "@/components/ui/field";
import { IDLE, type FormState } from "@/lib/forms";
import { changeOwnPasswordAction } from "./actions";

function SubmitButton() {
  const t = useTranslations("changePassword");
  const { pending } = useFormStatus();

  return (
    <button type="submit" className={buttonClass} disabled={pending}>
      {pending ? t("submitting") : t("submit")}
    </button>
  );
}

export function ChangePasswordForm({ minLength }: { minLength: number }) {
  const t = useTranslations("changePassword");
  const [state, formAction] = useActionState<FormState, FormData>(
    changeOwnPasswordAction,
    IDLE,
  );

  const fieldError = (name: string) =>
    state.fieldErrors?.[name] ? t(`errors.${state.fieldErrors[name]}`) : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-[var(--s-5)]" noValidate>
      {state.status === "error" && state.messageKey && !state.fieldErrors ? (
        <FormMessage tone="error">{t(`errors.${state.messageKey}`)}</FormMessage>
      ) : null}

      <Field
        label={t("currentPassword")}
        htmlFor="currentPassword"
        error={fieldError("currentPassword")}
      >
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          className={inputClass}
        />
      </Field>

      <Field
        label={t("newPassword")}
        htmlFor="newPassword"
        hint={t("hint", { min: minLength })}
        error={fieldError("newPassword")}
      >
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={minLength}
          required
          className={inputClass}
        />
      </Field>

      <Field
        label={t("confirmPassword")}
        htmlFor="confirmPassword"
        error={fieldError("confirmPassword")}
      >
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={minLength}
          required
          className={inputClass}
        />
      </Field>

      <SubmitButton />
    </form>
  );
}
