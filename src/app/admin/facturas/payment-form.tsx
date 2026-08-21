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
import { PAYMENT_METHOD_ORDER } from "@/domain/payments";
import { deletePaymentAction, recordPaymentAction } from "./actions";

/**
 * Recording a payment. The amount is in the invoice's currency — the form
 * does not offer a choice, because a payment in another currency is a
 * settlement-rate conversation the app does not have yet.
 */
export function PaymentForm({
  documentId,
  outstandingLabel,
  today,
}: {
  documentId: number;
  /** Pre-filled amount: what is still owed, the usual case. */
  outstandingLabel: string;
  today: string;
}) {
  const t = useTranslations("payments");
  const [state, formAction] = useActionState<FormState, FormData>(recordPaymentAction, IDLE);

  const error = (name: string) =>
    state.fieldErrors?.[name] ? t(`errors.${state.fieldErrors[name]}`) : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-[var(--s-4)]" noValidate>
      <input type="hidden" name="documentId" value={documentId} />

      {state.status === "error" && !state.fieldErrors ? (
        <FormMessage tone="error">{t(`errors.${state.messageKey}`)}</FormMessage>
      ) : null}
      {state.status === "success" ? (
        <FormMessage tone="success">{t("messages.paid")}</FormMessage>
      ) : null}

      <div key={state.attempt ?? 0} className="flex flex-col gap-[var(--s-4)]">
        <Field
          label={t("amount")}
          htmlFor="amount"
          hint={t("amountHint", { outstanding: outstandingLabel })}
          error={error("amount")}
        >
          <input
            id="amount"
            name="amount"
            defaultValue={state.values?.amount ?? ""}
            inputMode="decimal"
            required
            className={`${inputClass} tabular`}
          />
        </Field>

        <div className="grid gap-[var(--s-4)] sm:grid-cols-2">
          <Field label={t("method")} htmlFor="method" error={error("method")}>
            <select
              id="method"
              name="method"
              defaultValue={state.values?.method ?? "efectivo"}
              className={inputClass}
            >
              {PAYMENT_METHOD_ORDER.map((method) => (
                <option key={method} value={method}>
                  {t(`methods.${method}`)}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t("paidAt")} htmlFor="paidAt" error={error("paidAt")}>
            <input
              id="paidAt"
              name="paidAt"
              type="date"
              max={today}
              defaultValue={state.values?.paidAt ?? today}
              className={inputClass}
            />
          </Field>
        </div>

        <Field
          label={t("reference")}
          htmlFor="reference"
          hint={t("referenceHint")}
          error={error("reference")}
        >
          <input
            id="reference"
            name="reference"
            defaultValue={state.values?.reference ?? ""}
            maxLength={120}
            className={inputClass}
          />
        </Field>
      </div>

      <div>
        <Record />
      </div>
    </form>
  );
}

function Record() {
  const t = useTranslations("payments");
  const { pending } = useFormStatus();

  return (
    <button type="submit" className={buttonClass} disabled={pending}>
      {pending ? t("saving") : t("record")}
    </button>
  );
}

/**
 * Undo one recorded payment (PR-17) — admin only, and gated server-side by
 * `requireRole("payments.delete")`; this button only decides whether to draw
 * it (guardrail 3).
 *
 * There is no *edit* counterpart on purpose. Delete-and-re-record is one path
 * instead of two, and it leaves the activity log saying what actually
 * happened: this was taken back, that was entered. The issued invoice is not
 * touched — only what has been received against it, and the status that
 * implies, which the server re-derives.
 */
export function PaymentDeleteButton({ paymentId }: { paymentId: number }) {
  const t = useTranslations("payments");
  const [state, formAction] = useActionState<FormState, FormData>(
    deletePaymentAction,
    IDLE,
  );

  return (
    <form action={formAction} className="contents">
      <input type="hidden" name="paymentId" value={paymentId} />

      {state.status === "error" ? (
        <FormMessage tone="error">{t(`errors.${state.messageKey}`)}</FormMessage>
      ) : null}

      <Delete confirm={t("deleteConfirm")} label={t("delete")} busy={t("deleting")} />
    </form>
  );
}

function Delete({
  confirm,
  label,
  busy,
}: {
  confirm: string;
  label: string;
  busy: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      // A deletion that leaves a log entry is recoverable in the sense that
      // matters — you can see what it was and enter it again — but it still
      // changes what an invoice appears to have been paid, so it asks first.
      onClick={(event) => {
        if (!window.confirm(confirm)) event.preventDefault();
      }}
      disabled={pending}
      className={`${ghostButtonClass} min-h-9 px-[var(--s-3)] text-[length:var(--t--1)]`}
    >
      {pending ? busy : label}
    </button>
  );
}
