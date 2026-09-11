# Progress Tracker

Update this file after every meaningful implementation change.

## Current Phase

**U5 — M5a cash calendar.** Started 2026-09-10, after U4 closed and the
U5 grilling session cleared the assumptions that gate the allocation
optimiser (AD-40 through AD-45, OQ-18).
**Outcome: done, including the pre-merge review fix wave.**
`packages/engine/src/cash.ts`, 7 tasks, TDD throughout, then a final
code-review fix wave (7 findings + one documentation-only item) before
merge: `feed.planned_draws` is now booked as `PLANNED_FEED_DRAW_PAYMENT`
(priced the way `computeCosting` prices feed, deduped against already-
collected draws by `collection_date`); a flow dated before placement day
1 now throws instead of being silently dropped; `openingCents` /
`opening_cents` are documented as the balance at the START of day 1;
`cashFlowsMissingInputs` now keeps reporting a BULK candidate (key
`bulk_price`) once both OQ-2 values land, since OQ-16 gates the formula
independently; plus three test-only hardenings (invariant 9 with
`extra_chick_count`, the OQ-16-specific assertion, and `lines: []` vs
omitted overheads). 215 unit tests passing (was 209), golden suite
unchanged at 11 written / 11 passing / 1 held, lint/typecheck/build
clean. Report: `.superpowers/sdd/u5-cash-calendar-plan/final-fix-report.md`.

## Current Goal

**U5 — M5b allocation enumeration, and it is blocked.** Blocked on
**OQ-2's transport half** (the abattoir fee landed, transport did not)
and **OQ-16** (the bulk-net double-count). Three modes, with Maximum
Growth reframed as leveraged rollover (AD-35), and enumeration must
respect invariant 16's 14-day floor (AD-31). `projectCashCalendar`'s
real signature now exists (AD-46, AD-47), so M5b's plan can be written
against it rather than against a guessed one.

Two fixtures stay unwritten and neither is M5's to write: **6** waits on
OQ-8, **8** waits on OQ-10 and OQ-2. They are what holds the U1
completeness fixture.

*The U2, U3 and U4 goals that stood here are recorded under Completed.*

## Completed

- **U4 · M4 pre-merge code review fix wave.** 2026-09-11, on
  `u2-production-costing` immediately before merging it to main. M4 was the
  one part of the branch that had only ever had approval on its **reported
  values** — never an independent review of its code — which is the same gap
  that let the `feed.planned_draws` double-count survive in M5a until the
  final pass. Reviewed at effort `high`; **eight findings, all reproduced**,
  seven fixed and one documented in place.

  **Two were invariant 5 violations**, and the first is the sharpest form of
  it this project has produced: `gateValueCents` returned `0n` for a null gate
  price, valuing a bird at nothing and so making a hold look free (fixture 7's
  $3,200.71 collapses to $2,669.46, with 125 forecast-dead birds costing
  zero). `'gate_price'` had been a declared `MissingInputKey` since U1 and was
  **emitted nowhere** — and could not have fired if it had been, because
  `missingInputsFor` returned early for any batch with no BULK sale. The
  second: calibration erased the pre-harvest ramp (AD-48).

  The rest: gap-spanning deltas mis-rated by up to 18x (AD-49); an unbuildable
  harvest taking the whole decision down (AD-50); `yield_sensitivity` leaking
  `Infinity` bounds and never seeing `dressing_yield_pct`, so a 58% yield
  reported day 31 beside a window excluding 58 — now reported through a new
  mandatory `brackets_assumed_yield`; and a zero-bird flock being advised to
  hold to day 41. `bulk_price_cents_per_bird` is declared and never read:
  documented in the type and logged as **OQ-22** rather than wired up, because
  choosing between two price sources is M5b's blocked decision, not a fix
  wave's.

  **One pre-existing test changed, and the reason matters.** "calibrates from
  recorded days once the sufficiency threshold is met" asserted a ~50 bp rate
  from records reading 15/30/45/60 — which says 15 deaths in the first
  **sixteen** days, 0.03% a day, not the 0.5% its own comment claimed. It
  passed only because the day-16 delta was charged to a single day: **the test
  passed because of the defect it now guards against.** The cumulative figures
  now express 0.5% a day honestly; the assertion band is untouched.

  229 unit tests passing (was 215, +14 new). Golden suite **unchanged** at 11
  written / 11 passing / 1 held — no expected value moved, which is the point:
  the contract with the client did not change, only the code's honesty about
  what it does not know. Lint, typecheck and build clean.

