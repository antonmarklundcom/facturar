"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import {
  Field,
  FormMessage,
  buttonClass,
  ghostButtonClass,
  inputClass,
} from "@/components/ui/field";
import { IDLE, type FormState } from "@/lib/forms";
import { normalizeWhatsapp } from "@/domain/whatsapp";
import { validateRuc } from "@/domain/ruc";
import {
  createCustomerAction,
  setCustomerActiveAction,
  updateCustomerAction,
} from "./actions";

export type CustomerValues = {
  id?: number;
  name: string;
  ruc: string;
  isConsumidorFinal: boolean;
  whatsapp: string;
  email: string;
  address: string;
  docLocale: string;
  notes: string;
  active?: boolean;
};

const EMPTY: CustomerValues = {
  name: "",
  ruc: "",
  isConsumidorFinal: false,
  whatsapp: "",
  email: "",
  address: "",
  docLocale: "es",
  notes: "",
};

function Submit({ label, ghost }: { label: string; ghost?: boolean }) {
  const t = useTranslations("customers");
  const { pending } = useFormStatus();

  return (
    <button type="submit" className={ghost ? ghostButtonClass : buttonClass} disabled={pending}>
      {pending ? t("saving") : label}
    </button>
  );
}

/**
 * The shared field set. The RUC and WhatsApp inputs validate as you leave them
 * using the very same domain functions the server action calls (guardrail 7) —
 * one implementation, two call sites, so the two can never disagree.
 */
function CustomerFields({
  values,
  error,
  echoed,
}: {
  values: CustomerValues;
  error: (name: string) => string | undefined;
  echoed?: Record<string, string>;
}) {
  const t = useTranslations("customers");
  const suffix = values.id ?? "new";

  const initial = (name: keyof CustomerValues) =>
    echoed?.[name] ?? (values[name] as string | undefined) ?? "";

  const [consumidorFinal, setConsumidorFinal] = useState(
    echoed?.isConsumidorFinal !== undefined
      ? echoed.isConsumidorFinal === "on"
      : values.isConsumidorFinal,
  );
  const [rucHint, setRucHint] = useState<string | undefined>(undefined);
  const [whatsappHint, setWhatsappHint] = useState<string | undefined>(undefined);

  return (
    <>
      <Field label={t("name")} htmlFor={`name-${suffix}`} error={error("name")}>
        <input
          id={`name-${suffix}`}
          name="name"
          defaultValue={initial("name")}
          required
          maxLength={200}
          autoComplete="off"
          className={inputClass}
        />
      </Field>

      <div className="flex flex-col gap-[var(--s-3)]">
        <Field
          label={t("ruc")}
          htmlFor={`ruc-${suffix}`}
          error={error("ruc") ?? rucHint}
          hint={consumidorFinal ? t("rucOptionalHint") : t("rucHint")}
        >
          <input
            id={`ruc-${suffix}`}
            name="ruc"
            defaultValue={initial("ruc")}
            inputMode="numeric"
            placeholder="80012345-0"
            autoComplete="off"
            className={`${inputClass} tabular`}
            onBlur={(event) => {
              const raw = event.currentTarget.value.trim();
              if (raw === "") return setRucHint(undefined);
              const result = validateRuc(raw);
              setRucHint(result.valid ? undefined : t(`errors.${result.problem}`));
            }}
          />
        </Field>

        <label className="flex min-h-11 items-center gap-[var(--s-2)]">
          <input
            type="checkbox"
            name="isConsumidorFinal"
            checked={consumidorFinal}
            onChange={(event) => setConsumidorFinal(event.currentTarget.checked)}
            className="size-5"
          />
          <span className="text-[length:var(--t--1)]">{t("consumidorFinal")}</span>
        </label>
      </div>

      <div className="grid gap-[var(--s-4)] sm:grid-cols-2">
        <Field
          label={t("whatsapp")}
          htmlFor={`whatsapp-${suffix}`}
          error={error("whatsapp") ?? whatsappHint}
          hint={t("whatsappHint")}
        >
          <input
            id={`whatsapp-${suffix}`}
            name="whatsapp"
            defaultValue={initial("whatsapp")}
            inputMode="tel"
            placeholder="0981 123456"
            autoComplete="off"
            className={`${inputClass} tabular`}
            onBlur={(event) => {
              const raw = event.currentTarget.value.trim();
              if (raw === "") return setWhatsappHint(undefined);
              const result = normalizeWhatsapp(raw);
              if (result.valid) {
                // Show the number the way it will be stored, so the
                // normalisation is visible rather than a surprise.
                event.currentTarget.value = result.normalized;
                setWhatsappHint(undefined);
              } else {
                setWhatsappHint(t(`errors.${result.problem}`));
              }
            }}
          />
        </Field>

        <Field label={t("email")} htmlFor={`email-${suffix}`} error={error("email")}>
          <input
            id={`email-${suffix}`}
            name="email"
            type="email"
            defaultValue={initial("email")}
            autoComplete="off"
            className={inputClass}
          />
        </Field>
      </div>

      <div className="grid gap-[var(--s-4)] sm:grid-cols-2">
        <Field label={t("address")} htmlFor={`address-${suffix}`} error={error("address")}>
          <input
            id={`address-${suffix}`}
            name="address"
            defaultValue={initial("address")}
            maxLength={300}
            autoComplete="off"
            className={inputClass}
          />
        </Field>

        <Field
          label={t("docLocale")}
          htmlFor={`docLocale-${suffix}`}
          hint={t("docLocaleHint")}
          error={error("docLocale")}
        >
          <select
            id={`docLocale-${suffix}`}
            name="docLocale"
            defaultValue={initial("docLocale") || "es"}
            className={inputClass}
          >
            <option value="es">{t("locales.es")}</option>
            <option value="en">{t("locales.en")}</option>
          </select>
        </Field>
      </div>

      <Field label={t("notes")} htmlFor={`notes-${suffix}`} error={error("notes")}>
        <textarea
          id={`notes-${suffix}`}
          name="notes"
          defaultValue={initial("notes")}
          rows={3}
          maxLength={2000}
          className={`${inputClass} min-h-24 py-[var(--s-3)]`}
        />
      </Field>
    </>
  );
}

