# Progress Tracker

Update this file after every meaningful implementation change.

## Current Phase

**U2 — M1 production + M2 costing.** Starting 2026-09-10, immediately
after U1 closed.

## Current Goal

Implement `packages/engine/src/production.ts` (M1 flock projection) and
`src/costing.ts` (M2 cost engine), turning held golden fixtures green.

M1 must be built against **cumulative** mortality and cull columns with
derived deltas (AD-24, AD-25) — not per-day entry. Fixtures 1–5 and 12
are the near-term targets: they carry `records: []`, so they exercise
the curve-and-parameters path without needing entered history. Feed
consumption is based on **opening** birds (AD-7, invariant 10).

M2 also charges **production overheads** from the client's own Final
Report (AD-26) — four measured lines, $1,222.00 at his 3,000-bird scale —
without folding them into core credit.

Expected outcome: the previously-held fixtures assert real values,
`computeDecision()` no longer throws for them, and the golden step's
held count falls.

## Completed

- **U1 — Scaffold.** Monorepo, money value object, breed-curve seed and
  validation, domain types, `computeDecision()` stub, golden runner, CI
  split into five named steps. 9 of 13 fixtures written and verified
  before writing; 4 deliberately withheld pending OQ-8 through OQ-11.
  56 unit tests green; lint, typecheck, build clean. See the U1 task log
  under Session Notes.

## In Progress

- **U2 / M1 production.** Task 1 (day number), task 2 (types + AD-26
  overheads) and **task 3 (M1 projection)** done. Task 4 — M2 costing —
  is next, and is what wires `computeDecision()` and turns fixtures 1-4
  and 12 green.

  Task 3 landed `packages/engine/src/production.ts`: `projectProduction()`
  returning `ProductionProjection`, 20 tests, TDD throughout. Removals are
  read from the cumulative columns with deltas derived (AD-24, AD-25,
  invariant 13, joint bound enforced); feed is charged per day to OPENING
  birds (AD-7, invariant 10); records after `asOf` are ignored (invariant
  7); days with no record carry the last known cumulative forward rather
  than forecasting, because forecasting is M4's job and inventing a
  number is what invariant 5 forbids. Verified against the client's own
  numbers: 13,224 kg at day 41, 2.337 kg/bird at day 30, FCR 1.53 (not
  his 0.77 — KB-4), flock 3,100 with extras (KB-1).

  AD-27 was logged along the way — see Architecture Decisions.

## Next Up

1. **U2** — M1 production + M2 costing ← current
2. **U3** — M3 feed liability
3. **U4** — M4 harvest optimiser. Blocked on OQ-7; also where AD-24's
   per-batch EMA calibration and OQ-12's sufficiency threshold land.
4. **U5** — M5 allocation optimiser. **Run `/grill-me` first** per
   CLAUDE.md; blocked on OQ-2 **and** OQ-16 (bulk net double-count).

**Outstanding client questions** — OQ-2, OQ-3, OQ-4, OQ-7, OQ-8 are
compiled into a single message awaiting Daniel, and **OQ-13, OQ-15 and
OQ-16 go in the same message**: none of the three blocks anything, all
three are worth asking while he is answering. OQ-1 and OQ-14 are
answered. OQ-9 and OQ-11 were reframed and are no longer client
questions.

**Outstanding internal decision** — the AD-9 collision needs a renumber.

See `ai-workflow-rules.md` for the full build order.

## Golden fixtures — the contract

These encode the client's real spreadsheet. Write all 13 in U1.

| # | Test | Expected |
|---|---|---|
| 1 | 3,000 chicks @ $1.00, placed 2026-02-06, run to day 41 | Feed cost $8,079.81 |
| 2 | Same batch, total feed | 13,224 kg |
| 3 | Same batch, FCR at day 41 | 1.53 |
| 4 | Cumulative feed at day 30 | 2.337 kg/bird |
| 5 | Starter draw bags (cum feed day 14 ÷ 50) | 26.64 bags |
| 6 | Break-even gate birds, 5,000 flock, day 30 | 2,675 (54%) |
| 7 | Hold cost day 30 → 35, 5,000 flock | $3,305 |
| 8 | Bulk net per day held, 5,000 flock, day 30 | −$537 |
| 9 | Feed draw due dates from 2026-02-06 | Mar 8, Mar 22, Mar 29, Apr 5, Apr 12 |
| 10 | Bulk harvest day, default params | day 31 — provisional, see OQ-7 |
| 11 | Gate harvest window end, default params | day 38 |
| 12 | 3,000 chicks + 100 extra | flock = 3,100 |
| 13 | Abattoir fee unset | returns `missing_input`, not a guess |

