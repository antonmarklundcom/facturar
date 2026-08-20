/**
 * Demo-tenant seed (decision 16).
 *
 * Idempotent: it keys off the demo tenant's RUC, so running it twice leaves
 * one tenant, not two. `--reset` wipes that tenant's rows first, in
 * foreign-key order, and rebuilds them.
 *
 * The data is deliberately realistic — Paraguayan business names, cities and
 * guaraní amounts that look like real jobs, and RUC check digits computed
 * rather than invented. A demo where the numbers look fake kills the meeting.
 *
 * Run it with:
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx --env-file=.env scripts/seed.ts
 *
 * `tsx` does not auto-load `.env` (Phase A finding), and the condition flag is
 * what lets a plain script import the `server-only` modules the app shares.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  activityLog,
  customers,
  documentLines,
  documents,
  payments,
  products,
  tenants,
  timbrados,
  users,
  type Currency,
  type TaxRate,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { allocateDocumentNumber } from "@/domain/numbering.server";
import { computeLine, computeTotals, QTY_SCALE } from "@/domain/iva";
import { computeRucDv } from "@/domain/ruc";
import { validUntilFrom } from "@/domain/documents";
import { normalizeWhatsapp } from "@/domain/whatsapp";
import { generatePublicToken } from "@/lib/documents/token";
import { asuncionDateString } from "@/domain/format";

const DEMO_RUC_BASE = "80012345";
const DEMO_PASSWORD = "FerreteriaDemo2026";

const today = asuncionDateString(new Date());
function shiftDate(from: string, days: number): string {
  const [year, month, day] = from.split("-").map(Number);
  const at = Date.UTC(year, month - 1, day) + days * 86_400_000;
  return new Date(at).toISOString().slice(0, 10);
}

/** RUC with its check digit computed, never hand-written. */
function ruc(base: string): { rucBase: string; rucDv: string } {
  return { rucBase: base, rucDv: String(computeRucDv(base)) };
}

function whatsapp(local: string): string {
  const result = normalizeWhatsapp(local);
  if (!result.valid) throw new Error(`Seed has an invalid WhatsApp number: ${local}`);
  return result.normalized;
}

const CUSTOMERS = [
  {
    name: "Talleres Guaraní S.R.L.",
    base: "80098765",
    whatsapp: "0981 456789",
    email: "compras@talleresguarani.com.py",
    address: "Ruta Mcal. Estigarribia km 12, Luque",
    docLocale: "es" as const,
  },
  {
    name: "Constructora Ykuá Satã",
    base: "80055512",
    whatsapp: "0982 334455",
    email: "administracion@ykuasati.com.py",
    address: "Avda. España 1234, Asunción",
    docLocale: "es" as const,
  },
  {
    name: "Supermercado La Colonia",
    base: "80031477",
    whatsapp: "0971 887766",
    email: "proveedores@lacolonia.com.py",
    address: "Ruta 6, Hohenau, Itapúa",
    docLocale: "es" as const,
  },
  {
    name: "Estancia Santa Rosa",
    base: "80077123",
    whatsapp: "0985 221100",
    email: null,
    address: "Ruta Transchaco km 210, Loma Plata",
    docLocale: "es" as const,
  },
  {
    name: "Paraguay Agro Export S.A.",
    base: "80066432",
    whatsapp: "0991 445566",
    email: "purchasing@pyagroexport.com",
    address: "Avda. Boggiani 5500, Asunción",
    docLocale: "en" as const,
  },
  {
    name: "Ing. Ramón Villalba",
    base: "1234567",
    whatsapp: "0961 778899",
    email: "rvillalba@gmail.com",
    address: "Barrio San Pablo, San Lorenzo",
    docLocale: "es" as const,
  },
];

