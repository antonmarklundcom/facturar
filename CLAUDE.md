# facturar — Guardrails for build sessions

Read `PLAN.md` (what to build, PR order, acceptance criteria) and `ARCHITECTURE.md`
(data model, roles, domain rules) before writing any code. If a local skill named
`paraguay-business-apps`, `nodejs-mysql-hostinger-stack`, or `nextjs-deploy-hostinger`
is available, load it for the relevant work.

## Hard rules (never violate)

1. **Money:** integers only (bigint minor units) + currency column. Never float, never
   DECIMAL(x,2) for PYG. PYG has 0 decimals, USD has 2. All money math in shared utils
   from PR-4 — never inline arithmetic in components or routes.
2. **Tenancy:** every query goes through the `tenantScoped()` helper. Never trust a
   client-supplied tenant id. Every new table gets `tenant_id`.
3. **Permissions:** every mutating server action/route calls `requireRole()`. Hiding UI
   is not a permission check.
4. **Immutability:** issued invoices/credit notes are never updated or deleted. Corrections
   are new credit notes. Store the PDF snapshot at issue time.
5. **i18n:** no hardcoded user-facing strings — everything through next-intl keys, added to
   BOTH `es` and `en` catalogs in the same PR. Document-facing text uses the document's
   locale, not the user's.
6. **Numbering:** invoice numbers come only from the PR-4 generator (per-timbrado,
   transactional, gap-free). Never generate numbers ad hoc. Block issuing on expired timbrado.
7. **Validation:** RUC always through `validateRuc` (server + client). WhatsApp numbers
   normalized to `+5959XXXXXXXX` before storage.
8. **Tests:** any change to money math, IVA breakdown, RUC validation, numbering, or payment
   status derivation requires unit tests in the same PR. CI (lint + typecheck + build + vitest)
   must pass locally before pushing.
9. **DB config:** once the Hostinger connection works (pool in `src/db/index.ts`,
   connectionLimit 8), do not touch it. Env vars documented in `.env.example`, never commit `.env`.
10. **No scope creep:** build only the PR you're on, per its acceptance criteria. Note ideas
    in your end-of-PR report instead of implementing them.

## Workflow

- Branch `feat/pr-N-slug` per PLAN.md PR; PRs auto-merge when CI is green — so green must be real.
- After each PR: report what was done, issues found, improvement ideas, and risks for later PRs;
  update the status table in PLAN.md.
- Formatting/locale: `es-PY` money (`₲ 1.500.000`), dates `dd/mm/yyyy`, tz `America/Asuncion`
  (store UTC). Spanish UI uses voseo. Dark mode via CSS variable tokens; PDFs always light.
- Commands: `npm run dev` · `npm run build` · `npm run lint` · `npm run test` (vitest) ·
  `npx drizzle-kit generate` / `migrate` · scripts via `npx tsx scripts/<file>.ts`
  (tsx does not auto-load `.env` — pass it explicitly).
