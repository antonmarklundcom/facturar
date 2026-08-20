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
  /**
   * Echo of what was submitted.
   *
   * React 19 automatically resets a `<form action={…}>` once the action
   * settles. That is right after a successful create — the form should clear —
   * but after a validation error it would throw away everything the user
   * typed and hand them a blank form with error messages on it. Echoing the
   * values back lets the form restore them.
   *
   * Never contains a password: `echo()` takes an explicit field list.
   */
  values?: Record<string, string>;
  /**
   * Increments on every failed attempt. Forms use it as a React `key` so the
   * inputs remount carrying the echoed values.
   */
  attempt?: number;
};

export const IDLE: FormState = { status: "idle" };

/**
 * Collect the named fields from a submission so they can be echoed back on
 * error. Pass field names explicitly — never spread the whole `FormData`, or a
 * password would end up in the state that gets serialised to the client.
 */
export function echo(formData: FormData, names: readonly string[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const name of names) {
    const value = formData.get(name);
    if (typeof value === "string") values[name] = value;
  }
  return values;
}

export function formError(
  messageKey: string,
  fieldErrors?: Record<string, string>,
  options: { values?: Record<string, string>; previous?: FormState } = {},
): FormState {
  return {
    status: "error",
    messageKey,
    fieldErrors,
    values: options.values,
    attempt: (options.previous?.attempt ?? 0) + 1,
  };
}

export function formSuccess(messageKey?: string): FormState {
  // No `values` on success: the form should reset, which is exactly what React
  // does on its own.
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
