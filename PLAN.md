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
| 12 | CI gate | ESLint + typecheck + `next build` + Vitest; unit tests mandatory for money/RUC/IVA/numbering. **No GitHub Actions in this repo** — enforced locally by husky `pre-push`, with a `pre-commit` hook that refuses any staged workflow file |
| 13 | Builder model | Opus 5 for all PRs |
| 14 | Audit | Full `activity_log` + `updated_by`/`updated_at` |
| 15 | Deploy | Early — right after the foundation phase (PR-6) |
| 16 | Seed | Idempotent demo-tenant seed with realistic PY data |
| 17 | Domain | `facturar.clientes.com.py` — own Hostinger Node.js slot, separate from the existing `clientes.com.py` / `crm.clientes.com.py` app. Same slot also serves the Resend sender domain |
| 18 | Merge flow | The build chat opens and merges its own PRs once CI is green (no branch protection on GitHub Free for private repos); green must be real |
| 19 | Password reset | Admin-reset only in v1: a tenant admin sets a new password, user must change it at next login. No public reset flow, no email dependency. Self-service reset via Resend is a v1.1 item |
| 20 | Error monitoring | Structured server logs in v1 (no third-party SDK). Sentry to be added once the first real customer is live — recorded as a v1.1 item, not built now |
| 21 | Backups | Hostinger's automatic backups as baseline **plus** a scheduled `mysqldump` cron on the slot writing gzipped dumps to a separate path, keeping the last ~14. Also serves as the pre-migration rollback net |
| 22 | Public surface | `/` is a public marketing landing page, `/login` is the login screen, the authenticated app lives under `/admin/*`. Route contract fixed from PR-3 onward; the landing page itself ships in PR-15 |

Deferred (explicitly out of v1): SIFEN/e-Kuatia e-invoicing (data model must stay ready; never
claim compliance without verifying current DNIT rules), WhatsApp Cloud API automation, customer
portal with login, full CRM pipeline, Swedish market profile.

## Phase A — Foundation (sequential)

### PR-1 Scaffold + CI
create-next-app (App Router, TS, Tailwind), drizzle-orm/mysql2/drizzle-kit/tsx, `drizzle.config.ts`,
`src/db/index.ts` (pool, connectionLimit 8, timezone "Z"), `.env.example` with comments,
next-intl wired with `es` + `en` catalogs, design tokens (CSS variables, light + dark).
**No GitHub Actions** (decision 12) — the gate is husky `pre-push` running lint + typecheck +
build + vitest, plus a `pre-commit` hook that refuses any staged `.github/workflows/` file.
**Depends:** — · **Accept:** CI green on the PR itself; `npm run dev` renders a placeholder page in es and en.

### PR-2 Database schema + migrations
All tables per ARCHITECTURE.md: tenants, users, customers, products, timbrados, documents,
document_lines, payments, activity_log. Money as bigint minor units + currency. `tenant_id`
everywhere. Drizzle migrations committed.
**Depends:** PR-1 · **Accept:** migrations apply cleanly to a fresh MySQL DB; schema matches ARCHITECTURE.md.

### PR-3 Auth + roles + tenant scoping
Login/logout (iron-session + bcrypt), `users` with role enum, `requireRole()` and
`tenantScoped()` helpers, middleware protecting the app shell, user management screen (admin only).
Route contract (decision 22): login at `/login`, authenticated app under `/admin/*`, `/` left free
for the landing page (placeholder until PR-15) — middleware guards `/admin/*` only.
Admin-reset flow (decision 19): an admin can set a new password for a user in their tenant; the
user is forced to change it at next login (`must_change_password` flag). No public reset route.
**Depends:** PR-2 · **Accept:** unit tests for role checks; every server action asserts session + tenant; viewer cannot mutate anything; admin password reset forces a change at next login; no reset route reachable unauthenticated.

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
Follow the `nextjs-deploy-hostinger` playbook: own Node slot for `facturar.clientes.com.py`
(separate from the existing `clientes.com.py` app), MySQL + Remote MySQL, env vars, GitHub-based
deploy. Also set up the backup cron (decision 21): scheduled `mysqldump | gzip` to a path outside
the app directory, retaining the last ~14 dumps, with the command documented in this file.
Document the live URL + slot here when done.
**Depends:** PR-5 · **Accept:** login works on the live URL against the live DB; one backup dump verified to exist and to restore into a scratch DB.

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

### PR-15 Public landing page
Marketing landing at `/` on `facturar.clientes.com.py`: hero, 3–4 benefit blocks, a real product
screenshot, WhatsApp CTA, and a `/login` button. Spanish primary, `en` catalog kept in sync.
Apply `web-design-system`; no pricing page in v1. Must not pull the authenticated app's bundle.
**Depends:** PR-10 (needs a real invoice screenshot) · **Accept:** `/` renders publicly with no session; Lighthouse mobile ≥ 90; no hardcoded strings.

