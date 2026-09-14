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
  production. Which of the two is chosen in chunk 8.
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
  Task 9's placement is in chunk 8.

*Recommended as written.* Keeping the scaffold out means U6's diff is schema
and data access only, and its tests don't depend on a framework.

---

## Chunk 2 — Parameters, overheads, curves, and the opening cash balance

**Approved 2026-09-14 (D4-D8), logged as AD-61, AD-62, AD-64, AD-66, AD-67.**
Attached on approval: the enum-drift protocol (AD-63) and the display-column
rule for engine-shaped tables (AD-65).

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
- `max_placement_birds` has no seed (OQ-23) and stays nullable. The engine
  field is optional (`?: number`), not `| null`, so the repository must map a
  null column to an **omitted** field. Passed through as `null`, it slips past
  `requirePlacementCeiling`'s `=== undefined` check and throws "must be positive,
  got null". Either way the ceiling check **throws** rather than refusing.
  Logged for Task 9, not fixed in U6.

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

*Two points checked against the code (2026-09-14):*
- `'opening_cash'` is added **inside `computeAllocation`**, joined with
  `missingInputsFor(input)`. It does **not** go in the shared list in
  `refusals.ts`, because `decision` and the cash calendar read that list too
  (AD-60), and a null balance must not refuse them.
- `computeAllocation(input, feed, harvest, openingCents)` loses its fourth
  argument and reads `input.opening_cash_cents` instead. That argument is
  exactly the value `handoffAtPlacement` feeds the running batch's calendar from
  its placement day (`allocation.ts`), so the meaning does not change. Only
  allocation tests call it today, since the `decision.allocation` getter still
  throws, so no golden fixture changes.

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
it in the `decision.allocation` getter) is placed in chunk 8.

---

## Before chunk 3 — the `gate_price_cents_per_bird` question

Asked 2026-09-14: is it (a) a refusal with no emitting code path, or (b) an
orphaned key superseded when gate orders began carrying their own price?
Traced through git history and every read site. **Neither.** It is a live
`Parameters` field with a refusal that is emitted.

- **It is not a refusal key.** `MissingInputKey` has no member of that name,
  and never had one (`git log -S` over `packages/engine/src`). The refusal is
  `'gate_price'`.
- **The refusal is emitted.** `refusals.ts` `inputOnlyMissingInputs` emits
  `'gate_price'` when the rate for `gate_pricing_basis` is null, and two more
  sites refuse a gate order with no usable price. Tests assert it in
  `decision`, `harvest`, `cash` and `allocation`.
- **The field is read.** `harvest.ts` `gateValueCents` values a bird with it
  for the gate window and hold cost (fixture 7), throwing if a caller skipped
  `missingInputsFor`.
- **Order prices did not supersede it.** `ac800da` and AD-57 put a price on
  each order to value **actual** receipts. This field prices the **forecast**,
  for a sale that has no order yet. That is the same split as
  `Parameters.bulk_bands` and `SalesOrder.bands`.
- History: added in `5ec4e58` (U1 types), gained its refusal in `66bc1da` (M4
  review), consolidated in `0b8758c` (AD-60). No commit removed a reader.

**The key that does fit (b) is `mortality_history`.** It was declared in the U1
plan (`14c6dbf`) before calibration existed. It became unnecessary when M4
chose to fall back to the assumed mortality ramp, with `source: 'assumed'`,
when own-batch history is short (`architecture.md` invariant 14,
`calibrateMortality`). No code emits it. It is already logged in `current-issues.md` (due-diligence gap table, row 9),
"wire or delete". **Delete it** from `MissingInputKey` before any refusal is
stored, so it never enters a constraint (AD-63). Confirmed with the chunk 3
approval.

---

## Chunk 3 — Parameter table structure

Turns D4-D8 into tables. Columns listed here; DDL is written in the build.

### Conventions (AD-65, restated as rules for every table in U6)

- `id uuid primary key default gen_random_uuid()`, child tables included.
- `org_id uuid not null references organizations(id)` on every row. Parents
  also have `unique (id, org_id)`, and children reference
  `(parent_id, org_id)`, so a child cannot belong to a different org than its
  parent.
- `created_at timestamptz not null default now()` and
  `created_by uuid references auth.users(id)` on every row. Business dates are
  `date`.
- Enum-like columns: `text` with a named `CHECK` (AD-63).
- `organizations (id, name, created_at)` is created here only as the foreign
  key target. Memberships and roles are chunk 5.

### D9 · A parameter set is created by one database function, in one transaction

A set is a row in `parameter_sets` plus its `overhead_lines`,
`planning_bulk_bands` and 3 `feed_prices`. `supabase-js` cannot wrap several
table inserts in one transaction. If the repository inserted them one at a time,
a failure part-way through would leave a set with no feed prices. Worse, that
set would be in force (D7) the moment its row landed, because being in force
depends only on `effective_from`.

So there is one insert path, `create_parameter_set(payload jsonb) returns uuid`.
It validates the whole set (exactly one price per phase; bands with distinct
floors), assigns the revision (D10), and inserts every row atomically. No
client role gets `INSERT`, `UPDATE` or `DELETE` on the four tables directly.
The function is therefore `SECURITY DEFINER` with `set search_path = ''`, since
an invoker function could not insert without those grants. Because a definer
function bypasses RLS, it checks for itself that the caller is a member of
`payload.org_id` with a role allowed to change parameters (the roles are
chunk 5). A `BEFORE UPDATE OR DELETE` trigger raises an error, because the
service role bypasses RLS and grants, and immutability must hold for it too.

| Option | Against |
|---|---|
| Repository inserts each table | No transaction. A half-written set can be read as in force |
| Parent row with an `is_complete` flag | Every read must remember the flag; forgetting it is silent |

