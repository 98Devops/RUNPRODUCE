# Progress Tracker

Update this file after every meaningful implementation change.

## Current Phase

Not started. Context files written, awaiting U1.

## Current Goal

**U1 — Scaffold.** Monorepo, domain types, seed the breed curve, and
write the 13 golden fixtures as failing tests.

Expected outcome: `npm run build` passes and `npm test` shows 13
failing tests with clear expected values. Red tests at the end of U1
are the correct result — they are the executable spec.

## Completed

- None yet.

## In Progress

- None yet.

## Next Up

0. **Repo setup** — move `CLAUDE.md` to root, move `skills/` to
   `.claude/skills/`, install the superpowers plugin. See
   `context/skills.md`. Nothing works correctly until this is done.
0b. **Then** run `/grill-me` and send OQ-1 through OQ-4 to the client in
   writing. He has declined calls and asked for questions in text.
1. **U1** — scaffold, types, seed data, failing fixtures
2. **U2** — M1 production + M2 costing
3. **U3** — M3 feed liability

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

Fixtures 7, 8 and 11 depend on the **uncalibrated mortality model** —
see `current-issues.md` OQ-1. They lock in current assumed behaviour so
regressions are caught; they will need regenerating once real mortality
data arrives.

## Open Questions

Tracked in `current-issues.md`.

## Architecture Decisions

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

**U1 execution — in progress, task-by-task from
`docs/superpowers/plans/2026-09-10-u1-scaffold.md`.**

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
- **Next: Task 5** — the 13 golden fixtures. Fixtures 7, 8, 10 and 11
  stay held pending OQ-1 through OQ-4; nothing in task 4 depended on
  them.

**Zod vs. the zero-dependency invariant — settled (task 4).** The
invariant wins. `code-standards.md` now states it as a rule rather than
leaving it as an implicit precedent from `breed-curve.ts`: Zod stops at
the app/API boundary, and JSON compiled into the engine is validated at
import by hand. Validation stays mandatory; only the library is not.

**⚠️ CI is red from here until U2, by design.** `npm test` is a CI step
and the golden fixtures are meant to fail — so every run from `fb4a15e`
until `computeDecision()` is implemented reports failure. That is the
executable spec working as intended, but it means **CI red no longer
signals a regression during this window**, and TD-2's close-out
condition ("observed green on Node 20 with the real fixtures") cannot be
met while the fixtures are red. Decide at task 5 whether to keep it red
and read run logs by hand, or split the CI test step so the golden
suite reports separately from the unit suites.

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
