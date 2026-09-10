# Current Issues

Open questions, known bugs, and blocked work. Update whenever a
question is answered, a blocker appears, or an assumption is calibrated
against real data.

---

## Open questions — blocking

### OQ-1 · Real mortality by day ✅ ANSWERED 2026-09-10
**Answer (Daniel):** *"It varies."* He wants the system to **track actual
cumulative mortality entered daily**, not forecast off an assumed
universal rate.

**Close-out is a methodology, not a number:** cumulative daily entry;
forecast calibrated per-batch via EMA against trailing own-batch data;
the assumed ramp is fallback only, until sufficient own-batch history
exists.

The question as originally posed — "what is the real rate?" — had no
answer to give, because there is no single rate. That reframes the model
rather than filling in a constant:

1. **Data entry.** `daily_records.mortality_cumulative` is a running
   total ("total dead as of today"), not a daily delta. Delta is derived:
   `delta[d] = cumulative[d] − cumulative[d−1]`. New invariants 13 and 14
   in `architecture.md`.
2. **Forecasting.** The harvest optimiser (M4, not yet built) calibrates
   its rate from this batch's own trailing cumulative entries, using the
   same EMA pattern as the weight curve (alpha 0.4, actual vs standard).
3. **Fallback.** The previously-assumed ramp (0.15%/day, +0.35%/day after
   day 30) survives **only** as the fallback for days where insufficient
   own-batch history exists to calibrate from. It is never the permanent
   source, and its output stays `confidence: 'assumed'`. Calibrated
   output carries `confidence: 'calibrated'`.

**Superseded by the answer:** the old sub-question of whether "100/day"
was an absolute count or a rate. It was neither — it was one observation
from a batch that varied. Do not reopen it.

**Still true and still applies:**
- Fallback-derived parameters render with the dashed grey badge
- `MaxSafeBatchSize` is never presented as measured fact while it rests
  on the fallback
- The ramp stays editable in settings

**Follow-on:** OQ-12 (how much trailing history counts as "sufficient").

### OQ-2 · Abattoir fee and transport cost per bird 🔴 BLOCKS BULK RECOMMENDATION
**Status:** Unanswered. **Blocks:** all allocation output.

The client confirmed they bear processing cost: they hire a truck to
the abattoir, pay transport in, and the abattoir performs slaughter.
The buyer collects from the abattoir.

So `bulk_net_per_bird = contract_price − abattoir_fee − transport_per_bird`.

Neither cost is known. If combined they are $0.50/bird, bulk net is
$3.40 against $4.30 at the gate — a $0.90 gap rather than $0.40, which
materially shifts the recommendation toward gate sales.

**Handling until answered:**
- `abattoir_fee_cents` and `transport_cents` default to `null`
- Engine returns `{ kind: 'missing_input', missing: ['abattoir_fee'] }`
- UI shows "Enter abattoir cost to see the bulk recommendation"
- **Never estimate these.**

Also needed: an edge-case toggle for delivering direct to the buyer
instead of via the abattoir. Model as `delivery_mode: 'ABATTOIR' |
'DIRECT'` with its own cost field.

### OQ-7 · Slaughter target vs. the client's own curve 🔴 BLOCKS BULK HARVEST DAY
**Status:** Unanswered. **Blocks:** exact bulk harvest day, band-crossing logic (U4).

Slaughter target is 1,770 g but the client's own curve gives 1,754 g at
day 30 (16 g short) and 1,843 g at day 31. Rule as written — *first day
`weight_g >= 1770`* — yields day 31; the tracker's expected day 30 came
from an unverified reading that rounded 1,754 to 1.77 kg.

**Ask the client:**
- (a) does the buyer pay full price for a 1,754 g bird, or must it clear
  1,770 g?
- (b) is the real target nearer 1,750 g?

**Handling until answered:**
- The rule stays exactly `first day weight_g >= 1770`. Not weakened to
  "approximate", not changed to "nearest day".
- Golden fixture 10 encodes **day 31**, provisionally.
- Harvest-day outputs carry `confidence: 'assumed'` until answered.

---

## Open questions — golden fixture values that could not be verified

