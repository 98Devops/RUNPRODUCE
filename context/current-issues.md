# Current Issues

Open questions, known bugs, and blocked work. Update whenever a
question is answered, a blocker appears, or an assumption is calibrated
against real data.

---

## Client source documents — read 2026-09-10

Two client artifacts were read in full:

- `~/Downloads/RUNproduce Broiler Management .xlsx` — the **working
  spreadsheet** they actually used. Four sheets: Initialization, Record
  (90 day-rows), Final Report, Feed Account. This is the 3,000-bird
  batch our fixtures are drawn from.
- `~/Downloads/_RUNPRODUCE 30,000-BROILER HYBRID CASHFLOW & HARVEST
  DASHBOARD.md` — the **30,000-bird brief**. Content is duplicated
  verbatim from ~line 1418; read the first copy.

**Everything below is PROVISIONAL — inferred from client files, not
stated by Daniel.** Replace with his actual answer when it arrives; do
not treat any of it as settled.

### What the spreadsheet CONFIRMS (fixtures match the source workbook)

**Read this table for what it is — CORRECTED 2026-09-10.** It was
originally headed "from an independent source". It is not one.
`breed_curve.json` was itself extracted from this workbook, so checking
our fixtures against the workbook confirms **that we extracted and
recomputed it faithfully**. That is worth having and it is what this
table establishes. It is **not** a second opinion on whether the
workbook's own inputs are right or current, and it must not be cited as
one. The feed-cost row in particular is circular — see the note under
the table.

Record sheet row 43 (day 41) and Final Report agree with our fixtures
exactly:

| Value | Spreadsheet | Our fixture |
|---|---|---|
| Cum feed/bird, day 41 | `L43 = 4408` g | fixture 3 input |
| Total feed, day 41 | `M43 = 13224` kg | fixture 2 |
| Feed cost, day 41 | `O43` = 8079.81; `Final!C4` is **not independent**, see below | fixture 1 (807981c) |
| Weight day 30 / 31 | `1754` / `1843` g | fixture 10, OQ-7 |
| Cum feed/bird day 30 | `L32 = 2337` g | fixture 4 |
| Starter bags | `Feed!C2 = M16/50 = 26.64` | fixture 5 |
| Chick price | `Init!B7 = 1` ($1.00) | fixtures 1–5, 12 |
| Feed $/kg | `0.65 / 0.62 / 0.60` | breed_curve.json |

Fixtures 1, 2, 3, 4, 5, 10 and 12 all reproduce the client's own working
file, not just `breed_curve.json`. Since the seed came from that file,
this is an **extraction check**, not corroboration by a second source.

