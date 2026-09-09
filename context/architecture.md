# Architecture Context

## Stack

| Layer | Technology | Role |
|---|---|---|
| Framework | Next.js 15 (App Router) + TypeScript | Server rendering, routing, server actions |
| UI | Tailwind + shadcn/ui | Component layer |
| Design system | impeccable (`PRODUCT.md`, `DESIGN.md` at root) | Design language, tokens, deterministic craft rules |
| Charts | Recharts | Cash calendar and weight curve only |
| Auth | Supabase Auth | Email sign-in, session management |
| Database | Supabase Postgres | All persisted facts |
| Validation | Zod | Boundary validation for all external input |
| Engine | `packages/engine` — plain TypeScript | All business logic. No dependencies. |
| Tests | Vitest | Engine unit + golden fixture tests, red/green TDD |
| Icons | `@phosphor-icons/react` | Icon set — see ui-context.md |
| Deploy | **Netlify** + `@netlify/plugin-nextjs` | Hosting, Next.js runtime |
| Scheduled work | Netlify Scheduled Functions | Nightly snapshot, alert evaluation |

## Repository layout

```
/
├── CLAUDE.md
├── netlify.toml                ← build config + scheduled functions
├── context/                    ← this folder. Read before implementing.
│   └── breed_curve.json        ← seed data, do not modify
├── packages/
│   └── engine/                 ← PURE. No I/O. No framework.
│       ├── src/
│       │   ├── types.ts
│       │   ├── production.ts   M1 flock projection
│       │   ├── costing.ts      M2 cost engine
│       │   ├── feed.ts         M3 feed liability
│       │   ├── harvest.ts      M4 harvest optimiser
│       │   ├── allocation.ts   M5 cash + allocation
│       │   ├── recommend.ts    M6 plain-language advice
│       │   ├── scenario.ts     M7 parameter sweep
│       │   ├── explain.ts      Explained<T> wrapper
│       │   ├── money.ts        bigint cents value object
│       │   └── index.ts        computeDecision() — the only export
│       └── tests/
│           └── golden/         fixtures the engine must reproduce
├── netlify.toml                ← build config, plugin, scheduled functions
└── apps/
    └── web/
        ├── app/                routes
        ├── components/
        │   └── ui/             ← shadcn generated. Protected.
        ├── lib/
        │   ├── repositories/   ← ONLY place that touches Supabase
        │   └── supabase/       client setup
        ├── netlify/
        │   └── functions/      ← scheduled jobs only. No request handling.
        ├── db/
        │   └── migrations/
        └── netlify/
            └── functions/      ← scheduled jobs only, never request-path work
```

## Netlify specifics

- `netlify.toml` at repo root declares the build command, publish
  directory, and `@netlify/plugin-nextjs`.
- The monorepo means the base directory is `apps/web`; the engine
  package is built as a workspace dependency.
- **Scheduled work runs as Netlify Scheduled Functions**, declared in
  `netlify.toml` with a cron expression. Two jobs at MVP:
  - `nightly-snapshot` — recompute projections, persist a recommendation
  - `alert-eval` — evaluate alert rules, queue the email digest
- Secrets live in Netlify environment variables. Never in the repo.
  Anything prefixed `NEXT_PUBLIC_` is exposed to the browser — the
  Supabase service role key never carries that prefix.
- Deploy previews run on every PR. The engine test suite must pass
  before a deploy is promoted.

## System boundaries

- `packages/engine` — owns every calculation. Knows nothing about
  databases, HTTP, React, or the current time. Takes a snapshot of
  facts, returns a decision object. Runs identically in Node and the
  browser.
- `apps/web/lib/repositories` — the only code that imports the Supabase
  client. Reads facts, writes facts, assembles engine inputs. Contains
  no business logic.
- `apps/web/app` — routes and server actions. Validates input, calls a
  repository, calls the engine, renders. No arithmetic beyond
  formatting.
- `apps/web/components` — presentation only. Receives computed values
  as props. Never calculates a business number.
- `apps/web/db/migrations` — schema. Owns data integrity constraints.

## Data model

Facts are immutable and append-only. Everything else is derived.
**Never store a value that can be computed** — no `birds_alive` column,
no `amount_outstanding` column. Derive them.