Raised 2026-09-10 during U1 task 5. Four of the 13 contract values in
`progress-tracker.md` **cannot be reproduced from the client's own breed
curve under the parameters the plan specifies.** They are not written as
fixtures. Writing them would mean inventing the input that makes the
number come out — precisely what CLAUDE.md rule 3 forbids, and worse
than a gap because a fixture is the contract and is protected once
committed.

Nine fixtures are written and every one of their values was verified
against `context/breed_curve.json` **before** the file was created:
1, 2, 3, 4, 5, 9, 10, 12, 13.

### OQ-8 · Fixture 6 — break-even gate birds, 5,000 flock, day 30 🔴
**Contract value:** 2,675 birds (54%). **Computed:** 2,850.

Core credit = chick cost + feed to day 30.
`5,000 × $1.00 = $5,000` chicks, plus `5,000 × $1.45067 = $7,253.35`
feed (starter 383 g × $0.65 + grower 1,466 g × $0.62 + finisher 488 g ×
$0.60, from the client's own curve), giving **$12,253.35 ÷ $4.30 =
2,850**. With the assumed mortality model active it falls to 2,800 —
further from 2,675, not closer.

**2,675 reproduces exactly at a chick price of $0.85 with mortality
zeroed:** `$4,250 + $7,253.35 = $11,503.35 ÷ $4.30 = 2,675.2`, and
`2,675 ÷ 5,000 = 53.5%`, which is the contract's "54%". Both figures
land, so this is very likely the right reading — but **$0.85 is a chick
price the client has never given us for this scenario**, and the brief
says $1.00.

**Ask the client:** *"The 5,000-bird break-even figure of 2,675 — was
that worked out at 85 cents a chick? At the $1.00 in the brief we get
2,850."*

### OQ-9 · Fixture 7 — hold cost day 30 → 35, 5,000 flock 🟠 REFRAMED
**Status:** Not a discrepancy to reconcile. **Blocked on:** OQ-1 (answered)
implementation, then regenerate.

**The $3,305 is not a client figure.** It came from Daniel's own early
illustrative estimate and was never meant to be pinned exactly. Treating
it as a contract value was the error — it turned an illustration into a
target and sent us hunting for the assumption that reproduces it.

For the record, what the current arithmetic gives: feed for days 31–35
under the old assumed ramp is $2,506.91, birds lost over that window
280.7, worth $1,206.98 at $4.30 — sum $3,713.89. With mortality off,
$2,697.00 feed and $3,903.98 total. The residual against $3,305 implies
about $2.84 per bird lost, which matches no price in the brief. **That
hunt is closed. Do not spend further effort reconciling to $3,305.**

**Action instead:** once OQ-1's cumulative/calibrated model is
implemented (M4) and OQ-4's pricing basis is settled, **regenerate
fixture 7's expected value FROM the correctly implemented model** and
write it then. The number the model produces is the contract value.

### OQ-10 · Fixture 8 — bulk net per day held, 5,000 flock 🔴
**Contract value:** −$537/day. **Not computable at all.**

`bulk_net_per_bird = contract price − abattoir fee − transport`, and
both subtrahends are `null` pending OQ-2. The fee does not cancel out
of a per-day difference. This fixture is blocked on OQ-2 rather than
disputed — it becomes writable the moment the fee arrives.

### OQ-11 · Fixture 11 — gate window end day 38, and the per-kg rate 🟠 REFRAMED
**Status:** Not a discrepancy to reconcile. **Blocked on:** OQ-4, then
regenerate.

**The $2.46/kg is not a client figure.** Like $3,305, it came from an
early illustrative estimate of Daniel's, not from client data. The plan
derived it as "$4.30 for a 1,754 g bird", but `430 ÷ 1.754 = 245.15`
cents and `430 ÷ 1.770 = 242.94` — neither rounds to 246, and that is
because the rate was never an exact derivation in the first place. **Do
not reconcile the implementation to $2.46.**

Day 38 as a window end only holds under `PER_KG` gate pricing, which is
exactly what OQ-4 asks.

**Action instead:** once OQ-4 settles the pricing basis (and OQ-1's
model is implemented), **regenerate fixture 11's expected values FROM
the model** — both the rate and the window end day — and write the
fixture then.

**Note:** the AD slot reserved for the fixture-11 pricing basis stays
reserved and unfilled until this actually lands. Do not repurpose it.

---

## Open questions — non-blocking but important

### OQ-3 · The objective function 🟠
**Status:** Unanswered. **Affects:** which strategy is recommended by default.

The client stated three goals that conflict: cover chick and feed
credit fast, place the next batch immediately, and build cash reserves.
Covering fast means more gate sales, which means less bulk revenue.
Building reserve means not placing.

**Question to ask:** *"If you had $10,000 spare after covering costs,
would you place another batch straight away or hold it as reserve? And
how much reserve is enough before you'd start placing?"*

**Handling until answered:** AD-4 — present Cover Fast / Maximum Growth
/ Build Reserve side by side rather than picking one. This is arguably
better product regardless of the answer.

**Direction if the answer confirms the three goals — logged 2026-09-10,
NOT yet an AD.** This depends on Daniel's answer and becomes a real AD
only once OQ-3 confirms these three are the right goals to expose.

Implement AD-4's three strategies as selectable **modes**, not only as a
comparison view:

- Daniel picks **Cover Fast**, **Maximum Growth** or **Build Reserve**,
  or leaves it on a default.
- The mode **persists on the batch** until he changes it.
- The decision screen leads with **ONE number under the active mode**,
  rather than three cards every time.
- The **comparison view stays available underneath** for when he wants
  all three side by side. Nothing is removed — the default emphasis
  changes.

Plus a fourth **Auto** mode:

- Auto defaults to **Cover Fast** when the enumeration returns
  `infeasible` — in that case no real choice exists, so there is nothing
  to ask him.
- Otherwise Auto **requires an explicit pick**. It does not guess.
- **Per AD-19, Auto's reasoning is always shown.** Never a silent
  default. If Auto chose, the screen says what it chose and why.

**No engine change beyond what M5 already computes.** This is a
presentation-layer decision about which candidate-table column leads,
not a new calculation — AD-4 already has M5 producing all three columns.

**Do not build the mode-selector UI yet.** That is U9/U10 work.

**Checked 2026-09-10 — nothing currently planned makes this harder to
add later:**
- The U2 plan touches `production.ts`, `costing.ts`, `day-number.ts` and
  `types.ts` only. `Decision.allocation` stays `unknown` until U5, so no
  U2 shape constrains how the three columns are later surfaced.
- M5 producing all three columns per AD-4 is exactly what a mode needs:
  a mode is a selection over that table, not a different computation.
  Persisting the choice is a `batches` column, not an engine input.
- The one thing to preserve: **M5 must keep returning all three
  candidates even when a mode is active.** If a future step narrows M5
  to computing only the selected strategy, the comparison view and
  Auto's reasoning both lose their source. Flag it if that is ever
  proposed.

### OQ-4 · Gate sale pricing basis 🟠
**Status:** Unanswered. **Affects:** gate revenue formula and harvest window.

The brief says gate sales are **$4.30 per bird**. Their spreadsheet
books sales as **kg × price per kg**. These are different formulas with
different consequences: under per-bird pricing, growth adds no gate
revenue and the optimal gate harvest day collapses toward day 30. Under
per-kg pricing, growth pays until mortality overtakes it around day 38.

**Handling:** `pricing_basis: 'PER_BIRD' | 'PER_KG'` is a required
field on every sales order. Default to `PER_BIRD` for gate, matching
the brief, and surface the setting prominently.

### OQ-12 · How much own-batch history is "sufficient" to calibrate 🟡
**Status:** Open, assumed default. **Raised:** 2026-09-10, from OQ-1's answer.
**Affects:** when the harvest optimiser switches off the fallback ramp.

OQ-1 settles that the mortality rate is calibrated per batch from that
batch's own trailing cumulative entries, with the assumed ramp as
fallback. It does **not** settle the switchover point: how many trailing
days of entered data count as enough before the calibrated rate
overrides the fallback.

**That threshold is itself an assumed default.** Start with **3–5
trailing days** — enough to smooth a single bad entry, short enough to
respond within a 41-day cycle — and mark it as such. It is not validated
by anything yet.

**Handling until validated:**
- The threshold is a named parameter, not a literal buried in M4
- Below it, output carries `confidence: 'assumed'`; at or above it,
  `confidence: 'calibrated'`. The badge tells the user which they are
  looking at.
- Revisit once real batches have run — this is a question for data, not
  for the client.

**Sub-question, RESOLVED 2026-09-10 — not escalated to the client.**
`cull_cumulative` is cumulative too (AD-25). This is Daniel's existing
OQ-1 answer applied to a structurally identical field, not a new
question: a cull and a death are both irreversible removals counted by
hand at the same moment on the same form. Mixed semantics in adjacent
columns would have been a data-entry trap. The upper bound is **joint**
across the two columns — see invariant 13.

### OQ-5 · Who performs daily capture 🟡
**Status:** Named as "someone on the farm," no individual identified.

If the owner ends up doing capture himself, it will happen in bursts
from memory rather than daily, and the forecast degrades.

**Handling:** the system must work acceptably on weekly batch entry.
Forecast from the curve when records are missing and show a visible
staleness indicator: "Last recorded day 22 · 4 days behind."

### OQ-6 · Day 40 weight anomaly 🟡
**Status:** Unconfirmed. **Affects:** curve accuracy past day 39.

In the client's curve, day 39 → 40 jumps 2,562 g → 2,789 g (+227 g)
where every other day gains ~90 g. Likely a typo for ~2,652 g.

**Handling:** seeded as-is in `breed_curve.json` with a note. Does not
affect the day 28–35 harvest window where all decisions are made. Ask
the client to confirm.

---

## Tracked but deferred

### TD-1 · `npm audit` critical in the dev toolchain 🟡
**Raised:** 2026-09-10. **Decision:** accepted, not remediated. **Revisit:** when vitest is next upgraded.

`npm audit` reports 1 critical, 1 high, 3 moderate — all dev-only,
all in the vitest/vite chain.

| Advisory | Package | Severity | Note |
|---|---|---|---|
| [GHSA-5xrq-8626-4rwp](https://github.com/advisories/GHSA-5xrq-8626-4rwp) | `vitest` 2.1.9 (`<3.2.6`) | critical, CVSS 9.8 | Arbitrary file read/execute **only while the Vitest UI server is listening** |
| [GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) | `vite` 5.4.21 (`<=6.4.2`) | high, CVSS 7.5 | `server.fs.deny` bypass on Windows alternate paths |
| GHSA-82fw-gwwq-j7x9 / GHSA-4w7w-66w2-5vf9 / GHSA-v6wh-96g9-6wx3 | `@vitest/mocker`, `vite`, `esbuild` | moderate | mocker path traversal; optimized-deps `.map` traversal; launch-editor NTLM leak |

**Why it is accepted:** the critical requires the Vitest UI server to
be listening. `@vitest/ui` is not installed, no script passes `--ui`,
and the only test command is `vitest run` (one-shot, no server). The
vite advisories require a running dev server reachable by an attacker.
None of this ships — vitest and vite are `devDependencies` and are
absent from the Netlify build output.

**What would change the decision:** adding `@vitest/ui`, running
`vitest --watch` or a vite dev server on a shared/untrusted network, or
either package moving into runtime dependencies.

### TD-3 · No git remote configured — CI has never run ✅ CLOSED
**Raised:** 2026-09-10. **Closed:** 2026-09-10.

`.github/workflows/ci.yml` triggers correctly on `push: branches:
[main]` **and** `pull_request`. But `git remote -v` was empty. There was
nowhere to push, so no commit in this repo had ever been validated by
CI — every green result was local-only, on Node 24.

**Resolution:** remote added
(`https://github.com/98Devops/RUNPRODUCE.git`) and `main` pushed. The
workflow **did** trigger on the push — the failure mode this issue
warned about did not materialise.

**Evidence:** run
[34452361699](https://github.com/98Devops/RUNPRODUCE/actions/runs/34452361699)
— `verify` green in 16s on commit `bca826a`; lint, typecheck and test
all passed.

**Note for future runs:** GitHub annotates that `actions/checkout@v4`
and `actions/setup-node@v4` are forced onto Node 24 — that is the
runner's *action* runtime and is unrelated to the Node running our
code. The run log confirms `setup-node` acquired **Node v20.20.2** for
the `run` steps, which is what TD-2 cares about.

### TD-2 · Local Node 24 vs. CI Node 20 🟡
**Raised:** 2026-09-10. **Must be closed at U1 task 6.** **Now reachable — TD-3 closed — but not yet satisfied.**

Local is Node v24.11.0; `.github/workflows/ci.yml` pins `node-version:
'20'`. Harmless at scaffold stage, but `bigint` and
`Intl.NumberFormat` behaviour has shifted between Node majors and
money-as-`bigint`-cents is a hard invariant (CLAUDE.md rule 2).

**Close-out condition (restated 2026-09-10, after the CI split):** the
**full pipeline including the Golden fixtures step is green on Node 20
with zero held fixtures.** Green *while fixtures are held* does not
count and never did — a held fixture proves nothing about `bigint`
behaviour on Node 20, because its assertion never runs. The step prints
`held N`; TD-2 closes when that line reads `held 0` on a Node 20 run.
If Node 20 and local Node 24 diverge, that is a runtime discrepancy to
fix then, not in U4.

**Progress 2026-09-10 — partial, not closing.** First real CI run
([34452361699](https://github.com/98Devops/RUNPRODUCE/actions/runs/34452361699))
was green on **Node v20.20.2**: `money.test.ts`, 19/19 passed. That is
the first evidence that `bigint` money behaviour matches between local
Node 24 and CI Node 20 — but it covers `Money` only.

**2026-09-10 — CI stopped signalling regressions blindly.** From
`fb4a15e` until this change, `npm test` was one CI step containing both
the unit suites and the deliberately-red golden fixtures, so a red run
carried no information: the expected failure and a real regression
looked identical. That window is closed. Lint, typecheck, unit tests and
build are now four separate gating steps — `build` was not in CI at all
before this and is now — and the golden fixtures run as a fifth step
whose excusals are **derived, not declared**: a fixture is held only
when the engine call throws the typed `NotImplementedError`, or when the
fixture carries a `placeholder` instead of an expected value. A fixture
targeting a module that now exists gates like any other test. Verified
by probe before commit: a fixture asserting `807981` against an
implemented `computeDecision` returning `999999` exits the step 1, while
a `NotImplementedError` throw and a placeholder fixture both skip and
exit 0.

**Evidence:** run
[34456780592](https://github.com/98Devops/RUNPRODUCE/actions/runs/34456780592)
on commit `5e7cfc7` — `verify` green in 17s on **Node v20.20.2**. All
five steps passed: Lint, Typecheck, Unit tests (56), Build, Golden
fixtures (`written 0/13 · passing 0 · held 1`). First green CI run since
`fb4a15e`. **Still does not close TD-2** — `held` is 1, not 0.

**Honest caveat as of today:** all 13 fixtures route through the single
`computeDecision()` entry point, which is still the U1 stub — so the
step currently holds *everything* it is given. The discrimination is
structural rather than currently-exercised, and it becomes real
per-fixture the moment U2 implements a path. It needs no list updated
when that happens.

---

## Known bugs in the client's spreadsheet

We deliberately diverge from these. **Tell the client we did** — framed
as "things the new system fixes," not criticism.

### KB-1 · Extra chicks are never counted 🔴
`Initialization!B6` (extra chicks from company) exists but `Record!D3`
reads `B5` only. Free chicks are invisible, understating bird count and
every downstream cost.
**Our behaviour:** `flock = chick_count + extra_chick_count`. Golden
fixture 12 covers it.

### KB-2 · Feed calculated on closing birds 🔴
`H = J × K ÷ 1000` where `J` is closing birds (after deaths and sales).
Birds that died that day are treated as having eaten nothing.
**Our behaviour:** feed is based on opening birds. See AD-7. Our feed
figures will run slightly higher than his — flag this proactively so it
does not look like an error.

### KB-3 · Two conflicting feed price sources 🔴
`Record` uses $0.65 / $0.62 / $0.60 per kg. `Feed Account` uses $29.60
/ $28.60 per 50 kg bag = $0.592 / $0.572 per kg. Feed cost and feed
liability disagree by 8–10%.
**Our behaviour:** one price source. `feed_draws.price_per_bag_cents`
is authoritative; the per-kg rate derives from it. **Ask the client
which is correct.**

### KB-4 · FCR breaks on harvest day 🟠
`P = M ÷ ((J × G ÷ 1000) + Σ R)`. When all birds sell, `J = 0` so live
weight vanishes and FCR collapses (0.77 at day 41), then returns.
Days 42+ are `#DIV/0!`.
**Our behaviour:** FCR uses cumulative weight produced including sold
birds. Never divides by zero.

### KB-5 · Final Report reads a dead row 🟠
"Estimated income from remaining birds" reads row 92 (day 90) where
birds = 0 and weight is a stale 168 g. Always returns $0.
**Our behaviour:** read the last active day.

### KB-6 · No sales channel field 🔴
Sales are recorded as `birds × kg × price/kg` with no channel. Gate
cash and bulk 30-day are indistinguishable.
**Our behaviour:** `channel` is required on every sales order. This gap
is the reason the project exists.

### KB-7 · No receivables 🔴
Income books on the sale date. The 30-day wait is invisible.
**Our behaviour:** bulk sales create a dated receivable.

### KB-8 · One batch per file 🟠
`Feed Account` fakes batches 2 and 3 with hardcoded bag counts rather
than deriving them.
**Our behaviour:** batches are first-class records; up to 2 concurrent
(AD-8).

### KB-9 · Mortality is recorded, never forecast 🟠
No forward projection, so the pre-harvest spike cannot be anticipated.
**Our behaviour:** forecast mortality forward. Blocked on OQ-1 for
accuracy.

### KB-10 · Livability formula is fragile 🟡
`(Record!D3 − Record!I93) ÷ Record!D3` depends on row 93 being the
totals row. Breaks if rows are inserted.
**Our behaviour:** computed from facts, not cell positions.

---

## Known complexity risks

### CR-1 · Partial harvest heterogeneity 🟠
Selling 500 birds/day for five days means birds sold at five different
weights, with the remaining flock older, heavier, and dying faster. The
client's spreadsheet assumes one uniform flock, so there is no
reference implementation to copy.
**Mitigation:** AD-9 — slices from a single pool, weight-at-sale
recorded per sale. Do not model sub-flocks with independent curves;
that is correct but will consume days.

### CR-2 · Weight is a sample, not a measurement 🟠
Average body weight comes from weighing perhaps 20–30 birds. Sampling
error of ±5% on 1,754 g is ±88 g — a full day of growth. Catchers tend
to grab slower birds, biasing the sample low.
**Mitigation:** capture `weight_sample_size`; widen the confidence band
when small; present harvest as a **window** (day 29–31) rather than a
single day.

### CR-3 · Feed draw allocation across overlapping batches 🟠
One collection may serve two live batches. Wrong allocation makes
per-batch P&L meaningless, which destroys the ability to compare
batches.
**Mitigation:** allocate by bird-days. Batch A with 5,000 birds for 7
days versus Batch B with 5,000 for 3 days → A carries 70%. Simple and
explainable in one sentence.

### CR-4 · Recommendations may simply be ignored 🟡
The client has run this business profitably for years. If the system
says 2,675 and his gut says 2,000, he will follow his gut and stop
opening the app.
**Mitigation:** lead with what he cannot know (cash on a future date,
max safe batch size) rather than what he already judges well. Make
every number expandable. Log `actual_action` against every
recommendation — divergences are the most valuable data available.

---

## Blocked work

| Work | Blocked by |
|---|---|
| Bulk allocation recommendation | OQ-2 (abattoir fee) |
| Calibrated `MaxSafeBatchSize` | OQ-1 (mortality data) |
| Default strategy selection | OQ-3 (objective function) |
| Gate harvest window past day 32 | OQ-1, OQ-4 |

None of these block U1–U4. Build the engine; these affect output
accuracy and default selection, not structure.