const PRODUCTS: {
  name: string;
  description: string | null;
  unit: string;
  unitAmount: number;
  currency: Currency;
  taxRate: TaxRate;
}[] = [
  {
    name: "Chapa galvanizada N°26",
    description: "2,44 m × 1,10 m, calibre 26",
    unit: "unidad",
    unitAmount: 165_000,
    currency: "PYG",
    taxRate: "10",
  },
  {
    name: "Cemento Vallemí 50 kg",
    description: "Bolsa de 50 kg",
    unit: "bolsa",
    unitAmount: 62_000,
    currency: "PYG",
    taxRate: "10",
  },
  {
    name: "Hierro del 8 (12 m)",
    description: "Barra de 12 metros",
    unit: "barra",
    unitAmount: 78_500,
    currency: "PYG",
    taxRate: "10",
  },
  {
    name: "Arena lavada",
    description: "Metro cúbico puesto en obra",
    unit: "m³",
    unitAmount: 190_000,
    currency: "PYG",
    taxRate: "10",
  },
  {
    name: "Mano de obra — instalación",
    description: "Cuadrilla de dos personas",
    unit: "hora",
    unitAmount: 85_000,
    currency: "PYG",
    taxRate: "10",
  },
  {
    name: "Alquiler de andamio",
    description: "Módulo de 2 m, por día",
    unit: "día",
    unitAmount: 120_000,
    currency: "PYG",
    taxRate: "5",
  },
  {
    name: "Flete a interior",
    description: "Hasta 200 km",
    unit: "servicio",
    unitAmount: 450_000,
    currency: "PYG",
    taxRate: "10",
  },
  {
    name: "Libro de obra",
    description: "Exento de IVA",
    unit: "unidad",
    unitAmount: 45_000,
    currency: "PYG",
    taxRate: "exenta",
  },
  {
    name: "Consultoría técnica",
    description: "Informe estructural",
    unit: "hora",
    unitAmount: 4_500,
    currency: "USD",
    taxRate: "10",
  },
  {
    name: "Tornillo autoperforante (caja x100)",
    description: null,
    unit: "caja",
    unitAmount: 96_000,
    currency: "PYG",
    taxRate: "10",
  },
];

type SeedLine = {
  productIndex: number;
  qty: number;
};

function linesFor(
  tenantId: number,
  documentId: number,
  productIds: number[],
  seedLines: readonly SeedLine[],
) {
  return seedLines.map((seed, position) => {
    const product = PRODUCTS[seed.productIndex];
    const computed = computeLine({
      qty: seed.qty * QTY_SCALE,
      unitAmount: product.unitAmount,
      taxRate: product.taxRate,
    });

    return {
      tenantId,
      documentId,
      productId: productIds[seed.productIndex],
      description: product.name,
      unit: product.unit,
      qty: computed.qty,
      unitAmount: computed.unitAmount,
      taxRate: computed.taxRate,
      lineTotal: computed.lineTotal,
      lineIva: computed.lineIva,
      position,
    };
  });
}

function totalsFor(seedLines: readonly SeedLine[], currency: Currency) {
  const totals = computeTotals(
    seedLines.map((seed) => ({
      qty: seed.qty * QTY_SCALE,
      unitAmount: PRODUCTS[seed.productIndex].unitAmount,
      taxRate: PRODUCTS[seed.productIndex].taxRate,
    })),
    currency,
  );

  return {
    subtotal10: totals.subtotal10,
    subtotal5: totals.subtotal5,
    subtotalExenta: totals.subtotalExenta,
    iva10: totals.iva10,
    iva5: totals.iva5,
    total: totals.total,
  };
}

async function wipe(tenantId: number): Promise<void> {
  // Foreign-key order: children first.
  await db.delete(activityLog).where(eq(activityLog.tenantId, tenantId));
  await db.delete(payments).where(eq(payments.tenantId, tenantId));
  await db.delete(documentLines).where(eq(documentLines.tenantId, tenantId));
  // Credit notes and invoices reference other documents, so the self-reference
  // has to be broken before the rows can go.
  await db
    .update(documents)
    .set({ relatedDocumentId: null })
    .where(eq(documents.tenantId, tenantId));
  await db.delete(documents).where(eq(documents.tenantId, tenantId));
  await db.delete(products).where(eq(products.tenantId, tenantId));
  await db.delete(customers).where(eq(customers.tenantId, tenantId));
  await db.delete(timbrados).where(eq(timbrados.tenantId, tenantId));
  await db.delete(users).where(eq(users.tenantId, tenantId));
  await db.delete(tenants).where(eq(tenants.id, tenantId));
}

