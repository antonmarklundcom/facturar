/**
 * Shape returned by every server action to a `useActionState` form.
 *
 * Actions return translation *keys*, never user-facing text (guardrail 5) —
 * the client component that renders the form resolves them through next-intl.
 */
export type FormState = {
  status: "idle" | "error" | "success";
  /** Key under the form's own message namespace, e.g. "invalidCredentials". */
  messageKey?: string;
  /** Per-field keys, e.g. `{ email: "required" }`. */
  fieldErrors?: Record<string, string>;
};

export const IDLE: FormState = { status: "idle" };

export function formError(
  messageKey: string,
  fieldErrors?: Record<string, string>,
): FormState {
  return { status: "error", messageKey, fieldErrors };
}

export function formSuccess(messageKey?: string): FormState {
  return { status: "success", messageKey };
}

/** Read a trimmed string field from a `FormData`. */
export function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** Read a checkbox field. */
export function checkboxField(formData: FormData, name: string): boolean {
  const value = formData.get(name);
  return value === "on" || value === "true" || value === "1";
}