*Recommended.* Money travels inside `payload` as strings, the chunk 6 rule.

### D10 · Amend D7: `revision`, so a same-day mistake can be corrected

D7's `UNIQUE (org_id, effective_from)` means a set entered today with a wrong
gate price cannot be replaced today. The only way out would be a set effective
tomorrow, which leaves today's forecast wrong, or deleting the set, which D9
forbids.

`parameter_sets.revision smallint not null`, with
`UNIQUE (org_id, effective_from, revision)`. The set in force is the latest
`effective_from <= asOf`, then the highest `revision`. The function assigns the
revision (max + 1 for that date), so callers never choose it. The superseded
revision stays readable, which gives a UI "corrected on …" history for free
(AD-65). Index `(org_id, effective_from desc, revision desc)`.

*Recommended.* Rejected: breaking ties on `created_at`. That is also
deterministic, but a revision number is explicit and can be tested.
**This changes an approved decision, so it needs its own sign-off.**

### `parameter_sets`

| Column | Type | Null | Constraint | Seeded (D5) |
|---|---|---|---|---|
| `effective_from` | `date` | no | | |
| `revision` | `smallint` | no | `>= 1` | |
| `note` | `text` | yes | why this set exists; free text for the operator | |
| `mortality_base_rate_bp_daily` | `integer` | no | `>= 0` | |
| `mortality_ramp_start_day` | `smallint` | no | `>= 1` | |
| `mortality_ramp_rate_bp_daily` | `integer` | no | `>= 0` | |
| `slaughter_target_g` | `integer` | no | `> 0` | |
| `gate_pricing_basis` | `text` | no | `PER_BIRD`, `PER_KG` | |
| `gate_price_cents_per_bird` | `bigint` | **yes** | `> 0` | |
| `gate_price_cents_per_kg` | `bigint` | **yes** | `> 0` | |
| `gate_capacity_per_day` | `integer` | no | `> 0` | |
| `abattoir_fee_cents` | `bigint` | **yes** | `>= 0` | 10 |
| `transport_cents_per_bird` | `bigint` | **yes** | `>= 0` | 10 |
| `delivery_mode` | `text` | no | `ABATTOIR`, `DIRECT` | |
| `feed_terms_days` | `smallint` | no | `>= 0` | |
| `delivery_cents_per_tonne` | `bigint` | no | `>= 0` | 4000 |
| `reserve_floor_cents` | `bigint` | no | `>= 0` | |
| `dressing_yield_pct` | `smallint` | no | `1..100` | 62 |
| `calibration_trailing_days_min` | `smallint` | no | `>= 1` | 3 |
| `placement_step_birds` | `integer` | no | `> 0` | 1 |
| `max_placement_birds` | `integer` | **yes** | `> 0` | none (OQ-23) |

Notes on the choices:
- **Gate prices are `> 0`, not `>= 0`.** A zero price is the value
  `harvest.ts` refuses to invent ("zero is a number the client never gave
  us"). Unknown is null, and null refuses.
- **No cross-column CHECK that the price for the chosen basis is present.** Null
  there is a legitimate "not supplied", and refusing it is the engine's job
  (`'gate_price'`). A CHECK would stop an operator saving a partial set.
- **Mortality basis points are `integer`.** `BasisPoints` is typed `number`, so
  the database is narrower than the engine. Every stored value today is whole
  (15, 35), and a calibrated rate, which has decimals, is derived and never
  stored. Zod rejects a fraction at the boundary.
- **`dressing_yield_pct` is a whole `smallint`.** Daniel's figure is ~62, and
  OQ-17's measured replacement may have a decimal. If it does, the column
  becomes basis points in an additive migration. The engine type is `number`
  today.

### `overhead_lines`

`parameter_set_id`, `position smallint` (array order, which the engine's
charges and a screen both follow), `key` (`vaccine`, `electricity_heating`,
`labour`, `transport_other`), `label text`, `basis` (`PER_BIRD`, `PER_BATCH`),
`timing` (`PLACEMENT`, `MONTHLY`, `HARVEST_COMPLETE`), `amount_cents bigint >= 0`,
`measured_at_flock_size integer > 0`, `confidence` (`measured`, `calibrated`,
`assumed`), `source text not null`.
`UNIQUE (parameter_set_id, key)` mirrors the engine's own duplicate-key refusal
(`overheads.ts`). `UNIQUE (parameter_set_id, position)`.

### `planning_bulk_bands`

`parameter_set_id`, `dressed_floor_g integer > 0`,
`price_cents_per_bird bigint > 0`, `UNIQUE (parameter_set_id, dressed_floor_g)`.
Zero rows means the set has no planning schedule, so the bulk value is blank.
It never means "use the seed" (D5).

### `feed_prices`

`parameter_set_id`, `phase` (`STARTER`, `GROWER`, `FINISHER`),
`price_per_bag_cents bigint > 0`, `UNIQUE (parameter_set_id, phase)`. Exactly
three rows per set, enforced by D9's function because a CHECK cannot count rows.

### D11 · Breed curves: immutable, created whole, pinned by the batch

`breed_curves (name, source text not null)`,
`breed_curve_points (curve_id, day_number smallint >= 1, weight_g integer > 0,
feed_g integer >= 0, phase)` with `UNIQUE (curve_id, day_number)`, and
`breed_curve_phases (curve_id, phase, first_day smallint, last_day smallint)`
with `UNIQUE (curve_id, phase)` and `CHECK (first_day <= last_day)`.

- **Created whole** by `create_breed_curve(payload jsonb)`, for D9's reasons,
  plus two rules no CHECK can express, both of which the engine already enforces
  on its seed: days contiguous from 1, and each point's phase agreeing with the
  phase ranges.
- **Immutable.** A calibrated curve is a new curve.
- **Pinned by the batch** (`batches.breed_curve_id not null`, built in chunk
  4). This is the opposite of D7, on purpose. A price changes during a batch
  and should reach its forecast. The genetics of the chicks already placed do
  not change.

*Recommended.*

### D12 · Amend D6: `bag_kg` moves to `feed_prices`

D6 put `bag_kg` on `breed_curve_phases` as packaging. But bag size is set by
the supplier together with the price, and `PhasePricing`'s own comment says the
price "is meaningless without" it. If a supplier moves from 50 kg to 25 kg bags,
D6 as approved would require a new breed curve, which is exactly the coupling D6
was written to remove. With `feed_prices (parameter_set_id, phase,
price_per_bag_cents, bag_kg integer > 0)`, the curve holds only day ranges.
`costing.ts` already requires a whole, positive `bag_kg`. No engine change.

*Recommended.* **This changes an approved decision, so it needs its own sign-off.**

### Sign-off status: approved 2026-09-14, logged as AD-68 to AD-72

The approval message read "All seven decisions approved (D9-D15)". This chunk
has four decisions, D9-D12, so the approval is recorded as covering **D9, D10
(amends D7), D11, D12 (amends D6) and the column types above**, as written. The
message's names map as follows: D11 "overhead cadences" is T-RT1 below;
`overhead_line_type` is `key` / `basis`; `timing_basis` is `timing`; and
`contract_type` is the sales order's `channel` / `pricing_basis`, which are
chunk 4 constraints. **If the approval was meant for a different draft, say so
and the ADs are reverted.**

The same message confirmed removing "`gate_price_cents_per_bird` (orphaned key,
no schema impact)". That description fits `mortality_history`, not the field
(see "Before chunk 3"). So **`gate_price_cents_per_bird` stays**, and
`mortality_history` is deleted from `MissingInputKey` as an engine task (TDD),
placed in chunk 8 before any constraint on stored refusals is written.

