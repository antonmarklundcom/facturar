"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { Field, FormMessage, buttonClass, inputClass } from "@/components/ui/field";
import { IDLE, type FormState } from "@/lib/forms";
import { loginAction } from "./actions";

function SubmitButton() {
  const t = useTranslations("login");
  const { pending } = useFormStatus();

  return (
    <button type="submit" className={buttonClass} disabled={pending}>
      {pending ? t("submitting") : t("submit")}
    </button>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const t = useTranslations("login");
  const [state, formAction] = useActionState<FormState, FormData>(loginAction, IDLE);

  return (
    <form
      key={state.attempt ?? 0}
      action={formAction}
      className="flex flex-col gap-[var(--s-5)]"
      noValidate
    >
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {state.status === "error" && state.messageKey ? (
        <FormMessage tone="error">{t(`errors.${state.messageKey}`)}</FormMessage>
      ) : null}

      <Field
        label={t("email")}
        htmlFor="email"
        error={state.fieldErrors?.email ? t(`errors.${state.fieldErrors.email}`) : undefined}
      >
        <input
          id="email"
          name="email"
          type="email"
          defaultValue={state.values?.email ?? ""}
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          className={inputClass}
          aria-invalid={state.fieldErrors?.email ? true : undefined}
        />
      </Field>

      <Field
        label={t("password")}
        htmlFor="password"
        error={
          state.fieldErrors?.password ? t(`errors.${state.fieldErrors.password}`) : undefined
        }
      >
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={inputClass}
          aria-invalid={state.fieldErrors?.password ? true : undefined}
        />
      </Field>

      <SubmitButton />

      {/* Decision 19: no self-service reset. Say so, rather than leaving the
          user hunting for a link that does not exist. */}
      <p className="m-0 text-[length:var(--t--1)] text-ink-55">{t("forgotPassword")}</p>
    </form>
  );
}
