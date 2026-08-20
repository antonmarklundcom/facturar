"use client";

import { useActionState } from "react";
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
import { createTimbradoAction, updateTimbradoAction } from "./actions";

function Submit({ label, ghost }: { label: string; ghost?: boolean }) {
  const t = useTranslations("timbrados");
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className={ghost ? ghostButtonClass : buttonClass}
      disabled={pending}
    >
      {pending ? t("saving") : label}
    </button>
  );
}

type TimbradoValues = {
  id?: number;
  number: string;
  validFrom: string;
  validTo: string;
  establishment: string;
  expeditionPoint: string;
  rangeStart: string;
  rangeEnd: string;
  active?: boolean;
};

function TimbradoFields({
  values,
  showStart,
  error,
  echoed,
}: {
  values: TimbradoValues;
  showStart: boolean;
  error: (name: string) => string | undefined;
  /**
   * What the user submitted last time. React 19 resets a form once its action
   * settles, so without this a validation error would hand back a blank form
   * with error messages on it.
   */
  echoed?: Record<string, string>;
}) {
  const t = useTranslations("timbrados");
  const initial = (name: keyof TimbradoValues) =>
    echoed?.[name] ?? (values[name] as string | undefined) ?? "";

  return (
    <>
      <Field label={t("number")} htmlFor={`number-${values.id ?? "new"}`} error={error("number")}>
        <input
          id={`number-${values.id ?? "new"}`}
          name="number"
          defaultValue={initial("number")}
          inputMode="numeric"
          required
          className={`${inputClass} tabular`}
        />
      </Field>

      <div className="grid gap-[var(--s-4)] sm:grid-cols-2">
        <Field
          label={t("validFrom")}
          htmlFor={`validFrom-${values.id ?? "new"}`}
          error={error("validFrom")}
        >
          <input
            id={`validFrom-${values.id ?? "new"}`}
            name="validFrom"
            type="date"
            defaultValue={initial("validFrom")}
            required
            className={inputClass}
          />
        </Field>

        <Field
          label={t("validTo")}
          htmlFor={`validTo-${values.id ?? "new"}`}
          error={error("validTo")}
        >
          <input
            id={`validTo-${values.id ?? "new"}`}
            name="validTo"
            type="date"
            defaultValue={initial("validTo")}
            required
            className={inputClass}
          />
        </Field>
      </div>

      <div className="grid gap-[var(--s-4)] sm:grid-cols-2">
        <Field
          label={t("establishment")}
          htmlFor={`establishment-${values.id ?? "new"}`}
          error={error("establishment")}
        >
          <input
            id={`establishment-${values.id ?? "new"}`}
            name="establishment"
            defaultValue={initial("establishment")}
            inputMode="numeric"
            maxLength={3}
            className={`${inputClass} tabular`}
          />
        </Field>

        <Field
          label={t("expeditionPoint")}
          htmlFor={`expeditionPoint-${values.id ?? "new"}`}
          error={error("expeditionPoint")}
        >
          <input
            id={`expeditionPoint-${values.id ?? "new"}`}
            name="expeditionPoint"
            defaultValue={initial("expeditionPoint")}
            inputMode="numeric"
            maxLength={3}
            className={`${inputClass} tabular`}
          />
        </Field>
      </div>

      <div className="grid gap-[var(--s-4)] sm:grid-cols-2">
        <Field
          label={t("rangeStart")}
          htmlFor={`rangeStart-${values.id ?? "new"}`}
          error={error("rangeStart")}
        >
          <input
            id={`rangeStart-${values.id ?? "new"}`}
            name="rangeStart"
            type="number"
            min={1}
            defaultValue={initial("rangeStart")}
            required
            className={`${inputClass} tabular`}
          />
        </Field>

        <Field
          label={t("rangeEnd")}
          htmlFor={`rangeEnd-${values.id ?? "new"}`}
          error={error("rangeEnd")}
        >
          <input
            id={`rangeEnd-${values.id ?? "new"}`}
            name="rangeEnd"
            type="number"
            min={1}
            defaultValue={initial("rangeEnd")}
            required
            className={`${inputClass} tabular`}
          />
        </Field>
      </div>

      {showStart ? (
        <Field
          label={t("startAt")}
          htmlFor="nextSequence"
          hint={t("startAtHint")}
          error={error("nextSequence")}
        >
          <input
            id="nextSequence"
            name="nextSequence"
            type="number"
            min={1}
            defaultValue={echoed?.nextSequence ?? ""}
            placeholder={initial("rangeStart")}
            className={`${inputClass} tabular`}
          />
        </Field>
      ) : null}
    </>
  );
}

export function CreateTimbradoForm() {
  const t = useTranslations("timbrados");
  const [state, formAction] = useActionState<FormState, FormData>(
    createTimbradoAction,
    IDLE,
  );

  const error = (name: string) =>
    state.fieldErrors?.[name] ? t(`errors.${state.fieldErrors[name]}`) : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-[var(--s-5)]" noValidate>
      {state.status === "error" && !state.fieldErrors ? (
        <FormMessage tone="error">{t(`errors.${state.messageKey}`)}</FormMessage>
      ) : null}
      {state.status === "success" ? (
        <FormMessage tone="success">{t("messages.created")}</FormMessage>
      ) : null}

      <div key={state.attempt ?? 0} className="flex flex-col gap-[var(--s-5)]">
        <TimbradoFields
          values={{
            number: "",
            validFrom: "",
            validTo: "",
            establishment: "001",
            expeditionPoint: "001",
            rangeStart: "1",
            rangeEnd: "1000",
          }}
          showStart
          error={error}
          echoed={state.values}
        />
      </div>

      <div>
        <Submit label={t("create")} />
      </div>
    </form>
  );
}

export function EditTimbradoForm({ values }: { values: TimbradoValues }) {
  const t = useTranslations("timbrados");
  const [state, formAction] = useActionState<FormState, FormData>(
    updateTimbradoAction,
    IDLE,
  );

  const error = (name: string) =>
    state.fieldErrors?.[name] ? t(`errors.${state.fieldErrors[name]}`) : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-[var(--s-4)]" noValidate>
      <input type="hidden" name="timbradoId" value={values.id} />

      {state.status === "error" && !state.fieldErrors ? (
        <FormMessage tone="error">{t(`errors.${state.messageKey}`)}</FormMessage>
      ) : null}
      {state.status === "success" ? (
        <FormMessage tone="success">{t("messages.updated")}</FormMessage>
      ) : null}

      <div key={state.attempt ?? 0} className="flex flex-col gap-[var(--s-4)]">
        <TimbradoFields
          values={values}
          showStart={false}
          error={error}
          echoed={state.values}
        />
      </div>

      <label className="flex min-h-11 items-center gap-[var(--s-2)]">
        <input
          type="checkbox"
          name="active"
          defaultChecked={values.active}
          className="size-5"
        />
        <span className="text-[length:var(--t--1)]">{t("active")}</span>
      </label>

      <div>
        <Submit label={t("save")} ghost />
      </div>
    </form>
  );
}