- **U5 · M5a cash calendar.** `packages/engine/src/cash.ts`, 7 tasks, 17
  new tests, TDD throughout, then a pre-merge review fix wave adding 6
  more (23 in `cash.test.ts` total). 215 tests green; golden suite
  **unchanged** at 11 written / 11 passing / 1 held — expected, since
  M5a is deliberately not wired into `computeDecision()`; lint, typecheck
  and build clean.

  **Not wired into the decision path, on purpose.** `decision.allocation`
  keeps throwing `NotImplementedError` until M5b lands, so a future M5
  fixture stays correctly held rather than asserting against a
  half-built module (AD-29). `projectCashCalendar` and
  `cashFlowsMissingInputs` are exported standalone for M5b to call.

  **The reserve floor is reported and never applied.** Each day carries
  `breaches_reserve_floor`; the calendar as a whole carries the first
  breach. Filtering candidates against it is M5b's job (AD-43) — this
  module states the fact and stops.

  **A bulk-inclusive candidate cannot be priced yet, and fails loudly
  rather than guess.** Bulk net is contract price minus the abattoir fee
  minus transport, and whether transport belongs in that subtraction at
  all is OQ-16 — the Final Report already books a separate transport
  line for a gate-sold batch. Booking the gross contract price instead
  would silently answer OQ-16 in the client's stead, which invariant 5
  forbids; the BULK branch throws unconditionally until OQ-2's transport
  half and OQ-16 both land.

  Own module rather than folded into `allocation.ts` (AD-46); the
  `throughDay` horizon parameter has no default, deliberately (AD-47).

- **U4 — M4 harvest optimiser.** `packages/engine/src/harvest.ts`, 24 new
  tests, TDD throughout. **Fixtures 7, 10 and 11 now assert**; written is
  11 of 13 and held is down from 2 to 1 — the U1 completeness hold, which
  only closes when fixtures 6 and 8 are written (OQ-8, OQ-10). 192 tests
  green; lint, typecheck and build clean. Spec and plan:
  `context/plans/u4-harvest-optimiser.md`.

  **D1 was the decision the unit opened with, and it was a decision NOT to
  act** — see AD-36's D1 entry. The fallback ramp stands unchanged. Its
  compounded figures are now a test, so it cannot be quietly recalibrated
  later without the comparison that justified leaving it alone failing
  first.

  **Gate and bulk are answered separately** (AD-34). The bulk harvest day
  is pure curve arithmetic — first day `weight_g >= slaughter_target_g`,
  day 31. The gate window is derived from the marginal day's economics,
  and under the settled flat $4.25 it collapses onto day 31: flat pricing
  means growth adds no gate revenue, so every further day is pure cost.
  One implementation, and the pricing basis decides — not a constant
  swapped in.

  **`yield_sensitivity` is mandatory on the output, not optional.** The
  harvest day rests on an unmeasured ~62% (OQ-17), so a consumer reading
  only `bulk_harvest_day` must actively choose to drop the caveat rather
  than find it absent. The derived window is **59.7-62.7%**, not the
  59.7-62.8% this tracker and the spec both carried: 1,100 ÷ 1,754 =
  62.714%, rounded inward. Corrected here and in the plan.

  **The EMA calibrates on the observed rate directly, not on a ratio
  against the ramp.** OQ-1 describes the weight curve's "actual vs
  standard" pattern, but there is no client standard for mortality — "it
  varies" was the answer — and the only candidate standard is our own
  assumed ramp. Calibrating a ratio against it would anchor calibrated
  output to the assumption OQ-1 exists to retire. Carried-forward days are
  skipped outright: their derived zero means nobody wrote anything down,
  not that nothing died.

  AD-38 and AD-39 logged. OQ-9 and OQ-11 are closed by generation.

- **U3 — M3 feed liability.** `packages/engine/src/feed.ts`, 25 new
  tests, TDD throughout. **Fixtures 5 and 9 now assert**; held fell
  4 → 2 (the remaining two are U1 completeness and fixture 10/M4). 167
  tests green; lint, typecheck and build clean.

  M3 is two halves sharing only the 50 kg bag: **liability** (entered
  draws → what is owed and when) and **planning** (breed curve → what
  still needs drawing). `addDays` and `daysBetween` were added to
  `day-number.ts` as Hinnant's `civil_from_days`, the inverse of the
  existing function and kept beside it, since the engine bans `Date`.

  **Read from the client's Feed Account formulas, not from our notes.**
  His cadence is placement, +14, then +7 each time, each draw sized as
  the cumulative-feed delta over the days it covers ÷ 50. Chained off
  the PREVIOUS collection date (`A4 = A3+7`), so a draw taken late
  shifts the rest of the schedule rather than the schedule staying
  pinned to placement. Our planned draws reproduce his own 36.36 /
  57.36 / 73.80 bags — which is an **extraction check, not independent
  corroboration** (AD-36): his Feed Account and our seed both derive
  from the Record sheet.

  **What M3 deliberately does NOT return.** No `paid` / `outstanding` —
  `feed_payments` is not in `EngineInput` until U6, and defaulting paid
  to zero would assert every draw is unpaid. A conservative-looking
  default is still a fabricated fact; invariant 5's test is whether
  anyone supplied the input, not whether the guess errs safely. No
  `headroom` — needs the facility limit, which is not in `Parameters`.
  Both deferred, neither faked.

  **Planned quantities are an upper bound, not a forecast.** The flock
  is held flat at `flock_size` because U3 has no mortality model —
  forecasting removals is M4's job — so the schedule carries
  `planned_confidence: 'assumed'`.

  AD-37 and KB-11 logged. Spec and plan:
  `context/plans/u3-feed-liability.md`.

- **U1 — Scaffold.** Monorepo, money value object, breed-curve seed and
  validation, domain types, `computeDecision()` stub, golden runner, CI
  split into five named steps. 9 of 13 fixtures written and verified
  before writing; 4 deliberately withheld pending OQ-8 through OQ-11.
  56 unit tests green; lint, typecheck, build clean. See the U1 task log
  under Session Notes.

