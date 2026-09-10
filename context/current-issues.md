# Current Issues

Open questions, known bugs, and blocked work. Update whenever a
question is answered, a blocker appears, or an assumption is calibrated
against real data.

---

## Open questions — blocking

### OQ-1 · Real mortality by day 🔴 BLOCKS CORRECTNESS
**Status:** Unanswered. **Blocks:** harvest optimiser, max safe batch size.

The client said "about 100 birds a day dying after day 35." That was
turned into a model:
```
base_mortality_rate_daily      = 0.0015   (0.15%/day)
preharvest_ramp_start_day      = 30
preharvest_ramp_rate_daily     = 0.0035   (+0.35%/day compounding after day 30)
```

**These numbers were reverse-engineered to make "100/day" plausible at
a 10,000–15,000 flock. They are not measured.** The client's
spreadsheet contains zero recorded mortality — every cell is blank — so
there is no history to calibrate against.

This matters because the mortality ramp dominates the harvest optimiser
after day 32, and it produces both the scaling law and
`MaxSafeBatchSize`. If the real curve is flatter, larger batches are
safe and our recommendation is wrong.

**Also unresolved:** is "100/day" an absolute count or a rate? At 5,000
birds it is 2%/day (catastrophic). At 30,000 it is 0.33%/day (normal).
The optimiser cannot be trusted without knowing which.

**Handling until answered:**
- Parameters carry `confidence: 'assumed'` and render with the dashed
  grey badge
- `MaxSafeBatchSize` is labelled "based on the mortality pattern you
  described" — never presented as measured fact
- The ramp is editable in settings
- Auto-calibrate from `daily_records` once one batch completes

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

### TD-3 · No git remote configured — CI has never run 🔴
**Raised:** 2026-09-10. **Blocks:** the entire premise of TD-2's close-out.

`.github/workflows/ci.yml` triggers correctly on `push: branches:
[main]` **and** `pull_request`. But `git remote -v` is empty. There is
nowhere to push, so no commit in this repo has ever been validated by
CI — every green result so far is local-only, on Node 24.

**Consequence:** TD-2 cannot be closed at task 6 as written, because
"observe CI green on Node 20" is impossible until a remote exists.

**Fix:** create the GitHub repo and `git remote add origin`, then push.
Until then, treat every "CI passes" claim as unverified.

### TD-2 · Local Node 24 vs. CI Node 20 🟡
**Raised:** 2026-09-10. **Must be closed at U1 task 6.** **See TD-3 — currently impossible.**

Local is Node v24.11.0; `.github/workflows/ci.yml` pins `node-version:
'20'`. Harmless at scaffold stage, but `bigint` and
`Intl.NumberFormat` behaviour has shifted between Node majors and
money-as-`bigint`-cents is a hard invariant (CLAUDE.md rule 2).

**Close-out condition:** once the golden fixtures land in task 5, U1 is
not done until CI is observed **green on Node 20 with the real
fixtures** — not just locally green on 24. If it diverges, that is a
runtime discrepancy to fix now, not in U4.

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
