import { getTableColumns, getTableName, is } from "drizzle-orm";
import { getTableConfig, MySqlTable } from "drizzle-orm/mysql-core";
import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";

// `filter` cannot narrow here: MySqlTable is a supertype of the individual
// table types, not a member of the exported union.
const tables = Object.values(schema).filter((value) =>
  is(value, MySqlTable),
) as MySqlTable[];

/** Columns that hold money, in minor units. All of them must be bigint. */
const MONEY_COLUMNS = new Set([
  "unit_amount",
  "line_total",
  "line_iva",
  "subtotal_10",
  "subtotal_5",
  "subtotal_exenta",
  "iva_10",
  "iva_5",
  "total",
  "amount",
]);

describe("schema shape", () => {
  it("defines every table in ARCHITECTURE.md and nothing else", () => {
    expect(tables.map(getTableName).sort()).toEqual([
      "activity_log",
      "customers",
      "document_lines",
      "documents",
      "login_throttle",
      "payments",
      "products",
      "tenants",
      "timbrados",
      "users",
    ]);
  });
});

describe("guardrail 1 — money is integers", () => {
  it("uses bigint for every money column and never a float type", () => {
    for (const table of tables) {
      for (const [, column] of Object.entries(getTableColumns(table))) {
        const columnType = column.getSQLType().toLowerCase();

        expect(
          /float|double|decimal|numeric|real/.test(columnType),
          `${getTableName(table)}.${column.name} is ${columnType}`,
        ).toBe(false);

        if (MONEY_COLUMNS.has(column.name)) {
          expect(
            columnType.startsWith("bigint"),
            `${getTableName(table)}.${column.name} is ${columnType}, expected bigint`,
          ).toBe(true);
        }
      }
    }
  });

  it("pairs every money-bearing table with a currency column", () => {
    for (const table of tables) {
      const columns = Object.values(getTableColumns(table));
      const hasMoney = columns.some((column) => MONEY_COLUMNS.has(column.name));
      if (!hasMoney) continue;

      // Lines inherit the currency of their parent document rather than
      // repeating (and risking contradicting) it.
      if (getTableName(table) === "document_lines") continue;

      expect(
        columns.some((column) => column.name === "currency"),
        `${getTableName(table)} carries money but no currency column`,
      ).toBe(true);
    }
  });
});

describe("guardrail 2 — tenancy", () => {
  /**
   * Tables that legitimately carry no `tenant_id`, and why. Every entry is a
   * hole in guardrail 2, so each one needs a reason written down here rather
   * than discovered later in a diff.
   */
  const NO_TENANT_ID: Record<string, string> = {
    tenants:
      "its own primary key is the tenant id, so a tenant_id column would be a " +
      "second copy of it that could disagree",
    login_throttle:
      "written before authentication, when there is no session and therefore no " +
      "tenant; an address with no account has no tenant it could belong to, and " +
      "looking one up to find out would be the account-existence oracle the " +
      "login limiter exists to avoid",
  };

  it("puts tenant_id on every table except the documented exceptions", () => {
    for (const table of tables) {
      const name = getTableName(table);
      const hasTenantId = Object.values(getTableColumns(table)).some(
        (column) => column.name === "tenant_id",
      );
      expect(hasTenantId, `${name} is missing tenant_id`).toBe(!(name in NO_TENANT_ID));
    }
  });

  it("keeps the tenant-less exception list honest", () => {
    const names = tables.map(getTableName);
    for (const [name, reason] of Object.entries(NO_TENANT_ID)) {
      expect(names, `${name} no longer exists`).toContain(name);
      expect(reason.length, `${name} has no reason`).toBeGreaterThan(40);
    }
  });

  it("leads every tenant-scoped index with tenant_id", () => {
    for (const table of tables) {
      const name = getTableName(table);
      if (name in NO_TENANT_ID) continue;

      for (const definition of getTableConfig(table).indexes) {
        const columns = definition.config.columns;
        const first = columns[0];
        const firstName =
          first && "name" in first ? (first as { name: string }).name : undefined;

        // The buyer-token lookup is deliberately global: /d/[token] resolves a
        // document before any tenant is known.
        if (definition.config.name === "documents_public_token_uq") continue;

        expect(
          firstName,
          `${name}.${definition.config.name} does not lead with tenant_id`,
        ).toBe("tenant_id");
      }
    }
  });
});

describe("domain enums", () => {
  it("models the three IVA regimes", () => {
    expect([...schema.taxRateValues]).toEqual(["10", "5", "exenta"]);
  });

  it("models both currencies with PYG first", () => {
    expect([...schema.currencyValues]).toEqual(["PYG", "USD"]);
  });

  it("models the three staff roles", () => {
    expect([...schema.roleValues]).toEqual(["admin", "employee", "viewer"]);
  });

  it("models the Paraguayan payment methods including the wallets", () => {
    expect([...schema.paymentMethodValues]).toEqual([
      "efectivo",
      "transferencia",
      "tarjeta",
      "cheque",
      "tigo_money",
      "billetera_personal",
      "zimple",
      "qr",
    ]);
  });

  it("covers quote and invoice statuses in one enum", () => {
    for (const status of [
      "borrador",
      "enviado",
      "aceptado",
      "rechazado",
      "vencido",
      "pendiente",
      "parcial",
      "pagada",
      "vencida",
      "anulada",
    ]) {
      expect(schema.documentStatusValues).toContain(status);
    }
  });
});

describe("guardrail 4 — immutability support", () => {
  it("keeps the issue-time snapshot fields on documents", () => {
    const columns = Object.values(getTableColumns(schema.documents)).map((c) => c.name);
    expect(columns).toEqual(
      expect.arrayContaining(["issued_at", "issued_by", "pdf_snapshot", "number"]),
    );
  });

  it("keeps activity_log append-only (no updated_at / updated_by)", () => {
    const columns = Object.values(getTableColumns(schema.activityLog)).map((c) => c.name);
    expect(columns).toContain("created_at");
    expect(columns).not.toContain("updated_at");
    expect(columns).not.toContain("updated_by");
  });
});

describe("numbering support", () => {
  it("keeps the timbrado range and cursor as integers", () => {
    const columns = getTableColumns(schema.timbrados);
    for (const key of ["rangeStart", "rangeEnd", "nextSequence"] as const) {
      expect(columns[key].getSQLType().toLowerCase()).toBe("int");
    }
  });

  it("makes an issued document number unique per tenant", () => {
    const unique = getTableConfig(schema.documents).indexes.find(
      (definition) => definition.config.name === "documents_tenant_number_uq",
    );
    expect(unique?.config.unique).toBe(true);
    expect(
      unique?.config.columns.map((column) =>
        "name" in column ? (column as { name: string }).name : undefined,
      ),
    ).toEqual(["tenant_id", "number"]);
  });
});