### T-RT1 · Overhead round-trip test, written before any code that makes it pass

**Why it exists.** `cash.ts` dates an overhead with `if (timing ===
'HARVEST_COMPLETE')`, then `if (timing === 'MONTHLY')`, and dates **anything
else** at placement. So a stored `'monthly'` or `'HARVEST-COMPLETE'` would not
throw. Labour or electricity would silently land on day 1, and the calendar
would still look plausible.

**The test** (repository integration suite, dev-branch database, chunk 8
places it first in the build order):
1. **Seed parity.** Create a parameter set through `create_parameter_set` with
   `SEED_OVERHEADS` copied in (D5). Read it back through the repository and
   assemble `EngineInput`. Assert that `batchCashFlows` deep-equals the
   calendar from the same input with `overheads` omitted, which is the engine's
   seeded default today. `SEED_OVERHEADS` holds one line per cadence:
   `PLACEMENT` (vaccine), `MONTHLY` (electricity, split by housed days) and
   `HARVEST_COMPLETE` (labour). So every timing value's dating path is compared,
   and every `bigint` amount is checked through the string transport.
2. **Every value, not just the seed's.** The same round trip for a set that
   uses every `OverheadTiming` × `OverheadBasis` pair and every `Confidence`.
   The seed never pairs `PER_BIRD` with `MONTHLY`, for example. Assert
   calendar equality against the in-memory set.
3. **The spelling is rejected, not stored.** Writing `timing: 'monthly_split'`
   (and a case variant) fails on `overhead_lines_timing_values`, with no row
   written.

It is written and run red first: no table, function or repository exists
until it fails for the right reason.

**Engine change, adopted with the chunk 3 approval (AD-72), built test-first:**
make the placement branch `if (timing === 'PLACEMENT')` and end with an
exhaustive `never` check that throws on any other value. The database CHECK
stops a bad value at the door, and this closes the same fallthrough for any
input that does not come from the database. The failing test comes first (an
unknown timing currently dates at placement without error). Fixture results are
unchanged, because every existing line has a valid timing.

### AD-63 applied to this chunk: the governed constraints, by name

Each constraint below mirrors an engine union. Any addition, removal or rename
of a value is an engine and schema change **in the same commit**, and the CI
drift test fails if one side changes alone.

| Constraint | Engine union | Values today |
|---|---|---|
| `parameter_sets_gate_pricing_basis_values` | `PricingBasis` | `PER_BIRD`, `PER_KG` |
| `parameter_sets_delivery_mode_values` | `DeliveryMode` | `ABATTOIR`, `DIRECT` |
| `overhead_lines_key_values` | `OverheadKey` | `vaccine`, `electricity_heating`, `labour`, `transport_other` |
| `overhead_lines_basis_values` | `OverheadBasis` | `PER_BIRD`, `PER_BATCH` |
| `overhead_lines_timing_values` | `OverheadTiming` | `PLACEMENT`, `MONTHLY`, `HARVEST_COMPLETE` |
| `overhead_lines_confidence_values` | `Confidence` | `measured`, `calibrated`, `assumed` |
| `feed_prices_phase_values` | `Phase` | `STARTER`, `GROWER`, `FINISHER` |
| `breed_curve_points_phase_values`, `breed_curve_phases_phase_values` | `Phase` | same |

The names in the approval message map as follows: `overhead_line_type` is
`key` / `basis`, `timing_basis` is `timing`, and `contract_type` has no chunk 3
column. The nearest match, the sales order's `channel` and `pricing_basis`,
comes in chunk 4 and joins this table there.

`transport_other` is retired in the seed (2026-09-12) but still in
`OverheadKey`. Whether it stays in the constraint is decided by the engine type,
not here.