**Status after U1 task 5 (2026-09-10): 9 of 13 written.**

| Written and verified | Not written |
|---|---|
| 1, 2, 3, 4, 5, 9, 10, 12, 13 | **6, 7, 8, 11** |

Fixture 10 encodes **day 31**, not the day 30 in the table above — the
rule `first day weight_g >= 1770` applied literally to the client's own
curve (1,754 g at day 30, 1,843 g at day 31). Marked `provisional`
pending OQ-7.

Fixtures 6, 7, 8 and 11 could not be reproduced from the client's curve
under the specified parameters, so they were not written rather than
back-fitted. Each has an open question carrying the arithmetic and the
question to put to the client: **OQ-8** (fixture 6 — 2,675 vs. a
computed 2,850; reproduces exactly at $0.85 a chick), **OQ-9**
(fixture 7 — $3,305 vs. $3,714), **OQ-10** (fixture 8 — needs the
abattoir fee from OQ-2 and is not computable without it), **OQ-11**
(fixture 11 — the $2.46/kg rate does not follow from $4.30 ÷ 1.754 kg).

Fixtures 7, 8 and 11 additionally depend on the **uncalibrated mortality
model** — see OQ-1. When they are eventually written they lock in
assumed behaviour so regressions are caught, and will need regenerating
once real mortality data arrives.

## Open Questions

Tracked in `current-issues.md`.

## Architecture Decisions

**AD-27 · `fcr` is `number | null`; a wiped-out flock has no ratio.**
A flock with nothing left alive ate feed and produced no live weight, so
FCR is undefined. The first implementation returned `Infinity`, which is
worse than it looks: it renders in a UI as a ratio and reads as a real
figure. `null` is the rule-3 answer — a blank is always better than a
confident wrong number — and the UI shows a dash. Found by a test
written for that case rather than in production. Every other consumer of
`fcr` must now handle null, which is the point.

**AD-26 · Overheads are measured parameters; core credit stays chicks +
feed.**
The Final Report books four costs we were not modelling: vaccine $42,
electricity and heating $140, labour $640, other and transport $400 —
$1,222.00 on the 3,000-bird batch, 11.02% on top of core credit. They are
now `SEED_OVERHEADS` in `packages/engine/src/overheads.ts`, every line
`confidence: 'measured'`, because every figure is his own. This closed
OQ-14 without a client round trip.

What it does **not** do is change core credit. The client's brief asks for
four break-evens and says "These are NOT the same number. Display them
separately", so `core_credit_cents` stays chicks + feed (his "DOC + feed
break-even") and `overhead_cost_cents` / `full_production_cost_cents`
sit beside it, with a per-line `overhead_lines` breakdown for the UI.
Invariant 15 forbids blending them, because a blended figure cannot be
un-blended later.

Each line declares a basis, `PER_BIRD` or `PER_BATCH`, taken from the
brief's own variable/fixed split rather than guessed. A PER_BIRD line
stores the measured amount plus the flock it was measured at, not a
pre-divided per-bird rate: $42 over 3,000 birds is 1.4 cents a bird and
integer cents cannot hold it. Scaling is `bigint` and rounds **up** —
a cost rounded down flatters a break-even, which is the one direction
this engine must never err in. At most one cent per line.

**Overheads were ruled out as the explanation for fixture 6**, verified
rather than assumed: they move the 2,675 gap from 175 to 528, the wrong
way. OQ-15 and OQ-16 are the two follow-ons, neither blocking.

**AD-25 · Culls are entered cumulatively too, under a joint bound.**
Same treatment as AD-24, for the same reason, on a structurally
identical field. `cull_count` becomes `cull_cumulative`. A cull and a
death are both irreversible removals counted by hand at the same moment
on the same entry form; making one column cumulative and its neighbour a
daily delta is a data-entry trap that produces plausible wrong numbers.
This is Daniel's existing OQ-1 answer applied, not a new client
question. The upper bound is **joint** —
`mortality_cumulative + cull_cumulative <= chick_count + extra_chick_count`
— because a culled bird is no longer available to die; bounding each
column separately would admit a flock losing twice its own size.

**AD-24 · Mortality is entered cumulatively and forecast by per-batch
calibration; the ramp is a fallback.**
Daniel's answer to OQ-1 was "it varies", which is not a constant to plug
in. Entry becomes a running total ("total dead as of today") with the
daily delta derived, because a running sum of hand-entered deltas is
silently corrupted forever by one missed or doubled day, whereas a
restated cumulative total self-heals and violates a monotonicity check
on the spot. Forecasting calibrates per batch from that batch's own
trailing entries by EMA (alpha 0.4), reusing the weight-curve pattern.
The previously-assumed ramp (0.15%/day, +0.35%/day after day 30) is
demoted to fallback for days lacking sufficient own-batch history, and
its output stays `confidence: 'assumed'`. Threshold for "sufficient" is
OQ-12.

