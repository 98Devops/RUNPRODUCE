# U6 — Supabase Schema, RLS, Repositories

**Spec in progress.** Presented in chunks for sign-off, started 2026-09-14.
Task 0 (one shared refusal list, TD-4 #8, AD-60) is done: `0b8758c` on
`u6-supabase-schema`.

---

## Chunk 1 — Framing: what the schema is built from, where it is tested, where U6 stops

### The data model in `architecture.md` is a sketch, and it is behind the engine

It was written before AD-52 to AD-59. The engine's `EngineInput` is what the
repositories must assemble, and today the sketch cannot hold it:

| `EngineInput` needs | The sketch has |
|---|---|
| A band schedule per sales order, and `BANDED` pricing (AD-57) | `pricing_basis: PER_BIRD \| PER_KG`, no bands |
| A planning band schedule on the parameter set (`bulk_bands`) | `parameters (key, value_numeric, ...)`: a number per row, no lists |
| Overhead lines with a payment timing and a measured flock size (AD-56) | A key, a number and a unit per line. No timing |
| Enum parameters: `delivery_mode`, `gate_pricing_basis` | Numeric values only |
| Feed price per bag per phase (AD-52) | `breed_curve_points` has no pricing. The engine reads it from the seed curve's phases |
| `max_placement_birds`, `reserve_floor_cents`, `dressing_yield_pct` | Not in the sketch |

It also stores values the same document says never to store:
`sales_orders.gross_cents` and `net_cents` (derived by the engine since AD-57),
`feed_draws.total_cents` (bags × price per bag), and `daily_records.day_number`
(from the placement date).

### Fixtures 6 and 8

Neither one is served by U6 or blocked by it. Fixture 6 is M6's break-even
figure, held on Daniel's chick price (OQ-8). Fixture 8 is bulk net per day
held, ours to attempt (OQ-10). The one consequence for the schema: OQ-10
suspects fixture 8 needs a planning band schedule. So bands must be storable
on a parameter set as well as on an order. D1 already requires that.

### Decisions

**D1 · The schema is derived from `EngineInput`, not from the sketch.**
Each table exists to hold facts the engine reads, or facts the app needs to
produce them (organisations, memberships, credit facilities). Once this spec is
signed off, `architecture.md`'s data model section is rewritten to match, in
U6's first docs commit. The sketch is not patched column by column.
*Recommended.* The alternative is building the sketch and translating it in
the repositories. That puts a second model of a sales order in
`apps/web`, which is the drift TD-4 #8 just removed from the engine.

**D2 · A dedicated DEVELOPMENT Supabase project, reached through its own MCP server. Decided 2026-09-14.**
Revised from the chunk-1 draft. That draft recommended a local Docker stack; Docker is no
longer needed for U6.

- **Dev project:** ref `zlvjmaorlxrjnuxhykuh`, created by the user for U6. The
  `supabase` server in `.mcp.json` is pinned to this ref. Migrations, tests and schema
  experiments all run here. It is expected to be reset, wiped and rebuilt freely.
- **Daniel's production project is never touched by U6.** U11 deploys the final
  schema to it deliberately, in one clean migration. Every connection string, MCP
  target and deploy script defaults to dev. This is a hard rule in `SESSION.md`.
- **CI's database job** runs against a separate CI-only project or a throwaway
  branch of the dev project. It never runs against dev directly, and never against
  production. Which of the two is chosen in chunk 7.
- **The claude.ai Supabase connector is not used for U6.** It is account-wide, and
  on 2026-09-14 it listed two unrelated projects (`trevis-app`, `Fuel-track`) and not
  the dev project. Only the project-pinned `supabase` server is.

**D3 · Where U6 stops.**
- **In:** migrations, constraints, RLS, roles, seed. Repositories as plain
  TypeScript in `apps/web/lib/repositories`, Zod at the row boundary, and a
  `loadEngineInput(batchId, asOf)` that assembles `EngineInput`. The opening
  cash balance OQ-25 needs.
- **Out:** the Next.js app scaffold (U7 is its first screen; repositories need
  `@supabase/supabase-js`, not Next.js). No UI of any kind. No scheduled
  functions (U11).
- **Resolved in chunk 2 (D8):** how the balance is stored and reaches the engine.
  Task 9's placement is in chunk 7.

*Recommended as written.* Keeping the scaffold out means U6's diff is schema
and data access only, and its tests don't depend on a framework.

---

## Chunk 2 — Parameters, overheads, curves, and the opening cash balance

### What a parameter set has to hold

From `Parameters` and `BreedCurve` as the engine reads them today:

| Group | Fields | Shape |
|---|---|---|
| Mortality fallback | base rate, ramp start day, ramp rate | 3 integers (basis points, day) |
| Harvest | `slaughter_target_g`, `dressing_yield_pct`, `calibration_trailing_days_min` | scalars |
| Gate | price per bird, price per kg, `gate_pricing_basis`, capacity per day | 2 nullable money, 1 enum, 1 integer |
| Bulk costs | `abattoir_fee_cents`, `transport_cents_per_bird`, `delivery_mode` | 2 nullable money, 1 enum |
| Feed | `feed_terms_days`, `delivery_cents_per_tonne`, **price per bag per phase** | scalars + 3 prices |
| Allocation | `reserve_floor_cents`, `placement_step_birds`, `max_placement_birds` | money, integer, nullable integer |
| Lists | overhead lines (AD-56), planning bulk bands | variable length, typed rows |
| Curve | points per day, phase day ranges, bag size | per-curve rows |

### Decisions

**D4 · Typed columns for scalars, child tables for lists.**
`parameter_sets` has one column per scalar, typed as the engine types it. Money
is `bigint`, grams are `integer`, enums are `text` with a `CHECK`. A column is
nullable exactly where the engine's type is `| null`, so a null in the database
means what it means in the engine: not supplied, so refuse. The lists go in
`overhead_lines` and `planning_bulk_bands`, both keyed to the set.

| Option | Against |
|---|---|
| Key/value rows (the sketch) | Cannot hold an enum or a list. The database cannot check a value against its key's type, so Zod becomes the only integrity layer. `code-standards.md` says integrity belongs in the database |
| One JSONB document per set | Same problem. The database sees one opaque value |

*Recommended.* Per-scalar `confidence` is dropped from the sketch. The engine
reads confidence only on overhead lines, which keep it. Harvest and allocation
confidence is derived by the engine, never read from a column.

**D5 · Seeds are written into the row when a set is created. "Absent means seed" never crosses the database.**
The engine falls back to its `SEED_*` constants when an optional field is
omitted: overheads, bulk bands, dressing yield, delivery per tonne, the
calibration minimum, placement step, and the curve itself (AD-23). The
repository always passes every field explicitly, read from the row. A new set is
created with the seed values copied in, each overhead line keeping its `source`.

*Why:* a seed constant changed in code would otherwise silently change every
stored set that "had no value", including closed batches. An operator looking
at a set would also see blanks where the engine used numbers. The seed becomes
what the refusal texts already call it: what an app-level default is built from.
The dev seed script therefore fills the abattoir fee and transport at 10c each,
since Daniel has answered both.

*Two consequences:*
- An empty `overhead_lines` set means "charge no overheads". That is the
  engine's own meaning for an empty `lines` array, and nothing can reach the
  "absent" case.
- `max_placement_birds` has no seed (OQ-23) and stays nullable. Null reaches
  `computeAllocation` as absent, and today `requirePlacementCeiling` **throws**
  on that instead of refusing. Logged for Task 9, not fixed in U6.

*Recommended.*

**D6 · Feed prices move off the curve and onto the parameter set.**
The engine's `BreedCurve.phases` holds day ranges and bag size (genetics and
packaging) together with price per bag (what the supplier charges this month,
AD-52). Stored together, a price change would mean a new breed curve. So they
are split: `breed_curve_phases (curve_id, phase, first_day, last_day, bag_kg)` and
`feed_prices (parameter_set_id, phase, price_per_bag_cents)`. The repository
joins them back into `BreedCurve`. **No engine change.** A real draw still
carries its own invoiced `price_per_bag_cents` (chunk 3). *Recommended.*