## In Progress

Nothing. U4 closed 2026-09-10; U5 has not started and is blocked — see
Next Up.

### Closed, kept for the reasoning

- **U2 / M1 + M2.** Tasks 1-4 done. **Six golden fixtures now assert for
  real** — 1, 2, 3, 4, 12 and 13 — against the client's own numbers.
  Held is down from 10 to 4: completeness (U1 task 5), fixture 5 and 9
  (M3, U3), fixture 10 (M4, U4). U2 is complete pending a close-out
  review.

  Task 4 landed `packages/engine/src/costing.ts` and wired
  `computeDecision()`. Feed is priced by phase from integer grams against
  per-kg rates in cents, `bigint` throughout, rounding **up** per AD-26 —
  reproducing his $8,079.81 exactly. Core credit stays chicks + feed
  (invariant 15); overheads sit beside it in `overhead_cost_cents` and
  `full_production_cost_cents` at $12,301.81 total. A BULK sale with no
  abattoir fee returns `missing_input` naming both gaps, never a guess
  (fixture 13, invariant 5).

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

  AD-27 and AD-28 were logged along the way — see Architecture Decisions.

## Next Up

1. ~~**U2** — M1 production + M2 costing~~ done
2. ~~**U3** — M3 feed liability~~ done ← fixtures 5, 9 green
3. ~~**U4** — M4 harvest optimiser~~ done ← fixtures 7, 10, 11 green
4. ~~**U5 · M5a** — cash calendar~~ done ← `packages/engine/src/cash.ts`,
   209 tests green, golden unchanged at 11/11/1 (AD-46, AD-47)