**AD-23 · `EngineInput.curve` is optional; absent means the seed.**
Every golden fixture would otherwise carry a literal copy of 41 curve
rows. Absent means `SEED_BREED_CURVE` — the client's own data, which is
what the fixtures are written against. Present means a calibrated curve
supplied by the caller, which is where U6 calibration will land.

**AD-22 · Fixture 13 books a BULK sale to make the abattoir fee
genuinely required.**
The plan gave fixtures 1–5 and fixture 13 identical inputs
(`abattoir_fee_cents: null`) while expecting `kind: 'ok'` from the first
five and `kind: 'missing_input'` from the thirteenth. One entry point
cannot return both for the same input, so the contradiction had to be
resolved before writing a protected file. Resolution: the fee is
required **when bulk economics are in play**, so fixture 13 carries a
1,200-bird `BULK` sales order and fixtures 1–5 carry `sales: []`. This
also states the rule the engine should implement — `missing_input` is
raised by what the input asks for, not by any null in the parameter
block. Revisit if the client's answer to OQ-2 changes the shape.

**AD-21 · The golden fixture suite is a separate CI step, and excusals
are derived rather than declared.**
An executable spec is red on purpose, which makes a single test step
useless as a regression signal for the whole time the spec is unmet. The
suite is therefore split out. What keeps the split honest is that no
list anywhere says which fixtures are allowed to fail: a fixture is held
only if the engine throws the typed `NotImplementedError`, or if the
fixture declares `expect.placeholder` because an OQ is unanswered. Both
are observed at run time, so the excusal expires by itself when the
module lands. The step consequently needs no `continue-on-error` — it
gates on everything except the two derived cases.

**AD-1 · Pure calculation engine, no I/O.**
The engine runs identically on server and in browser, enabling instant
scenario sliders without a round trip, and making the whole business
logic testable without a database.

**AD-2 · Money as `bigint` cents, weight as integer grams.**
The system splits revenue across channels and allocates feed cost
across overlapping batches. Float drift would produce reconciliation
failures that destroy client trust.

**AD-3 · Brute-force enumeration for allocation, not a solver.**
The decision space is one variable with ~300 discrete candidates.
Enumeration is faster to write, has no dependencies, handles
step-function contract pricing natively, and — critically — lets the UI
explain why a rejected option was rejected.

**AD-4 · Three named strategies instead of one recommendation.**
The client stated three conflicting goals (cover credit fast, grow,
build reserve). Rather than guess an objective function, present Cover
Fast / Maximum Growth / Build Reserve side by side and let him choose.
Revisit once OQ-3 is answered.

**AD-5 · Seed the client's own breed curve, not a generic standard.**
Their spreadsheet contains 41 days of weight and feed intake tuned by
their own experience. Using it means the system reproduces numbers they
already recognise, which is how trust is earned.

**AD-6 · Light mode only.**
The capture screen is used outdoors in direct sun on a cheap Android
phone. Dark UI is unreadable in that context.

**AD-7 · Feed consumption based on opening birds, not closing.**
The client's spreadsheet uses closing birds, which excludes feed eaten
by birds that died that day. We deliberately diverge. Flag this to the
client — it will make our feed figures slightly higher than his.

**AD-8 · Cap at two concurrent batches for MVP.**
Feed draw allocation across overlapping batches is genuinely complex.
Two covers the staggered-placement strategy. Three or more is deferred.

**AD-9 · Netlify hosting, not Vercel.**
Existing deployment familiarity. Next.js runs via
`@netlify/plugin-nextjs`. Scheduled work uses Netlify Scheduled
Functions declared in `netlify.toml`. Do not generate `vercel.json`.

**AD-10 · Design skill dials overridden to VARIANCE 3 / MOTION 2 /
DENSITY 7-2.**
Design tooling defaults sit around 8/6/4, tuned for marketing and
product sites. This is a financial ledger replacing a trusted
spreadsheet, used outdoors on a low-end Android. Asymmetric layouts hurt
scanning; perpetual animation costs battery and frames. The skill's
anti-slop rules (no Inter, no purple, no emoji, mono numbers, no
3-card rows) are kept in full. See `ui-context.md` §0.

**AD-11 · No animation library.**
No Framer Motion, GSAP or ThreeJS. CSS transitions only. The capture
screen's performance floor is a cheap Android phone, and the decision
console is a dense data surface where motion actively impedes reading.