---

## Chunk 4 — Recorded facts: batches, daily records, feed draws, sales orders

**Status: approved 2026-09-14 (D13-D19), logged as AD-74 to AD-80.** D14's
view naming is superseded by AD-75: raw version tables live in a `facts` schema,
and the plain names are views of current rows (chunk 5). This is what Daniel
enters day to day.
Conventions from chunk 3 apply to every table: uuid `id`, `org_id` with composite
foreign keys, `created_at` / `created_by`, and `text` + named CHECK.

### What the engine reads, and what it does not

| `EngineInput` field | Shape the engine needs | Notes that shape the tables |
|---|---|---|
| `batch` | placement date, chick count, extra chicks, chick price | No status, no code, no curve (the curve is `input.curve`) |
| `records` | `day_number`, both cumulatives, 3 feed kg, weight + sample size | Filtered to `day_number <= asOf` by the engine. Gaps carry forward. A non-monotonic cumulative or an over-flock total **throws** |
| `draws` | collection date, phase, bags, kg, price per bag, terms | Filtered to `collection_date <= asOf` by the engine. Fractional bags refuse (`feed_draw_bags`). `kg` is compared with bags × 50 |
| `sales` | channel, date, count, live weight, dressed weight, basis, prices, bands, terms | **Not** filtered by asOf: forward-dated orders are meant to reach the calendar (`cash.ts`). Counts refuse against the flock and survivors |

The sketch's derived columns are dropped, per "never store a value that can be
computed": `day_number`, `total_cents`, `gross_cents`, `net_cents`, and sales
`status`. Its `feed_draws.due_date` stays, as the generated column
`code-standards.md` names. The engine ignores it and computes its own.

### D13 · A batch is an identity row plus a placement fact

`batches (id, org_id, code, breed_curve_id)` is the identity. It never changes,
and every other fact references it. `UNIQUE (org_id, code)`.
`breed_curve_id` is pinned here (D11).

`batch_placements (batch_id, placement_date, chick_count integer > 0,
extra_chick_count integer >= 0, chick_price_cents bigint > 0)` holds the numbers,
and follows the correction rule (D14). A typo in the chick count is realistic,
and fixing it must not change the batch's identity, which every record, draw and
sale points at.

`batch_closures (batch_id, closed_on date)` is a fact too, also under D14, so
reopening a batch is a correction. D7 needs `closed_on`: a report on a closed
batch passes `asOf = closed_on`.

**Status is not stored.** The sketch's `PLANNED | ACTIVE | HARVESTING | CLOSED`
is derived from placement date, closure and sales against `asOf`.

*Recommended.* Rejected: one mutable `batches` row with an audit trigger. That
would make batches the only fact that updates in place.

### D14 · Corrections append; nothing is updated or deleted

This resolves "facts are immutable and append-only" (`architecture.md`) against
"a repeated daily record upserts" (`code-standards.md`). The two are
reconciled, not traded off.

- **Every fact table has `supersedes_id uuid null` referencing its own table**,
  with `UNIQUE (supersedes_id)`, so a row is superseded at most once and a
  correction history is one straight chain. A correction inserts a new row
  pointing at the row it replaces.
- **Removing an entry made in error** inserts a superseding row with
  `voided boolean not null default false` set to true. Nothing is deleted.
- **The current row** is one that nothing supersedes and that is not voided.
  Each table gets a `current_<table>` view, and repositories read only views.
- **One chain per natural key**, where a key exists: daily records have
  `UNIQUE (batch_id, record_date) WHERE supersedes_id IS NULL`, so a second
  entry for a date must be a correction of the first. Draws and sales orders
  have no natural key: two identical draws on one day can both be real.
- **The upsert rule becomes idempotency.** Each fact row carries
  `client_request_id uuid not null unique`, the `Idempotency-Key`. A repeated
  submission returns the existing row and writes nothing. A resubmission whose
  values match the current row also writes nothing, so a double-tap on "save"
  leaves no history noise.
- A `BEFORE UPDATE OR DELETE` trigger raises on every fact table, as in D9.

*What it costs:* every read goes through a view, and a correction is an insert
plus a lookup of the row it replaces. *What it gives:* a "corrected on …, was …"
history on every fact (AD-65), and no fact can be lost to an update.

*Not provided, on purpose:* reading "what was known at time T". The engine's
invariant 7 is about business dates, not knowledge time, and exact reproduction
of a past recommendation is `recommendations.input_snapshot`. `created_at` is on
every row, so chunk 6 could add a knowledge-time filter later without a
migration.

| Option | Against |
|---|---|
| Update in place, history table by trigger | Breaks "append-only". The history is a side table every "was …" screen must remember to join |
| `revision` number per natural key (like D10) | Draws and sales have no natural key to number within |
| Accounting-style reversal rows | A cumulative count cannot be reversed by a negative row without the engine summing them. That is a model change |

*Recommended.*

### D15 · Integrity is checked by deferred triggers; writes go through one function per fact

`code-standards.md` lists four integrity rules. Where each one lands:

| Rule | Database? | How |
|---|---|---|
| Mortality cannot exceed birds placed | **Yes** | Current daily records per batch: both cumulatives non-decreasing by `record_date`, and `mortality + cull <= chick_count + extra_chick_count` of the current placement. These are the checks `production.ts` throws on today |
| Sales cannot exceed birds alive | **Partly** | The database enforces current orders' total `<= chick_count + extra_chick_count`, which can never reject a true fact. **Alive on the order date stays the engine's refusal** (`sales_bird_count`): the database rejecting it would refuse a true mortality record entered after a true sale |
| Payments cannot exceed a draw total | **Not in U6** | No payments table (D19) |
| Draws cannot exceed the facility limit | **Not in U6** | No facilities table (D19) |

