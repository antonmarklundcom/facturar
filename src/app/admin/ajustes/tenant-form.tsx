"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { Field, FormMessage, buttonClass, inputClass } from "@/components/ui/field";
import { IDLE, type FormState } from "@/lib/forms";
import { updateTenantAction } from "./actions";

function Submit() {
  const t = useTranslations("settings");
  const { pending } = useFormStatus();

  return (
    <button type="submit" className={buttonClass} disabled={pending}>
      {pending ? t("saving") : t("save")}
    </button>
  );
}

export function TenantForm({
  tenant,
}: {
  tenant: {
    name: string;
    ruc: string;
    logoUrl: string;
    defaultCurrency: string;
    address: string;
    phone: string;
    email: string;
  };
}) {
  const t = useTranslations("settings");
  const [state, formAction] = useActionState<FormState, FormData>(
    updateTenantAction,
    IDLE,
  );

  const error = (name: string) =>
    state.fieldErrors?.[name] ? t(`errors.${state.fieldErrors[name]}`) : undefined;

  // React 19 resets the form once the action settles; restore what was typed
  // so a validation error does not blank the screen.
  const initial = (name: keyof typeof tenant) => state.values?.[name] ?? tenant[name];

  return (
    <form
      key={state.attempt ?? 0}
      action={formAction}
      className="flex flex-col gap-[var(--s-5)]"
      noValidate
    >
      {state.status === "error" && !state.fieldErrors ? (
        <FormMessage tone="error">{t(`errors.${state.messageKey}`)}</FormMessage>
      ) : null}
      {state.status === "success" ? (
        <FormMessage tone="success">{t("messages.saved")}</FormMessage>
      ) : null}

      <Field label={t("companyName")} htmlFor="name" error={error("name")}>
        <input
          id="name"
          name="name"
          defaultValue={initial("name")}
          required
          className={inputClass}
        />
      </Field>

      <div className="grid gap-[var(--s-5)] sm:grid-cols-2">
        <Field
          label={t("ruc")}
          htmlFor="ruc"
          hint={t("rucHint")}
          error={error("ruc")}
        >
          <input
            id="ruc"
            name="ruc"
            defaultValue={initial("ruc")}
            inputMode="numeric"
            placeholder="80012345-0"
            className={`${inputClass} tabular`}
          />
        </Field>

        <Field
          label={t("defaultCurrency")}
          htmlFor="defaultCurrency"
          hint={t("defaultCurrencyHint")}
          error={error("defaultCurrency")}
        >
          <select
            id="defaultCurrency"
            name="defaultCurrency"
            defaultValue={initial("defaultCurrency")}
            className={inputClass}
          >
            <option value="PYG">{t("currencies.PYG")}</option>
            <option value="USD">{t("currencies.USD")}</option>
          </select>
        </Field>
      </div>

      <div className="grid gap-[var(--s-5)] sm:grid-cols-2">
        <Field label={t("phone")} htmlFor="phone">
          <input
            id="phone"
            name="phone"
            defaultValue={initial("phone")}
            inputMode="tel"
            placeholder="+595 981 123456"
            className={inputClass}
          />
        </Field>

        <Field label={t("email")} htmlFor="email" error={error("email")}>
          <input
            id="email"
            name="email"
            type="email"
            defaultValue={initial("email")}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label={t("address")} htmlFor="address">
        <input
          id="address"
          name="address"
          defaultValue={initial("address")}
          className={inputClass}
        />
      </Field>

      <Field
        label={t("logoUrl")}
        htmlFor="logoUrl"
        hint={t("logoUrlHint")}
        error={error("logoUrl")}
      >
        <input
          id="logoUrl"
          name="logoUrl"
          type="url"
          inputMode="url"
          defaultValue={initial("logoUrl")}
          placeholder="https://…"
          className={inputClass}
        />
      </Field>

      <div>
        <Submit />
      </div>
    </form>
  );
}
