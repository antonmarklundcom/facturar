# facturar — Build Plan

Invoicing app (facturación) for Paraguayan SMBs. Multi-tenant SaaS. This plan is the contract
for the build chats: each PR below is one pull request, built in order of its dependencies,
auto-merged when CI is green. Builder model: **Opus 5** for all PRs.

Read `ARCHITECTURE.md` (data model + domain rules) and `CLAUDE.md` (guardrails) before any PR.
Relevant local skills for the build chats: `paraguay-business-apps`, `nodejs-mysql-hostinger-stack`,
`nextjs-deploy-hostinger`, `web-design-system`.

## Locked decisions (agreed 2026-08-19)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Market | Paraguay-first, per-tenant market-profile abstraction so Sweden can be added later |
| 2 | Tenancy | Multi-tenant from day one (`tenant_id` on every table, server-side filtering) |
| 3 | Staff roles | `admin`, `employee`, `viewer` (read-only + export) |
| 4 | Buyer access | Token-protected public URLs per document — no customer login |
| 5 | Auth | Own email+password: iron-session + bcrypt, behind a small provider abstraction |
| 6 | Languages | UI: es + en per-user switcher. Document language: per customer, overridable per document. next-intl, translation keys everywhere |
| 7 | Currency | PYG + USD from day one (integer amounts + currency + exchange_rate) |
| 8 | V1 documents | Quotes (presupuestos) → invoices (contado/crédito), credit notes, payments |
| 9 | Delivery | WhatsApp-first (wa.me deeplink + token URL) + email |
| 10 | Email | Resend (separate free team for this project's domain) |
| 11 | Dark mode | Yes, day one (token-based theming; PDFs always light) |
| 12 | CI gate | ESLint + typecheck + `next build` + Vitest; unit tests mandatory for money/RUC/IVA/numbering |
| 13 | Builder model | Opus 5 for all PRs |
| 14 | Audit | Full `activity_log` + `updated_by`/`updated_at` |
| 15 | Deploy | Early — right after the foundation phase (PR-6) |
| 16 | Seed | Idempotent demo-tenant seed with realistic PY data |
| 17 | Domain | facturar.clientes.com.py (Resend sender domain: clientes.com.py) |
| 18 | Merge flow | Build chat watches CI and merges each PR itself only when green (no reliance on GitHub branch protection) |

Deferred (explicitly out of v1): SIFEN/e-Kuatia e-invoicing (data model must stay ready; never
claim compliance without verifying current DNIT rules), WhatsApp Cloud API automation, customer
portal with login, full CRM pipeline, Swedish market profile.

## Phase A — Foundation (sequential)

### PR-1 Scaffold + CI
create-next-app (App Router, TS, Tailwind), drizzle-orm/mysql2/drizzle-kit/tsx, `drizzle.config.ts`,
`src/db/index.ts` (pool, connectionLimit 8, timezone "Z"), `.env.example` with comments,
next-intl wired with `es` + `en` catalogs, design tokens (CSS variables, light + dark),
GitHub Actions workflow: lint + typecheck + build + vitest.
**Depends:** — · **Accept:** CI green on the PR itself; `npm run dev` renders a placeholder page in es and en.

### PR-2 Database schema + migrations
All tables per ARCHITECTURE.md: tenants, users, customers, products, timbrados, documents,
document_lines, payments, activity_log. Money as bigint minor units + currency. `tenant_id`
everywhere. Drizzle migrations committed.
**Depends:** PR-1 · **Accept:** migrations apply cleanly to a fresh MySQL DB; schema matches ARCHITECTURE.md.

### PR-3 Auth + roles + tenant scoping
Login/logout (iron-session + bcrypt), `users` with role enum, `requireRole()` and
`tenantScoped()` helpers, middleware protecting the app shell, user management screen (admin only).
**Depends:** PR-2 · **Accept:** unit tests for role checks; every server action asserts session + tenant; viewer cannot mutate anything.

### PR-4 Domain utilities + tests (the money core)
`validateRuc` (modulo-11 DV), consumidor final handling, IVA-included math (10/5/exenta,
per-line rounding), `es-PY` formatting (`₲ 1.500.000`, USD 2 decimals), invoice number
generator (`EST-PTO-0000001` per timbrado, gap-free, race-safe), timbrado expiry/range warnings,
exchange-rate handling. **Vitest coverage of every function is the acceptance gate.**
**Depends:** PR-2 · **Accept:** exhaustive unit tests incl. rounding edge cases and known-valid/invalid RUCs.

### PR-5 App shell + settings
Layout, nav, per-user UI language switcher (es/en), dark-mode toggle, tenant settings screen
(company data, RUC, logo, timbrado CRUD with validity window, default currency), dashboard skeleton.
Apply web-design-system tokens — this must not look like a generic admin template. Mobile-first.
**Depends:** PR-3 · **Accept:** settings persist per tenant; timbrado expiry warning visible when <30 days or <10% of range left.

### PR-6 Deploy to Hostinger (early)
Follow the `nextjs-deploy-hostinger` playbook: Node slot, MySQL + Remote MySQL, env vars,
GitHub-based deploy. Document the live URL + slot in this file when done.
**Depends:** PR-5 · **Accept:** login works on the live URL against the live DB.

## Phase B — Features (parallelizable once Phase A is merged)

### PR-7 Customers
CRUD with RUC validation, consumidor final flag, WhatsApp number normalized `+5959XXXXXXXX`,
one-tap wa.me deeplink, document-language default (es/en) per customer, email field.
**Depends:** PR-4, PR-5 · **Accept:** invalid RUC rejected client- and server-side; employee can edit, viewer cannot.

### PR-8 Products & services
CRUD: name, description, unit price (amount+currency), IVA rate (10/5/exenta), unit.
**Depends:** PR-4, PR-5 · **Accept:** line-ready data; price formatting correct in both currencies.

### PR-9 Quotes (presupuestos)
CRUD with line items, validity date ("Presupuesto válido por X días"), PDF (branded, IVA
breakdown), token-protected public URL, status (borrador/enviado/aceptado/rechazado/vencido),
convert-to-invoice action.
**Depends:** PR-7, PR-8 · **Accept:** PDF renders in the customer's document language; token URL needs no login; conversion carries all lines.

### PR-10 Invoices
Factura contado + crédito (due date/installments). Numbering via PR-4 generator; issuing blocked
on expired timbrado. **Issued invoices are immutable** — stored PDF snapshot + raw data; edits
only via credit note. Token public URL. Per-document language override at creation.
**Depends:** PR-9 · **Accept:** number sequence gap-free under concurrent issuing (tested); immutability enforced server-side; per-rate IVA-included breakdown on the PDF.

### PR-11 Credit notes + payments
Nota de crédito referencing the original invoice (full/partial). Payment recording: efectivo,
transferencia, tarjeta, cheque, billeteras (Tigo Money, Billetera Personal, Zimple, QR);
partial payments; invoice status derived (pendiente/parcial/pagada/vencida/anulada).
**Depends:** PR-10 · **Accept:** status math unit-tested; credit note PDF references original number.

### PR-12 Send flows
WhatsApp composer (`wa.me/<number>?text=` greeting + token URL) and Resend email sending for
quotes + invoices, both logged to activity_log. Email templates in the document language.
**Depends:** PR-9, PR-10 · **Accept:** send events appear in the document's history; email delivers with PDF link.

### PR-13 Dashboard + reports + activity log UI
Default screen = "what needs action today": overdue invoices, quotes awaiting follow-up,
timbrado warnings. IVA summary per rate per period, sales per period, export CSV.
Per-document history panel from activity_log.
**Depends:** PR-10, PR-11 · **Accept:** numbers reconcile with unit-tested domain math; viewer role sees everything read-only.

### PR-14 Seed + polish
Idempotent demo-tenant seed (valid RUC DVs, realistic ₲ amounts, PY names/cities, sample
quotes/invoices/payments). Empty states, loading states, mobile QA pass, design-system QA gate,
`es`/`en` catalog completeness check (no missing keys).
**Depends:** all · **Accept:** fresh DB + seed → demo-able app in <1 min; no hardcoded UI strings remain (grep gate).

## Build-chat protocol

- One PR per branch `feat/pr-N-slug`; never push to main directly. Auto-merge on green CI.
- Before pushing: run lint, typecheck, build, and tests locally; reproduce-then-fix for any CI failure.
- After each PR, report to the user: what was done, issues found, ideas for improvement, and
  risks for later PRs. After each phase, update this file's status column below.

## Status

| PR | Title | Status |
|----|-------|--------|
| 1 | Scaffold + CI | pending |
| 2 | Schema | pending |
| 3 | Auth + roles | pending |
| 4 | Domain utils | pending |
| 5 | App shell | pending |
| 6 | Deploy | pending |
| 7 | Customers | pending |
| 8 | Products | pending |
| 9 | Quotes | pending |
| 10 | Invoices | pending |
| 11 | Credit notes + payments | pending |
| 12 | Send flows | pending |
| 13 | Dashboard + reports | pending |
| 14 | Seed + polish | pending |
