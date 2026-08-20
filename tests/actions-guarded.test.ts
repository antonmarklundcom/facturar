import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("../src", import.meta.url));

/** Every .ts/.tsx file under src/, as paths relative to src/. */
function sourceFiles(directory = SRC, prefix = ""): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) return sourceFiles(`${directory}/${entry.name}`, relative);
      return /\.tsx?$/.test(entry.name) ? [relative] : [];
    })
    .sort();
}

/**
 * Files that legitimately contain `"use server"` without a `requireRole()`
 * call. Every entry needs a reason, and adding one should feel deliberate.
 */
const UNGATED_ALLOWLIST: Record<string, string> = {
  "app/login/actions.ts":
    "Authentication entry point: it creates the session the gates read. " +
    "Guarded instead by generic credential errors and a fail-closed lookup.",
  "app/actions/locale.ts":
    "Switches the viewer's own UI language. Touches no tenant data and grants " +
    "no rights, so there is no role to require.",
  "app/admin/cambiar-contrasena/actions.ts":
    "The forced password change (decision 19) is the one mutation a user owing " +
    "a password change may perform; it uses requireSessionForPasswordChange().",
};

describe("guardrail 3 — every mutation is gated", () => {
  it("calls requireRole() in every server-action file that is not allow-listed", () => {
    const offenders: string[] = [];

    for (const relative of sourceFiles()) {
      const source = readFileSync(`${SRC}/${relative}`, "utf8");
      if (!/^\s*["']use server["']/m.test(source)) continue;
      if (relative in UNGATED_ALLOWLIST) continue;
      if (/requireRole\s*\(/.test(source)) continue;

      offenders.push(relative);
    }

    expect(
      offenders,
      "server-action files with no requireRole() call and no documented reason",
    ).toEqual([]);
  });

  it("keeps the allowlist honest — every entry is a real server-action file", () => {
    const serverActionFiles = new Set<string>();

    for (const relative of sourceFiles()) {
      const source = readFileSync(`${SRC}/${relative}`, "utf8");
      if (/^\s*["']use server["']/m.test(source)) serverActionFiles.add(relative);
    }

    for (const allowed of Object.keys(UNGATED_ALLOWLIST)) {
      expect(serverActionFiles.has(allowed), `${allowed} is no longer a server action`).toBe(
        true,
      );
    }
  });

  it("gives every allow-listed file a written reason", () => {
    for (const [file, reason] of Object.entries(UNGATED_ALLOWLIST)) {
      expect(reason.length, `${file} has no reason`).toBeGreaterThan(40);
    }
  });
});

describe("decision 19 — no public password-reset route", () => {
  it("exposes no reset/forgot/recover route anywhere in the app tree", () => {
    const routeLike = sourceFiles().filter(
      (relative) =>
        relative.startsWith("app/") &&
        /\/(page|route)\.tsx?$/.test(relative) &&
        /(reset|forgot|olvid|recuperar|recover)/i.test(relative),
    );

    expect(routeLike).toEqual([]);
  });

  it("keeps the only password-reset entry points behind /admin", () => {
    const resetFiles = sourceFiles().filter((relative) =>
      /resetUserPassword|changeOwnPassword/.test(readFileSync(`${SRC}/${relative}`, "utf8")),
    );

    expect(resetFiles.length).toBeGreaterThan(0);
    for (const file of resetFiles) {
      if (!file.startsWith("app/")) continue;
      expect(file.startsWith("app/admin/"), `${file} is outside /admin`).toBe(true);
    }
  });
});

describe("decision 22 — route contract", () => {
  it("keeps the middleware matcher off the public landing page", () => {
    const middleware = readFileSync(`${SRC}/middleware.ts`, "utf8");
    const matcher = middleware.slice(middleware.indexOf("matcher"));

    expect(matcher).toContain("/admin/:path*");
    // A bare "/" in the matcher would put the PR-15 landing page behind the gate.
    expect(matcher).not.toMatch(/["']\/["']/);
  });

  it("has a login page at /login and an app root at /admin", () => {
    const files = sourceFiles();
    expect(files).toContain("app/login/page.tsx");
    expect(files).toContain("app/admin/page.tsx");
    expect(files).toContain("app/admin/layout.tsx");
  });
});
