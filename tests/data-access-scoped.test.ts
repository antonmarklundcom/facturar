import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

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

/**
 * Files that hold the database handle without scoping a query — there are
 * none today, and each new entry needs a written reason.
 */
const UNSCOPED_ALLOWLIST: Record<string, string> = {
  "lib/auth/throttle.ts":
    "the login limiter runs before authentication: there is no session and so " +
    "no tenant id to scope by, and resolving one from the submitted address " +
    "before deciding whether to throttle would be exactly the account-existence " +
    "oracle the limiter is built not to be. Its rows are keyed by email and IP " +
    "and hold no tenant data.",
};

describe("guardrail 2 — every query is tenant-scoped", () => {
  it("uses tenantScoped/ownTenant/withTenant in every module that touches the db", () => {
    const offenders: string[] = [];

    for (const relative of sourceFiles()) {
      const source = readFileSync(`${SRC}/${relative}`, "utf8");
      // The db handle is only ever imported from "@/db"; the schema lives at
      // "@/db/schema" and holds no connection.
      if (!/from\s+["']@\/db["']/.test(source)) continue;
      if (relative in UNSCOPED_ALLOWLIST) continue;
      if (/\b(tenantScoped|ownTenant|withTenant|withTenantAll)\s*\(/.test(source)) continue;

      offenders.push(relative);
    }

    expect(
      offenders,
      "modules using the db handle with no tenant scoping and no documented reason",
    ).toEqual([]);
  });

  it("keeps the allowlist honest", () => {
    for (const [file, reason] of Object.entries(UNSCOPED_ALLOWLIST)) {
      expect(sourceFiles(), `${file} no longer exists`).toContain(file);
      expect(reason.length, `${file} has no reason`).toBeGreaterThan(40);
    }
  });
});