function useCustomerForm(action: typeof createCustomerAction) {
  const t = useTranslations("customers");
  const [state, formAction] = useActionState<FormState, FormData>(action, IDLE);

  const error = (name: string) =>
    state.fieldErrors?.[name] ? t(`errors.${state.fieldErrors[name]}`) : undefined;

  return { state, formAction, error, t };
}

export function CreateCustomerForm() {
  const { state, formAction, error, t } = useCustomerForm(createCustomerAction);

  return (
    <form action={formAction} className="flex flex-col gap-[var(--s-5)]" noValidate>
      {state.status === "error" && !state.fieldErrors ? (
        <FormMessage tone="error">{t(`errors.${state.messageKey}`)}</FormMessage>
      ) : null}
      {state.status === "success" ? (
        <FormMessage tone="success">{t("messages.created")}</FormMessage>
      ) : null}

      {/* Remount on every failed attempt so the echoed values land as
          defaultValue — React 19 resets the form once the action settles. */}
      <div key={state.attempt ?? 0} className="flex flex-col gap-[var(--s-5)]">
        <CustomerFields values={EMPTY} error={error} echoed={state.values} />
      </div>

      <div>
        <Submit label={t("create")} />
      </div>
    </form>
  );
}

export function EditCustomerForm({ values }: { values: CustomerValues }) {
  const { state, formAction, error, t } = useCustomerForm(updateCustomerAction);

  return (
    <form action={formAction} className="flex flex-col gap-[var(--s-5)]" noValidate>
      <input type="hidden" name="customerId" value={values.id} />

      {state.status === "error" && !state.fieldErrors ? (
        <FormMessage tone="error">{t(`errors.${state.messageKey}`)}</FormMessage>
      ) : null}
      {state.status === "success" ? (
        <FormMessage tone="success">{t("messages.updated")}</FormMessage>
      ) : null}

      <div key={state.attempt ?? 0} className="flex flex-col gap-[var(--s-5)]">
        <CustomerFields values={values} error={error} echoed={state.values} />
      </div>

      <input type="hidden" name="active" value={values.active ? "true" : "false"} />

      <div>
        <Submit label={t("save")} />
      </div>
    </form>
  );
}

/**
 * Deactivate / restore. A customer is never deleted — issued documents point
 * at them and those are immutable (guardrail 4).
 */
export function CustomerActiveToggle({ id, active }: { id: number; active: boolean }) {
  const t = useTranslations("customers");
  const [state, formAction] = useActionState<FormState, FormData>(
    setCustomerActiveAction,
    IDLE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-[var(--s-3)]">
      <input type="hidden" name="customerId" value={id} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />

      {state.status === "error" ? (
        <FormMessage tone="error">{t(`errors.${state.messageKey}`)}</FormMessage>
      ) : null}
      {state.status === "success" ? (
        <FormMessage tone="success">{t(`messages.${state.messageKey}`)}</FormMessage>
      ) : null}

      <Submit label={active ? t("deactivate") : t("restore")} ghost />
    </form>
  );
}
