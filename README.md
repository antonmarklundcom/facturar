# facturar

Multi-tenant invoicing (facturación) for Paraguayan SMBs.
Next.js 15 (App Router) · TypeScript · Tailwind v4 · Drizzle ORM + MySQL · next-intl (es/en).

Read [`PLAN.md`](./PLAN.md) (what to build, PR order), [`ARCHITECTURE.md`](./ARCHITECTURE.md)
(data model, roles, domain rules) and [`CLAUDE.md`](./CLAUDE.md) (guardrails) before writing code.

## Getting started

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL and SESSION_SECRET
npm run dev
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server on http://localhost:3000 |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Vitest (`npm run test:watch` to watch) |
| `npm run verify` | lint + typecheck + test + build — the same gate the pre-push hook runs |
| `npm run db:generate` / `npm run db:migrate` | drizzle-kit migrations |

One-off scripts run through `tsx`, which does **not** auto-load `.env`:

```bash
npx tsx --env-file=.env scripts/<file>.ts
```

## Quality gate

There is **no GitHub Actions CI in this repo, by design** (PLAN.md decision 12). The gate is local:

- `.husky/pre-push` runs lint + typecheck + test + build and blocks the push if anything fails.
- `.husky/pre-commit` refuses any staged file under `.github/workflows/`.

Hooks install themselves via the `prepare` script on `npm install`.

## Conventions

- Money is **integer minor units** (`bigint`) plus a currency column. PYG has 0 decimals, USD 2.
  Floats and `DECIMAL(x,2)` are banned.
- Every table carries `tenant_id`; every query goes through `tenantScoped()`; every mutation
  calls `requireRole()`.
- No hardcoded user-facing strings — next-intl keys only, added to **both** `messages/es.json`
  and `messages/en.json` in the same change.
- Routes (decision 22): `/` public landing, `/login` sign-in, authenticated app under `/admin/*`.
- Timestamps stored UTC, displayed `America/Asuncion`, dates `dd/mm/yyyy`.
