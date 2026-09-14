# Code Standards

## General

- Keep modules small and single-purpose. One engine module owns one
  stage of the calculation.
- Fix root causes. Do not layer a workaround over a wrong number.
- Do not mix unrelated concerns in one component or route.
- If a calculation appears in the UI, it is in the wrong place. Move it
  to the engine.
- Name things the way the client does: `draw`, `gate sale`, `bulk
  sale`, `livability`, `cashflow_days`. Their vocabulary is the domain
  vocabulary.

## TypeScript

- Strict mode throughout. `noUncheckedIndexedAccess` on.
- No `any`. No non-null assertions (`!`) outside tests.
- Validate all external input with Zod at the system boundary before it
  is trusted. External means: request bodies, URL params, database
  rows, and JSON seed files read at runtime.
- **The Zod requirement stops at the engine boundary.** The engine's
  zero-runtime-dependency invariant overrides it: JSON compiled into
  `packages/engine` (the breed curve seed) is validated at import by
  hand-rolled checks, not Zod, because such a file is version-controlled
  source whose failure mode is a bad commit caught in CI, not a hostile
  payload. Validation is still mandatory — only the library is not.
- Prefer discriminated unions over optional fields for result types:
  ```ts
  type DecisionResult =
    | { kind: 'ok'; decision: Decision }
    | { kind: 'missing_input'; missing: MissingInput[] }
    | { kind: 'infeasible'; gap: Money; levers: Lever[] }
  ```
- Domain types use branded primitives so units cannot be mixed:
  ```ts
  type Cents = bigint & { readonly __brand: 'Cents' }
  type Grams = number & { readonly __brand: 'Grams' }
  type DayNumber = number & { readonly __brand: 'DayNumber' }
  ```

## The engine (`packages/engine`)

- **Pure functions only.** Input in, value out. No side effects.
- No imports from `next`, `react`, `@supabase/*`, or any runtime API.
  The package's only dependency should be its own types.
- Enforce with an ESLint rule banning `Date`, `Math.random`,
  `process.env`, and `fetch` inside `packages/engine/src`.
- Every exported function is unit tested.
- Every module returns `Explained<T>` for values the UI will display:
  ```ts
  interface Explained<T> {
    value: T
    formula: string          // "opening_birds × feed_g ÷ 1000"
    inputs: Record<string, { value: unknown; source: string }>
    confidence: 'measured' | 'calibrated' | 'assumed'
  }
  ```
- `computeDecision()` in `index.ts` is the only public export.

## Money and units

- All money is `Cents` (`bigint`). Construct with `Money.fromDollars()`
  or `Money.fromCents()`. Never do arithmetic on a raw number.
- All weight is `Grams` (integer). Convert to kg for display only.
- Percentages and rates are basis points (integer). 5% is `500`.
- Splitting money: use `Money.split(total, weights)` which guarantees
  `sum(parts) === total`. Never `Math.round(total * ratio)`.
- Formatting happens in `apps/web` only, never in the engine.

## Next.js

- **Verify before importing.** Before adding any third-party library,
  check `package.json` first. If missing, state the install command
  before writing code that uses it. Never assume a library exists.
- **Client component isolation.** Global state and any interactive
  logic work only in Client Components. Wrap providers in a `'use
  client'` boundary; Server Components render static layout exclusively.
- **Viewport stability.** Never use `h-screen` for full-height sections.
  Always `min-h-[100dvh]` — prevents layout jump on iOS Safari, which
  matters on the capture screen.
- **Grid over flex-percentage math.** Never
  `w-[calc(33%-1rem)]`. Use `grid grid-cols-1 md:grid-cols-3 gap-6`.
- Default to server components. Add `'use client'` only where browser
  interactivity is required — the scenario sliders and the capture form.
- The decision console renders server-side. The scenario panel hydrates
  and calls the engine client-side for instant recalculation.
- Server actions for mutations. Route handlers only where an external
  caller needs them.
- Keep each route handler to a single responsibility.

## API and server actions

- Validate and parse input with Zod before any logic runs.
- Enforce auth and organisation ownership before any mutation.
- Mutations accept an `Idempotency-Key`; repeated submission of the
  same daily record upserts rather than duplicating.
- Return consistent shapes. Errors carry a machine-readable `code` and
  a human-readable `message`.
- Never return a raw database row. Map to a domain type.

## Data and storage

- Metadata and facts belong in Postgres.
- Enforce integrity in the database, not only in application code:
  payments cannot exceed a draw total, mortality cannot exceed birds
  placed, sales cannot exceed birds alive, draws cannot exceed the
  facility limit.
- Use generated columns for anything mechanically derivable
  (`due_date`).
- Every mutation writes through a repository function. No inline
  queries.

## Styling

- **Apply `impeccable` for all UI work**, under the constraints in
  `ui-context.md` §0. Token values live in `DESIGN.md` at the repo root.
- Use the CSS custom property tokens defined in `ui-context.md`. No
  hardcoded hex values.
- Follow the border radius scale in `ui-context.md`.
- Numbers use the mono font. Always. A column of figures must align.
- shadcn components are never used in their default state — customise
  radii, colours and shadows to the tokens.
- **Run `web-design-guidelines` against every UI unit before marking it
  done.** Fix findings, or record an explicit exception in
  `current-issues.md` with a reason.

## Test-driven development (required)

All engine work follows strict red/green TDD, per the superpowers
workflow:

1. **Red** — write the failing test first. Run it. Confirm it fails for
   the reason you expect.
