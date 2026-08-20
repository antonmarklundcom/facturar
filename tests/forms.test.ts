import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkboxField, echo, field, formError, formSuccess, IDLE } from "@/lib/forms";

const SRC = fileURLToPath(new URL("../src", import.meta.url));

function sourceFiles(directory = SRC, prefix = ""): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) return sourceFiles(`${directory}/${entry.name}`, relative);
      return /\.tsx?$/.test(entry.name) ? [relative] : [];
    })
    .sort();
}

describe("field readers", () => {
  it("trims string fields", () => {
    const formData = new FormData();
    formData.set("name", "  Ferretería Ykuá  ");
    expect(field(formData, "name")).toBe("Ferretería Ykuá");
  });

  it("returns an empty string for a missing field", () => {
    expect(field(new FormData(), "missing")).toBe("");
  });

  it("reads a checkbox in each form a browser sends it", () => {
    for (const raw of ["on", "true", "1"]) {
      const formData = new FormData();
      formData.set("active", raw);
      expect(checkboxField(formData, "active")).toBe(true);
    }
    expect(checkboxField(new FormData(), "active")).toBe(false);
  });
});

/**
 * React 19 resets a `<form action={…}>` once its action settles. That is right
 * after a successful create, but after a validation error it would hand the
 * user a blank form with error messages on it — everything they typed gone.
 *
 * The fix is to echo the submitted values back in the state. These tests pin
 * the two halves of it: the echo happens on error, and it never carries a
 * password.
 */
describe("echo — surviving React 19's automatic form reset", () => {
  it("collects only the named fields", () => {
    const formData = new FormData();
    formData.set("email", "ana@ykua.com.py");
    formData.set("name", "Ana");
    formData.set("password", "super-secret-value");

    expect(echo(formData, ["email", "name"])).toEqual({
      email: "ana@ykua.com.py",
      name: "Ana",
    });
  });

  it("does not invent entries for fields that were not submitted", () => {
    expect(echo(new FormData(), ["email"])).toEqual({});
  });

  it("skips a File value rather than serialising it to the client", () => {
    const formData = new FormData();
    formData.set("logo", new File(["x"], "logo.png"));
    expect(echo(formData, ["logo"])).toEqual({});
  });
});

describe("formError", () => {
  it("carries the echoed values and increments the attempt counter", () => {
    const first = formError("invalid", { ruc: "wrong_dv" }, { values: { ruc: "80012345-9" } });
    expect(first).toMatchObject({
      status: "error",
      messageKey: "invalid",
      fieldErrors: { ruc: "wrong_dv" },
      values: { ruc: "80012345-9" },
      attempt: 1,
    });

    const second = formError("invalid", undefined, { previous: first });
    expect(second.attempt).toBe(2);
  });

  it("starts the counter at 1 from the idle state", () => {
    expect(formError("invalid", undefined, { previous: IDLE }).attempt).toBe(1);
  });
});

describe("formSuccess", () => {
  it("carries no echoed values, so the form clears as it should", () => {
    const state = formSuccess("saved");
    expect(state.status).toBe("success");
    expect(state.values).toBeUndefined();
  });
});

describe("guardrail — a password is never echoed back to the client", () => {
  it("no action passes a password field to echo()", () => {
    const offenders: string[] = [];

    for (const relative of sourceFiles()) {
      const source = readFileSync(`${SRC}/${relative}`, "utf8");

      for (const call of source.match(/echo\(formData,\s*\[[^\]]*\]/g) ?? []) {
        if (/password/i.test(call)) offenders.push(`${relative}: ${call}`);
      }
    }

    expect(offenders, "echo() called with a password field").toEqual([]);
  });

  it("every action file that echoes values does so from an explicit list", () => {
    // Spreading the whole FormData would sweep passwords into the state.
    for (const relative of sourceFiles()) {
      const source = readFileSync(`${SRC}/${relative}`, "utf8");
      // Skip the module that defines it.
      if (relative === "lib/forms.ts") continue;
      if (!source.includes("echo(formData")) continue;
      expect(
        /echo\(formData,\s*\[/.test(source) || /echo\(formData,\s*[A-Z_]+\)/.test(source),
        `${relative} calls echo() without an explicit field list`,
      ).toBe(true);
    }
  });
});