**AD-15 · UI design directions are explored via git worktrees.**
Four parallel variations (tokens / typography / structure / open) built
in separate worktrees on ports 3001–3004, judged against both audit
gates and the product criteria, winner merged and the rest deleted.
Worktrees share one git history, so every variation inherits `context/`,
`PRODUCT.md` and `DESIGN.md` — meaning §0 governs all four. Process:
`context/ui-build-playbook.md` Phase B.

**AD-18 · Card system merges structure from one reference with
treatment from another; neither is copied.**
Four-across KPI layout and the value/delta/comparison shape from
"Statistics Card 2"; light surface, unit separation and inset sub-rows
from "Statistics Card 10". Everything else in those components — the
saturated fuchsia/blue/teal fills, BorderBeam (`#9c40ff`), Inter, the
`.dark` block, forty keyframes, decorative blurred SVG — violates §0 or
AD-11 and is stripped. Spec:
`context/card-system-and-decision-ux.md`.

**AD-19 · Four of six UX psychology principles are rejected or
constrained.**
Those principles come from consumer SaaS optimising for conversion of a
stranger. This tool has one committed user making financial decisions
about his own livelihood. Adopted: smart defaults, IKEA effect (the
scenario sliders already are it). Constrained to honest use: goal
gradient (real progress only, never an artificial head start), loss
aversion (report the computed cost of delay; never frame to drive
action). Rejected: contrast effect (anchoring a man's cash decisions is
manipulation), reciprocity (no signup funnel). Test applied throughout:
if the user learned how the interface was designed to influence him,
would he still trust it?

**AD-17 · Higgsfield installed but deferred out of the product.**
CLI authenticated and skills installed to `.agents/skills/` (scoped to
this project, full agent permissions — read before use). Not part of the
U1–U11 skill set and not invoked during the build. Legitimate homes: a
future marketing site (separate repo, opposite constraints), a client
explainer video, and portfolio material. Frame-analysis method captured
in `context/deferred-motion-assets.md`.

**AD-16 · Scroll-driven video animation is rejected.**
Marketing-site craft aimed at seducing a visitor. This is an internal
decision tool used outdoors on a low-end Android on poor connectivity.
Scroll-driven video would burn battery, drop frames, cost the user
bandwidth he pays for, and slow the one flow that must never be slow.
Contradicts `MOTION 2` and AD-11. Revisit only if a separate marketing
site is ever built, in that repo.

**AD-14 · impeccable replaces `design-taste-frontend-v1`.**
Both descend from Anthropic's `frontend-design` skill and do the same
job. impeccable adds 61 deterministic detector rules that run with no
LLM, persistent design truth in `PRODUCT.md` and `DESIGN.md`, and 23
iterative commands. Running both would put two competing taste systems
on the same files. `web-design-guidelines` is kept — it audits a
different axis (accessibility and interface correctness, not visual
craft), so the two gates are complementary rather than redundant.
Token values live in `DESIGN.md`; `ui-context.md` §0 keeps the
reasoning and the operating constraints, and wins on intent.

**AD-13 · `context/CONTEXT.md` is the authoritative glossary.**
It is the convention `grilling` expects.
`project-overview.md` keeps a short primer for orientation, but where
the two disagree, `CONTEXT.md` wins. A project-specific `orient` skill
is vendored at `.claude/skills/orient/` as the session entry routine.

**AD-12 · One skill per phase; superpowers owns the build loop.**
Several skill sets cover spec → plan → TDD. Running more than one
duplicates ceremony and burns context, which is the binding constraint
on this build. Final set: `orient` (session entry), `grill-me` +
`grilling` (resolving assumptions), `superpowers` (spec → plan → TDD →
build), `impeccable` and `web-design-guidelines` (UI only). `to-spec`, `implement`, `tdd`, `code-review`,
`to-questionnaire` and `domain-modeling` are deliberately not
installed. See `context/skills.md`.

**AD-9 · Partial harvest modelled as slices from a single pool.**
Each day's sale records the weight at that day. We do not model
separate sub-flocks with independent curves. Simpler, defensible, and
avoids the largest complexity sink in the project.

## Session Notes

**U1 — COMPLETE, 2026-09-10.** Executed task-by-task from
`docs/superpowers/plans/2026-09-10-u1-scaffold.md`.

**Definition of Done:** monorepo scaffolded and linting; engine pure
(verified by probe); `money.ts` and `breed-curve.ts` green; `types.ts`
defining the envelope; `computeDecision()` stubbed; golden runner
globbing fixtures with one dotted assertion each; CI split into five
named steps with derived excusals. **9 of 13 fixtures written**, every
value verified against `context/breed_curve.json` before the file was
created. **Fixtures 6, 7, 8 and 11 deliberately not written** — see
OQ-8 through OQ-11. That is a completion, not a shortfall: writing them
would have meant inventing the input that makes the number come out.