2. **Green** — write the minimum code to pass. No more.
3. **Refactor** — only once green.

Never write implementation before its test. Never write a test that
passes on first run — if it does, it was not testing anything.

**YAGNI.** Build only what a golden fixture or a documented flow
requires. No speculative abstraction, no "we might need this later"
parameters, no config options nobody asked for. If it is not in
`project-overview.md`, it is not in scope.

**DRY, with judgement.** Extract on the third repetition, not the
second. Premature abstraction is worse than duplication in a codebase
this small.

## Testing

- Golden fixtures in `packages/engine/tests/golden/` are the contract.
  They encode the client's real spreadsheet output. A failing golden
  test blocks the change.
- Every engine module has unit tests covering: zero, one, maximum,
  and boundary cases.
- Test money arithmetic for exact equality, never approximate.
- Do not test framework internals, shadcn components, or Supabase
  client behaviour.
- Engine branch coverage target: 95%. Elsewhere: whatever the flows
  naturally cover.

### Due-diligence passes must RUN the engine, not only read it

**Standing practice, adopted 2026-09-12.** Any gap-finding or due-diligence pass
over the engine must execute it against realistic inputs. Reading the source is
necessary and is not sufficient.

**The evidence it was adopted on.** The bulk-revenue due-diligence pass found
ten gaps. Two of the most serious were invisible to source-reading and surfaced
only by execution:

- **`SEED_OVERHEADS` still charged the $400 line the client had retired.** In
  source it reads as valid, well-sourced, `confidence: 'measured'` client data,
  with a comment explaining exactly why each line belongs. Nothing about it looks
  wrong. Running it showed overheads at $5,200 for a 30,000-bird flock against a
  true $1,200.
- **Sales were never reconciled against live birds.** The code path is short and
  reads as complete. Running it accepted an order for **999,999 birds from a
  3,000-bird batch**, and one for **−500**, both returning `ok`.

A third instance, from the same week: M5b's whole module was unreachable from
`index.ts` while 35 tests passed, because every test imported the module
directly (OQ-27).

**Why this is the same doctrine as invariant 5, not a new one.** Invariant 5
says a confident wrong number is worse than a blank. Applied to gap-finding:
**reading tells you what the code INTENDS; running tells you what it DOES**, and
a due-diligence report built only on reading is itself a confident wrong answer
— it asserts completeness it has not tested for. A pass that says "I read every
function on the path" is making a claim of the exact kind this engine refuses to
make about money.

**What a pass must therefore include:**

1. Execute the path end to end on a realistic input, not a minimal one. Use the
   client's own figures where they exist.
2. Probe the boundaries deliberately — absurd quantities, negatives, zero,
   dates outside the projection window. Each of those found a real gap.
3. Check what a CONSUMER reaches, not only what a test reaches (OQ-27).
4. Re-run the pass after acting on it. The bulk-revenue pass was run twice and
   the second run found four gaps the first missed, including a duplicate
   question the first run had itself created.

**Treat a new question arising on an already-audited topic as evidence the pass
was incomplete**, and check the audit's own record before asking anyone else.

### Passing tests do not prove a module is reachable

**Every test in this repo imports a module directly** — `../src/feed.js`,
`../src/allocation.js`. That proves the logic inside the module. It proves
**nothing** about whether a consumer of `@runproduce/engine` can reach it.

This is not hypothetical. **M5b shipped eight tasks, nine exported functions and
35 passing tests with `allocation.ts` re-exported from nowhere.**
`computeAllocation` was correct, tested, documented — and invisible from the
package's only entry point. Every test passed the whole time, because every test
bypassed the entry point.

**So "tests pass" answers a narrower question than it appears to.** It says the
code does what it claims *when you can call it*. Reachability is a separate
property and needs its own assertion.

**`tests/engine-surface.test.ts` now enforces it for the whole engine.** It
reads `src/` and fails if any module exports a value `index.ts` does not
re-export. It is written against the source rather than a hand-maintained list,
so a new exported function is covered the moment it is written — there is no
list to remember to update.

**A deliberately-internal export goes on that file's `INTERNAL_CROSS_MODULE`
allowlist with its reason**, never silently omitted. An allowlist entry is a real
decision — it says consumers must not call this — and a second test fails if an
allowlisted name stops existing, so the list cannot rot into precedent.

**The audit that followed, for the record:** every other engine module was
checked, and exactly one other export was unreachable — `costing.costOfFeed`,
which is deliberate (`cash.ts` reuses it so feed rounds identically in both) and
is now allowlisted. So the M5b gap was very nearly a one-off — but "nearly" was
worth confirming rather than assuming, and the check is cheaper to keep than to
repeat by hand.

**The general lesson, beyond exports:** when a test suite and a consumer reach
the code by different routes, the suite cannot see anything that is wrong with
the route it does not take. Ask what the consumer's path is, and assert on that
path at least once.

## File organization

- `packages/engine/src/` — one file per calculation stage
- `packages/engine/tests/golden/` — JSON fixtures with expected outputs
- `apps/web/app/` — routes, one folder per screen
- `apps/web/components/` — presentation components
- `apps/web/components/ui/` — shadcn generated. **Protected. Do not
  hand-edit.**
- `apps/web/lib/repositories/` — one file per aggregate
  (`batches.ts`, `feed.ts`, `sales.ts`, `cash.ts`)
- `apps/web/db/migrations/` — sequential SQL migrations
