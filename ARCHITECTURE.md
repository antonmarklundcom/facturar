# facturar — Architecture

Next.js 15 (App Router) + TypeScript + Tailwind · Drizzle ORM + MySQL (Hostinger) ·
iron-session auth · next-intl (es/en) · Resend email · @react-pdf/renderer for PDFs
(pure JS — no headless Chrome on Hostinger).

## Principles

1. **Multi-tenant:** `tenant_id` on every table. All reads/writes go through a `tenantScoped()`
   helper that injects the filter server-side. Client-supplied tenant ids are never trusted.
2. **Money is integers.** PYG: whole guaraníes (no decimals). USD: cents. Column pattern:
   `amount bigint` + `currency enum('PYG','USD')` + optional `exchange_rate`. Floats are banned.
3. **Issued documents are immutable.** An issued invoice is never edited or deleted — corrections
   go through credit notes. A PDF snapshot + the raw data are stored at issue time.
4. **Market profile abstraction.** Tax math, document numbering, id validation, and formatting
   live behind a per-tenant `MarketProfile` interface. v1 ships `py` only; `se` (moms, unbroken
   series, ROT/RUT, öre) can be added later without remodeling.
5. **Two language layers.** UI language = per-user preference (es/en, next-intl catalogs,
   translation keys only). Document language = per-customer default, overridable per document;
   controls PDF + email/WhatsApp template text.
6. **SIFEN-ready, not SIFEN-compliant.** Data stays normalized and complete (RUC, timbrado,
   per-rate IVA, line items) so a certified e-invoicing provider can be bolted on later.
   Never claim compliance without verifying current DNIT rules.

## Data model (Drizzle, MySQL)

All tables: `id`, `tenant_id`, `created_at`, `updated_at`, `updated_by` unless noted.

- **tenants** — name, ruc_base, ruc_dv, logo_url, market_profile ('py'), default_currency,
  address, phone, email, plan/status flags (demo → paying is a flag, not a reinstall).
- **users** — email (unique per tenant), password_hash, name, role enum('admin','employee','viewer'),
  ui_locale enum('es','en'), active.
- **customers** — name, ruc_base, ruc_dv, is_consumidor_final, whatsapp `+5959XXXXXXXX`,
  email, address, doc_locale enum('es','en'), notes. Indexed by (tenant_id, ruc).
- **products** — name, description, unit, unit_amount bigint, currency, tax_rate enum('10','5','exenta').
- **timbrados** — number, valid_from, valid_to, establishment ('001'), expedition_point ('001'),
  range_start, range_end, next_sequence. Issuing checks validity + range; warn at <30 days or
  <10% of range remaining.
- **documents** — one table for all document types: type enum('quote','invoice_contado',
  'invoice_credito','credit_note'), status, number (null for quotes until issued),
  timbrado_id (invoices), customer_id, doc_locale, currency, exchange_rate,
  issue_date, due_date, valid_until (quotes), related_document_id (credit_note → invoice,
  invoice → source quote), public_token (unguessable, for buyer URLs), totals (subtotal per
  tax rate, iva_10, iva_5, total) — all bigint, pdf_snapshot ref, issued_at, issued_by.
- **document_lines** — document_id, product_id nullable, description, qty (x1000 fixed-point),
  unit_amount bigint, tax_rate, line_total bigint. IVA-included math:
  `iva = total * rate / (100 + rate)`, rounded per line.
- **payments** — document_id, amount bigint, currency, method enum('efectivo','transferencia',
  'tarjeta','cheque','tigo_money','billetera_personal','zimple','qr'), paid_at, reference, notes.
- **activity_log** — tenant_id, user_id, entity_type, entity_id, action ('created','updated',
  'issued','sent_whatsapp','sent_email','paid','credited','deleted'), detail JSON, created_at.
  Append-only.

## Roles & permissions (server-enforced)

| Capability | admin | employee | viewer |
|---|---|---|---|
| Tenant settings, timbrados, users | ✔ | ✖ | ✖ |
| Create/edit customers, products, quotes | ✔ | ✔ | ✖ |
| Issue invoices / credit notes, record payments | ✔ | ✔ | ✖ |
| Delete drafts | ✔ | own only | ✖ |
| Edit/delete issued documents | ✖ (nobody — immutable) | ✖ | ✖ |
| View + export everything | ✔ | ✔ | ✔ |

Every mutating server action calls `requireRole(session, [...])` and `tenantScoped()`.
Hiding buttons is UX, not security.

**Buyer access:** no accounts. `GET /d/[public_token]` renders the document (view + PDF
download) with no login. Tokens are long-random, revocable, and rate-limited.

## Key routes

- `/login`, `/dashboard` (action-first: overdue, follow-ups, timbrado warnings)
- `/clientes`, `/productos`, `/presupuestos`, `/facturas`, `/pagos`
- `/ajustes` (tenant, timbrados, users — admin), `/informes` (IVA per rate, sales, CSV export)
- `/d/[token]` public buyer view
- Shared form component per entity for create + edit; one route folder per entity.

## Locale/formatting rules

- `es-PY` money: `₲ 1.500.000` (dots, no decimals); USD: `US$ 1.234,56`.
- Dates `dd/mm/yyyy`, timezone `America/Asuncion`, store UTC.
- Spanish UI voseo in action labels ("Agregá", "Enviá", "Cargá").
- PDFs always light theme; app UI has light + dark via CSS variable tokens.
