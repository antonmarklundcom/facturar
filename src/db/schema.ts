import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  datetime,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  uniqueIndex,
  varchar,
  type AnyMySqlColumn,
} from "drizzle-orm/mysql-core";
import { throttleScopes } from "@/domain/throttle";

/**
 * facturar — data model (see ARCHITECTURE.md "Data model").
 *
 * Invariants this file enforces at the storage layer:
 *
 * 1. Money is ALWAYS `bigint` minor units plus a `currency` column. PYG has no
 *    decimals (minor unit = 1 guaraní), USD has two (minor unit = 1 cent).
 *    There is no FLOAT or DECIMAL column anywhere in this schema, by design.
 * 2. Every table except `tenants` itself carries `tenant_id` with a foreign key,
 *    and every index that matters leads with `tenant_id` so a scoped query can
 *    actually use it. `login_throttle` is the one documented exception — it is
 *    written before any session exists, so there is no tenant to scope it to.
 * 3. Issued documents are immutable — `issued_at` / `issued_by` / `pdf_snapshot`
 *    are write-once at issue time; corrections are new credit-note rows.
 * 4. `activity_log` is append-only: it has `created_at` and nothing else.
 */

/** Currencies supported from day one (decision 7). */
export const currencyValues = ["PYG", "USD"] as const;

/** IVA regimes on a Paraguayan invoice line. */
export const taxRateValues = ["10", "5", "exenta"] as const;

/** UI language (per user) and document language (per customer / per document). */
export const localeValues = ["es", "en"] as const;

/** Staff roles (decision 3). */
export const roleValues = ["admin", "employee", "viewer"] as const;

/** Document types sharing one table + one line-item table. */
export const documentTypeValues = [
  "quote",
  "invoice_contado",
  "invoice_credito",
  "credit_note",
] as const;

/**
 * One status enum for every document type.
 * Quotes:  borrador → enviado → aceptado / rechazado / vencido
 * Invoices/credit notes: pendiente → parcial → pagada, or vencida / anulada
 */
export const documentStatusValues = [
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
] as const;

/** Payment methods a Paraguayan SMB actually uses. */
export const paymentMethodValues = [
  "efectivo",
  "transferencia",
  "tarjeta",
  "cheque",
  "tigo_money",
  "billetera_personal",
  "zimple",
  "qr",
] as const;

/** Append-only audit actions (decision 14). */
export const activityActionValues = [
  "created",
  "updated",
  "issued",
  "sent_whatsapp",
  "sent_email",
  "paid",
  "credited",
  "deleted",
] as const;

/** Market profile abstraction — v1 ships `py`; `se` slots in later. */
export const marketProfileValues = ["py"] as const;

/** Tenant lifecycle: demo → paying is a flag, never a reinstall. */
export const tenantStatusValues = ["demo", "active", "suspended"] as const;