async function main(): Promise<void> {
  const reset = process.argv.includes("--reset");

  const existing = await db
    .select()
    .from(tenants)
    .where(eq(tenants.rucBase, DEMO_RUC_BASE))
    .limit(1);

  if (existing[0] && !reset) {
    console.log(
      `Demo tenant #${existing[0].id} already exists. Run with --reset to rebuild it.`,
    );
    return;
  }

  if (existing[0]) {
    console.log(`Removing demo tenant #${existing[0].id}…`);
    await wipe(existing[0].id);
  }

  const [tenantResult] = await db.insert(tenants).values({
    name: "Ferretería San Blas S.A.",
    ...ruc(DEMO_RUC_BASE),
    marketProfile: "py",
    defaultCurrency: "PYG",
    address: "Avda. Mcal. López 1234, Asunción",
    phone: whatsapp("0981 123456"),
    email: "ventas@sanblas.com.py",
    status: "demo",
  });
  const tenantId = tenantResult.insertId;

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const staff = [
    { email: "admin@sanblas.com.py", name: "Ana Giménez", role: "admin" as const },
    { email: "vendedor@sanblas.com.py", name: "Carlos Benítez", role: "employee" as const },
    { email: "contador@sanblas.com.py", name: "Rosa Cáceres", role: "viewer" as const },
  ];

  await db.insert(users).values(
    staff.map((person) => ({
      tenantId,
      email: person.email,
      passwordHash,
      name: person.name,
      role: person.role,
      uiLocale: "es" as const,
      active: true,
    })),
  );

  const [adminUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.tenantId, tenantId))
    .limit(1);
  const userId = adminUser.id;

  const [timbradoResult] = await db.insert(timbrados).values({
    tenantId,
    number: "16543210",
    validFrom: shiftDate(today, -60),
    validTo: shiftDate(today, 300),
    establishment: "001",
    expeditionPoint: "001",
    rangeStart: 1,
    rangeEnd: 2_000,
    nextSequence: 1,
    active: true,
    updatedBy: userId,
  });
  const timbradoId = timbradoResult.insertId;

  await db.insert(customers).values(
    CUSTOMERS.map((customer) => ({
      tenantId,
      name: customer.name,
      ...ruc(customer.base),
      isConsumidorFinal: false,
      whatsapp: whatsapp(customer.whatsapp),
      email: customer.email,
      address: customer.address,
      docLocale: customer.docLocale,
      active: true,
      updatedBy: userId,
    })),
  );

  await db.insert(customers).values({
    tenantId,
    name: "Consumidor final",
    rucBase: null,
    rucDv: null,
    isConsumidorFinal: true,
    whatsapp: null,
    email: null,
    address: null,
    docLocale: "es",
    active: true,
    updatedBy: userId,
  });

  const customerRows = await db
    .select({ id: customers.id, name: customers.name })
    .from(customers)
    .where(eq(customers.tenantId, tenantId));

  const customerId = (name: string) => {
    const row = customerRows.find((candidate) => candidate.name === name);
    if (!row) throw new Error(`Seeded customer missing: ${name}`);
    return row.id;
  };

  await db.insert(products).values(
    PRODUCTS.map((product) => ({
      tenantId,
      name: product.name,
      description: product.description,
      unit: product.unit,
      unitAmount: product.unitAmount,
      currency: product.currency,
      taxRate: product.taxRate,
      active: true,
      updatedBy: userId,
    })),
  );

  const productRows = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(eq(products.tenantId, tenantId));

  const productIds = PRODUCTS.map((product) => {
    const row = productRows.find((candidate) => candidate.name === product.name);
    if (!row) throw new Error(`Seeded product missing: ${product.name}`);
    return row.id;
  });

  /* --- quotes ------------------------------------------------------------ */

  const quoteSeeds: {
    customer: string;
    status: "borrador" | "enviado" | "aceptado";
    issued: number;
    validity: number;
    lines: SeedLine[];
    notes: string | null;
  }[] = [
    {
      customer: "Constructora Ykuá Satã",
      status: "enviado",
      issued: 4,
      validity: 15,
      lines: [
        { productIndex: 1, qty: 120 },
        { productIndex: 2, qty: 40 },
        { productIndex: 3, qty: 6 },
      ],
      notes: "Entrega en obra, Avda. España. Precios válidos salvo variación cambiaria.",
    },
    {
      customer: "Talleres Guaraní S.R.L.",
      status: "aceptado",
      issued: 12,
      validity: 20,
      lines: [
        { productIndex: 0, qty: 24 },
        { productIndex: 9, qty: 4 },
        { productIndex: 4, qty: 16 },
      ],
      notes: "Incluye la mano de obra de montaje.",
    },
    {
      customer: "Estancia Santa Rosa",
      status: "borrador",
      issued: 1,
      validity: 30,
      lines: [
        { productIndex: 0, qty: 60 },
        { productIndex: 6, qty: 1 },
      ],
      notes: null,
    },
  ];

  const quoteIds: number[] = [];

  for (const seed of quoteSeeds) {
    const issueDate = shiftDate(today, -seed.issued);
    const [result] = await db.insert(documents).values({
      tenantId,
      type: "quote",
      status: seed.status,
      customerId: customerId(seed.customer),
      docLocale: "es",
      currency: "PYG",
      issueDate,
      validUntil: validUntilFrom(issueDate, seed.validity),
      notes: seed.notes,
      publicToken: generatePublicToken(),
      ...totalsFor(seed.lines, "PYG"),
      createdBy: userId,
      updatedBy: userId,
    });

    quoteIds.push(result.insertId);
    await db.insert(documentLines).values(
      linesFor(tenantId, result.insertId, productIds, seed.lines),
    );
    await db.insert(activityLog).values({
      tenantId,
      userId,
      entityType: "document",
      entityId: result.insertId,
      action: "created",
      detail: { type: "quote" },
    });
  }

  /* --- invoices ---------------------------------------------------------- */

  const invoiceSeeds: {
    customer: string;
    type: "invoice_contado" | "invoice_credito";
    issued: number;
    creditDays: number | null;
    lines: SeedLine[];
    /** Payments to record, as a fraction of the total. */
    paid: { fraction: number; method: "efectivo" | "transferencia" | "tigo_money"; days: number }[];
    fromQuote?: number;
  }[] = [
    {
      customer: "Talleres Guaraní S.R.L.",
      type: "invoice_credito",
      issued: 10,
      creditDays: 30,
      lines: [
        { productIndex: 0, qty: 24 },
        { productIndex: 9, qty: 4 },
        { productIndex: 4, qty: 16 },
      ],
      paid: [{ fraction: 0.5, method: "transferencia", days: 4 }],
      fromQuote: 1,
    },
    {
      customer: "Supermercado La Colonia",
      type: "invoice_contado",
      issued: 8,
      creditDays: null,
      lines: [
        { productIndex: 5, qty: 6 },
        { productIndex: 7, qty: 2 },
      ],
      paid: [{ fraction: 1, method: "efectivo", days: 8 }],
    },
    {
      customer: "Constructora Ykuá Satã",
      type: "invoice_credito",
      issued: 45,
      creditDays: 15,
      lines: [
        { productIndex: 1, qty: 200 },
        { productIndex: 3, qty: 8 },
      ],
      paid: [],
    },
    {
      customer: "Consumidor final",
      type: "invoice_contado",
      issued: 2,
      creditDays: null,
      lines: [{ productIndex: 9, qty: 1 }],
      paid: [{ fraction: 1, method: "tigo_money", days: 2 }],
    },
  ];

  const invoiceIds: number[] = [];

  for (const seed of invoiceSeeds) {
    const issueDate = shiftDate(today, -seed.issued);
    const totals = totalsFor(seed.lines, "PYG");

    const invoiceId = await db.transaction(async (tx) => {
      const allocated = await allocateDocumentNumber(tx, {
        tenantId,
        timbradoId,
        today: issueDate,
      });

      const [result] = await tx.insert(documents).values({
        tenantId,
        type: seed.type,
        status: "pendiente",
        number: allocated.number,
        timbradoId,
        customerId: customerId(seed.customer),
        docLocale: "es",
        currency: "PYG",
        issueDate,
        dueDate: seed.creditDays === null ? null : validUntilFrom(issueDate, seed.creditDays),
        relatedDocumentId:
          seed.fromQuote === undefined ? null : quoteIds[seed.fromQuote] ?? null,
        publicToken: generatePublicToken(),
        ...totals,
        issuedAt: new Date(`${issueDate}T15:00:00.000Z`),
        issuedBy: userId,
        createdBy: userId,
        updatedBy: userId,
      });

      await tx
        .insert(documentLines)
        .values(linesFor(tenantId, result.insertId, productIds, seed.lines));

      return result.insertId;
    });

    invoiceIds.push(invoiceId);

    await db.insert(activityLog).values({
      tenantId,
      userId,
      entityType: "document",
      entityId: invoiceId,
      action: "issued",
      detail: { type: seed.type },
    });

    for (const payment of seed.paid) {
      const amount = Math.round(totals.total * payment.fraction);
      await db.insert(payments).values({
        tenantId,
        documentId: invoiceId,
        amount,
        currency: "PYG",
        method: payment.method,
        paidAt: new Date(`${shiftDate(today, -payment.days)}T15:00:00.000Z`),
        reference: payment.method === "transferencia" ? "TRF-448120" : null,
        notes: null,
        createdBy: userId,
        updatedBy: userId,
      });

      await db
        .update(documents)
        .set({ status: payment.fraction >= 1 ? "pagada" : "parcial" })
        .where(eq(documents.id, invoiceId));

      await db.insert(activityLog).values({
        tenantId,
        userId,
        entityType: "document",
        entityId: invoiceId,
        action: "paid",
        detail: { amount },
      });
    }
  }

  /* --- one credit note --------------------------------------------------- */

  const creditedInvoiceId = invoiceIds[1];
  const creditLines: SeedLine[] = [{ productIndex: 7, qty: 1 }];
  const creditTotals = totalsFor(creditLines, "PYG");

  await db.transaction(async (tx) => {
    const allocated = await allocateDocumentNumber(tx, {
      tenantId,
      timbradoId,
      today: shiftDate(today, -6),
    });

    const [result] = await tx.insert(documents).values({
      tenantId,
      type: "credit_note",
      status: "pendiente",
      number: allocated.number,
      timbradoId,
      customerId: customerId("Supermercado La Colonia"),
      docLocale: "es",
      currency: "PYG",
      issueDate: shiftDate(today, -6),
      relatedDocumentId: creditedInvoiceId,
      notes: "Devolución de un libro de obra con la tapa dañada.",
      publicToken: generatePublicToken(),
      ...creditTotals,
      issuedAt: new Date(`${shiftDate(today, -6)}T15:00:00.000Z`),
      issuedBy: userId,
      createdBy: userId,
      updatedBy: userId,
    });

    await tx
      .insert(documentLines)
      .values(linesFor(tenantId, result.insertId, productIds, creditLines));

    await tx.insert(activityLog).values({
      tenantId,
      userId,
      entityType: "document",
      entityId: creditedInvoiceId,
      action: "credited",
      detail: { number: allocated.number, amount: creditTotals.total },
    });
  });

  console.log(
    [
      `Seeded tenant #${tenantId} — Ferretería San Blas S.A.`,
      `  RUC ${DEMO_RUC_BASE}-${computeRucDv(DEMO_RUC_BASE)}`,
      `  users: ${staff.map((person) => person.email).join(", ")}`,
      `  password: ${DEMO_PASSWORD}`,
      `  ${CUSTOMERS.length + 1} customers, ${PRODUCTS.length} products,`,
      `  ${quoteSeeds.length} quotes, ${invoiceSeeds.length} invoices, 1 credit note`,
    ].join("\n"),
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