## Build-chat protocol

- One PR per branch `feat/pr-N-slug`; never push to main directly. Auto-merge on green CI.
- Before pushing: run lint, typecheck, build, and tests locally; reproduce-then-fix for any CI failure.
- After each PR, report to the user: what was done, issues found, ideas for improvement, and
  risks for later PRs. After each phase, update this file's status column below.

## Status

| PR | Title | Status |
|----|-------|--------|
| 1 | Scaffold + CI | **merged** |
| 2 | Schema | **merged** |
| 3 | Auth + roles | **merged** |
| 4 | Domain utils | **merged** |
| 5 | App shell | **merged** |
| 6 | Deploy | deferred — awaiting Hostinger credentials |
| 7 | Customers | **merged** |
| 8 | Products | **merged** |
| 9 | Quotes | pending |
| 10 | Invoices | pending |
| 11 | Credit notes + payments | pending |
| 12 | Send flows | pending |
| 13 | Dashboard + reports | pending |
| 14 | Seed + polish | pending |
| 15 | Landing page | pending |

## Phase A notes (recorded 2026-08-20)

Carried into later PRs rather than fixed in place:

- **Login rate limiting** is not implemented. Worth adding before the first real tenant is live.
- **`server-only`** on `lib/auth/users.ts`, `lib/auth/session.ts`, `lib/activity.ts` and
  `domain/numbering.server.ts` means a plain `tsx` script cannot import them. PR-14's seed either
  talks to `db` directly or that marker is relaxed on the pure data-access modules.
- **`documents.status`** is one enum spanning quote and invoice states. PR-9/PR-10 need a
  per-type guard so an invoice cannot land in `aceptado`.
- **`updated_at`** is maintained by Drizzle's `$onUpdate`, not by MySQL. A raw SQL `UPDATE`
  will not touch it.
- **The gap-free numbering test** (`tests/domain/numbering.db.test.ts`) needs a real MySQL and is
  skipped unless `TEST_DATABASE_URL` is set. Run it before PR-10 ships.
- **`zod`** is a dependency but is not yet used; it is there for the shared validation layer
  PR-7/PR-8 will need.
- **WhatsApp normalisation** (guardrail 7) lands in PR-7, not PR-4.
- **Timbrados are deactivated, never deleted** — they are a legal record.
- **Migrations were verified against MariaDB 10.11**, the engine available in the build
  environment. Re-run `db:migrate` against the real Hostinger MySQL in PR-6.
- **`next/font/google`** fetches at build time, so the Hostinger build box needs network access.
- **npm audit** reports advisories in transitive dev tooling (`postcss`/`sharp` under `next@15`,
  `esbuild` under `drizzle-kit`). The only offered fix is `next@16`, which contradicts
  ARCHITECTURE.md; left on 15 deliberately.

## Phase B notes (recorded 2026-08-20, after PR-7 / PR-8)

- **`zod` was removed.** It sat unused in `package.json`, reserved for the shared
  validation layer. What these forms need is a translation *key* per field rather than a
  message string, which zod only reaches through a mapping layer the size of the module
  that replaced it — `src/lib/validation.ts`. Money and RUC rules still live in
  `src/domain`. Use `src/lib/validation.ts` for PR-9 onward rather than starting a second
  idiom.
- **WhatsApp normalisation** landed in `src/domain/whatsapp.ts` (guardrail 7): storage
  shape `+5959XXXXXXXX`, `waMeLink()` for the deeplink, `formatWhatsapp()` for display.
  Landlines are rejected on purpose — a `wa.me` link to one goes nowhere.
- **Catalogue rows are deactivated, never deleted** — customers and products alike. Both
  are referenced by documents, which are immutable once issued.
- **Product prices are IVA-inclusive**, matching `document_lines`. PR-9's line editor
  should copy `unit_amount`, `tax_rate`, `unit` and `description` onto the line as a
  snapshot rather than joining to `products` at render time.
- **Not verified against a live database.** This build container had no MySQL, so PR-7 and
  PR-8 were checked by lint, typecheck, unit tests and `next build` only. The first real
  run against MySQL 8 is still PR-6.
- **Search is `LIKE '%term%'` capped at 200 rows.** Fine for a demo tenant and for an SMB
  with a few hundred customers; revisit if a tenant ever passes a few thousand.
- **No customer/product picker component yet.** PR-9 needs one for the line editor; build
  it there as a shared component rather than inline, since PR-10 and PR-11 need it too.

## v1.1 backlog (decided, deliberately not in v1)

- Self-service password reset by email via Resend (signed single-use token, 30-min expiry, rate limited).
- Sentry (free tier) with a scrubber for RUC, money amounts and email addresses — add once the first real tenant is live.
- Off-site copy of the nightly dump (outside the Hostinger account).
