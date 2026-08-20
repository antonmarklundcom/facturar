import { eq, type SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { describe, expect, it } from "vitest";
import { customers, documents, payments, users } from "@/db/schema";
import {
  CrossTenantError,
  InvalidTenantError,
  assertRowTenant,
  assertTenantId,
  tenantScoped,
  withTenant,
  withTenantAll,
} from "@/db/tenant";

const dialect = new MySqlDialect();

/** Compile a Drizzle condition the way the driver would. */
function compile(condition: SQL): { sql: string; params: unknown[] } {
  const query = dialect.sqlToQuery(condition);
  return { sql: query.sql, params: query.params };
}

const render = (condition: SQL) => compile(condition).sql;

describe("tenantScoped", () => {
  it("always filters on tenant_id", () => {
    const condition = tenantScoped(customers, 7);
    expect(render(condition)).toContain("tenant_id");
  });

  it("ANDs extra conditions on rather than replacing the tenant filter", () => {
    const condition = tenantScoped(customers, 7, eq(customers.active, true));
    const rendered = render(condition);
    expect(rendered).toContain("tenant_id");
    expect(rendered).toContain("active");
    expect(rendered.toLowerCase()).toContain(" and ");
  });

  it("ignores undefined conditions from optional filters", () => {
    const maybe = undefined;
    const condition = tenantScoped(documents, 3, maybe, eq(documents.status, "pendiente"));
    expect(render(condition)).toContain("status");
  });

  it.each([0, -1, 1.5, Number.NaN])("refuses tenant id %s", (tenantId) => {
    expect(() => tenantScoped(users, tenantId as number)).toThrow(InvalidTenantError);
  });

  it("refuses a client-supplied string tenant id", () => {
    // The shape a query-string or form value would arrive in.
    expect(() => tenantScoped(users, "7" as unknown as number)).toThrow(InvalidTenantError);
  });

  it("works for every tenant-scoped table", () => {
    for (const table of [customers, documents, payments, users]) {
      expect(render(tenantScoped(table, 1))).toContain("tenant_id");
    }
  });
});

describe("withTenant", () => {
  it("stamps the tenant id onto an insert payload", () => {
    expect(withTenant(4, { name: "Ferretería Ykuá" })).toEqual({
      name: "Ferretería Ykuá",
      tenantId: 4,
    });
  });

  it("overwrites a client-supplied tenant id rather than trusting it", () => {
    expect(withTenant(4, { name: "x", tenantId: 99 })).toEqual({ name: "x", tenantId: 4 });
  });

  it("stamps every row of a batch", () => {
    expect(withTenantAll(2, [{ a: 1 }, { a: 2, tenantId: 500 }])).toEqual([
      { a: 1, tenantId: 2 },
      { a: 2, tenantId: 2 },
    ]);
  });

  it("refuses an invalid tenant id", () => {
    expect(() => withTenant(0, { a: 1 })).toThrow(InvalidTenantError);
  });
});

describe("assertRowTenant", () => {
  it("accepts a row from the caller's tenant", () => {
    expect(() => assertRowTenant({ tenantId: 5 }, 5)).not.toThrow();
  });

  it("rejects a row from another tenant", () => {
    expect(() => assertRowTenant({ tenantId: 6 }, 5)).toThrow(CrossTenantError);
  });

  it("rejects a missing row", () => {
    expect(() => assertRowTenant(null, 5)).toThrow(CrossTenantError);
  });
});

describe("assertTenantId", () => {
  it("narrows a valid id", () => {
    expect(() => assertTenantId(1)).not.toThrow();
  });

  it("rejects anything that is not a positive integer", () => {
    for (const value of [null, undefined, "1", 0, -3, 2.5, Number.NaN, {}]) {
      expect(() => assertTenantId(value)).toThrow(InvalidTenantError);
    }
  });
});

describe("raw SQL is not how queries get built", () => {
  it("tenantScoped returns a Drizzle condition, not an interpolated string", () => {
    const { sql: text, params } = compile(tenantScoped(customers, 9));

    // The tenant id travels as a bound parameter, never spliced into the SQL.
    expect(text).not.toContain("9");
    expect(text).toContain("?");
    expect(params).toContain(9);
  });
});