5. **U5 · M5b** — allocation enumeration. **`/grill-me` complete
   2026-09-10**, both rounds: AD-40 to AD-45 and OQ-18 came out of it.
   The frontier is closed and the spec is complete —
   `context/plans/u5-allocation-optimiser.md`. **The enumeration's shape
   and mechanics are buildable today; bulk-inclusive candidate scores are
   not** (OQ-2 transport, OQ-16), and two of three modes returning
   `missing_input` while Maximum Growth returns a real number is the
   expected behaviour while they are open — see AD-43. Blocked on
   **OQ-2's transport half** (the abattoir fee landed, transport did not)
   **and** OQ-16 (bulk net double-count), and Mode set decided (AD-35):
   three modes, Maximum Growth reframed as leveraged rollover. Enumeration
   must respect invariant 16's 14-day floor (AD-31). **M5b's plan is now
   written against `projectCashCalendar`'s real signature** — `(input,
   throughDay, openingCents, feed)` — rather than a guessed one.

**Outstanding client questions, after Daniel's 2026-09-10 answers** —
**OQ-8** and the **transport half of OQ-2** are what remain outstanding,
plus **OQ-13, OQ-15, OQ-16, OQ-17**, none of which block. **OQ-17 is the
highest-value ask of that group**: a measured dressing percentage from
~20 paired live/dressed weights. It blocks nothing, but the harvest day
rests on an unmeasured ~62% that is 0.8 points from changing the answer. Answered: OQ-1,
OQ-14, OQ-3, OQ-4, OQ-7, and OQ-2 in part. **OQ-9 and OQ-11 were never
client questions and are now CLOSED** — both were reframed, then closed by
generating fixtures 7 and 11 from the model in U4. **OQ-3's internal decision is settled** —
leveraged rollover reframes Maximum Growth; three modes (AD-35).

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
| 5 | First draw bags (cum feed day 14 ÷ 50) | 26.64 bags — path renamed, AD-37 |
| 6 | Break-even gate birds, 5,000 flock, day 30 | 2,675 (54%) |
| 7 | Hold cost day 30 → 35, 5,000 flock | ~~$3,305~~ → **$3,200.71**, generated — OQ-9 |
| 8 | Bulk net per day held, 5,000 flock, day 30 | −$537 |
| 9 | Feed draw due dates from 2026-02-06 | Mar 8, Mar 22, Mar 29, Apr 5, Apr 12 |
| 10 | Bulk harvest day, default params | day 31 — CONFIRMED by OQ-7; sensitive to dressing yield, see OQ-17 |
| — | Every fixture's gate price | $4.25, reconciled across all nine — AD-38 |
| 11 | Gate harvest window end, default params | ~~day 38~~ → **day 31**, generated — OQ-11 |
| 12 | 3,000 chicks + 100 extra | flock = 3,100 |
| 13 | Abattoir fee unset | returns `missing_input`, not a guess |

**Status after U4 (2026-09-10): 11 of 13 written.**

| Written and verified | Not written |
|---|---|
| 1, 2, 3, 4, 5, 7, 9, 10, 11, 12, 13 | **6** (OQ-8), **8** (OQ-10) |

Fixture 10 encodes **day 31**, not the day 30 in the original table — the
rule `first day weight_g >= 1770` applied literally to the client's own
curve (1,754 g at day 30, 1,843 g at day 31). **OQ-7 answered 2026-09-10
confirms day 31** on dressing-yield grounds, so the `provisional` marker
was lifted. The expected value never changed. See AD-33.

**Still assumed, though no longer provisional.** Lifting the marker
recorded that the *reasoning* is now Daniel's rather than ours. It did
not make the number measured: day 31 holds only at a dressing yield of
**59.7–62.7%** (derived in U4; this document and the U4 spec both carried
62.8, which was a stray rounding of 1,100 ÷ 1,754 = 62.714%), and his
~62% is an estimate. The fixture stays at day 31 —
it is what the stated inputs give — but see **OQ-17** before treating
the day as settled.

**Fixtures 7 and 11 were generated in U4 and now assert** — $3,200.71
and day 31, reported before they were written and fitted to nothing. The
discredited $3,305 and day 38 are retired; see OQ-9 and OQ-11. Fixtures 6
and 8 remain unwritten.

The paragraph below is how 6, 7, 8 and 11 stood before U4, kept for the
reasoning.

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
once real mortality data arrives. **7 and 11 are now written on exactly
that footing:** both carry `provisional`, both assert, and both need
regenerating when real mortality data lands.

## Open Questions

Tracked in `current-issues.md`.

## Architecture Decisions

**AD-48 · Calibration replaces the BASE mortality rate; the pre-harvest
uplift survives it.**
M4 returned one flat calibrated number for every day, which deleted the
pre-harvest ramp outright — the thing CONTEXT.md calls the core
operational risk — and labelled the result `'calibrated'`. The rate is
`base + uplift`; only the base is something a batch's own records
observe. So calibration substitutes the base and `preharvestUpliftBp`
still applies from the ramp start day.

Two consequences, both deliberate:

- **Ramp days are excluded from the base calibration.** An observation
  from day >= `preharvest_ramp_start_day` already contains the real
  acceleration. Calibrating on it and adding the assumed uplift back
  double-counts; subtracting the assumed uplift to recover a base is the
  ratio-against-our-own-assumption OQ-1 exists to stop. They still
  advance the gap cursor, because they are records.
- **`preharvest_uplift_source` is a new, mandatory field** on
  `HarvestPlan`, always `'assumed'`. `mortality_source: 'calibrated'`
  describes the base rate only, and one field cannot honestly carry both
  provenances. Mandatory rather than optional for the same reason
  `yield_sensitivity` is (AD-39's reasoning): a consumer must actively
  choose to drop the caveat rather than find it absent.

**AD-49 · A recorded day's delta is amortised over the days it covers.**
Carried-forward days were correctly skipped, but the recorded day that
FOLLOWS a gap carries the whole gap's arrears in its derived delta, and
that was divided by one day's opening birds. 45 deaths over 18 days
calibrated byte-identically to 45 deaths over 3 consecutive days —
50.26 bp either way.

The delta is now divided by its actual span. Spreading it evenly across
the gap is an assumption, and it is recorded as one: it is an assumption
about the **shape** of a measured total, not an invented total, which is
the line invariant 5 actually draws. The alternative of dropping
post-gap days entirely would throw away the client's only data on
precisely the batches that are recorded sparsely — which is most of them.

**Known limitation, logged not fixed:** a gap-spanning observation enters
the EMA once, though it represents N days, so it is under-weighted
relative to a run of single days. The 18x error is gone; this residue is
a weighting refinement, not a wrong number.

**AD-50 · `planHarvest` is a lazy getter again, like `allocation`.**
M4 made it eager, so a breed curve that never reaches
`slaughter_target_g` threw out of `computeDecision` and took production,
costing and feed down with it — three sound results lost to a fourth
that could not be built. The getter pattern index.ts already documents
exists for exactly this blast radius. Memoised, so
`d.harvest === d.harvest` holds.

**AD-35 · Maximum Growth is reframed as leveraged rollover. Three modes,
not four.**
Daniel's actual pattern (OQ-3) is leveraged rollover: proceeds fund a
LARGER next batch, with grower and finisher draws timed against sales
proceeds so growth compounds. Rather than add a fourth mode beside the
three, **Maximum Growth is redefined to mean exactly this**.

The reason is AD-31. "Earliest possible next placement" was Maximum
Growth's whole objective, and the 14-day inter-batch gap now determines
that date in nearly every case — the mode was emptying out. Reframing
fills a mode that had little left to decide; adding a fourth would have
put another column on a decision screen used outdoors on a cheap Android
to preserve a distinction the floor had mostly erased.

**The cost, recorded so it is not rediscovered as a surprise:** the label
"Maximum Growth" is now slightly loose for a size-and-leverage objective,
and the pure date objective no longer exists. If a reason to optimise the
placement date alone ever returns — a change to the 14-day gap, another
house — this is the decision to revisit. Use "leveraged rollover" when
explaining what the mode does; "Maximum Growth" is the UI label.

M5's enumeration keeps three columns and its existing shape.

**AD-34 · Bulk is modelled as a presale, and that drives M4.**
The contract buyer takes birds regardless of finish size. That is a
structural property of the arrangement, not a pricing quirk, and it is
the reason under-finished birds go to bulk: a day not spent finishing a
bulk bird is feed not bought. M4 reasons from it directly rather than
carrying it as a comment — a bulk bird has no weight gate and needs to
reach the target only to be PRICED, not to be sellable; a gate bird has
a real quality gate. Bulk and gate are two different decisions, not one
optimisation with a different price constant. Rule lives in
architecture.md under Harvest and channel design notes.

**AD-33 · The slaughter target is dressing-yield arithmetic; fixture 10
is confirmed, not regenerated.**
1,770 g live is what dresses to ~1.1 kg at Daniel's ~62% (OQ-7,
answered). Our earlier "hit the 1.1 kg band and stop" reading — which
argued for day 30 — is WITHDRAWN, not left on record as an alternative.
The rule stays *first day weight_g >= slaughter_target_g*, now grounded
rather than provisional, and still yields day 31. slaughter_target_g
stays his stated 1,770 rather than being re-derived to 1,774, which
would invent precision on top of an approximate 62%.

**CORRECTED 2026-09-10 — "robust" was wrong, and the test that produced
it was the wrong test.** AD-33 originally claimed robustness on the
grounds that an exact 1.1 kg dressed target back-solves to 1,774 g live,
also first met on day 31. That is true, and it establishes nothing: it
varies the *target*'s rounding while holding the *yield* fixed at 62%,
which is the one input actually in doubt. Varying the yield instead —
58, 60, 62, 64, 66% — gives harvest days **32, 31, 31, 30, 29**. Day 31
survives only on a **59.7–62.8%** window, and ~62% sits 0.8 points from
its upper edge. Two roundings of one estimate agreeing is not
independent confirmation. The rule and fixture 10 are unchanged — day 31
is still the best available answer and still what the stated inputs
give — but it is now recorded as **assumed and sensitive**, not robust.
The measured yield is asked for in **OQ-17**.

**Fixture 10 changed, and the change is declared.** Its 
marker was lifted because the assumption it named is now answered. The
EXPECTED VALUE did not change — day 31 before, day 31 after. This is a
metadata correction, not a regeneration, and it is flagged here the way
AD-30 flagged the harness encoding: fixtures are the client contract and
nothing about them moves silently.

**AD-46 · The cash calendar is its own module, not inside `allocation.ts`.**
Logged 2026-09-10 during M5a. `architecture.md`'s file map designated
`allocation.ts` as "M5 cash + allocation". M5a deliberately put the cash
projection in its own `packages/engine/src/cash.ts` instead — a
divergence from the file map, stated plainly rather than left for a
future session to notice on its own. The map is corrected in the same
pass.

Two reasons. It is independently testable and independently valuable —
`project-overview.md` lists **Cash calendar** as its own deliverable,
separate from **Decision engine** — so it earns its own file on the same
footing M1-M4 already stand on. And M5b's enumeration will project a
calendar roughly **8,401 times per run** (271 candidate sizes x 31
candidate dates, AD-40/AD-41) — a hot path, with its own performance and
testing concerns. Keeping it out of `allocation.ts` leaves that file
about enumeration and ranking, not about both.

**The cost if this is ever revisited:** a reader trusting the file map
over the actual code would look for cash projection inside
`allocation.ts` and not find it — which is exactly why the map is
corrected here rather than left to drift; a map that stops matching the
code is worse than no map.

**AD-47 · `throughDay` has no default.**
Logged 2026-09-10 during M5a. `projectCashCalendar()` takes its horizon
as a required parameter with nothing a caller can omit.

AD-43 makes the 90-day cash calendar a **display** horizon, while each
M5b allocation candidate is scored over its **own** completion horizon —
`placement + 41 + terms_days`. A default here would let a caller
silently inherit the wrong window, which is the exact mismatch AD-36
names: two quantities compared at mismatched points, read as a real
difference rather than an artefact of the comparison. Concretely:
scoring every candidate over a fixed 90-day window from `asOf` would
give a candidate placed at `floor + 30` thirty fewer days of its own
cycle inside the window than one placed at the floor, so Build Reserve
would end up preferring early placement for a window-truncation
artefact rather than an economic reason.

The parameter's own doc comment in `cash.ts` carries this reasoning, so
it stays visible at the call site and not only here.

**AD-45 · M5 has two entry points, and a candidate's cash calendar is
projected exactly once.**
Decided 2026-09-10 in the U5 grilling session, round 2.

**The decision path returns four objects:** the winner per mode plus
`place_nothing`, each fully explained, with the candidate count considered
and its tie count. The full candidate surface is 271 sizes x 31 dates =
**8,401**, and returning it scored three times over is ~25,000 objects
crossing the engine boundary to a cheap Android.

**The surface gets its own function,** `enumerateCandidates()`, called
explicitly by the scenario sliders — which are in MVP scope and want the
curve rather than three points on it. One function per question.

**One projection per candidate, shared across modes.** A candidate's cash
position is mode-independent, so the calendar for (8,400 birds, floor + 12)
is the same object whichever mode ranks it. Projecting per mode would
permit the three modes to disagree about the same candidate's cash
position; projecting once makes consistency structural rather than
something tests have to chase.

**AD-44 · The allocation tie-break is deterministic, stated, and the tie
is reported.**
Decided 2026-09-10 in the U5 grilling session, round 2. **Earliest date
first, then smaller size** — earliest because invariant 16 already handles
biosecurity and idle days earn nothing, smaller because at an equal score
it risks less capital.

Ties are routine rather than exotic: Maximum Growth maximises size in
100-bird steps (AD-41), so every date that affords 8,400 birds scores
identically. The rule is therefore stated and tested, never implicit. An
implicit tie-break — whichever candidate the loop reached first — makes the
output depend on enumeration order, which no test pins down and which
changes silently the day someone reorders the loops.

**The tie is reported, not resolved away:** `tied_candidates` on the
winner. Eleven candidates scoring identically means the choice is
insensitive, which is decision-relevant — Daniel can then choose on
grounds the engine cannot see, like a delivery he would rather not rush.

**AD-43 · Three integer scalars; the reserve floor filters rather than
scores; each candidate is scored over its OWN completion horizon.**
Decided 2026-09-10 in the U5 grilling session, round 2.

| Mode | Scalar | Direction |
|---|---|---|
| Cover Fast | days until cumulative receipts clear the new batch's core credit | minimise |
| Maximum Growth | placement size in birds | maximise |
| Build Reserve | cash retained in cents once obligations are discharged | maximise |

All three are integers — days, birds, cents — so no float touches the
ranking (invariant 2).

**The reserve floor filters; it never scores.** A breaching candidate is
excluded from every mode's ranking rather than ranked lower. OQ-3 settled
it as a hard constraint with an override path; folding it into Build
Reserve's objective would double-count it AND let a high-scoring candidate
buy its way past a constraint that is not for sale.

**The horizon is per candidate: `placement + 41 + terms_days`, not the
fixed 90-day display calendar.** Scoring every candidate over 90 days from
`asOf` gives a candidate placed at floor + 30 thirty fewer days of its own
cycle inside the window than one placed at the floor — so Build Reserve
would prefer early placement for a **window-truncation artefact** rather
than an economic reason. **That is the AD-36 error**: two quantities
compared at mismatched points, the mismatch read as a real difference.
Found by asking what the scoring window actually was, which is the check
AD-36 asks for.

**A consequence to state rather than smooth over.** Cover Fast's and Build
Reserve's scalars both need receipts, which need bulk net — blocked on
OQ-2's transport half and OQ-16. Maximum Growth's scalar is placement size,
which needs neither. So until those land, a bulk-inclusive candidate makes
**two modes return `missing_input` while the third returns a real
number**. That is correct and expected, not a regression: invariant 5
declining to compute what it cannot while still answering what it can. The
`missing_input` says so in its own `why`, so a test run or demo reads as
intended without anyone having to find the spec.

**AD-42 · No Auto mode. M5 enumerates three strategies and points at
none of them.**
Decided 2026-09-10 in the U5 grilling session. AD-35 settled that there is
no fourth *objective*; this settles the question it did not reach — whether
the system picks among the three for him. It does not.

A `recommended` flag may be built later, but it is a **UI concern for
U7-U11**, computed after the three strategies and never part of the
enumeration. If built, its whole rule must be statable in one line the user
can check — "this is the only mode that does not breach the reserve floor" —
and with more than one mode qualifying it shows **no flag** rather than an
invisible tie-break.

The brief's own design principle is the reason: *"Rather than pick one, the
system presents three named strategies side by side and lets him choose."*
A black box carrying the authority of three transparent ones is worse than
no pointer at all, especially on a decision screen used outdoors on a cheap
Android.

**AD-41 · M5's enumeration: size x date, stepped by box, place-nothing
included, one placement.**
Decided 2026-09-10 in the U5 grilling session. Three parts, all shape
rather than arithmetic:

**Step.** Batch size steps by `placement_step_birds`, a **named parameter**
defaulting to an assumed **100** — the conventional day-old-chick box,
which divides 3,000 and 30,000 exactly. Never a literal, and anything it
determines carries `confidence: 'assumed'` until **OQ-18** lands the unit
Daniel's hatchery actually invoices in. Stepping to the bird is wrong both
ways: 27,000 candidates a date is pointless, and 7,432 birds is not
orderable.

**Place nothing.** Size 0 is a real candidate. Build Reserve's honest
optimum is sometimes to place nothing, and suppressing it would be the
engine declining to say something true. It is reported as its own outcome,
`place_nothing`, carrying the overhead arithmetic that justifies it — NOT
as a zero-bird batch through the standard fields, which would put $0
revenue and $780 of `PER_BATCH` overhead (AD-26) into a projection as
though a batch existed.

**One placement.** The free variables are size and date for a **single**
next placement. No joint optimisation across two placements — a
combinatorial jump for a case AD-8 caps at two batches anyway. But every
candidate is scored against the **full cash calendar including any
already-running second batch's obligations**: its draws compete for the
same headroom and the same cash. If those obligations make every candidate
breach the reserve floor, that is a real and reportable answer.

**AD-40 · The placement date is ENUMERATED from the floor, not determined
by it. This sharpens AD-31 and AD-35; it reverses neither.**
Decided 2026-09-10 in the U5 grilling session. Stated carefully because a
future read could easily mistake it for a contradiction.

**What AD-31 settled, and still settles:** placement cannot precede
`harvest_completion + 14`. Biosecurity, not finance. M5 never generates a
candidate below the floor; it is not a penalty term a mode could out-argue.
**Untouched by this decision.**

**What AD-35 settled, and still settles:** the mode set is three, and
Maximum Growth means leveraged rollover — a **size** objective with draw
timing as a second lever — rather than the old "earliest possible next
placement" **date** objective. The pure date objective is gone and does not
come back. **Untouched by this decision.**

**What AD-40 adds:** both of the above reasoned that the placement date was
"largely determined" by the floor. That is true of the space *below* the
floor and false of the space *above* it. Bulk proceeds land **30 days**
after the sale while the floor is only harvest_end + **14**, so for roughly
16 days past the floor, waiting longer means more cash has arrived, which
finances a larger batch. That is a live trade-off in the placement date,
running in the **opposite direction** from the floor — which is exactly why
the floor does not foreclose it.

So M5's enumeration is **two-dimensional, size x date**: dates from the
floor forward to **floor + 30 days**, stepped daily. The range ends at 30
because that is the bulk terms length — past it no further receivable is
unlocked by waiting, so the space genuinely closes rather than being
truncated for convenience.

**The distinction that keeps all three consistent:** AD-31 and AD-35 were
right that there is nothing to optimise in being *earlier*. AD-40 observes
there is something to optimise in being *later*, and that it is financed by
the same receivable leveraged rollover already reasons about. Reframing
Maximum Growth was still correct; pinning the date at the floor would not
have been.

**AD-39 · `hold_cost_to_day` — the hold cost is a range, so the output
carries a range.**
Logged 2026-09-10 during U4. The approved output shape had
`cost_of_delay_per_day: { gate, bulk }` — one marginal day — and nothing a
range total could address, which is what fixture 7 actually asks for
("hold cost day 30 → 35"). So `HarvestPlan` also carries
`hold_cost_to_day`: cumulative hold cost from `asOf` forward, **keyed by
the day held through** rather than indexed, so a fixture names the day it
means instead of counting array positions.

The two fields answer different questions and are anchored differently on
purpose. `hold_cost_to_day` is anchored on `asOf` — "what does holding
from today cost". `cost_of_delay_per_day` is anchored on the target day,
the same way `bulk_harvest_day` is, so it stays a planning figure rather
than drifting with the calendar.

Forecast birds are rounded to whole birds each day *before* any money is
computed, so no float ever touches a money path (invariant 2).

**AD-38 · One gate price across the whole fixture set: $4.25.**
Logged 2026-09-10 during U4. OQ-4 and `architecture.md` both settle the
default gate price at flat **$4.25**, and **all nine** previously written
fixtures carried $4.30 — not just fixture 10. All nine were rewritten to
$4.25 in one pass.

**No expected value moved.** None of fixtures 1-5, 9, 10, 12 or 13
asserts on a gate price: they assert feed cost, feed weight, FCR,
cumulative feed, draw bags, due dates, the harvest day, flock size and a
`missing_input`. Fixture 10's day 31 in particular is pure curve
arithmetic and is price-independent. Confirmed by re-running the golden
step: 9 written, 9 passing, before fixtures 7 and 11 were added.

This is a deliberate fixture change and is logged because of that. A
golden fixture that changes without an `AD-` entry is one of the red
flags `orient` looks for, and "it was only an input constant" is exactly
the reasoning that would let a real contract change through unnoticed.

**AD-37 · Fixture 5's assert PATH changed; its value did not.**
`decision.feed.starter_bags_to_day_14` became
`decision.feed.first_draw_bags_to_day_14`. Expected value stays
**26.64**. Declared here because golden fixtures are protected files and
nothing about them moves silently — the same declaration AD-33 made when
it lifted fixture 10's `provisional` marker.

The reason is KB-11: the first draw covers days 1–14, spanning STARTER
(1–13) and one GROWER day, so "starter" names a phase the figure does
not represent. The starter-phase total is 22.98 bags, a genuinely
different number. The assert path is **our** addressing scheme, not
client data, so renaming it costs nothing and stops a future session
reading `types.ts` alone from re-inheriting the client's own naming
confusion.

**AD-36 · A second presentation of a figure is not a second source.**
Logged 2026-09-10 after the same mistake was found twice in one day.

AD-33 claimed day 31 was "robust" because 1,770 g and a back-solved
1,774 g both land there — two roundings of one 62% estimate. OQ-13
claimed the Record price set was "independently confirmed" by the Final
Report — where `Final!C4 = Record!N93 = SUM(N3:N92)`, the Record
sheet's own column, re-displayed on another tab. Different documents,
identical error: a figure restated in a second place was read as a
second source for it.

**The test to apply before writing "confirms", "corroborates",
"independent" or "robust":** name the input that would have to be wrong
for both figures to be wrong together. If it is the *same* input, there
is one source and one estimate, however many places it appears.

**Third instance, 2026-09-10 — and this one was our own flag, not a
client document. D1 is a REVERSAL.**

OQ-1 carried a rider that the fallback mortality ramp is "roughly double"
the client's planning figure, to be resolved at U4. It is not. The claim
compared the ramp's **day-41** cumulative figure (9.85%) against the
brief's 5% — which is a **harvest-day** figure (30,000 → 28,500 saleable).
Day 41 is not when anyone harvests. Compared at the same point, the ramp
gives **5.21% at the day-31 harvest against the brief's 5%**: close
agreement, not a 2x discrepancy.

**D1: the ramp is NOT recalibrated.** Recalibrating on the strength of
the mismatched comparison would have understated mortality on the one day
the ramp is actually consulted — and it is consulted precisely when there
is no own-batch history to calibrate from, which is every new batch's
harvest decision.

Same species of error as the two above, one layer further in: two
quantities compared at mismatched points, and the mismatch read as a real
disagreement. The difference is that here the mismatched comparison was
**ours**, and the artifact it corrupted was our own open question rather
than a reading of a client workbook. AD-36's test catches it either way —
name the input that would have to be wrong for both figures to be wrong
together. Here it was not even two figures: it was one curve read at two
different days.

**The asymmetry is why declining to act was right.** If the correction
were itself wrong, the ramp stays as it has been through U1-U3 — already
shipped, already working. Recalibrating on a flawed premise would have
put a *new* error into the one number the harvest decision depends on. A
wrong reason to leave something alone costs nothing; a wrong reason to
change it costs the change.

The ramp's compounded figures — 4.74% at day 30, 5.21% at day 31, 7.10%
at day 35, 9.85% at day 41 — are now asserted in
`tests/harvest.test.ts`, so the ramp cannot be quietly recalibrated later
without the comparison that justified leaving it alone failing first.

**Where this bites hardest:** client workbooks are full of summary tabs
that reference detail tabs. A cell reference looks like agreement and
carries none. Check the formula, not the value — the XML is readable
(`unzip -p book.xlsx xl/worksheets/sheetN.xml`) and it took minutes.

Not every such claim was wrong. OQ-1's "independently corroborated by
the 30,000 brief" is sound: a different document, written before
Daniel's verbal answer, reaching the same conclusion from its own
reasoning — and it flags rather than hides that our fallback ramp is
~2x the brief's figure. That is what the real thing looks like.

**AD-32 · The offal transfer is recorded but not costed.**
The abattoir keeps the offals on top of its 10c/bird cash fee. Only the
10 cents flows through the financial model. The transfer is recorded on
the sales order — ,  — because it
is real economic value Daniel gives up, and a line with no cash amount
is exactly the kind of thing that vanishes from a record and cannot be
recovered later.  is NULL, meaning not valued; zero
would assert the offals are worthless. Same rule as every other unknown
(invariant 5). A future abattoir deal that pays for offals fills it in
and the history stays comparable.

**AD-31 · The 14-day inter-batch gap is a ceiling on optimism.**
Placement cannot precede harvest completion + 14 days (spraying and
disinfection). Biosecurity, not finance, so it binds regardless of cash,
mode or opportunity. M5 never GENERATES a candidate earlier than the
floor — it is not a penalty term a strategy could out-argue, because a
mode that could would eventually recommend placing into an uncleaned
house. Now invariant 16.

A second-order consequence, which OQ-3 turns on: this largely DETERMINES
the next placement date, so Maximum Growth — whose whole objective was
"earliest possible next placement" — has little left to optimise. That is
the main argument for reframing it as leveraged rollover rather than
adding a fourth mode.

**AD-29 · Unbuilt modules are getters that throw, and the golden runner
reads the fixture's path inside its try.**
`computeDecision()` now returns real production and costing, but M3, M4
and M5 do not exist. Exposing them as `undefined` would make fixtures 5,
9 and 10 assert against nothing and fail — or worse, pass vacuously.
They are getters that throw `NotImplementedError` when read, and the
golden runner resolves the fixture's dotted path inside the same `try` as
the engine call, so "not built yet" classifies as held rather than
failing. This keeps U1's design property intact: a fixture stops being
excused the moment its module lands, with no list of excuses anywhere to
update.

**AD-30 · Fixture money is a decimal string; the harness encodes both
ways, the fixture values never change.**
JSON has no bigint, so the fixture files hold money as `"807981"`. The
harness gained `parseFixtureInput` (string → `bigint` on the way in) and
`toComparable` (`bigint` → string on the way out). The decode keys off
CONTEXT.md's own naming rule — a money field always carries `cents` in
its name — rather than a hand-listed set of fields that would drift as
soon as a new money field appears. The client's numbers in those files
were not touched, which is the point: the contract is the value, not its
encoding.

**AD-28 · A carried-forward day is marked, never disguised.**
M1 continues past a day with no record by carrying the last recorded
cumulative forward. That is correct and stays — nothing is forecast into
the gap, because forecasting is M4's job and the carried value is the
optimistic direction only in the sense that unrecorded removals are not
guessed at. The hazard is what the derived delta then looks like: zero,
which is exactly what a real day with no deaths produces. An absence of
data and a measured zero become the same number.

`ProductionProjection` now carries a per-day `days` series, each entry
with `carried_forward` and `days_since_last_record`, plus the same two
fields at the top level for the asOf figures. The VALUE is untouched;
only its provenance is exposed — the same move as CR-2's confidence
widening for thin weight samples. Invariant 5 was extended to state the
rule outright, and it binds the UI too: a carried-forward figure renders
differently, on the same footing as the measured/calibrated/assumed
badges in `ui-context.md`, so U9's decision console cannot quietly drop
the distinction. `Carried forward` is now a CONTEXT.md glossary term.

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
  weights 1,754 g (d30) / 1,843 g (d31) / 2,875 g (d41). AD-20 checked by hand, independently of the code:
  `383×0.65 + 1466×0.62 + 2559×0.60` = $2.693270/bird,
  ×3,000 = **$8,079.81** exactly, matching fixture 1. **"Independently"
  here means independently of our implementation, not of the client's
  price set** — the check uses those same prices, so it says nothing
  about whether they are current (OQ-13, corrected 2026-09-10). The seed's own
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
