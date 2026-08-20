"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import type { Role } from "@/db/schema";
import {
  Field,
  FormMessage,
  buttonClass,
  ghostButtonClass,
  inputClass,
} from "@/components/ui/field";
import { IDLE, type FormState } from "@/lib/forms";
import { createUserAction, resetUserPasswordAction, updateUserAction } from "./actions";

const ROLES: Role[] = ["admin", "employee", "viewer"];

function Submit({ label, pendingLabel, ghost }: { label: string; pendingLabel: string; ghost?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={ghost ? ghostButtonClass : buttonClass}
      disabled={pending}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

function useFieldError(state: FormState) {
  const t = useTranslations("users");
  return (name: string) =>
    state.fieldErrors?.[name] ? t(`errors.${state.fieldErrors[name]}`) : undefined;
}

export function CreateUserForm({ minLength }: { minLength: number }) {
  const t = useTranslations("users");
  const [state, formAction] = useActionState<FormState, FormData>(createUserAction, IDLE);
  const fieldError = useFieldError(state);

  return (
    <form action={formAction} className="flex flex-col gap-[var(--s-5)]" noValidate>
      {state.status === "error" && !state.fieldErrors ? (
        <FormMessage tone="error">{t(`errors.${state.messageKey}`)}</FormMessage>
      ) : null}
      {state.status === "success" ? (
        <FormMessage tone="success">{t(`messages.${state.messageKey}`)}</FormMessage>
      ) : null}

      <Field label={t("name")} htmlFor="new-name" error={fieldError("name")}>
        <input id="new-name" name="name" required className={inputClass} />
      </Field>

      <Field label={t("email")} htmlFor="new-email" error={fieldError("email")}>
        <input
          id="new-email"
          name="email"
          type="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          className={inputClass}
        />
      </Field>

      <Field label={t("role")} htmlFor="new-role" error={fieldError("role")}>
        <select id="new-role" name="role" defaultValue="employee" className={inputClass}>
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {t(`roles.${role}`)}
            </option>
          ))}
        </select>
      </Field>

      <Field label={t("uiLocale")} htmlFor="new-locale">
        <select id="new-locale" name="uiLocale" defaultValue="es" className={inputClass}>
          <option value="es">{t("locales.es")}</option>
          <option value="en">{t("locales.en")}</option>
        </select>
      </Field>

      <Field
        label={t("initialPassword")}
        htmlFor="new-password"
        hint={t("initialPasswordHint", { min: minLength })}
        error={fieldError("password")}
      >
        <input
          id="new-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={minLength}
          required
          className={inputClass}
        />
      </Field>

      <Submit label={t("create")} pendingLabel={t("saving")} />
    </form>
  );
}

export function EditUserForm({
  user,
}: {
  user: { id: number; name: string; role: Role; active: boolean };
}) {
  const t = useTranslations("users");
  const [state, formAction] = useActionState<FormState, FormData>(updateUserAction, IDLE);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-[var(--s-3)]">
      <input type="hidden" name="userId" value={user.id} />

      <label className="flex flex-col gap-[var(--s-1)]">
        <span className="text-[length:var(--t--1)] text-ink-55">{t("name")}</span>
        <input
          name="name"
          defaultValue={user.name}
          required
          className={`${inputClass} w-56`}
        />
      </label>

      <label className="flex flex-col gap-[var(--s-1)]">
        <span className="text-[length:var(--t--1)] text-ink-55">{t("role")}</span>
        <select name="role" defaultValue={user.role} className={`${inputClass} w-44`}>
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {t(`roles.${role}`)}
            </option>
          ))}
        </select>
      </label>

      <label className="flex min-h-12 items-center gap-[var(--s-2)]">
        <input type="checkbox" name="active" defaultChecked={user.active} className="size-5" />
        <span className="text-[length:var(--t--1)]">{t("active")}</span>
      </label>

      <Submit label={t("save")} pendingLabel={t("saving")} ghost />

      {state.status === "error" ? (
        <FormMessage tone="error">{t(`errors.${state.messageKey}`)}</FormMessage>
      ) : null}
      {state.status === "success" ? (
        <FormMessage tone="success">{t(`messages.${state.messageKey}`)}</FormMessage>
      ) : null}
    </form>
  );
}

export function ResetPasswordForm({
  userId,
  minLength,
}: {
  userId: number;
  minLength: number;
}) {
  const t = useTranslations("users");
  const [state, formAction] = useActionState<FormState, FormData>(
    resetUserPasswordAction,
    IDLE,
  );
  const fieldError = useFieldError(state);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-[var(--s-3)]">
      <input type="hidden" name="userId" value={userId} />

      <label className="flex flex-col gap-[var(--s-1)]">
        <span className="text-[length:var(--t--1)] text-ink-55">{t("newPassword")}</span>
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={minLength}
          required
          className={`${inputClass} w-56`}
        />
      </label>

      <Submit label={t("resetPassword")} pendingLabel={t("saving")} ghost />

      {fieldError("password") ? (
        <FormMessage tone="error">{fieldError("password")}</FormMessage>
      ) : null}
      {state.status === "success" ? (
        <FormMessage tone="success">{t(`messages.${state.messageKey}`)}</FormMessage>
      ) : null}
    </form>
  );
}