**D7 · Parameter sets are immutable and effective-dated. A batch does not pin one.**
A set is never updated. Changing the gate price means inserting a new set with
a later `effective_from`, `UNIQUE (org_id, effective_from)`. The set in force for
a computation is the latest one with `effective_from <= asOf`.

This removes two columns from the sketch. `is_active` is derivable, and
`code-standards.md` says not to store what can be computed. `batches.parameter_set_id` goes too:
a price Daniel updates mid-batch should reach that batch's forecast, and
pinning would require an explicit re-pin every time.

*What it costs:* replaying a closed batch at a later `asOf` uses newer parameters.
A report on a closed batch must therefore pass `asOf = closed_at`. Exact
reproduction of a past recommendation is already covered by
`recommendations.input_snapshot`. *Recommended.*

**D8 · The opening cash balance (OQ-25): a ledger fact, derived by the engine, carried in `EngineInput`.**

*What the engine actually needs.* `openingCents` is **the cash held at the
start of the running batch's placement day**, before its own flows. The calendar
books the chick cost, overheads, draw payments and receipts itself, from day 1
on (`buildDays` throws on any flow dated before placement). **So it is not
today's bank balance.** Handing it today's balance would count everything
already paid since placement twice. It is also not `reserve_floor_cents`
(OQ-25's original finding).

*Storage:* `cash_accounts (org_id, name, opening_balance_cents, opening_date)`
and `cash_transactions (account_id, txn_date, direction, amount_cents, category,
batch_id NULL, ...)`, as in the sketch, plus `batch_id`.

*Derivation:* a new pure engine function returns the balance at placement:
the sum of every account's opening balance, plus transactions dated on or after
`opening_date` and before `placement_date`. It **excludes transactions
linked to the batch being projected**. A hatchery deposit paid a week before
placement would otherwise be subtracted here and booked again by the calendar
on day 1. It refuses with a new `MissingInputKey`, `'opening_cash'`, when there
is no account, or when any account opens after the placement date (the balance
before its records begin is unknown). The repository filters by org and batch;
the engine does the sum. Summing a ledger is a calculation, so it does not go in
a repository.

*How it reaches the engine:* `EngineInput.opening_cash_cents: Cents | null`, a
dated fact beside `records`, `draws` and `sales`. It is not a `Parameters`
field (OQ-25 option 1), because a balance is not a setting. It is not a
`computeDecision` argument (option 3), because that changes the one public
signature every fixture uses. Null leaves production, costing, feed and
harvest untouched. Only the allocation reads it, and it adds `'opening_cash'`
to its existing blocked path. That path already builds no calendars, refuses
Cover Fast and Build Reserve, and still answers Maximum Growth with
`reserve_floor_checked: false`. **No whole-result refusal shape is needed**,
which was option 1's main cost.

*What it does not solve, stated so it isn't mistaken for solved:* the projection
from placement forward is the engine's model of the batch, not the bank. Actual
payments that differ from projected ones, and spending unrelated to the batch,
are invisible until the next batch's placement-day balance picks them up.
Reconciling against today's real balance (asOf) would be an M5a change and a
separate decision. It gets logged as a new OQ, not built.

*Until U8 builds ledger capture:* the dev seed creates one account opening on
the seed batch's placement date with no transactions, so the derived balance
is exactly the entered one.

*Recommended.* **Moves into U6's build:** the engine function, the new key and
the `EngineInput` field (TDD, engine side), and the tables. **Task 9** (reading
it in the `decision.allocation` getter) is placed in chunk 7.

---

## Chunks still to come

3. **Facts.** Records, draws, sales and their bands. What is stored and what is
   derived. How a correction works under "facts are append-only" when the
   standards also say a repeated daily record upserts. Which of the four
   integrity rules in `code-standards.md` the database can enforce, and which
   it cannot (for example, "sales cannot exceed birds alive" needs the mortality
   model).
4. **Access.** RLS per table. How WORKER is kept away from financial columns,
   since RLS filters rows, not columns.
5. **Repositories and `EngineInput` assembly.** `bigint` through PostgREST
   (JSON numbers lose precision above 2^53, so money travels as strings). Zod
   schemas and their relation to the engine's types. A guard that refuses to
   connect to any project ref other than dev.
6. **Seed.** Daniel's real figures as the dev dataset.
7. **Build order (TDD), CI's database target, Task 9's placement**, and the plan
   task list.