**Final state:** 56 unit tests green across 5 files; lint, typecheck and
build clean; golden step green with 9 held on `computeDecision not
implemented — U2`, which is the intended red-by-design signal.

**Carried into U2:** AD-24 and AD-25 landed after task 5 and changed
`DailyRecord`'s shape — M1 must be built against cumulative mortality
and cull columns with derived deltas, never against per-day entry.

**Still open, not blocking U1's close:** the **AD-9 collision** (Netlify
hosting vs. partial-harvest-as-slices, both live and both cited
elsewhere) needs a renumber decision. Flagged, not resolved.

**U1 task log:**

- **Task 1 — DONE** (`3c477ad`). npm-workspaces monorepo scaffolded:
  root `package.json`, `tsconfig.base.json` (strict +
  `noUncheckedIndexedAccess` + `resolveJsonModule`),
  `packages/engine` (zero runtime deps, vitest), `apps/web`
  (placeholder, no scripts), `eslint.config.js`, CI workflow pinned to
  Node 20, `.gitignore` extended. `npm install` resolves both
  workspaces as symlinks; `npm run lint` passes. Purity rule verified
  by probe: `Date.now()` in `packages/engine/src` errors with
  `no-restricted-globals` (DoD #2 met). Local toolchain is Node 24 /
  npm 11; CI still pins Node 20.
- **Task 2 — DONE** (`526d7d1`). `packages/engine/src/money.ts` +
  `tests/money.test.ts`. 19 tests green; lint and typecheck clean.
  `Cents` is the branded `bigint` and is declared here — Task 3's
  `types.ts` re-exports it. `split()` is largest-remainder: **largest
  remainder wins, ties break by lowest index**, so `split(100n,
  [1,1,1])` → `[34n, 33n, 33n]` and the CR-3 bird-days case
  `split(807981n, [35000,15000])` → `[565587n, 242394n]`, both summing
  exactly. Negative totals allocate on the magnitude then negate, so
  rounding is symmetric about zero. All-zero weights **throw** rather
  than equal-splitting — an all-zero bird-days allocation means the
  caller has no live batches and is a bug worth surfacing, not
  smoothing over. A single zero weight among non-zero ones is legal and
  yields `0n`. The CR-3 case passed on the first run of the
  implementation; no test was adjusted to fit output.
- **Task 3 — DONE** (`5ec4e58`). `packages/engine/src/types.ts` +
  `src/breed-curve.ts` + `tests/breed-curve.test.ts`. 8 new tests green
  (27 total); lint, typecheck and build clean. All eight expected
  values were verified against `context/breed_curve.json` **before**
  the test was written, so nothing was fitted to output: cum feed 444 g
  (d14) / 2,337 g (d30) / 4,408 g (d41), per-phase 383 / 1,466 / 2,559,
  weights 1,754 g (d30) / 1,843 g (d31) / 2,875 g (d41). AD-20 checked
  independently: `383×0.65 + 1466×0.62 + 2559×0.60` = $2.693270/bird,
  ×3,000 = **$8,079.81** exactly, matching fixture 1. The seed's own
  `cum_feed_g` column agrees with the derived sum on all 41 rows, but
  is still ignored in favour of computing — the *cost* column is the
  one that drifts.
  `types.ts` re-exports `Cents` from `money.ts` as planned.
  The seed is validated at import (contiguous days from 1, phase label
  vs. phase day range, non-negative integer grams) rather than trusted.
  **Standards deviation, deliberate:** `code-standards.md` requires Zod
  for JSON seed files; the engine's zero-runtime-dependency invariant
  forbids it. Hand-rolled validation serves the intent. If a third
  place needs seed validation, revisit — the rule or the invariant
  should give, not the code silently.
- **Task 4 — DONE** (`fb4a15e`). `packages/engine/src/index.ts` +
  `tests/golden/_shared.ts` + `tests/golden.test.ts` +
  `tests/golden-runner.test.ts`. `computeDecision()` throws
  `computeDecision not implemented — U2`. The runner globs
  `golden/*.json` and asserts **one dotted path per fixture**, so a
  fixture pins a single field without the `Decision` shape being
  settled. 7 new tests green (34 total); the one intended red is `loads
  all 13 fixtures` — `expected [] to have a length of 13`. Lint,
  typecheck and build clean.
  `resolvePath` is tested in its own right: a **missing leaf resolves
  to `undefined`**, but **traversing into a non-object throws**. Without
  that split, a fixture whose path disagreed with the engine's shape
  would assert against `undefined` and pass silently the moment U2
  landed — a green test proving nothing.
  **Two gaps the plan did not anticipate, both fixed:** `@types/node`
  was absent so the `fs`-based loader would not typecheck (added as an
  engine *devDependency* and to `tsconfig` `types` — types only, the
  zero-runtime-dependency invariant is intact); and ESLint's
  `no-unused-vars` does not honour the leading underscore that `tsc`'s
  `noUnusedParameters` does, so the stub's `_input` failed lint. The two
  conventions are now aligned repo-wide in `eslint.config.js`.
- **Task 4b — DONE.** The CI split (see below). `src/errors.ts`,
  `tests/golden-classify.test.ts`, `tests/golden-integrity.test.ts`,
  `tests/golden-fixtures.test.ts` (replaces `golden.test.ts`), two
  vitest configs, `test:golden` script, five-step workflow. 22 new tests
  green (56 total in the gating step); golden step green with 1 held.
- **Task 5 — DONE, 9 of 13.** Fixtures **1, 2, 3, 4, 5, 9, 10, 12, 13**
  written. Every value was verified against `context/breed_curve.json`
  **before** the file was created — feed cost $8,079.81, total feed
  13,224 kg, FCR 4408/2875 = 1.5332 → 1.53, cum feed 2,337 g at day 30,
  444 g × 3,000 ÷ 50,000 = 26.64 bags, all five due dates counted by
  hand (2026 is not a leap year), flock 3,000 + 100 = 3,100, and
  fixture 10's day 31 from w30 = 1,754 g / w31 = 1,843 g against the
  literal rule `first day weight_g >= 1770`.
  **Fixtures 6, 7, 8 and 11 are NOT written** — their contract values
  cannot be reproduced from the client's own curve under the specified
  parameters. See **OQ-8 through OQ-11** in `current-issues.md`; each
  carries the arithmetic and the question to put to the client. Fixture
  6 is the near-miss: 2,675 falls out exactly at $0.85 a chick, against
  the brief's $1.00, and that is an inference rather than a client fact.
  Two contradictions in the plan were resolved rather than papered over:
  AD-22 (fixture 13 vs. 1–5) and AD-23 (`curve` optional).
  All 9 are held in CI on `computeDecision not implemented — U2`, which
  is the intended state.
- **Superseded note — Task 5 as originally scoped** — 13 fixtures. The
  plan assumed 7, 8, 10 and 11 were the four blocked ones; in fact 10
  verified cleanly and 6 did not.
  **Vocabulary collision to keep straight:** "held back" in the plan
  means *written last, pending a client answer* — those four carry
  concrete expected values ($3,305, −$537, day 31, day 38) and are
  marked `provisional`, so they **assert**. That is not the same as a
  CI-**held** fixture, which is one CI reports and does not fail on. Use
  `expect.placeholder` only where the expected value is genuinely
  unknowable, not merely assumed. On current information all four take
  values, and `placeholder` may go unused at task 5. Nothing in task 4
  depended on them.

**U2 task 2 — DONE, plus overheads (AD-26), 2026-09-10.**
`ProductionProjection` and `CostingResult` replace the `unknown`
halves of the `Decision` envelope, and `CostingResult` carries the
overhead figures from the start rather than having them retrofitted.
New `packages/engine/src/overheads.ts`: `SEED_OVERHEADS`,
`overheadLineCents`, `overheadBreakdown`, `overheadCostCents`,
`validateOverheadModel`. The seed is validated at import, the same
treatment `breed-curve.ts` gives its JSON and for the same reason —
hand-transcribed client data should throw at load, not surface later as a
wrong figure on a break-even screen. 33 new tests; **89 green total**;
lint, typecheck and build clean.

`Parameters.overheads` is **optional**, absent meaning
`SEED_OVERHEADS` — the AD-23 convention, so no fixture carries a copy
of client data it does not assert on. An empty `lines` array means
"charge no overheads" and is a different thing from absent; null is never
used for either.

**No golden fixture was regenerated, and that was checked mechanically
rather than by eye.** Every written fixture's asserted path was listed
and compared: fixture 1 asserts `costing.feed_cost_cents` (feed only),
2/3/4/12 assert production quantities, 5 and 9 the feed module, 10 the
harvest day, 13 a `missing_input`. Overheads touch none of them, and
they add no `MissingInputKey` — they are measured, so they can never be
missing. Fixture 6 (break-even) is unwritten and blocked on OQ-8; the
overhead arithmetic was run against it anyway and **widens** its gap
(2,850 → 3,203 against a contract 2,675), which is recorded under OQ-14
as ruling overheads out.

**Three context findings mined from the client's brief while doing this,
all verified against the file:**
- OQ-14 is answered by section 19 — four break-evens, displayed
  separately. It was never an either/or.
- The brief's own variable/fixed cost split supplies each line's basis,
  so the classification is his, not ours.
- The brief assumes ~$0.59/bird overheads where his measured figures give
  $0.407/bird — logged as OQ-15, which our PER_BATCH lines surface as
  $0.173/bird at 30,000. The model exposes the discrepancy instead of
  hiding it.

**KB numbering collision resolved.** The three bugs written up after
reading the formulas were numbered KB-6/7/8 and collided with the
existing KB-6/7/8. They needed no numbers: they **confirm** KB-2, KB-4
and KB-3 from formulas rather than inference, and are folded into those.
No KB number is now used twice. The AD-9 collision is still open.

**OQ-13 (feed price set) explicitly blocks nothing.** The Record sheet's
prices are the ones that reconcile to the Final Report's $8,079.81, which
is the only cross-check that exists. Ask Daniel; do not wait for him.

**OQ-1 answered — the mortality model changed shape, 2026-09-10.**
Daniel: *"It varies."* Not a constant to plug in. Three consequences,
applied before U2 so M1 is not built on the old assumption:

- `DailyRecord.mortality_count` → **`mortality_cumulative`** (total dead
  as of that day; delta derived). `architecture.md` schema column renamed
  to match, and CONTEXT.md gains **Cumulative mortality** / **Daily
  mortality** as distinct terms.
- `architecture.md` invariants **13** (monotonic cumulative, bounded by
  `chick_count + extra_chick_count`) and **14** (no standard curve;
  calibrate per batch, fallback only) added.
- `MortalityModel` is now documented as the **fallback**, not the source.
  M4 calibrates per batch by EMA (alpha 0.4) off own-batch trailing data.

**No fixture was affected, verified rather than assumed:** all nine
committed fixtures carry `records: []`, so not one of them encodes a
mortality figure in either semantics. Eight also zero the mortality
parameters outright; fixture 10 is the only one with a live ramp
(`15 / 30 / 35` bp) and it asserts a harvest **day** off the weight
curve, which the change does not touch. Typecheck and lint clean after
the rename — no other code referenced the old field.

New **OQ-12**: how many trailing days count as "sufficient" before the
calibrated rate overrides the fallback. Starting default 3–5 days, itself
assumed. Carries a sub-question on whether `cull_count` should be
cumulative too.

**AD numbering — audited on disk, 2026-09-10.** The list had drifted in
conversation. Actual state of this file:
- **AD-1 … AD-19, AD-21, AD-22, AD-23** are defined here.
- **AD-9 is used twice** — "Netlify hosting, not Vercel" and "Partial
  harvest modelled as slices from a single pool". Both are referenced
  live elsewhere (`ui-build-playbook.md` cites AD-9 for Netlify;
  `current-issues.md` cites AD-9 for the pool). **Unresolved — needs a
  renumber decision.**
- **AD-20 is referenced but never defined** (task 3 note, "AD-20 checked
  independently"). This is the slot reserved for **fixture-11 pricing
  basis**. It stays reserved and unfilled until fixture 11 lands. Do not
  repurpose it.
- The `kind:'ok'`/`missing_input` contradiction fix **is already AD-22**;
  `curve`-optional **is already AD-23**. They did not need new numbers.
- **AD-24** and **AD-25** were then assigned off this list (mortality
  model; culls cumulative). **AD-26** is now taken (overheads). Next
  genuinely free number is **AD-27**.
- **Rule: grep this file before assigning any AD number.** Never infer
  the next number from a previous chat message.

**Zod vs. the zero-dependency invariant — settled (task 4).** The
invariant wins. `code-standards.md` now states it as a rule rather than
leaving it as an implicit precedent from `breed-curve.ts`: Zod stops at
the app/API boundary, and JSON compiled into the engine is validated at
import by hand. Validation stays mandatory; only the library is not.

**CI split — done, 2026-09-10.** The problem: `npm test` was a single CI
step holding both the unit suites and the deliberately-red golden
fixtures, so from `fb4a15e` a red run carried no information — the
expected failure and a real regression were indistinguishable. Resolved:

- Five named steps. **Lint, Typecheck, Unit tests, Build** gate
  unconditionally; red there is a regression, always. `Build` was absent
  from CI before this.
- **Golden fixtures** is a fifth step running
  `packages/engine/tests/golden-fixtures.test.ts` under
  `vitest.golden.config.ts`. It reports written / passing / held counts.
- **It has no `continue-on-error`.** The permissiveness is per-fixture
  and *derived*, not step-wide and declared. `classifyFixture()` in
  `tests/golden/_shared.ts` holds a fixture in exactly two cases: the
  engine call threw the typed `NotImplementedError` (new,
  `src/errors.ts`), or the fixture declares `expect.placeholder`
  instead of `expect.value` because an OQ is unanswered. Held fixtures
  `skip`. Everything else asserts, and asserting includes failing.
- So a fixture rejoins the gate **automatically** when its module lands.
  Replacing the `computeDecision` stub is the only action required;
  there is no list of excuses to remember to update.
- `provisional` ≠ held. A provisional fixture asserts, locking in
  assumed behaviour so regressions are caught, exactly as planned.
- Fixture *integrity* gates (unit step): schema valid, ids unique, no id
  outside 1–13, never more than 13, `validateFixture` reports every
  problem not just the first. Fixture *completeness* (all 13 written) is
  held in the golden step, because writing them is task 5.
- **Verified by probe, not asserted:** with `computeDecision` temporarily
  returning `999999` and a fixture expecting `807981`, the step exits 1.
  With the `NotImplementedError` stub and a placeholder fixture, both
  skip and the step exits 0. Probe reverted before commit.

**The honest limit, stated plainly:** all 13 fixtures route through the
one `computeDecision()` entry point, which is still the U1 stub — so
today the step holds everything it is given. There is currently no
fixture that *should* be passing; the already-implemented modules
(`money`, `breed-curve`) are covered by unit tests in the gating step,
not by fixtures. The discrimination is structural rather than
currently-exercised.

**Task 5 close-out:** when the 13th fixture is written, move
`expect(fixtures.map(f => f.id)).toEqual(FIXTURE_IDS)` out of
`golden-fixtures.test.ts` and into the gating `golden-integrity.test.ts`,
so a vanished fixture fails the build from then on.

**CI is live as of task 2.** Remote
`https://github.com/98Devops/RUNPRODUCE.git`; first green run
[34452361699](https://github.com/98Devops/RUNPRODUCE/actions/runs/34452361699)
on **Node v20.20.2**. TD-3 closed. TD-2 stays open until the task 5
fixtures run green on Node 20 in that same CI.

**CI now runs `npm ci`, not `npm install`** (task 4). It installs the
committed `package-lock.json` tree exactly rather than re-resolving,
which is what TD-2 assumes when it compares CI Node 20 against local
Node 24. Verified locally: `npm ci` clean-installs 198 packages with no
lockfile drift.

**Latent, not yet biting:** `packages/engine/tsconfig.json` sets
`rootDir: "."` while `breed-curve.ts` imports
`../../../context/breed_curve.json` from outside it; harmless while
both `build` and `typecheck` are `--noEmit`. **The day the engine
emits, `tsc` fails with `TS6059: File
'…/context/breed_curve.json' is not under 'rootDir'
'…/packages/engine'. 'rootDir' is expected to contain all source
files.`** It is a config error, not a code error — the fix is to widen
`rootDir` to the repo root (which relocates `outDir` output), or to copy
the seed inside `packages/engine/src/`. Candidate for the task 6
close-out.

Context pack written before U1.

**Workflow:** this project runs the superpowers loop — understand,
chunked spec, implementation plan, then subagent execution on "go".
Strict red/green TDD. Do not write implementation before its failing
test.

**Skills:** superpowers (always), impeccable (UI units only — run
`/impeccable init` first, seeded from the context pack; `ui-context.md`
§0 governs intent, `DESIGN.md` holds token values),
web-design-guidelines (accessibility gate on every UI unit).

Key things for the next session to know:

- `context/breed_curve.json` is real client data extracted from their
  spreadsheet. **Day 30 = 1,754 g does *not* meet the 1,770 g slaughter
  target — see OQ-7.** The earlier note here asserted that it did; that
  unverified rounding is the source of the fixture 10 contradiction and
  has been removed. Feed phases: starter days 1–13 ($0.65/kg), grower
  14–27 ($0.62), finisher 28+ ($0.60).
- The client's existing spreadsheet has 10 known bugs. We deliberately
  diverge from three of them (extra chicks ignored, feed on closing
  birds, two conflicting feed prices). See `current-issues.md` KB-1
  through KB-3.
- Two inputs are genuinely unknown and block full correctness:
  real mortality-by-day, and the abattoir fee. The engine must return
  `missing_input` rather than estimate. See OQ-1 and OQ-2.
- Start with U1. Do not skip ahead to UI work.