**The Final Report is not a second source for the feed cost — verified
in the XML 2026-09-10.** The chain is:

    Record!F (price/kg, the Record sheet's own price set)
      -> Record!N{row} = F*H          (daily feed kg x that price)
        -> Record!N93   = SUM(N3:N92) (column total)
          -> Final!C4   = Record!N93  (a bare cell reference)

`Final!C4` performs no arithmetic of its own. It is the Record sheet's
daily cost column, summed and displayed on another tab. Reconciling the
Record price set to the Final Report therefore proves only that Excel
can add up its own column, and the same applies to our AD-20 hand-check
(`383x0.65 + 1466x0.62 + 2559x0.60 = $8,079.81`), which re-derives the
Record arithmetic from the Record prices. **Both confirm our engine
reproduces the workbook. Neither is evidence about which price set is
current.** That question is OQ-13's alone, and it has no cross-check
available. See the OQ-13 correction.

### Formula-level confirmation of three known bugs

**Numbering note, resolved 2026-09-10.** These three were first written
up as "KB-6 / KB-7 / KB-8", colliding with the existing KB-6, KB-7 and
KB-8 further down this file. They needed no new numbers: reading the
formulas did not find new bugs, it **confirmed three we had already
logged from inference**. They are folded into KB-2, KB-4 and KB-3
accordingly, and no KB number is used twice. If you arrived here looking
for "KB-7 (FCR)" or "KB-8 (two feed prices)", they are **KB-4** and
**KB-3**.

- **KB-2 confirmed · Feed is charged to CLOSING birds.** `H = J*K/1000`
  where `J` is Closing Birds. Invariant 10 and AD-7 already say do not
  copy this; now confirmed in the formula rather than inferred.
- **KB-4 confirmed · FCR double-counts sold weight on the sale day.**
  `P43 = M43/((J43*G43/1000)+SUM(R$3:R43))` — on day 41 all 3,000 birds
  are sold, so `R43 = 8625` kg is added to a denominator that already
  counts those same birds as live, giving `0.7666` instead of
  `1.5332`. Our fixture 3 asserts `1.53`, the correct value.
  **No action: independently confirmed correct.**
- **KB-3 confirmed · The workbook prices feed two different ways.**
  Record uses `0.65 / 0.62 / 0.60` per kg (= $32.50 / $31.00 / $30.00
  per 50 kg). Feed Account and the 30,000 brief both use **$31.60 /
  $29.60 / $28.60 per 50 kg** (= $0.632 / $0.592 / $0.572 per kg). Our
  fixtures follow the Record sheet, which is what reproduces $8,079.81.
  **No action on the fixtures — but the "it reconciles" reason was
  wrong** (corrected 2026-09-10): `Final!C4 = Record!N93 = SUM(N3:N92)`,
  so the Final Report just re-displays the Record sheet's own total. Of
  course the Record prices reconcile to it. Keeping that price set is
  still right, on the narrower ground that it is the set the workbook
  actually used and the one our fixtures reproduce.
  Which set is *current* is still worth asking — see OQ-13, which blocks
  nothing.

### Cost categories — now modelled, from his own figures ✅ 2026-09-10

Final Report books, for the 3,000-bird batch: Chicks $3,000, Feed
$8,079.81, **Vaccine $42, Electricity & Heating $140, Labour $640,
Other/Transport $400**. Total $12,301.81 against our core credit
(chicks + feed) of $11,079.81 — a **$1,222 gap**, which is **11.02% on
top of core credit and 9.93% of his total booked cost** (both computed,
neither estimated).

**These four are now engine parameters** — `SEED_OVERHEADS` in
`packages/engine/src/overheads.ts`, every line
`confidence: 'measured'`, because every figure is read out of his own
spreadsheet. This did not wait for a client response and did not need
one. See AD-26, and OQ-14 below, which this closes.

---

### OQ-13 · Which feed price set is current? 🟠 BLOCKS NOTHING
**Status:** Open, and deliberately not blocking. **Affects:** every money
figure downstream *if* the answer turns out to be the cheaper set.

**Decision 2026-09-10, and it stands — but one of its two reasons was
false. CORRECTED 2026-09-10.**

The original decision rested partly on this: *"the Record sheet's
0.65/0.62/0.60 is independently confirmed by reconciling to the Final
Report's $8,079.81, which is the only cross-check available."* **That is
withdrawn.** Reading the workbook XML shows `Final!C4 = Record!N93 =
SUM(N3:N92)`, where `N = F*H` — the Record sheet's own price column
times its own daily feed column. The Final Report adds nothing and
checks nothing; it re-displays the Record total on another tab.
Reconciling to it is circular, and it is not a cross-check at all, let
alone the only one.

**This is the AD-33 failure mode again** — treating a second
*presentation* of one figure as a second *source* for it. Found by the
scan that AD-33's correction prompted.

**There is no cross-check available for the price set.** Only Daniel can
answer which is current.

**The decision not to block survives on its other reason, which is
sound:** switching price source later is a parameter edit, not a
rewrite, and fixture 1 would be regenerated against an AD at that point.
What changes is the confidence — we are keeping `0.65/0.62/0.60` because
it is the set the workbook actually used to produce its own totals, not
because anything corroborates it. **Ask Daniel with the rest, and treat
it as more open than it read before.**

The client's own workbook contains two contradictory feed price sets
(KB-8). Our fixtures use the Record sheet's, which is the one that
reproduces the Final Report's $8,079.81. The 30,000 brief and the Feed
Account sheet use the cheaper set.

**Ask the client:** *"Two feed prices appear in your file — $32.50 a
starter bag on the daily sheet and $31.60 on the feed account. Which is
current?"*

**Handling until answered:** keep the Record sheet's `0.65/0.62/0.60`,
because it is the set the workbook itself used — not because it
"reconciles to the Final Report", which is circular. Do not switch on
the brief alone.

### OQ-14 · Do overheads belong in core credit? ✅ ANSWERED 2026-09-10 — by his own brief
**Answer:** the question was a false choice, and the client's brief had
already answered it. Section 19 asks for **four** break-evens and says so
outright:

> Feed break-even … DOC + feed break-even … **Full production
> break-even** (DOC + Feed + Overheads + Other costs) … Cashflow
> break-even. **"These are NOT the same number. Display them
> separately."**

So overheads neither belong inside core credit nor get dropped: both
figures are produced and shown side by side. Landed as **AD-26**:

- `core_credit_cents` stays chicks + feed, as CONTEXT.md defines it.
  This is his "DOC + feed break-even".
- `overhead_cost_cents` and `full_production_cost_cents` are new on
  `CostingResult`, with a per-line `overhead_lines` breakdown carrying
  each line's label, basis and confidence, so the UI can show both the
  make-up and the badge.
- Invariant 15 now forbids folding overheads into core credit: a blended
  figure cannot be un-blended afterwards.

**Verified, and it matters for OQ-8:** overheads do **not** explain
fixture 6's 2,675. On the 5,000-bird day-30 scenario, core-credit
break-even is 2,850 birds and full-production break-even is **3,203**.
Adding overheads moves the gap against the contract value from 175 to
528 — the wrong direction. Overheads are therefore ruled out as the
explanation, and OQ-8's chick-price reading stands as the only live one.

**Follow-ons, neither blocking:** OQ-15 (do the fixed lines stay fixed at
30,000 birds?) and OQ-16 (is the $400 transport line the abattoir run?).

### OQ-15 · Do labour and electricity stay flat at 30,000 birds? 🟠 NEW
**Status:** Open, blocks nothing. **Affects:** overhead cost at any scale
other than 3,000 birds.

His figures are measured on a 3,000-bird batch. Classified by the brief's
own variable/fixed split, labour ($640) and electricity ($140) are FIXED
and so are charged per batch whatever the size. That is very likely wrong
at 30,000 birds, and the arithmetic shows how wrong: our model gives
**$0.173/bird at 30,000** against the brief's own working assumption of
**~$0.59/bird**. Even treating all four lines as fully variable gives
only $0.407/bird.

**Ask the client:** *"Your own figures put overheads at 41c a bird on the
3,000-bird batch — $640 labour, $140 electricity, $42 vaccine, $400
transport. The 30,000-bird plan assumes 59c a bird. At 30,000, does
labour go up with the bird count, or is it the same team?"*

**Handling until answered:** the measured figures stand as the defaults
on their measured basis, which is exactly right at his current scale and
is his own data at any scale. Nothing is extrapolated. When a 30,000
scenario is modelled the overhead lines are editable — the brief says
"Make this editable" — and anything the user changes stops being
`measured`.

### OQ-16 · Is the $400 "Other/Transport" the abattoir run? 🔴 BLOCKS BULK NET
**Status:** Open, and a **hard precondition on the U5 task that computes
bulk net revenue** — listed in the blocked-work table below, not only in
a code comment, so that answering OQ-2 cannot silently unblock bulk
allocation while this is still open. **Affects:** whether bulk economics
double-counts transport.

`overhead_lines.transport_other` is the Final Report's $400 on a batch
sold at the gate. `Parameters.transport_cents_per_bird` is the run to
the abattoir, still null pending OQ-2. The brief says "Do not
double-count costs", and these two could be the same truck.

**Ask the client:** *"Is the $400 transport on your final report the feed
and chick collection, or does it include taking birds to the abattoir?"*

**Handling until answered:** both are charged, because each is a real
cost on its own terms and neither is invented. That interim state is
safe only while nothing consumes bulk net.

**The gate held its first real test, 2026-09-10.** Daniel answered the
abattoir fee (10c/bird) the same day. That is exactly the moment this
note was written to survive — a partial OQ-2 answer arriving and bulk
looking unblocked. It is not: transport is still unanswered, and OQ-16
is still open, so two independent things each still block bulk net.

**The gate:** the U5 task computing bulk net revenue does not start until
OQ-16 is answered, *even if OQ-2 has been*. OQ-2 supplies the abattoir
fee; OQ-16 says whether charging it alongside `transport_other` bills the
same truck twice. An answered OQ-2 is **not** sufficient to proceed.

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

**Independently corroborated 2026-09-10 by the 30,000 brief**, which
predates his answer and says the same thing: *"Use a planning mortality
assumption of approximately 5%... **But mortality must be an INPUT, not
a fixed assumption**"*, with 1%–6% selectable. His "it varies" is not a
new position; it was in the brief all along and we modelled a fixed ramp
anyway.

**PROVISIONAL, and it matters: our fallback ramp is roughly double the
client's own planning figure.** The brief's 5% is **cumulative over the
cycle** (30,000 x 95% = 28,500 saleable), not per day. Our fallback
(0.15%/day, +0.35%/day after day 30) compounds to **~9.5% over 41
days**. Until real data calibrates it, the fallback should be
recalibrated to land near 5% cumulative, and the "is 100/day a count or
a rate" reading is settled: **neither — it is a cumulative percentage of
placement.** Do not act on this before U4; log it against OQ-12.

### OQ-2 · Abattoir fee and transport cost per bird 🟠 HALF ANSWERED 2026-09-10
**Answer (Daniel):** the abattoir fee is **10 cents per bird in cash,
and the abattoir keeps the offals.**

**Transport is still unanswered.** He gave the abattoir fee; he did not
give the cost of the run to the abattoir. `transport_cents_per_bird`
stays `null` and the engine keeps returning `missing_input` for it, so
bulk net is still not computable. Do not read "OQ-2 answered" anywhere
and assume both halves landed — **the bulk recommendation remains
blocked**, now on transport alone.

**Only the 10 cents flows through the financial model.** The offals are
recorded, not costed: `offal_disposition = RETAINED_BY_ABATTOIR` with
`offal_value_cents = NULL` on the sales order. Null means nobody has
priced them, which is not the same as zero — zero would assert they are
worthless, and they are not. This is real economic value Daniel gives up
and it stays on the record, because a different abattoir deal that pays
for offals would otherwise be impossible to compare against this one.
See AD-32.

Fixture 13 is unaffected and still passes: it sets both fields to `null`
in its own input and asserts the refusal, which stays correct behaviour
whatever the real-world default becomes.

**Superseded detail below, kept for the reasoning.**

**Status (before the answer):** Unanswered. **Blocks:** all allocation output.

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

### OQ-7 · Slaughter target vs. the client's own curve ✅ ANSWERED 2026-09-10
**Answer (Daniel):** 1,770 g live is the weight that yields **~1.1 kg
dressed at his actual dressing percentage of ~62%**. `1770 × 0.62 =
1,097 g`. It is dressing-yield arithmetic — the weight a 1.1 kg dressed
bird has to start from — not an optimisation against the contract bands.

**The earlier "hit the 1.1 kg band and stop" hypothesis is WITHDRAWN.**
It was our inference from the brief, not his reasoning, and it argued
for day 30 on the grounds that 1,754 g yields ~1.088 kg dressed, "still
inside the band". That argument is now off the record rather than
sitting beside the answer as an unresolved alternative. Under his actual
logic 1,754 g yields 1.088 kg dressed, which is **below** 1.1 kg, so day
30 does not reach the target at all.

**The rule is unchanged and now grounded:** *first day
`weight_g >= slaughter_target_g`* → **day 31** on his curve.
`slaughter_target_g` stays
1,770 — his stated number — rather than being quietly re-derived to
1,774, which would be inventing precision on top of an approximate 62%.

**AMENDED 2026-09-10 — day 31 is sensitive to the yield.** This answer
originally called the result "robust to the rounding" because an exact
1.1 kg dressed target back-solves to 1,774 g, also day 31. That claim is
withdrawn: it varies the target's rounding while holding the yield fixed
at 62%, and the yield is the uncertain input. A proper sweep (58, 60,
62, 64, 66%) gives days **32, 31, 31, 30, 29**. Day 31 holds only on
**59.7–62.8%**, and ~62% sits 0.8 points below the edge where the answer
becomes day 30. The rule and fixture 10 do not change — day 31 remains
what the stated inputs give — but harvest-day output keeps
`confidence: 'assumed'`. **OQ-17** asks for the measured figure.

**Golden fixture 10 is CONFIRMED, not regenerated.** Its expected value
was already day 31 and stays day 31; the answer removed the reason it
was marked `provisional`, so that marker is being lifted. No asserted
value changed. See AD-33.

**What survives from this question, and belongs to U4:** the bands still
pay LESS as the bird gets heavier — $3.90 at 1.1 kg dressed, $3.80 at
1.2 kg, $3.70 at 1.3 kg. The target is a floor to reach, not a direction
to keep travelling in, and M4 must surface overshoot as the revenue loss
it is. The correction was to *why* 1,770 g is the number, not to
*whether* heavier is worse. The live design rule now lives in
`architecture.md` under "Harvest and channel design notes".

**Superseded detail below, kept for the reasoning.**

**Status (before the answer):** Unanswered. **Blocks:** exact bulk harvest day, band-crossing logic (U4).

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
- **PROVISIONAL, and it may invert the rule.** The brief explains where
  1,770 g comes from: *"~1.77 kg live -> ~1.1 kg dressed"* (a 62%
  dressing yield), and the bulk contract is banded on **dressed** weight
  and pays **LESS as the bird gets heavier**: $3.90 at 1.1 kg dressed,
  $3.80 at 1.2 kg, $3.70 at 1.3 kg. The brief says outright: *"heavier
  birds may generate LESS revenue per bird. The model must highlight
  this."*
  So the target is not "reach 1,770 g and beyond" — it is **hit the
  1.1 kg dressed band and stop**. Day 30's 1,754 g yields ~1.088 kg
  dressed, still inside that band. That is an argument for day 30 over
  day 31 that has nothing to do with rounding 1,754 up.
  **This is a U4 concern, not a U2 one. Do not change fixture 10 now** —
  it is marked provisional and its day-31 value follows the rule as
  currently written. Raise it with the client before U4.
- Golden fixture 10 encodes **day 31**, provisionally.
- Harvest-day outputs carry `confidence: 'assumed'` until answered.

### OQ-17 · Daniel's measured dressing percentage 🔴 HIGH — does not block U3

**Status:** Open. **Raised:** 2026-09-10, from the AD-33 sensitivity
check. **Affects:** the bulk harvest day (fixture 10), M4's harvest rule,
and every downstream revenue figure that prices a dressed bird.

**The ask, and it is a measurement, not an opinion:** on the next batch,
**weigh ~20 birds live, then weigh the same birds dressed, and give us
both sets of numbers.** Not a recalled percentage — the paired weights,
so we can compute the yield and see its spread across birds.

**Why it is worth the trouble.** Every dressing-yield number in this
project traces back to one rough "~62%" and has never been measured.
That single estimate sets `slaughter_target_g = 1770`, which sets the
harvest day, which sets feed cost, hold cost and the gate/bulk split. The
sensitivity check shows how little slack there is:

| Dressing yield | Target live weight | First day at target |
|---|---|---|
| 58% | 1,896.6 g | day 32 |
| 60% | 1,833.3 g | day 31 |
| **62%** | **1,774.2 g** | **day 31** |
| 64% | 1,718.8 g | day 30 |
| 66% | 1,666.7 g | day 29 |

Day 31 survives only between **59.7% and 62.8%**. Daniel's ~62% sits
**0.8 points** from the boundary at which the answer becomes day 30.

**The structural reason it is this tight:** on his own curve a bird gains
~87 g/day around harvest, and 1 point of dressing yield moves the target
live weight by ~29 g. So **one harvest day is worth only ~3 points of
yield.** A yield known to "about 62%" cannot pin a harvest day at all —
the precision of the answer exceeds the precision of the input, which is
exactly what invariant 5 exists to prevent.

**Structurally enforced in U4, 2026-09-10.** `HarvestPlan` carries
`assumed_dressing_yield_pct` and a **mandatory, non-optional**
`yield_sensitivity` beside `bulk_harvest_day`. A consumer reading only the
day must now actively choose to drop the caveat rather than find it absent
by default — which is what makes this question protective rather than a
paragraph nobody's code reads.

**The derived window is 59.7-62.7%, not the 59.7-62.8% recorded here.**
1,100 g dressed ÷ 1,754 g (day 30's live weight) = 62.714%, rounded
inward so the reported window never claims the day holds at a yield where
it does not. The lower bound, 1,100 ÷ 1,843 = 59.685% → 59.7%, was right.
The table below is otherwise unchanged and still correct. Daniel's ~62%
sits **0.7 points** from the upper edge.

The sensitivity is computed against the bulk contract's **first band**
(1.1 kg dressed) rather than against `slaughter_target_g × yield`. Taking
the dressed goal from client band data is what stops the check from
re-rounding its own assumption — the AD-36 error.

**Handling until answered:**
- `slaughter_target_g` stays **1,770** — his stated number. Do not
  re-derive it from a guessed yield.
- The rule stays *first day `weight_g >= slaughter_target_g`*. Not
  softened, not widened to a range.
- Harvest-day output carries `confidence: 'assumed'`, and U4 must show
  the yield it assumed alongside the day, so the day is never read as
  measured. **Done — see above.**
- **Do not present day 31 to Daniel as a precise recommendation.** It is
  the right answer given his stated inputs and it is one rounding away
  from day 30.

**Note on history:** this was never asked as its own question. It has
been an embedded assumption inside OQ-7 and the CONTEXT.md glossary
entry since the brief, carried as fact because it appeared in a client
document. The sensitivity check is what turned it into a question.

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

**PROVISIONAL — the $0.85 hypothesis got weaker, not stronger.** The
spreadsheet states $1.00 twice: `Initialization!B7 = 1` and Final
Report `C3 = Init!B5*Init!B7 = $3,000` for 3,000 chicks. Neither file
contains an $0.85 chick anywhere. The files cover a 3,000-bird batch and
fixture 6 is the 5,000-bird scenario, so this is not decisive — but the
one-sentence close stays as written and should not be softened toward
$0.85.

### OQ-9 · Fixture 7 — hold cost day 30 → 35, 5,000 flock ✅ CLOSED 2026-09-10
**Closed by generation in U4.** The fixture is written and asserts.

**The generated value is $3,200.71** (`hold_cost_to_day.35.gate_total_cents`
= 320071), reported before it was written and fitted to nothing:

| Component | |
|---|---|
| Feed, days 31–35, charged to opening birds at $0.60/kg finisher | $2,669.46 |
| 125 birds forecast lost × $4.25 flat gate | $531.25 |
| **Gate total** | **$3,200.71** |
| Bulk total (125 × $3.70, the 1.3 kg band at day 35) | $3,131.96 |

The discredited $3,305 sits 3.3% above this and the $3,713.89 recorded
below sits 16% above — that figure used the compounding ramp D1 has since
retired, and $4.30 rather than the settled $4.25. **Neither was fitted
to.** The fixture carries `provisional`: it rests on the assumed fallback
ramp and the assumed flat gate price, and needs regenerating when real
mortality data lands.

**Superseded detail below, kept for the reasoning.**

**Status (before U4):** Not a discrepancy to reconcile. **Blocked on:** OQ-1 (answered)
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

### OQ-11 · Fixture 11 — gate window end day 38, and the per-kg rate ✅ CLOSED 2026-09-10
**Closed by generation in U4.** The fixture is written and asserts.

**The generated value is day 31** — `gate_window: { first_day: 31,
last_day: 31 }`. The tripwire was cleared by a wide margin, not narrowly.
Under flat per-bird pricing the marginal day's revenue gain is exactly
zero against a real feed-and-mortality cost, so the window collapses onto
the first day the bird reaches the slaughter target. The degenerate
one-day window is the honest result, and it comes from a **revenue**
mechanism, not a mortality one.

**Day 38 is not reproducible under any per-kg rate either, and that is
worth recording.** Controls run at both rates:

| Gate pricing | Window end |
|---|---|
| Flat $4.25/bird (settled default, OQ-4) | **31** |
| $2.00/kg (the real heavy-bird rate) | 41 |
| $2.46/kg (the discredited rate) | 41 |

Day 38 originally meant *"growth pays until mortality overtakes it"*. That
crossover cannot happen under our ramp: the ramp is a flat **step** at day
30, not an escalation, so mortality cost stops rising while growth keeps
paying, and the window runs to the end of the curve. **Day 38 rested on
the compounding ramp that D1 retired** (see AD-36's D1 entry) — not on the
$2.46/kg rate alone, which is what this question originally suspected. Two
discredited inputs, one discredited output.

The fixture carries `provisional`: it rests on the assumed flat gate price
and on the assumed yield behind the 1,770 g target (OQ-17).

**Superseded detail below, kept for the reasoning.**

**Status (after OQ-4 landed, before U4):** Not a discrepancy to reconcile. **Was blocked on OQ-4, which
is now answered** — so fixture 11 can be generated from the model when
U4 lands. It is still unwritten, and still must be generated rather than
back-fitted.

**What OQ-4's answer changes here.** Day 38 as a window end only held
under `PER_KG` gate pricing. Under the real rule most gate birds price
**flat at ~$4.25**, and a flat price means growth adds no gate revenue —
which collapses the gate window toward the slaughter target rather than
stretching it to day 38. Expect the generated value to be **materially
earlier than 38**, and treat a regenerated 38 as a signal something is
wrong rather than a happy confirmation.

The $2.46/kg remains not-a-client-figure. We now have two real rates —
flat $4.25/bird and $2.00/kg for heavy birds — and 2.46 is neither.

**Superseded detail below, kept for the reasoning.**

**Status (before OQ-4 landed):** Not a discrepancy to reconcile. **Blocked on:** OQ-4, then
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

### OQ-3 · The objective function ✅ ANSWERED 2026-09-10 — "leveraged rollover"
**Answer (Daniel):** the real pattern has a name, and it is **not** one
of our three. Proceeds from selling today's batch fund booking a
**LARGER** next batch, with grower and finisher feed draws deliberately
timed against sales proceeds, so that growth **compounds** rather than
just clearing debt or sitting as reserve.

Call it **leveraged rollover**. Use his name for it, not ours.

**What it is not.** It is closer to Maximum Growth than to the other two,
but it is not the same objective:

| | Optimises | Free variable |
|---|---|---|
| Cover Fast | fewest days to clear core credit | sales mix |
| Maximum Growth | earliest next placement | placement **date** |
| Build Reserve | highest cash retained | how much is not spent |
| **Leveraged rollover** | **largest next batch the proceeds can finance** | placement **size**, plus draw **timing** |

Maximum Growth optimises a date; leveraged rollover optimises a size,
and uses draw timing as a second lever — a draw taken on 30-day terms
against a sale that lands inside those 30 days is free working capital,
which is the "leveraged" half of the name.

**AD-31 sharpens this considerably.** The 14-day inter-batch gap is a
hard floor on the placement date, so "earliest possible next placement"
is now largely **determined** — harvest completion plus 14 — and Maximum
Growth's optimisation space has mostly collapsed. The mode as originally
defined has little left to decide. That is a strong argument that this
is a **reframing of Maximum Growth**, not a fourth mode beside it.

**DECIDED 2026-09-10: reframe Maximum Growth.** It now means leveraged
rollover specifically — the largest next batch the proceeds can finance,
with draws timed against sales, subject to invariant 16's 14-day floor.
The mode set stays **three**, and M5's enumeration keeps its shape.

The reasoning is AD-31's: the placement date is now floor-determined, so
the original "earliest next placement" objective was emptying out. This
fills a mode rather than adding a fourth column to a decision screen used
outdoors on a cheap Android. **The cost, stated so it is not rediscovered
later:** "Maximum Growth" is now a slightly loose label for a
size-and-leverage objective, and the pure date objective is gone. If a
reason to optimise the date alone ever returns — a change to the 14-day
gap, say — this is the decision to revisit. See AD-35.

**What is settled regardless:** the reserve floor stays a hard
constraint with the override path (below), and the mode set is a
presentation-and-enumeration decision, not a new calculation.

**Superseded detail below, kept for the reasoning.**

**Status (before the answer):** Unanswered. **Affects:** which strategy is recommended by default.

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

**PROVISIONAL — the brief supplies the constraint but not the
objective.** The 30,000 brief states a **minimum cash reserve** as a
hard floor with selectable values **$5,000 / $10,000 / $15,000 /
$20,000**, and: *"The dashboard should never recommend a cash/bulk
allocation that causes projected cash to fall below the minimum reserve
unless the user explicitly overrides it."* That validates
`reserve_floor_cents` and the override path.

On the objective itself the brief leans one way without settling it:
*"Use cash sales to finance the cycle. Use the bulk buyer to absorb
volume"*, and *"We do NOT want to sell everything live if the market
cannot absorb it."* That is **Cover Fast as the working default**, with
gate capacity as the binding constraint — which is also the sensible
Auto fallback. Still not an answer to "would you place or hold $10,000",
which is the part only Daniel can give.

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

### OQ-4 · Gate sale pricing basis ✅ ANSWERED 2026-09-10 — and the answer is "neither"
**Answer (Daniel):** gate pricing is **quality-gated**, not per-bird and
not per-kg. A visually good bird — his words, **"big chest"** — sells
flat at about **$4.20–$4.30** whatever it weighs, under roughly 2 kg. A
heavier bird is priced **per kg at about $2.00/kg**. The two converge
near the crossover, which is why both readings looked defensible.

**This reconciles the two client sources instead of picking one.** The
brief's "$4.30 per bird" is the flat rate for typical birds; the
spreadsheet's `S43 = 2` ($2.00/kg) is the heavy-bird rate. Both are his,
both are correct, and they describe **different birds**. The earlier
framing — "the source files disagree" — was wrong about the disagreement.

**The system cannot compute this and must not pretend to.** "Big chest"
is a visual judgement about conformation; weight is the only thing we
have, and weight is not it. So:

- Gate revenue defaults to the **flat ~$4.25 per bird**, carrying
  `confidence: 'assumed'` until real sales data exists.
- **Per-kg at ~$2.00/kg is the fallback** for birds recorded above
  ~2 kg live weight.
- It is presented as **a documented approximation, never a formula.**
  The crossover is not even clean: at exactly 2 kg the flat rate is
  $4.25 against $4.00 per-kg, and they only meet near 2.125 kg. Drawing
  a sharp threshold would invent precision the input does not have.
- At the 1,770 g slaughter target the flat rate dominates — $4.25
  against $3.54 per-kg — so typical harvest-weight birds price flat.

`pricing_basis: 'PER_BIRD' | 'PER_KG'` stays on every sales order: it now
records **which rule was applied to this sale**, which is exactly what
makes real sales data able to replace the assumption later.

The live design rule is in `architecture.md` under "Harvest and channel
design notes".

**Superseded detail below, kept for the reasoning.**

**Status (before the answer):** Unanswered. **Affects:** gate revenue formula and harvest window.

The brief says gate sales are **$4.30 per bird**. Their spreadsheet
books sales as **kg × price per kg**. These are different formulas with
different consequences: under per-bird pricing, growth adds no gate
revenue and the optimal gate harvest day collapses toward day 30. Under
per-kg pricing, growth pays until mortality overtakes it around day 38.

**Handling:** `pricing_basis: 'PER_BIRD' | 'PER_KG'` is a required
field on every sales order. Default to `PER_BIRD` for gate, matching
the brief, and surface the setting prominently.

**PROVISIONAL — the source files disagree with each other, so this
question is sharpened rather than closed:**
- The **30,000 brief is per bird**, consistently: "$4.30 per bird", the
  Live-vs-Bulk table's "Price $4.30", and the worked example "At
  $4.30/bird, sell approximately 1,047 birds for cash."
- The **spreadsheet is per kg**: Record `S43 = 2` ($2.00/kg),
  `R43 = 8625` kg, `T43 = S43*R43 = $17,250`. A per-bird alternative
  sits beside it at `U93 = J43*5` = $15,000 ($5.00/bird).

Both are the client's. Keeping `PER_BIRD` as the default is still
right — the brief is the more recent and more deliberate artifact — but
**$2.00/kg is now a real observed gate rate** where before we had none.

Note what this does to OQ-11: $4.30/bird at the 1,770 g target implies
**$2.43/kg**, which is where the plan's unsourced "$2.46/kg" came from.
The spreadsheet's actual $2.00/kg is a materially different number.

### OQ-18 · What unit does the hatchery invoice chicks in? 🟡
**Status:** Open, assumed default. **Raised:** 2026-09-10, from the U5
grilling session. **Affects:** the granularity of every batch-size
recommendation M5 makes.

**The ask, and it is a small one:** *when you order day-old chicks, what
does the hatchery invoice in — boxes, crates, or a flat bird count? And how
many birds is one of those?*

**Why it matters more than it looks.** M5 enumerates candidate batch sizes
and recommends one. A recommendation Daniel cannot place an order for is
not a recommendation — "7,432 birds" is arithmetic, not an instruction. The
step size is what makes the output orderable.

**Handling until answered:** `placement_step_birds`, a named parameter
defaulting to **100** — the conventional day-old-chick box, which divides
both 3,000 and 30,000 exactly. It is **not a client figure**; anything the
step determines carries `confidence: 'assumed'`. See AD-41.

**Does not block U5.** The parameter is the whole mechanism, and a different
answer changes its default rather than any code. Ask it with the rest.

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

**Implemented in U4, 2026-09-10.** The threshold is
`Parameters.calibration_trailing_days_min`, defaulting to the exported
`DEFAULT_CALIBRATION_TRAILING_DAYS_MIN` = **3**, the short end of the
range. Below it `calibrateMortalityRate` returns `rate_bp: null` and the
fallback ramp is used, with `mortality_source: 'assumed'`; at or above it
the EMA rate is used and the source reads `'calibrated'`.
`trailing_days_used` is reported either way, so the badge can say what it
actually had to work with.

**One thing U4 settled that this question did not ask.** Only **recorded**
days count toward the threshold. A carried-forward day's derived delta is
zero because nobody wrote anything down, not because nothing died, and
counting it would both inflate the day count and drag the rate toward zero
with fabricated data. Sparse history therefore calibrates slowly, which is
the correct behaviour.

**The rider OQ-1 parked here never arrived, because it was withdrawn.**
OQ-1's claim that the fallback ramp is "roughly double" the brief's
planning figure was to be logged against this question at U4. It was
instead found to be a mismatched comparison and reversed — see **D1**
under AD-36. The ramp is unchanged and nothing about it lands here.

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

### KB-11 · "Starter" draw is not the starter phase 🟡
The Feed Account's first draw (`Feed!C2 = Record!M16/50` = 26.64 bags)
is labelled as the starter draw but covers **days 1–14**. STARTER is
days 1–13; day 14 is GROWER. So the label names a phase while the
formula spans two, and the starter-phase total is a different number
entirely — 383 g/bird x 3,000 / 50 = **22.98 bags**.

**Our behaviour:** reproduce his 26.64, because the draw cadence is his
and the fixture is the contract, but **do not carry his label**. The
field is `first_draw_bags_to_day_14` and the golden fixture's assert
path was changed to match (AD-37). A KB entry explains history; a field
name is what stops the confusion propagating into code that never reads
this file.

**Not a divergence** — the quantity is unchanged. Only the name is.

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
| Bulk allocation recommendation | OQ-2 — **transport half only**; abattoir fee answered 2026-09-10 |
| U5 · bulk net revenue computation | OQ-2 (transport) **and** OQ-16 — both required, neither sufficient alone |
| U5 · any **bulk-inclusive** candidate score | OQ-2 (transport) **and** OQ-16. The enumeration's SHAPE is buildable today and is spec'd; a candidate routing birds to bulk returns `missing_input` naming both gaps, never a gate-only figure dressed as complete |
| Calibrated `MaxSafeBatchSize` | OQ-1 (mortality data) |
| Default strategy selection | ~~OQ-3~~ answered; mode set decided (AD-35) |
| ~~Gate harvest window past day 32~~ | **Moot.** Built in U4: under the settled flat gate price the window ends at day 31, so there is no "past day 32" to unblock. It reopens only if per-kg gate pricing becomes the default — see OQ-11 |

None of these blocked U1–U4, all four of which are now done. They affect
output accuracy and default selection, not structure. **Invariant 16's 14-day
inter-batch gap is not in this table on purpose** — it is not blocked on
anything, it is a settled hard constraint M5 builds against (AD-31).