- **Deferred constraint triggers** (`DEFERRABLE INITIALLY DEFERRED`), checked at
  commit. Correcting day 5 upward past day 6's total is then possible, as long
  as day 6 is corrected in the same transaction.
- **They fire on both sides of each bound.** A placement correction that lowers
  `chick_count` below recorded removals or sold birds is rejected too.
- **Each check locks the batch identity row** (`FOR UPDATE`), so two concurrent
  entries cannot each pass against a stale total.
- **The error names the day and the numbers**, in the engine's wording, so a
  capture screen can show it as it stands.
- **Writes** go through `record_daily_records(batch_id, rows jsonb)`,
  `record_feed_draw(payload)`, `record_sales_order(payload)` (the order and its
  bands together) and `record_batch_placement(payload)`. Each is `SECURITY
  DEFINER` with a membership check, as in D9, and no client role has direct
  write grants. The function handles `supersedes_id`, `client_request_id` and
  the no-op rule. The triggers hold the integrity, so the service role cannot
  bypass it.

*Recommended.* Rejected: integrity only in the write functions, which the
service role and a future second write path would skip.

### D16 · Daily records store the date and grams, not the day number or kg

`daily_records (batch_id, record_date date, mortality_cumulative integer >= 0,
cull_cumulative integer >= 0, feed_starter_g, feed_grower_g, feed_finisher_g
integer >= 0, avg_weight_g integer > 0 null, weight_sample_size integer > 0 null,
notes text null)` + D14 columns.

- **`record_date`, not `day_number`.** Daniel enters a date, and a corrected
  placement date must move every day number rather than leave stored numbers
  pointing at the wrong day. The repository derives `day_number` with the
  engine's own `dayNumberFor`. A deferred trigger rejects a `record_date`
  before the current placement date.
- **Grams, not kg** (CLAUDE.md rule 2). The engine's `DailyRecord` types feed
  as kg `number`, so the repository divides by 1000. Changing the engine type
  to grams is not in U6. It is logged as tech debt.
- **Weight and sample size are null together or present together**
  (`CHECK ((avg_weight_g IS NULL) = (weight_sample_size IS NULL))`). A weight
  with no sample size cannot be calibrated.

*Recommended.*

### D17 · A feed draw belongs to one batch, and a part bag is recordable

`feed_draws (batch_id, collection_date, phase, bags numeric > 0 (at most 2 decimals),
feed_g integer > 0, price_per_bag_cents bigint > 0, terms_days smallint >= 0,
reference text null, due_date date GENERATED ALWAYS AS (collection_date +
terms_days))` + D14 columns.

- **`batch_id not null`.** The engine takes a batch's draws. The sketch's
  `credit_facilities` + `feed_allocations` (one draw split across overlapping
  batches) have no engine reader, so they are deferred (D19). Until then, a draw
  that really serves two batches is recorded as two draws with the same
  `reference`. **For Daniel (proposed OQ-32):** does one collection ever feed
  two batches?
- **`bags` is `numeric`, not `integer`.** OQ-21 is open: a part bag may be real.
  A whole-number column would make a true invoice unrecordable. Stored as
  entered, it reaches the engine, which refuses with `feed_draw_bags` and says
  why, instead of the database rejecting what Daniel typed.