```sql
organizations   (id, name, created_at)
memberships     (org_id, user_id, role)          -- OWNER | MANAGER | WORKER

parameter_sets  (id, org_id, name, effective_from, is_active)
parameters      (parameter_set_id, key, value_numeric, unit, confidence)
                -- confidence: MEASURED | CALIBRATED | ASSUMED

breed_curves       (id, org_id, name, source)
breed_curve_points (curve_id, day, weight_g, feed_g, phase)

batches         (id, org_id, code, placement_date, chick_count,
                 extra_chick_count, chick_price_cents, curve_id,
                 parameter_set_id, status, closed_at)
                -- status: PLANNED | ACTIVE | HARVESTING | CLOSED

daily_records   (id, batch_id, record_date, day_number,
                 mortality_count, cull_count,
                 feed_starter_kg, feed_grower_kg, feed_finisher_kg,
                 avg_weight_g, weight_sample_size,
                 notes, recorded_by, recorded_at)
                UNIQUE (batch_id, record_date)

credit_facilities (id, org_id, supplier_name, limit_cents, default_terms_days)

feed_draws      (id, org_id, facility_id, collection_date, feed_type,
                 bags, kg, price_per_bag_cents, total_cents,
                 terms_days, due_date, reference)
                -- due_date GENERATED ALWAYS AS (collection_date + terms_days)

feed_allocations(draw_id, batch_id, kg_allocated)
                -- one draw may serve two overlapping batches
feed_payments   (id, draw_id, payment_date, amount_cents, method)

sales_orders    (id, org_id, batch_id, channel, order_date,
                 bird_count, avg_live_weight_g, avg_dressed_weight_g,
                 price_cents_per_bird, price_cents_per_kg,
                 pricing_basis, gross_cents,
                 abattoir_fee_cents, transport_cents, net_cents,
                 terms_days, due_date, status)
                -- channel: GATE | BULK
                -- pricing_basis: PER_BIRD | PER_KG
receipts        (id, sales_order_id, receipt_date, amount_cents, method)

expenses        (id, org_id, batch_id NULL, expense_date, category,
                 amount_cents, cost_type, is_recurring)
                -- cost_type: VARIABLE | FIXED

cash_accounts     (id, org_id, name, opening_balance_cents, opening_date)
cash_transactions (id, account_id, txn_date, direction, amount_cents,
                   category, ref_table, ref_id)

recommendations (id, org_id, batch_id, as_of_date, engine_version,
                 input_hash, input_snapshot JSONB, output JSONB,
                 rationale JSONB, accepted_at, actual_action JSONB)

scenarios       (id, org_id, batch_id, name, param_overrides JSONB)
alerts          (id, org_id, batch_id NULL, rule_key, severity,
                 title, body, triggered_at, acknowledged_at)
```

### Derived views
```
v_batch_status      birds alive, day number, livability, latest weight, FCR
v_feed_liability    per draw: paid, outstanding, days until due
v_receivables       per bulk order: outstanding, days outstanding
v_cash_projection   day-by-day opening / in / out / closing
v_batch_pnl         full cost and revenue rollup
```

## Auth and access model

- Every user signs in via Supabase Auth.
- Every row in every domain table carries `org_id`.
- Row Level Security restricts all access to the caller's organisation.
- Roles: `OWNER` (full access), `MANAGER` (all except settings and
  batch close), `WORKER` (daily capture only — cannot see financials).
- One organisation exists at MVP. Do not build organisation switching.

## Invariants

The codebase must never violate these.

1. **`packages/engine` performs no I/O.** No database calls, no fetch,
   no file access, no `Date.now()`, no `Math.random()`, no environment
   variables. `asOf` is always passed in explicitly.

2. **Money is `bigint` cents; weight is integer grams; rates are basis
   points.** No floating point arithmetic on money, ever. When money is
   split, the split must sum exactly to the original — use
   largest-remainder allocation.

3. **Derived values are never stored.** Birds alive, outstanding
   balances, cumulative feed and FCR are computed from facts on read.

4. **Only `lib/repositories` imports the Supabase client.** No route,
   component, or engine file may query the database directly.

5. **The engine never invents an input.** A missing required value
   produces a typed `MissingInput` result naming what is missing. It
   never substitutes a default silently.

6. **Every engine output carries provenance.** Values are returned
   wrapped as `Explained<T>` with formula, inputs, and confidence.

7. **No lookahead.** A computation with `asOf = T` must never read a
   record dated after `T`.

8. **The same engine build runs on server and client** and returns
   identical results for identical inputs.

9. **Batch size is never hardcoded.** Every quantity scales from
   `chick_count + extra_chick_count`.

10. **Feed consumed is based on opening birds, not closing birds.**
    Birds that die during the day still ate that day. (The client's
    spreadsheet gets this wrong — do not copy the bug.)

11. **A recommendation is persisted with its inputs and engine
    version** so any past recommendation can be reproduced exactly.

12. **Request handlers do no long-lived work.** Nightly snapshots and
    alert evaluation run in Netlify Scheduled Functions, not in request
    handlers.

## Hosting notes (Netlify)

- Next.js runs via `@netlify/plugin-nextjs`. Server components, server
  actions and route handlers all work; no adapter code needed.
- **Scheduled work uses Netlify Scheduled Functions**, declared in
  `netlify.toml`. There is no Vercel Cron here — do not generate
  `vercel.json` or `vercel` imports.
- Environment variables are set in the Netlify UI and referenced
  server-side only. Never expose the Supabase service key to the client.
- `netlify.toml` must pin the Node version to match local development.