// Fresh builders per table — a column builder instance must not be shared
// between two `mysqlTable()` calls.
const createdAt = () =>
  datetime("created_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`);

const updatedAt = () =>
  datetime("updated_at", { mode: "date" })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`)
    .$onUpdate(() => new Date());

/* -------------------------------------------------------------------------- */
/* tenants                                                                     */
/* -------------------------------------------------------------------------- */

export const tenants = mysqlTable(
  "tenants",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    /** RUC without the check digit, e.g. "80012345". */
    rucBase: varchar("ruc_base", { length: 20 }),
    /** Dígito verificador, validated with modulo-11 in PR-4. */
    rucDv: varchar("ruc_dv", { length: 1 }),
    logoUrl: varchar("logo_url", { length: 500 }),
    marketProfile: mysqlEnum("market_profile", marketProfileValues)
      .notNull()
      .default("py"),
    defaultCurrency: mysqlEnum("default_currency", currencyValues)
      .notNull()
      .default("PYG"),
    address: varchar("address", { length: 300 }),
    /** Normalised to +5959XXXXXXXX before storage. */
    phone: varchar("phone", { length: 20 }),
    email: varchar("email", { length: 255 }),
    status: mysqlEnum("status", tenantStatusValues).notNull().default("demo"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    updatedBy: int("updated_by"),
  },
  (table) => [index("tenants_status_idx").on(table.status)],
);

/* -------------------------------------------------------------------------- */
/* users                                                                       */
/* -------------------------------------------------------------------------- */

export const users = mysqlTable(
  "users",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenant_id")
      .notNull()
      .references(() => tenants.id),
    email: varchar("email", { length: 255 }).notNull(),
    /** bcrypt hash — never a plaintext or reversible value. */
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    role: mysqlEnum("role", roleValues).notNull().default("viewer"),
    uiLocale: mysqlEnum("ui_locale", localeValues).notNull().default("es"),
    /** Set by an admin password reset (decision 19); cleared on next change. */
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    active: boolean("active").notNull().default(true),
    lastLoginAt: datetime("last_login_at", { mode: "date" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    updatedBy: int("updated_by"),
  },
  (table) => [
    uniqueIndex("users_tenant_email_uq").on(table.tenantId, table.email),
    index("users_tenant_role_idx").on(table.tenantId, table.role),
  ],
);

/* -------------------------------------------------------------------------- */
/* customers                                                                   */
/* -------------------------------------------------------------------------- */

export const customers = mysqlTable(
  "customers",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: varchar("name", { length: 200 }).notNull(),
    rucBase: varchar("ruc_base", { length: 20 }),
    rucDv: varchar("ruc_dv", { length: 1 }),
    /** Consumidor final invoices use RUC 44444401-7 by convention. */
    isConsumidorFinal: boolean("is_consumidor_final").notNull().default(false),
    /** Normalised to +5959XXXXXXXX before storage (guardrail 7). */
    whatsapp: varchar("whatsapp", { length: 20 }),
    email: varchar("email", { length: 255 }),
    address: varchar("address", { length: 300 }),
    /** Default language of documents issued to this customer. */
    docLocale: mysqlEnum("doc_locale", localeValues).notNull().default("es"),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    updatedBy: int("updated_by"),
  },
  (table) => [
    index("customers_tenant_ruc_idx").on(table.tenantId, table.rucBase),
    index("customers_tenant_name_idx").on(table.tenantId, table.name),
  ],
);

/* -------------------------------------------------------------------------- */
/* products                                                                    */
/* -------------------------------------------------------------------------- */

export const products = mysqlTable(
  "products",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    /** "unidad", "hora", "m2", … free text shown on the document line. */
    unit: varchar("unit", { length: 30 }).notNull().default("unidad"),
    /** IVA-inclusive unit price, minor units of `currency`. */
    unitAmount: bigint("unit_amount", { mode: "number" }).notNull().default(0),
    currency: mysqlEnum("currency", currencyValues).notNull().default("PYG"),
    taxRate: mysqlEnum("tax_rate", taxRateValues).notNull().default("10"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    updatedBy: int("updated_by"),
  },
  (table) => [index("products_tenant_name_idx").on(table.tenantId, table.name)],
);

/* -------------------------------------------------------------------------- */
/* timbrados                                                                   */
/* -------------------------------------------------------------------------- */

export const timbrados = mysqlTable(
  "timbrados",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenant_id")
      .notNull()
      .references(() => tenants.id),
    /** DNIT authorisation number. */
    number: varchar("number", { length: 20 }).notNull(),
    validFrom: date("valid_from", { mode: "string" }).notNull(),
    validTo: date("valid_to", { mode: "string" }).notNull(),
    /** Establecimiento, always 3 digits, e.g. "001". */
    establishment: varchar("establishment", { length: 3 }).notNull().default("001"),
    /** Punto de expedición, always 3 digits, e.g. "001". */
    expeditionPoint: varchar("expedition_point", { length: 3 }).notNull().default("001"),
    /** Authorised correlative range, inclusive. */
    rangeStart: int("range_start").notNull().default(1),
    rangeEnd: int("range_end").notNull(),
    /**
     * Next correlative to hand out. The PR-4 generator advances this inside a
     * transaction with a row lock so numbering stays gap-free under concurrency.
     */
    nextSequence: int("next_sequence").notNull().default(1),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    updatedBy: int("updated_by"),
  },
  (table) => [
    uniqueIndex("timbrados_tenant_point_uq").on(
      table.tenantId,
      table.number,
      table.establishment,
      table.expeditionPoint,
    ),
    index("timbrados_tenant_active_idx").on(table.tenantId, table.active, table.validTo),
  ],
);

/* -------------------------------------------------------------------------- */
/* documents                                                                   */
/* -------------------------------------------------------------------------- */

export const documents = mysqlTable(
  "documents",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenant_id")
      .notNull()
      .references(() => tenants.id),
    type: mysqlEnum("type", documentTypeValues).notNull(),
    status: mysqlEnum("status", documentStatusValues).notNull().default("borrador"),
    /** "001-001-0000123". NULL until the document is issued. */
    number: varchar("number", { length: 20 }),
    timbradoId: int("timbrado_id").references(() => timbrados.id),
    customerId: int("customer_id")
      .notNull()
      .references(() => customers.id),
    /** Language of the PDF and of the WhatsApp/email templates. */
    docLocale: mysqlEnum("doc_locale", localeValues).notNull().default("es"),
    currency: mysqlEnum("currency", currencyValues).notNull().default("PYG"),
    /**
     * PYG per 1 USD at document time, in micro-units (rate × 1 000 000) so the
     * rate is an integer like every other number here. NULL when the document
     * currency is the tenant's own and no conversion was involved.
     */
    exchangeRate: bigint("exchange_rate", { mode: "number" }),
    issueDate: date("issue_date", { mode: "string" }),
    /** Invoices a crédito. */
    dueDate: date("due_date", { mode: "string" }),
    /** Quotes: "Presupuesto válido por X días". */
    validUntil: date("valid_until", { mode: "string" }),
    /** credit_note → invoice, invoice → source quote. */
    relatedDocumentId: int("related_document_id").references(
      (): AnyMySqlColumn => documents.id,
    ),
    /** Unguessable buyer token for GET /d/[token]. Revocable by nulling it. */
    publicToken: varchar("public_token", { length: 64 }),
    /* --- totals, all minor units of `currency` --- */
    subtotal10: bigint("subtotal_10", { mode: "number" }).notNull().default(0),
    subtotal5: bigint("subtotal_5", { mode: "number" }).notNull().default(0),
    subtotalExenta: bigint("subtotal_exenta", { mode: "number" }).notNull().default(0),
    /** IVA *included* in the corresponding subtotal, not added on top. */
    iva10: bigint("iva_10", { mode: "number" }).notNull().default(0),
    iva5: bigint("iva_5", { mode: "number" }).notNull().default(0),
    total: bigint("total", { mode: "number" }).notNull().default(0),
    /** Path/URL of the PDF frozen at issue time (immutability, guardrail 4). */
    pdfSnapshot: varchar("pdf_snapshot", { length: 500 }),
    issuedAt: datetime("issued_at", { mode: "date" }),
    issuedBy: int("issued_by").references(() => users.id),
    notes: text("notes"),
    createdBy: int("created_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    updatedBy: int("updated_by"),
  },
  (table) => [
    // MySQL allows repeated NULLs in a UNIQUE index, so drafts (number IS NULL)
    // coexist while issued numbers stay unique per tenant.
    uniqueIndex("documents_tenant_number_uq").on(table.tenantId, table.number),
    uniqueIndex("documents_public_token_uq").on(table.publicToken),
    index("documents_tenant_type_status_idx").on(table.tenantId, table.type, table.status),
    index("documents_tenant_customer_idx").on(table.tenantId, table.customerId),
    index("documents_tenant_due_idx").on(table.tenantId, table.dueDate),
    index("documents_tenant_issue_idx").on(table.tenantId, table.issueDate),
  ],
);

/* -------------------------------------------------------------------------- */
/* document_lines                                                              */
/* -------------------------------------------------------------------------- */

export const documentLines = mysqlTable(
  "document_lines",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenant_id")
      .notNull()
      .references(() => tenants.id),
    documentId: int("document_id")
      .notNull()
      .references(() => documents.id),
    /** Snapshot semantics: the description is copied, not joined, at line time. */
    productId: int("product_id").references(() => products.id),
    description: varchar("description", { length: 300 }).notNull(),
    unit: varchar("unit", { length: 30 }).notNull().default("unidad"),
    /** Quantity as fixed-point ×1000 — 1.5 units is stored as 1500. */
    qty: bigint("qty", { mode: "number" }).notNull().default(1000),
    /** IVA-inclusive unit price in minor units of the document's currency. */
    unitAmount: bigint("unit_amount", { mode: "number" }).notNull().default(0),
    taxRate: mysqlEnum("tax_rate", taxRateValues).notNull().default("10"),
    /** qty × unitAmount, rounded once per line. IVA-inclusive. */
    lineTotal: bigint("line_total", { mode: "number" }).notNull().default(0),
    /** IVA contained in lineTotal: total × rate / (100 + rate), rounded per line. */
    lineIva: bigint("line_iva", { mode: "number" }).notNull().default(0),
    position: int("position").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("document_lines_tenant_document_idx").on(table.tenantId, table.documentId),
  ],
);

/* -------------------------------------------------------------------------- */
/* payments                                                                    */
/* -------------------------------------------------------------------------- */

export const payments = mysqlTable(
  "payments",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenant_id")
      .notNull()
      .references(() => tenants.id),
    documentId: int("document_id")
      .notNull()
      .references(() => documents.id),
    /** Minor units of `currency`. Partial payments are normal. */
    amount: bigint("amount", { mode: "number" }).notNull(),
    currency: mysqlEnum("currency", currencyValues).notNull().default("PYG"),
    method: mysqlEnum("method", paymentMethodValues).notNull(),
    paidAt: datetime("paid_at", { mode: "date" }).notNull(),
    /** Transfer id, cheque number, wallet reference… */
    reference: varchar("reference", { length: 120 }),
    notes: text("notes"),
    createdBy: int("created_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    updatedBy: int("updated_by"),
  },
  (table) => [
    index("payments_tenant_document_idx").on(table.tenantId, table.documentId),
    index("payments_tenant_paid_at_idx").on(table.tenantId, table.paidAt),
  ],
);

/* -------------------------------------------------------------------------- */
/* activity_log — append-only                                                  */
/* -------------------------------------------------------------------------- */

export const activityLog = mysqlTable(
  "activity_log",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenant_id")
      .notNull()
      .references(() => tenants.id),
    /** NULL for system-generated entries (cron, webhooks). */
    userId: int("user_id").references(() => users.id),
    entityType: varchar("entity_type", { length: 40 }).notNull(),
    entityId: int("entity_id").notNull(),
    action: mysqlEnum("action", activityActionValues).notNull(),
    detail: json("detail"),
    createdAt: createdAt(),
  },
  (table) => [
    index("activity_log_tenant_entity_idx").on(
      table.tenantId,
      table.entityType,
      table.entityId,
    ),
    index("activity_log_tenant_created_idx").on(table.tenantId, table.createdAt),
  ],
);


/* -------------------------------------------------------------------------- */
/* login_throttle — failed-login counters (PR-16)                              */
/* -------------------------------------------------------------------------- */

/**
 * Failed-login counters, one row per (scope, identifier).
 *
 * **This is the one table with no `tenant_id`, and deliberately so.** It is
 * written before anybody is authenticated: at the moment a login is throttled
 * there is no session, no tenant, and — if the address has no account at all —
 * no tenant it could ever have belonged to. Giving it a tenant column would
 * mean either inventing one or looking the address up first, and looking it
 * up first is exactly the account-existence oracle the limiter must not be.
 * `tests/schema.test.ts` names it as the single documented exception.
 *
 * A row is an aggregate, not a log: one upsert per failed attempt rather than
 * a row per attempt, and deleted outright when the address logs in. The
 * append-only record of who signed in stays in `activity_log`.
 */
export const loginThrottle = mysqlTable(
  "login_throttle",
  {
    id: int("id").autoincrement().primaryKey(),
    scope: mysqlEnum("scope", throttleScopes).notNull(),
    /**
     * The normalised email, or the client IP. Capped at 190 characters: no
     * real address is longer, and grouping the absurd ones together only
     * makes the limiter stricter.
     */
    identifier: varchar("identifier", { length: 190 }).notNull(),
    failures: int("failures").notNull().default(0),
    lastFailureAt: datetime("last_failure_at", { mode: "date" }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("login_throttle_scope_identifier_uq").on(table.scope, table.identifier),
    index("login_throttle_last_failure_idx").on(table.lastFailureAt),
  ],
);

/* -------------------------------------------------------------------------- */
/* inferred types                                                              */
/* -------------------------------------------------------------------------- */

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type Timbrado = typeof timbrados.$inferSelect;
export type NewTimbrado = typeof timbrados.$inferInsert;
export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type DocumentLine = typeof documentLines.$inferSelect;
export type NewDocumentLine = typeof documentLines.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type ActivityLogEntry = typeof activityLog.$inferSelect;
export type NewActivityLogEntry = typeof activityLog.$inferInsert;
export type LoginThrottleRow = typeof loginThrottle.$inferSelect;

export type Currency = (typeof currencyValues)[number];
export type TaxRate = (typeof taxRateValues)[number];
export type DocumentLocale = (typeof localeValues)[number];
export type Role = (typeof roleValues)[number];
export type DocumentType = (typeof documentTypeValues)[number];
export type DocumentStatus = (typeof documentStatusValues)[number];
export type PaymentMethod = (typeof paymentMethodValues)[number];
export type ActivityAction = (typeof activityActionValues)[number];