- **`feed_g` (the draw's kg, in grams) is stored, not derived from bags.** `feed.ts` compares the two to
  flag a discrepancy, so both are facts.
- **No `total_cents`**: bags × price is derived.

*Recommended.*

### D18 · Sales orders: forward orders are stored, nothing monetary is derived into a column

`sales_orders (batch_id, channel, order_date, bird_count integer > 0,
avg_live_weight_g integer > 0, avg_dressed_weight_g integer > 0 null,
pricing_basis, price_cents_per_bird bigint > 0 null, price_cents_per_kg bigint
> 0 null, terms_days smallint >= 0)` + D14 columns.
`sales_order_bands (sales_order_id, dressed_floor_g integer > 0,
price_cents_per_bird bigint > 0)`, `UNIQUE (sales_order_id, dressed_floor_g)`.
The bands are written with the order in one function call, and a correction
supersedes the order with a fresh set of bands.

- **Impossible combinations are rejected; unsupplied values are not.** Named
  CHECKs:
  - `sales_orders_banded_is_bulk`: `pricing_basis <> 'BANDED' OR channel =
    'BULK'`. The engine refuses a BANDED gate order, which is nonsense rather
    than a gap.
  - The rule from chunk 3 holds: a null price, or a BANDED order with no
    dressed weight or no bands, is "not supplied". The engine refuses it with
    `gate_price`, `bulk_price` or `dressed_weight`. Invoices arrive late.
- **Forward-dated orders are stored.** `cash.ts` deliberately reads orders past
  `asOf`, since a booked bulk run is exactly what the calendar should show.
  **But `avg_live_weight_g` is required**, because the engine types it non-null.
  For a booked order that is the agreed or expected weight, corrected (D14) when
  the birds are weighed. **For Daniel (proposed OQ-33):** does he book bulk runs
  ahead, and does the buyer fix a weight when he does?
- **Not stored:** `gross_cents`, `net_cents`, `abattoir_fee_cents`,
  `transport_cents` (the engine derives them from the order and parameters,
  AD-55 / AD-57), and `status` (derived).
- **Deferred:** `offal_disposition` and `offal_value_cents` (D19).

*Recommended.*

### D19 · What chunk 4 does not build

Nothing can be entered before a capture screen exists, so a table with no
engine reader loses no data by waiting. Each addition later is additive (AD-65).

| Sketch table / column | Engine reads it? | Lands |
|---|---|---|
| `credit_facilities`, `feed_allocations` | No | With a facility-headroom feature |
| `feed_payments`, `receipts` | No; the calendar projects payments from terms | U8 ledger capture, with their integrity rule |
| `expenses` | No; overheads come from parameter sets | U8 |
| `offal_disposition`, `offal_value_cents` | No | With the sales capture screen. The OQ-2 fact is kept in `architecture.md` until then |
| `cash_accounts`, `cash_transactions` | **Yes, via D8** | **Built in U6**, with D14's correction columns on transactions. `direction` (`IN`, `OUT`) gets a named CHECK; `category` stays free text until U8 |
| `recommendations`, `scenarios`, `alerts` | Written by the app, not read by the engine | Chunk 8 decides whether `recommendations` is U6 or U7 |

*Recommended.*

### AD-63 applied to this chunk

These join AD-63's governed list on approval. Any addition, removal or rename is
an engine + schema change in the same commit, and the CI drift test compares
them.

| Constraint | Engine union | Values today |
|---|---|---|
| `sales_orders_channel_values` | `Channel` | `GATE`, `BULK` |
| `sales_orders_pricing_basis_values` | `SalePricingBasis` | `PER_BIRD`, `PER_KG`, `BANDED` |
| `feed_draws_phase_values` | `Phase` | `STARTER`, `GROWER`, `FINISHER` |
| `cash_transactions_direction_values` | none yet: D8's engine function introduces the union | `IN`, `OUT` |

`sales_orders_banded_is_bulk` is a cross-column rule, not a value list, so it is
not part of the drift test. Its round-trip test (a BANDED BULK order through the
repository to the calendar, and a BANDED GATE order rejected on write) is T-RT2,
built first in the same way as T-RT1.

### The discussion points, in short

1. **D14** is the biggest: append-only correction chains with views, versus
   updating in place.
2. **D15**: the database refuses an impossible fact (removals over flock, sales
   over flock), while the engine refuses one that is merely inconsistent with
   other facts (sold more than alive that day).
3. **D17 / D18** leave two questions for Daniel: a collection shared by two
   batches, and booking bulk runs ahead.

---

## Chunk 5 — Fact table structure: daily records, feed draws, and the rest

**Status: draft, awaiting sign-off.** Turns D13-D19 (AD-74 to AD-80) into
tables, the way chunk 3 turned D4-D8 into parameter tables. Columns and named
constraints are listed here; the DDL is written in the build.

**This chunk rests on three assumed answers from Daniel** (message drafted
2026-09-14, not yet sent):
- **OQ-32:** one feed collection serves one batch.
- **OQ-33:** no bulk run is booked with a fixed weight.
- **OQ-34:** no feed is collected before placement.

A different answer reshapes the section marked for it. The consequences table
is in `current-issues.md`, under the Daniel message.

### Schemas (AD-75)

| Schema | Holds | Reachable through the API? |
|---|---|---|
| `facts` | Identity tables and every `*_versions` table. RLS enabled | **No.** Not in PostgREST's exposed schemas |
| `public` | The views named after the thing (current rows), the `*_history` views, the parameter tables from chunk 3, and the write functions | Yes |

Chunk 3's parameter tables stay in `public`. They are immutable and have no
versions to hide, because a correction there is a new `revision` (AD-69).

### Columns every version table shares (AD-75)

| Column | Type | Constraint |
|---|---|---|
| `id` | `uuid` | primary key |
| `org_id` | `uuid not null` | FK `organizations` |
| `supersedes_id` | `uuid null` | `UNIQUE`. Composite FK to its own table, see below |
| `voided` | `boolean not null default false` | `<table>_void_supersedes`: `NOT voided OR supersedes_id IS NOT NULL` |
| `client_request_id` | `uuid not null` | `UNIQUE` |
| `created_at`, `created_by` | `timestamptz`, `uuid` | as chunk 3 |

**A correction cannot move a fact to a different parent or key.** The
self-reference is a composite FK: `(supersedes_id, batch_id) REFERENCES
(id, batch_id)`, and for daily records `(supersedes_id, batch_id, record_date)`.
A record entered against the wrong date is voided and entered again. It is not
"corrected" onto another date's chain, where it could collide with that date's
own record.

**The current-row rule, written once:** a row is current when no row's
`supersedes_id` is its `id` and it is not `voided`. `UNIQUE (supersedes_id)`
is also the index that makes that check cheap.

A superseded voided row can itself be superseded, which un-voids the entry.
The write functions allow it. The history shows it.

### `facts.batches` (identity, AD-74)

`id`, `org_id`, `code text not null`, `breed_curve_id uuid not null` (composite
FK to `breed_curves (id, org_id)`), `created_at`, `created_by`.
`UNIQUE (org_id, code)`, `UNIQUE (id, org_id)`. Immutable trigger. Not versioned.

### `facts.batch_placement_versions`

`batch_id`, `placement_date date`, `chick_count integer`,
`extra_chick_count integer`, `chick_price_cents bigint` + shared columns.

| Constraint | Rule |
|---|---|
| `batch_placement_versions_chick_count_positive` | `chick_count > 0` |
| `batch_placement_versions_extra_chick_count_nonnegative` | `extra_chick_count >= 0` |
| `batch_placement_versions_chick_price_positive` | `chick_price_cents > 0`. A free chick is an extra, not a zero price |
| `batch_placement_versions_one_chain` | unique index `(batch_id) WHERE supersedes_id IS NULL` |

### `facts.batch_closure_versions`

`batch_id`, `closed_on date` + shared columns. `batch_closure_versions_one_chain`
on `(batch_id) WHERE supersedes_id IS NULL`. Reopening a batch is a voiding row.
A deferred trigger checks that `closed_on` is on or after the current placement
date.

### `facts.daily_record_versions` (D16)

| Column | Type | Null | Constraint |
|---|---|---|---|
| `batch_id` | `uuid` | no | composite FK `facts.batches (id, org_id)` |
| `record_date` | `date` | no | on or after current placement (trigger) |
| `mortality_cumulative` | `integer` | no | `>= 0`; non-decreasing (trigger) |
| `cull_cumulative` | `integer` | no | `>= 0`; non-decreasing (trigger) |
| `feed_starter_g` | `integer` | no | `>= 0` |
| `feed_grower_g` | `integer` | no | `>= 0` |
| `feed_finisher_g` | `integer` | no | `>= 0` |
| `avg_weight_g` | `integer` | yes | `> 0` |
| `weight_sample_size` | `integer` | yes | `> 0` |
| `notes` | `text` | yes | |

- `daily_record_versions_weight_with_sample`:
  `(avg_weight_g IS NULL) = (weight_sample_size IS NULL)`.
- `daily_record_versions_one_chain`: unique index
  `(batch_id, record_date) WHERE supersedes_id IS NULL`.
- **Feed columns are `not null` with no default.** The engine types all three
  as non-null numbers, and a capture screen that leaves one out must fail, not
  store a zero nobody entered (invariant 5). The engine itself treats a zero
  as a true zero.
- **Carried-forward days are not stored.** A date with no row is a gap, and
  `projectProduction` already marks it `carried_forward`. A stored "nothing
  happened" row would be indistinguishable from a real entry of zeros.

### `facts.feed_draw_versions` (D17) — *reshaped if OQ-32 or OQ-34 is not "a"*

| Column | Type | Null | Constraint |
|---|---|---|---|
| `batch_id` | `uuid` | no | composite FK |
| `collection_date` | `date` | no | on or after current placement (trigger, OQ-34) |
| `phase` | `text` | no | `feed_draw_versions_phase_values` |
| `bags` | `numeric` | no | `> 0`; `feed_draw_versions_bags_two_decimals`: `scale(bags) <= 2`. Fractions stored, refused by the engine (OQ-21) |
| `feed_g` | `integer` | no | `> 0`. The weight on the docket, compared by `kgDiscrepancy` |
| `price_per_bag_cents` | `bigint` | no | `> 0` |
| `terms_days` | `smallint` | no | `>= 0` |
| `reference` | `text` | yes | the supplier's docket number |
| `due_date` | `date` | generated | `collection_date + terms_days` |

- **No natural-key chain.** Two identical draws on one day can both be real.
- **Why unconstrained `numeric` plus a scale CHECK, not `numeric(8,2)`:** the
  client's own sheet produces two-decimal bag counts (26.64), so two decimals are
  real. `numeric(8,2)` would silently ROUND a third decimal on insert, which is
  a number nobody entered. The CHECK rejects it instead.
- **Why `price_per_bag_cents` is not null:** a docket always carries a price.
  If Daniel does not have it, the draw is entered when he does. This is
  different from chunk 3's nullable gate price, which is a setting that may
  never have been given. **Open for sign-off:** is "not entered yet" a real
  state for a draw? If yes, the column becomes nullable and the engine needs a
  new refusal key, since `FeedDraw.price_per_bag_cents` is non-null today.

### `facts.sales_order_versions` (D18) — *reshaped if OQ-33 is "c"*

| Column | Type | Null | Constraint |
|---|---|---|---|
| `batch_id` | `uuid` | no | composite FK |
| `channel` | `text` | no | `sales_order_versions_channel_values` |
| `order_date` | `date` | no | on or after current placement (trigger) |
| `bird_count` | `integer` | no | `> 0`; current total `<=` flock (trigger) |
| `avg_live_weight_g` | `integer` | no | `> 0` |
| `avg_dressed_weight_g` | `integer` | yes | `> 0` |
| `pricing_basis` | `text` | no | `sales_order_versions_pricing_basis_values` |
| `price_cents_per_bird` | `bigint` | yes | `> 0` |
| `price_cents_per_kg` | `bigint` | yes | `> 0` |
| `terms_days` | `smallint` | no | `>= 0` |

`sales_order_versions_banded_is_bulk`: `pricing_basis <> 'BANDED' OR
channel = 'BULK'`.

`facts.sales_order_bands (sales_order_version_id, dressed_floor_g integer > 0,
price_cents_per_bird bigint > 0)`, `UNIQUE (sales_order_version_id,
dressed_floor_g)`. Bands belong to one version and are immutable. A correction
writes its own full band set, so a history row always shows the bands it was
priced on.

### `facts.cash_accounts` and cash versions (D19, AD-67)

- `facts.cash_accounts (id, org_id, name text not null)`: identity.
- `facts.cash_account_opening_versions (account_id, opening_date date,
  opening_balance_cents bigint)`, one chain per account. **No sign CHECK**: an
  overdrawn opening balance is real.
- `facts.cash_transaction_versions (account_id, txn_date date, direction text,
  amount_cents bigint > 0, category text not null, batch_id uuid null)`.
  `cash_transaction_versions_direction_values` covers `IN` and `OUT`. The
  amount is always positive; the direction carries the sign.

### Views in `public` (AD-75)

All are `security_invoker = true`.

| View | Returns |
|---|---|
| `batches` | identity + current placement + current closure (null if open) |
| `daily_records` | current rows. No `day_number`: the repository derives it with `dayNumberFor` (AD-77) |
| `feed_draws` | current rows |
| `sales_orders` | current rows, with `bands` as a `jsonb` array in `dressed_floor_g` order |
| `cash_accounts` | identity + current opening |
| `cash_transactions` | current rows |
| `<each>_history` | every version, with `is_current` and `superseded_at` |

### Triggers

| Name | On | Kind | Checks |
|---|---|---|---|
| `<table>_immutable` | every `facts` table | `BEFORE UPDATE OR DELETE` | raises, always |
| `daily_records_removals_valid` | `daily_record_versions`, `batch_placement_versions` | deferred constraint | current cumulatives non-decreasing by `record_date`; `mortality + cull <= chick_count + extra_chick_count`; no record before placement |
| `sales_orders_within_flock` | `sales_order_versions`, `batch_placement_versions` | deferred constraint | current `sum(bird_count) <= chick_count + extra_chick_count`; no order before placement |
| `feed_draws_after_placement` | `feed_draw_versions`, `batch_placement_versions` | deferred constraint | no draw before placement (OQ-34) |
| `batch_closures_after_placement` | `batch_closure_versions`, `batch_placement_versions` | deferred constraint | `closed_on >= placement_date` |

- **Each check starts with `SELECT … FROM facts.batches WHERE id = … FOR
  UPDATE`.** Under READ COMMITTED, the check's next statement then sees any
  transaction that committed while it waited, so two entries cannot pass
  against the same stale total.
- **Messages** use the engine's wording ("Day 12: removals exceed the flock — 40
  dead + 5 culled = 3,005 from 3,000 birds"), and `ERRCODE` is `check_violation`
  so the repository maps it to a typed error, not a 500.

### Write functions (AD-76)

All are `SECURITY DEFINER`, `search_path = ''`, and check membership (roles in
chunk 6). Money travels in the payload as strings.

| Function | Writes |
|---|---|
| `record_batch(payload)` | identity + first placement, one transaction |
| `record_batch_placement(payload)` | a correction to the placement |
| `record_batch_closure(payload)` | close, or void to reopen |
| `record_daily_records(batch_id, rows jsonb)` | one or more dates. For each: a new chain, or a supersede of that date's head. Several days commit together, so the deferred triggers see them together |
| `record_feed_draw(payload)` | new, correction or void |
| `record_sales_order(payload)` | order + full band set, new, correction or void |
| `record_cash_account(payload)`, `record_cash_transaction(payload)` | same pattern |

Each function:
- **Returns the existing id on a repeated `client_request_id`.**
- **Returns the current id, writing nothing, when the values equal the current
  row** (AD-75).
- **Refuses a `supersedes_id` that is not a current row.** Correcting an
  already-superseded row would fork the history, and `UNIQUE (supersedes_id)`
  would reject it anyway. The function says why in words.

### Tests this chunk adds to the build (test-first)

- **T-RT2 · Sales round trip.** A BANDED BULK order goes through
  `record_sales_order`, the view and the repository into `batchCashFlows`, and
  must equal the in-memory calendar. A BANDED GATE order must be rejected on
  `sales_order_versions_banded_is_bulk`.
- **T-RT3 · Correction round trip.** Enter days 1-5, correct day 3, void day 4.
  `public.daily_records` must return days 1, 2, 3 (corrected) and 5, and the
  engine's `ProductionProjection` must equal one built from those four records
  in memory. Day 4 must come back `carried_forward`.
- **T-DB1 · Raw rows are unreachable.**
  - supabase-js as `authenticated` querying `facts.daily_record_versions`
    returns an error.
  - The exposed-schemas setting does not include `facts`.
  - No repository source names `facts.` or `_versions`.
- **T-DB2 · Integrity from both sides.**
  - Day 6 below day 5 is rejected.
  - Correcting day 5 and day 6 together in one call is accepted.
  - A placement correction lowering `chick_count` below recorded removals is
    rejected.
  - Two concurrent inserts that would each fit but together exceed the flock:
    exactly one commits.
- **T-DB3 · Idempotency.** The same `client_request_id` twice gives one row. An
  identical resubmission with a new id also gives one row.

### AD-63 applied to this chunk (replaces chunk 4's names)

| Constraint | Engine union | Values today |
|---|---|---|
| `feed_draw_versions_phase_values` | `Phase` | `STARTER`, `GROWER`, `FINISHER` |
| `sales_order_versions_channel_values` | `Channel` | `GATE`, `BULK` |
| `sales_order_versions_pricing_basis_values` | `SalePricingBasis` | `PER_BIRD`, `PER_KG`, `BANDED` |
| `cash_transaction_versions_direction_values` | `CashDirection` (new, with AD-67's engine function) | `IN`, `OUT` |

### The discussion points, in short

1. **The `facts` schema.** It holds identity rows as well as versions, and the
   parameter tables stay in `public`. Is that the split you want?
2. **Feed columns are `not null` with no default.** A blank field fails to save
   instead of storing zero.
3. **A draw's price is not null.** Is "price not known yet" a real state for a
   feed docket?
4. **Correcting onto another date is not allowed.** A wrong date is void and
   re-enter.

---

## Chunks still to come

6. **Access.** RLS per table, memberships and roles, and grants on the D9/D11
   functions. How WORKER is kept away from financial columns, since RLS filters
   rows, not columns.
7. **Repositories and `EngineInput` assembly.** `bigint` through PostgREST
   (JSON numbers lose precision above 2^53, so money travels as strings). Zod
   schemas and their relation to the engine's types. A guard that refuses to
   connect to any project ref other than dev.
8. **Seed.** Daniel's real figures as the dev dataset.
9. **Build order (TDD), CI's database target (including AD-63's drift test),
   Task 9's placement**, and the plan task list. Already owed a slot: T-RT1 to T-RT3 and
   T-DB1 to T-DB3 first, the `overhead_line` refusal (AD-73), deleting
   `mortality_history`, and the TD-5 decision not to retype feed in U6.
