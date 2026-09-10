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
