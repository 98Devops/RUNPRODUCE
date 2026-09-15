# Current Issues

Open questions, known bugs, and blocked work. Update whenever a
question is answered, a blocker appears, or an assumption is calibrated
against real data.

---

## Severity — read this before skimming the rest

Most entries below are **open questions**: things the client has not told us,
where the engine correctly declines to guess. They are marked 🔴 / 🟠 / 🟡 by
how much they block.

**A small number of entries are a different kind of thing entirely: defects we
wrote, shipped, and caught — code that produced a confident wrong number, or
no number at all.** Those are marked **🔴🔴 CRITICAL** and collected here, at
the top, because they are qualitatively worse than an unanswered question and a
future session skimming this file should see that without reading a full
description to work it out.

An unanswered question makes the engine say "I don't know", which is the
behaviour invariant 5 asks for. A critical defect makes it say something
false — or crash — while looking authoritative. The bar for this marker is:
**would a user have acted on a wrong number, or seen nothing at all?**

| | Meaning |
|---|---|
| 🔴🔴 **CRITICAL** | Our code produced a confident wrong number, or crashed. Fixed or urgent. |
| 🔴 | Blocks a unit, or is urgent |
| 🟠 | Important, does not block |
| 🟡 | Minor, or internal |
| ✅ | Answered / closed |

### CD-1 · A null gate price was priced at $0.00 🔴🔴 CRITICAL — FIXED 2026-09-11
**Found:** M4's pre-merge code review. **Fixed:** `66bc1da`. **Lived in main
for:** never — caught on the branch, before the merge.

`planHarvest`'s `gateValueCents` returned `0n` when the gate price was null.
Zero is a number the client never gave us, and it is the single most dangerous
one available here: **it makes holding a bird look free.** Fixture 7's hold
cost drops from $3,200.71 to $2,669.46, with 125 forecast-dead birds valued at
nothing. A user reading that would hold birds the engine should have told them
to sell.

**Why this one is the reference case for the marker.** `'gate_price'` had been
a declared `MissingInputKey` since U1 — the refusal slot existed, was named
correctly, and was **emitted nowhere**. And it could not have fired even if it
had been written, because `missingInputsFor` returned early for any batch with
no BULK sale, which is every gate-only batch. Three layers of invariant-5
machinery were in place and none of them ran.

**Fixed by:** emitting `gate_price` before the bulk early-return, for whichever
basis is active, plus a programming-error guard in `planHarvest` matching the
one `projectCashCalendar` already carries.

### CD-2 · Calibration deleted the pre-harvest ramp and called itself 'calibrated' 🔴🔴 CRITICAL — FIXED 2026-09-11
**Found:** M4's pre-merge code review. **Fixed:** `66bc1da`, AD-48. **Lived in
main for:** never — caught on the branch.

Once enough records existed, `rateBpFor` returned **one flat calibrated number
for every day**, which silently removed the pre-harvest mortality ramp — the
accelerating death rate CONTEXT.md names as *the core operational risk*. Clean
pre-ramp records forecast a fraction of the fallback's loss to day 41, across
precisely the days the harvest decision turns on.

**Why it is critical rather than merely wrong.** It was **labelled
`'calibrated'`**. The output told the reader it had been improved by the
client's own data at the exact moment it had been degraded by it, and the
degradation grew as more real data arrived. A wrong number wearing a confidence
label that says "this one is better than our assumption" is worse than the
assumption it replaced.

**Fixed by:** calibrating the BASE rate only and keeping the uplift, excluding
ramp days from the base calibration, and adding a mandatory
`preharvest_uplift_source` so `mortality_source: 'calibrated'` can no longer be
read as covering both.

### The third member of this class is still open
**OQ-21**, the fractional-bag crash, belongs here by severity — it produces no
number at all, taking `computeDecision` down with a `RangeError` on Daniel's
own 26.64 figure. It is filed under blocking open questions below because half
of its fix needs an answer from him, but **read it with this section's bar in
mind, not the bar of the questions around it.**

**What both CD entries have in common, and what it cost to find them.** Neither
was found by tests, review of reported values, or the golden fixtures — all of
which were green. Both were found by an **independent code review of code that
had only ever had approval on its outputs**. That is the same gap that let
M5a's `feed.planned_draws` double-count survive to its final pass. The lesson
is recorded here rather than in a commit message because it is the reason this
section exists.

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

## FOR US TO BUILD — bulk revenue, complete, 2026-09-12

**Daniel is never asked about any of this.** Same trace as the Daniel list;
these are the gaps where the missing thing is code, not information.

**Ordered by real priority, not by the order they were found.** Reprioritised
and the first three executed on 2026-09-12.

| Rank | Item | State |
|---|---|---|
| **1** | Sales quantity validation | ✅ **DONE** — `salesMissingInputs`, typed `sales_bird_count` refusal, 7 tests. Daniel's robustness request maps directly here: a 999,999-bird order against a 3,000-bird batch returning `ok` is precisely what he asked for protection against. |
| **2** | Retired $400 in `SEED_OVERHEADS` | ✅ **DONE** — removed, AD-51, 8 assertions updated. Note the error direction was **understatement**, not overstatement — see AD-51. |
| **3** | `bulkNetCentsPerBird` | ✅ **BUILT AND WIRED** 2026-09-12 (AD-57) — reads the ORDER's own contract (PER_BIRD, PER_KG or BANDED) and books a NET `BULK_RECEIPT` on order date + terms. |
| 4 | Revenue / profit / margin / break-even | **Queued — now the largest thing standing between the engine and a bulk number.** Nothing of it exists. |
| **5** | Dressed weight on `SalesOrder` | ✅ **DONE** — `avg_dressed_weight_g`, required for a BANDED order and refused rather than derived from the assumed yield (AD-57). |
| **6** | OQ-22 precedence | ✅ **DONE** — closed by DELETING `bulk_price_cents_per_bird`, not by ranking the two sources (AD-57). |
| 7 | `transport_cents_per_bird` not distinguished by delivery mode | Queued — the value landed (AD-55), the DIRECT-mode distinction did not. Needs question 11. |
| 8 | Offal fields on `SalesOrder` | Queued. |
| 9 | `mortality_history` dead key | Queued — wire or delete. |
| **10** | OQ-28 feed delivery field | ✅ **DONE** — AD-54, paid on the collection date. |
| 11 | OQ-25 cash balance | Blocked on U6. **Now the only thing between `computeAllocation` and the `decision.allocation` getter.** |
| 12 | OQ-26 Cover Fast | Blocked on M6. |
| 13 | OQ-29 — a 1-bird grid takes 20.8 s | **New 2026-09-12.** Ours. Should land before M5b Task 9. |
| 14 | OQ-30 — the band schedule extrapolates in planning, refuses in sales | **New 2026-09-12.** Half ours, half question 2 on the Daniel list. |

**On the critical path to a bulk number:**

1. **Bulk net is not implemented at all.** `grep bulk_net src/` returns nothing.
   `receiptCents` computes a GROSS amount and the BULK branch in
   `projectCashCalendar` refuses rather than booking it. Verified 2026-09-12:
   supplying a hypothetical transport value still throws. **Answering OQ-2
   closes one gap of two.**
2. **No revenue, profit, margin or break-even exists anywhere in the engine.**
   `CostingResult` is costs only. The brief asks outright for break-even
   quantity ("how many birds must be sold to recover...") and profit, and none
   of it is built. "Bulk profitability end to end" needs this, not just a net
   per bird.
3. **`SalesOrder` carries no dressed weight.** Bands key on `dressed_floor_g`;
   orders carry `avg_live_weight_g` only, so every band lookup routes through
   the assumed 62% yield even when a real dressed weight is known.
4. **OQ-22 is still undecided** — `bulk_price_cents_per_bird` is declared and
   read nowhere, while M4 prices bulk off the bands. Two live sources for one
   price. It moved out of M5b because M5b never computes a bulk net; it lands
   with whichever unit does.

**Correctness, found by this pass:**

5. **`SEED_OVERHEADS` still charges the retired $400.** `transport_other`,
   `amount_cents: 40000n`, PER_BIRD at 3,000 birds. Daniel retired this line on
   2026-09-12, so every `overhead_cost_cents`,
   `full_production_cost_cents` and day-1 cash lump is now overstated by
   13.3c/bird. **No golden fixture asserts an overhead-inclusive figure**
   (checked: fixtures assert feed cost, feed kg, FCR, cumulative feed, draw
   bags, hold cost, due dates, harvest day, gate window, flock size, and one
   refusal), so removing it is contained — but it must be a deliberate AD, not
   a quiet edit, because it changes the client's own historical baseline.
6. **Sales are not reconciled against live birds.** Verified 2026-09-12:
   `computeDecision` returns `ok` for a GATE order of **999,999 birds from a
   3,000-bird batch**, and `ok` for a bird count of **−500**. Revenue would be
   computed on birds that do not exist. This is the most direct gap against
   Daniel's robustness request, and it is entirely ours to close.
7. **`transport_cents_per_bird` is required in both delivery modes**, with no
   distinction between the run to the abattoir and a direct delivery to the
   buyer — which the client explicitly asked to be supported as an edge case.
   Only the abattoir FEE is gated on `delivery_mode`.
8. **`SalesOrder` has no offal fields.** `architecture.md` and AD-32 specify
   `offal_disposition` and `offal_value_cents` (null meaning "not valued", which
   is not zero); the engine type has neither, so a future deal that pays for
   offals cannot be compared against this one.
9. **`mortality_history` is a declared `MissingInputKey` emitted nowhere** —
   the same dead-slot shape as OQ-22, and worth either wiring or deleting.
10. **OQ-28 has no field yet** — `delivery_cents_per_tonne` on `Parameters` plus
    a derived `delivery_cents` beside `total_cents` on `DrawLiability`. Design
    chosen; blocked only on Daniel's timing answer (item 6 on his list).

**Already logged, still open, on the path to a usable answer:**

11. **OQ-25** — no cash balance in `EngineInput`, so M5b Task 9 cannot wire
    `decision.allocation`. Needs U6.
12. **OQ-26** — Cover Fast structurally cannot answer; needs M6's channel split.

**Was there anything behind these?** The pass was run twice. The second run
found items 5, 6, 8 and 9, and found that OQ-24 duplicated OQ-13 — i.e. the
first pass was itself incomplete. Items 5 and 6 were only visible by executing
the engine rather than reading it. **Treat any NEW client question arising on
this topic as evidence this pass missed something**, and check here first.

## Client questions outstanding — index, 2026-09-14

**How client questions work (standing rule, 2026-09-14):** a gap that needs
Daniel is logged here as an OQ with proposed question wording, and stops there.
The user handles every question to Daniel, out of band and in a format they
control. Nothing in this repository is a message to him.

Every client question still open, checked against this file on 2026-09-14 (OQ-38 to OQ-40 added 2026-09-15):

| OQ | The gap | Shapes |
|---|---|---|
| OQ-32 | Does one feed collection ever serve two batches? | U6 chunk 5 feed draws |
| OQ-33 | Are bulk runs booked ahead with a fixed weight? | U6 chunk 5 sales orders |
| OQ-34 | Is feed ever collected before the chicks arrive? | U6 chunk 5; `buildDays` throws on it |
| OQ-35 | What does a bird over 1.3 kg dressed pay? | Bulk value past the top band (AD-58), TD-4 #9 |
| OQ-36 | Does the bulk buyer cap how many birds he takes? | Whether bulk can absorb a whole flock |
| OQ-40 | How much cash does the farm hold when the planner starts? | Opening cash (AD-67); the allocation refuses without it |
| OQ-39 | How many birds a day does the gate take? | `gate_capacity_per_day`, seeded as assumed (U6 chunk 8) |
| OQ-38 | Which minimum cash reserve should the planner protect? | `reserve_floor_cents`, seeded as assumed (U6 chunk 8) |
| OQ-37 | Is transport the same per bird on a direct delivery? | Bulk net when `delivery_mode = DIRECT` |
| OQ-21 | Does the supplier ever charge for part of a bag? | Pricing a part-bag draw (refused today) |
| OQ-17 | ~20 paired live and dressed weights | The bulk harvest day, every dressed price |
| OQ-15 | Do labour and electricity scale at 30,000 birds? | Overheads at any scale but 3,000 |
| OQ-19 | Which day is labour paid, "when the batch is done"? | Overhead cash dates |
| OQ-8 | Was the 2,675 break-even worked at 85c a chick? | Fixture 6 |
| OQ-6 | Is day 40's 2,789 g a typo? | Curve past day 39 |
| OQ-5 | Who does daily capture, and who else sees money? | Which memberships are created (U6 chunk 6) |

---

## THE DANIEL LIST — bulk revenue, complete, 2026-09-12 (historical: six answered 2026-09-12; what is still open is in the index above)

### SEND FIRST, ALONE — the pricing question

> **Is the bulk deal priced per bird or per kg?** Your contract bands say
> $3.90 at 1.1 kg dressed, $3.80 at 1.2, $3.70 at 1.3. But your record shows
> one sale at $2.00/kg — $5.75 a bird at 2.875 kg. Which one governs a new
> sale?

**Why it goes alone and first.** It is the only question whose answer changes
the SHAPE of the calculation rather than a number inside it. Per-bird bands and
per-kg pricing are incompatible structures: one caps at $3.70 for a heavy bird,
the other pays more the heavier it gets. Until it is settled, `bulkNetCentsPerBird`
cannot be wired to the cash calendar, OQ-22 cannot be closed, and the bands may
be modelling a `band_overshoot_loss` that does not exist. Bundling it with
twelve other questions risks it being answered last or in passing.

**Then ask him which he prefers:** answer this one first and take the rest after,
or take all thirteen at once. **Do not send the bundle until he chooses.**

---

### THE REMAINING TWELVE — bundled, held until he chooses

**This is the whole of what only Daniel can answer on this topic.** Produced by
a full end-to-end trace of the bulk-revenue path on 2026-09-12, after two
earlier rounds each found a gap hiding behind the last. Every item was verified
against code or client files, not recalled. **Nothing further should be sent to
him about bulk revenue after this — if a new question appears, it means this
pass missed something and that is worth knowing.**

**Blocks a bulk number outright:**

| # | Question | Why it blocks | Ref |
|---|---|---|---|
| 1 | What does it cost to get one load of birds to the abattoir — per bird, or per truckload and how many birds fit? | `transport_cents_per_bird` is the last unknown term in gross − fee − transport | OQ-2 |
| 2 | The contract pays $3.90 at 1.1 kg dressed, $3.80 at 1.2, $3.70 at 1.3. What does it pay above 1.3 kg dressed? | `bandForDressedG` silently reuses the top band past 1.3 kg — an extrapolation past the contract's stated range | new |
| ~~3~~ | **MOVED — sent first and alone, see above.** | | |

**Changes the number materially:**

| # | Question | Why | Ref |
|---|---|---|---|
| 4 | Roughly 20 paired live/dressed weights, or your measured dressing percentage | Bulk price is banded on DRESSED weight; every bulk figure currently rests on an assumed 62% | OQ-17 |
| 5 | Two feed prices appear in your file — $32.50 a starter bag on the daily sheet, $31.60 on the feed account. Which is current? | 3-5% on the largest single cost; no cross-check exists | OQ-13 |
| 6 | Is the $40/tonne feed transport paid on collection, or on the same 30 days as the feed? | Changes the cash calendar, not just the total | OQ-28 |
| 7 | Do labour and electricity stay flat at 30,000 birds, or scale? | Measured at 3,000 only | OQ-15 |
| 8 | Does the bulk buyer cap how many birds he will take? | "Guaranteed outlet" with no stated ceiling; decides whether bulk can absorb a whole flock | new |
| 9 | Does the feed supplier ever invoice a part bag, or do you always collect whole 50 kg bags? | Feed cost feeds core credit and break-even | OQ-21 |
| 10 | Day 40 shows 2,789 g — a jump of +227 g against about 90 g/day. Typo or real? | Weight → dressed weight → band → price | OQ-6 |

**Smaller, but ask now rather than later:**

| # | Question | Ref |
|---|---|---|
| 11 | If you ever deliver straight to the buyer instead of the abattoir, is transport the same per bird? | new |
| 12 | When do you actually pay labour and electricity — per batch, monthly, or on some other date? | OQ-19 |
| 13 | What unit does the hatchery invoice chicks in — boxes of 100, or something else? | OQ-18 |

**Deliberately NOT on this list:** anything the engine can settle itself.
Everything in "for us to build" below is ours and Daniel is never asked about
it. Recording that boundary matters as much as the list — three of the gaps
found on 2026-09-12 had been sitting behind a client question that would never
have revealed them.

### OQ-13 · Which feed price set is current? ✅ ANSWERED 2026-09-12 — with a THIRD set
**Answer (Daniel, 2026-09-12):** **$30.60 starter, $29.60 grower, $28.60
finisher**, per 50 kg bag.

**Neither of the two sets we asked about.** We offered the Record sheet's
$32.50/$31.00/$30.00 or the Feed Account's $31.60/$29.60/$28.60. He gave a third.
His data supersedes our question's framing and is used as given — reconciling it
to our own options would mean arguing with the client about what he pays for
feed. **OQ-24 is closed by the same answer**; both workbook sets are historical.

**Two consequences, both in AD-52:**

1. **`price_per_kg_cents` could not hold it.** $30.60 over 50 kg is 61.2 cents a
   kg. Phase pricing is now per BAG, with `bag_kg`, and `costOfFeed` divides the
   bag price to the gram in one integer expression.
2. **Fixture 1 no longer reproduces his workbook**, and that is correct — the
   workbook is priced at what feed used to cost. Feed cost at day 41 drops from
   $8,079.81 to **$7,698.06**; fixture 7's hold cost from $3,200.71 to
   **$3,076.16**. The extraction check those fixtures provided is spent.

**Superseded reasoning below, kept because its lesson outlived the question.**

### OQ-13 (superseded) · Which feed price set is current? 🟠 BLOCKS NOTHING
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

### OQ-16 · Is the $400 "Other/Transport" the abattoir run? ✅ RETIRED 2026-09-12
**Resolution: RETIRED — the input is no longer part of the client's business
logic.** Daniel removed the $400 "Other Expenses/Transport" line. He did **not**
tell us what it was composed of.

**Record this precisely, because two wrong summaries are available and both
would be load-bearing:**

| Wrong summary | Why it misrepresents him |
|---|---|
| "Answered yes — it WAS the abattoir run" | He never said so. Recording it this way would let a future reader treat `transport_cents_per_bird` as already covered by a retired overhead, and under-charge bulk. |
| "Answered no — it was feed and chick collection" | He never said this either. It would license charging transport twice if the line ever came back, and it invents a composition for a number nobody analysed. |

**What is actually true:** the question asked how to split a line that no longer
exists. It is moot, not resolved. **No fact about transport composition was
established** — we know less about what the $400 was than the question assumed
we would by now, and that is fine, because nothing depends on it any more.

**What this DOES unblock.** The double-count risk is gone: there is no longer an
overhead line that might duplicate `transport_cents_per_bird`, so transport,
once we know its value, can be charged into bulk net cleanly. The formula
question OQ-16 existed to answer is closed by the removal of one of its terms.

**What this does NOT unblock — read this before declaring bulk net ready.**
Retiring a cost line is not the same as supplying a different cost's value.
**OQ-2's transport half is still unanswered**: nobody has told us what the run
to the abattoir costs. Setting it to `0n` because an unrelated overhead was
retired would be inventing the number, which is exactly what invariant 5
forbids. See OQ-2 and the blocked-work table.

**Superseded analysis below, kept because it is why the question was asked.**

**Status (before retirement):** Open, and a **hard precondition on the U5 task
that computes bulk net revenue**. **Affects:** whether bulk economics
double-counts transport.

`overhead_lines.transport_other` is the Final Report's $400.
`Parameters.transport_cents_per_bird` is the run to the abattoir, still null
pending OQ-2. The brief says "Do not double-count costs", and these two could
be the same truck.

**PREMISE CORRECTED 2026-09-11 — and it moves the odds toward a
double-count, not away.** This entry previously said the $400 sat on "a batch
sold at the gate". **It did not.** Read from the client workbook
(`RUNproduce Broiler Management .xlsx`):

- `Final Report`!C8 — "Other Expenses/Transport" = **400**, a hardcoded
  constant with no formula, alongside vaccine 42, electricity 140, labour 640.
- `Record`!row 43 is the **only** sale in the entire workbook: day 41, all
  3,000 birds, avg **2,875 g**, **8,625 kg at $2.00/kg = $17,250**. One
  transaction, whole flock, per-kg. Income runs 0 to 17,250 on that row and
  never moves again.

One lot, per-kg, below the gate's per-kg equivalent (~$2.43/kg at $4.30 for
a 1.77 kg bird) — that is a **contract/bulk** sale, not gate trade. So the
$400 sat on a batch sold **100% in bulk**, which makes it MORE likely to
already be the abattoir run, not less. $400 / 3,000 = **13.3c per bird**, a
plausible transport figure in its own right.

**This raises the stakes on the question rather than answering it.** If the
$400 is the abattoir run and we also charge `transport_cents_per_bird`, we
bill the same truck twice on every bulk batch.

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

### OQ-40 · How much cash does the farm hold when the planner starts? 🟡 OPEN
**Status:** open, never asked. **Raised:** 2026-09-15, from U6 chunk 8 (seed).
**Affects:** the opening cash balance (AD-67). Without an account opening, the
allocation refuses `'opening_cash'`. Cover Fast and Build Reserve refuse, and
Maximum Growth answers with the reserve floor unchecked.
**Proposed question:** *"On the day you start using the planner, how much cash
will the farm have available, bank and cash on hand together?"*
**Meanwhile:** Daniel's dev organisation has no cash account (chunk 8 D34), and
the refusal shows. No balance is seeded on his organisation. The synthetic
organisation has a labelled one.
**When answered:** one account opening, dated the day he gives. In production
it is entered on a settings screen on the day, not seeded from this answer.

### OQ-39 · How many birds a day does the gate actually take? 🟡 OPEN
**Status:** open, never asked as one figure. **Raised:** 2026-09-15, from U6
chunk 8. **Affects:** `gate_capacity_per_day`, a required parameter. It sets the
gate window, the max safe batch size and the gate/bulk split.
**What we have:** the brief says gate sales "run at 500-1,000 birds/day"
(`project-overview.md`). OQ-23's call says "7k birds on the gate", which is a
total over a harvest, not a rate. The fixtures use 750, the midpoint, and that
is ours.
**Proposed question:** *"On a normal harvest day, about how many birds do you
sell at the gate? Your brief says 500 to 1,000 a day. Is there one number in
that range you would plan around?"*
**Meanwhile:** 750, seeded as `assumed` and owned by this OQ (chunk 8 D33).
**If he gives a range with no single figure:** the parameter stays assumed. A
low/high pair would be a design change (the gate window reads one rate), logged
then.

### OQ-38 · Which minimum cash reserve should the planner protect? 🟡 OPEN
**Status:** open. The amount was left unanswered by OQ-3 (whose question asked
"how much reserve is enough"; the answer settled the objective, not the
amount). **Raised as its own OQ:** 2026-09-15, from U6 chunk 8.
**Affects:** `reserve_floor_cents`, a required parameter that AD-43's filter
reads. It decides which placements the allocation calls affordable.
**What we have:** the 30,000 brief makes the reserve a hard floor, selectable
at $5,000, $10,000, $15,000 or $20,000, with an explicit override path.
**Proposed question:** *"Your brief lists a minimum cash reserve of $5,000,
$10,000, $15,000 or $20,000. Which one should the planner never let the cash
fall below?"*
**Meanwhile:** $20,000, the highest option he listed, seeded as `assumed` and
owned by this OQ (chunk 8 D33). The highest option errs toward calling a
placement unaffordable, the cautious direction, as AD-55 chose for transport.
**Not zero:** zero means "no floor", which the brief rules out.
### OQ-37 · Is transport the same per bird on a direct delivery? 🟡 OPEN
**Status:** open, never answered. **Raised:** 2026-09-12 (Daniel list #11), logged
as an OQ 2026-09-14. **Affects:** bulk net when `delivery_mode = DIRECT`.
`bulkNetCentsPerBird` drops the abattoir fee on a direct delivery but charges
the same `transport_cents_per_bird` (`cash.test.ts`: "whether transport is the
SAME per bird is unanswered"; due-diligence item 7 above).
**Proposed question:** *"If you ever deliver birds straight to the buyer instead
of the abattoir, does transport cost the same per bird, more, or less?"*
**Meanwhile:** one transport rate for both modes, as built. **If different:** a
second parameter, `direct_transport_cents_per_bird`, nullable and refused when
null on a DIRECT order.

### OQ-36 · Does the bulk buyer cap how many birds he takes? 🟡 OPEN
**Status:** open, never answered. **Raised:** 2026-09-12 (Daniel list #8), logged
as an OQ 2026-09-14. **Affects:** the gate/bulk split. The brief calls bulk a
"guaranteed outlet" with no ceiling, and the allocation treats it as unbounded.
**Proposed question:** *"Is there a limit on how many birds the bulk buyer will
take from one batch, or in one week?"*
**Meanwhile:** no cap. **If capped:** a nullable `bulk_capacity` parameter that
bounds the split, beside `gate_capacity_per_day`.

### OQ-35 · What does a bird over 1.3 kg dressed pay? 🟡 OPEN
**Status:** open, never asked. **Raised:** 2026-09-12 as OQ-30's client half
(Daniel list #2). OQ-30 closed on our side by AD-58; this is what it left.
Logged as its own OQ 2026-09-14. **Affects:** bulk value past the top band,
blank from day 34 today; TD-4 #9 (whether "1.3 kg" is a floor or a range).
**Proposed question:** *"Your contract pays $3.90 at 1.1 kg dressed, $3.80 at
1.2 and $3.70 at 1.3. What does it pay for a bird over 1.3 kg dressed? And does
1.3 kg mean exactly 1.3, or anything from 1.30 to 1.39?"*
**Meanwhile:** planning and sales both refuse past the top band (AD-58). **When
answered:** both paths change together, since there is only one.

### OQ-34 · Is feed ever collected before the chicks arrive? 🟠 SHAPES U6
**Status:** open. **Raised:** 2026-09-14,
while drafting U6 chunk 5. **Affects:** `feed_draw_versions`, and today's engine.

`cash.ts` `buildDays` **throws** on any flow dated before placement. A draw
collected the day before the chicks come in books its delivery payment on the
collection date, so one true entry would take the whole calendar down. The
throw assumes such a flow was folded into `openingCents`. Under AD-67 that fold
covers `cash_transactions`, but not feed draws.
**Assumed for chunk 5:** never (answer a). A trigger rejects a draw before the
current placement date, which keeps the engine's precondition true. **If b or
c:** an engine change, decided then: pre-placement draws fold into opening
cash (AD-67), or the calendar starts earlier.
**Proposed question:** *"Do you ever collect starter feed before the chicks
arrive? (a) No, same day or after; (b) yes, a day or two before; (c) yes,
sometimes a week or more before."*

### OQ-33 · Are bulk runs booked ahead with a fixed weight? 🟠 SHAPES U6
**Status:** open. **Raised:** 2026-09-14, U6 D18 (AD-79).
**Affects:** `sales_order_versions`. `SalesOrder.avg_live_weight_g` is
non-null, and forward-dated orders reach the calendar by design.
**Assumed for chunk 5:** not booked with a fixed weight (a or b). One live-weight
column, entered as the expected weight and corrected (AD-75) once weighed.
**If c:** a contracted weight column separate from the weighed one, and an
engine decision on which prices the order.
**Proposed question:** *"When you sell a run to a bulk buyer, how far ahead is
it agreed? (a) Not ahead, arranged on the day or once weighed; (b) booked ahead
with a date and a number of birds, weight and money settled when weighed;
(c) booked ahead with a weight or weight range fixed in the deal."*

### OQ-32 · Does one feed collection ever serve two batches? 🟠 SHAPES U6
**Status:** open. **Raised:** 2026-09-14, U6 D17 (AD-78).
**Affects:** whether feed draws are one-to-one with a batch or need a collection
table plus a per-batch split. `EngineInput.draws` is per batch, and the
architecture sketch assumed a split (`feed_allocations`).
**Assumed for chunk 5:** no (answer a). **If b:** a collection table and a split,
where a split by bags can create part bags (OQ-21). **If c:** per-batch feed
cost has no recorded basis. That needs a new allocation rule, which is an
engine and client decision.
**Proposed question:** *"When one batch is still being sold and the next is
already placed, does one feed collection ever feed both? (a) No; (b) sometimes,
and I split the bags between them; (c) sometimes, and I don't track the split."*

### OQ-21 · A fractional-bag draw crashes the engine 🟠 CRASH FIXED — CLIENT HALF OPEN
**Status:** **The crash is fixed** (2026-09-11). The engine now refuses with a
typed `missing_input` keyed `feed_draw_bags`, naming the draw and its date,
instead of throwing a `RangeError`. `feed.ts` also carries a named guard for a
caller that skips the check, matching `cash.ts`'s precedent — it matters
because M5b's `projectCandidate` calls `computeFeedLiability` directly.
**The secondary `kg_discrepancy` float bug is fixed too:** `kgDiscrepancy()`
compares at gram resolution (invariant 2's own unit), so `0.07` bags against
`3.5` kg no longer reports a discrepancy that does not exist.

**What is still open is the CLIENT half, and only that:** whether a part bag
is real commerce to be priced or a capture-screen artefact to be rejected.
The fix deliberately answers neither — it refuses. Nothing rounds `bags`, and
no price is derived for a part bag. When Daniel answers, the refusal is
replaced by pricing (round the resulting cents up, as `costOfFeed` does) or by
a hard input-boundary rejection, and this entry closes.

**Originally raised and reproduced 2026-09-11.** **Raised:** 2026-09-11,
out of the M5a review session — but the defect is **pre-existing U3 scope**,
not M5a's. **Affects:** every `computeDecision()` call for a batch whose
entered draws carry a non-integer bag count. **This is ours, not Daniel's**,
though the shape of the fix needs one answer from him.

**The crash.** `feed.ts:75` prices an entered draw as
`BigInt(draw.bags) * draw.price_per_bag_cents`. `FeedDraw.bags` is typed
`number` with no integer constraint, and `BigInt()` throws on any fractional
value. Reproduced against a single 26.64-bag draw:

```
RangeError: The number 26.64 cannot be converted to a BigInt
            because it is not an integer
  at src/feed.ts:75:21
  at Module.computeFeedLiability src/feed.ts:66:44
```

**It is not hypothetical — it is sitting on his own figure.** 26.64 is
Daniel's own first-draw bag count (`Feed!C2 = Record!M16/50`, 3,000 birds),
and **fixture 5 already asserts it** as `first_draw_bags_to_day_14`. So the
engine computes 26.64 on the PLANNING half and crashes on the LIABILITY half
the moment that same number is entered as a real draw. The only reason CI is
green is that every fixture's entered draws happen to carry whole bags
(27, 40, 48, 52, 53) — an accident of the fixture set, not a property of the
code.

**Severity: it takes the whole decision down, not the feed block.** The
`RangeError` is uncaught and propagates out of `computeFeedLiability` →
`computeDecision`. No `missing_input`, no partial result, no explained value —
a stack trace instead of a decision. That is worse than any wrong number this
repo has argued over, because **nothing renders at all**.

**Scope: `feed.ts:75` is the only exposure.** Every other `BigInt()` in
`packages/engine/src` converts a value that is structurally an integer — bird
counts, integer grams, flock size — or rounds first (`harvest.ts:257`).
`bags` is the one client-entered field the client's own arithmetic produces
as a decimal.

**The question for Daniel:** *does the feed supplier ever invoice a part
bag — 26.64 bags at $32.50 — or does he always collect whole 50 kg bags and
26.64 is only what the sheet computes before he rounds to what he actually
carries away?*

**Why the answer changes the fix, not just the wording.**
- If a part bag is **real commerce**, the fix prices it: multiply out and
  round the resulting cents, matching `costOfFeed`'s round-up convention so
  a liability is never understated. Money stays `bigint` cents; only the
  conversion moves.
- If a part bag is a **spreadsheet artefact**, the fix rejects it at the
  input boundary with a typed error naming the field — because a 26.64 in
  the bags column then means the capture screen fed a `kg ÷ 50` into a field
  that wants what the supplier invoiced, and pricing it would launder a data
  error into a confident number.

**Rejected outright: silently rounding `bags`.** It changes the money owed
without telling anyone, in a direction nobody chose. Invariant 5 forbids it
whichever way it rounds.

**Not blocked on his answer.** One option — crash on nothing, return a typed
`MissingInput`/validation error naming `bags` — is strictly better than a
`RangeError` under either answer, and can land before he replies.

**Secondary, found in the same line and verified.** `feed.ts:78` sets
`kg_discrepancy` with float equality: `draw.kg !== draw.bags * KG_PER_BAG`.
`26.64 * 50` is exactly `1332`, so fixture 5's own number is safe — but
`bags * 50` is **not** exact in general for a 2dp bag count (`0.07 * 50`
gives `3.5000000000000004`), so some part-bag draws would report a
discrepancy that does not exist. Worth closing in the same change; it is a
wrong flag, not a crash, so it does not carry this issue's urgency.

**Why it did not stop the branch.** M5b consumes `feed.planned_draws` and
`feed.draws`; it does not change how a draw is priced, so the fix does not
collide with it. Deliberately logged rather than fixed in-session: it is a
U3 change with a client question attached, and folding it into an M5a merge
would put an unreviewed pricing decision inside a cash-calendar commit.

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

### OQ-2 · Abattoir fee and transport cost per bird ✅ ANSWERED 2026-09-12 — both halves
**Answer, completed:** the abattoir fee is **10 cents a bird** (2026-09-10) and
the run to the abattoir is **10 cents a bird** (2026-09-12). **20 cents a bird in
total, and they are two costs, not one** — see AD-55, which also records why
charging both was a judgement rather than a fact, which direction it errs in
(conservative: it understates bulk profitability), and where it will be caught
if wrong.

Bulk net is now computed and booked (AD-57). Both fields stay
required-and-nullable on `Parameters`, and a null still refuses: a value being
known is not the same as it being supplied.

**Still open and NOT answered here:** whether a DIRECT delivery to the buyer
costs the same per bird — question 11 on the Daniel list.

**Superseded detail below, kept for the reasoning.**

### OQ-2 (superseded) · Abattoir fee and transport cost per bird 🟠 HALF ANSWERED 2026-09-10
**Answer (Daniel):** the abattoir fee is **10 cents per bird in cash,
and the abattoir keeps the offals.**

**Transport is still unanswered.** He gave the abattoir fee; he did not
give the cost of the run to the abattoir. `transport_cents_per_bird`
stays `null` and the engine keeps returning `missing_input` for it, so
bulk net is still not computable. Do not read "OQ-2 answered" anywhere
and assume both halves landed — **the bulk recommendation remains
blocked**, now on transport alone.

**Re-confirmed 2026-09-12, against two events that each looked like they
closed it and did not.**

1. **OQ-16 was RETIRED, not answered.** The client removed the $400
   Other/Transport line. That removes the double-count RISK, so transport can
   now be charged cleanly — but removing one cost does not price a different
   one. `transport_cents_per_bird` is still `null`, and **it is not zero by
   default**: nobody has said the truck to the abattoir is free.
2. **The $40/tonne figure is FEED transport, not this.** Confirmed by the
   client 2026-09-12 as the cost of getting FEED delivered. It is real data and
   it is tracked as OQ-28 — it is not the abattoir run and must never be
   substituted for it.

**Verified by running it, not by reading:** with the abattoir fee supplied and
transport `null`, `computeDecision` on the client's own batch returns
`missing_input` keyed `transport_cents_per_bird`. With a hypothetical transport
value supplied, `projectCashCalendar` still throws — because bulk net was never
implemented (see OQ-16's retirement note and the `bulk_price` refusal). **Two
independent gaps, and answering this question closes only one of them.**

**The one-line question that closes this:** *"What does it cost you to get one
load of birds to the abattoir — per bird, or per truckload and how many birds
fit?"*

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

**OQ-2 closed 2026-09-12, so this is now ours to attempt.** Untested claim -
fixture 8 may still need a planning band schedule; verify by attempting to
write it before treating this as closed.

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

### OQ-18 · What unit does the hatchery invoice chicks in? ✅ ANSWERED 2026-09-12
**Answer (Daniel):** **per chick.** So `placement_step_birds` is **1** and
nothing rounds a recommendation — 8,437 birds is an order he can place.

**It cost something, and that cost is ours: OQ-29.** The enumeration grid is
sizes x 31 dates, so a stride of 1 multiplies the candidate count by the old
assumed 100 — `computeAllocation` goes from 0.26 s to 20.8 s at his realistic
5,000-bird ceiling. The fix is not to default the stride back to 100 (that puts
a search bound back inside a field carrying a client fact); see AD-53.

**Superseded framing below.**

### OQ-18 (superseded) · What unit does the hatchery invoice chicks in? 🟡
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

### OQ-23 · What actually caps a placement? ✅ ANSWERED 2026-09-11
**Answer (client, from the original requirements call):** **nothing in the
engine caps it — the operator types it in.**

> *"They are not placing 30k birds per cycle but the system should be adjust
> and be flexible for 30K so for that field they should put **any figure
> technically** but most realistic starting example would be **5K**, so the
> field should be dynamic and flexible for any per cycle figure in the system
> adjusts"*

**So:** `max_placement_birds` is a required `Parameters` field with **no
derived default and no hardcoded cap**. **5,000** is the realistic current
scale; **30,000** is the aspirational target the brief plans against
("Target placement: 30,000 DOCs", with ~5% planning mortality). Neither is a
ceiling the engine may assume — absent the field, `requirePlacementCeiling`
throws, exactly as the M5b plan specified.

**The same source independently confirms the conflation this question was
raised to name.** From the same call: *"they can **7k birds on the gate** but
for them to push aggressively to 15k they will be risk of pre harvest loss."*
Gate absorption (7k) and placement size (15k, 30k) are stated as different
quantities by the client himself, in one sentence. The gate-derived ceiling
was wrong for exactly the reason argued below.

**Consequence: M5b Task 8 is unblocked on the ceiling.** It remains blocked
for **bulk scoring** on OQ-2 transport and OQ-16 — verified in code on
2026-09-11, not assumed: a bulk-inclusive input returns `abattoir_fee`,
`transport_cents_per_bird` and `bulk_price`; supplying both OQ-2 values still
leaves `bulk_price`, because OQ-16 gates the formula independently. A
gate-only input returns no refusals and is scoreable today.

**Superseded framing below, kept for the reasoning.**

**Status (before the answer):** Open. **Raised:** 2026-09-11, from writing M5b's plan against the
real `projectCashCalendar` signature. **Affects:** the upper bound of the
allocation enumeration — i.e. the largest batch the optimiser is allowed to
consider at all.

**The plan had this wrong, and the error was a conflation rather than a
number.** It derived the enumeration's ceiling as
`gate_capacity_per_day × harvest-window days`. Under the settled flat $4.25
gate price the window is **one day wide** (U4), so that caps a candidate at
~750 birds — against a spec that imagined sizes into the tens of thousands.

**Gate capacity does not cap batch size, and the client's own brief says so.**
It caps how fast a batch converts to same-day cash:

> *"Use cash sales to finance the cycle. Use the bulk buyer to absorb volume."*
> *"We do NOT want to sell everything live if the market cannot absorb it."*

Bulk takes what the gate cannot. So there are **two different quantities that
share a formula**, and the plan used one as the other:

| Quantity | Gate-derived? | What it is |
|---|---|---|
| **Max safe batch size** | **Yes** | An **output**. CONTEXT.md: "largest placement that gate capacity can clear before pre-harvest mortality eats the gain". project-overview.md goal 4 asks for it. Correct as it stands. |
| **Enumeration ceiling** | **No** | The largest batch the optimiser may *consider*. A bulk-inclusive batch exceeds gate absorption **by design**. |

**The 30,000 range is real, not framing we inherited.** Checked against the
client artifacts rather than assumed: the second client document is the
**30,000-broiler brief** itself; **OQ-15** records that that brief carries its
own per-bird overhead assumption at that scale (~59c/bird against our measured
41c) — a document that has costed itself at a scale is planning at it, not
gesturing at it; and project-overview.md goal 5 states it as a product
requirement: *"Work at any batch size. 3,000 to 30,000. Nothing hardcoded."*

**The ask:** *"What actually limits how many chicks you can place at once —
house space, the hatchery's supply, or the cash to pay for them? And what is
that number today?"*

**Why we cannot derive it.** `gate_capacity_per_day` is the **only** capacity
field in `Parameters`. House and brooding capacity, hatchery supply, and any
placement ceiling of his own are simply not inputs we hold. Picking 30,000
because the brief's title says 30,000 would be inventing a constraint out of a
document heading.

**The consequence that matters more than the number.** The wrong ceiling was
**masking how blocked M5b actually is.** A gate-derived cap kept every
candidate gate-only, and gate-only candidates are scoreable today. Lift it to
the real range and most candidates become **bulk-inclusive**, which means Cover
Fast and Build Reserve return `missing_input` for them until **OQ-2's transport
half** and **OQ-16** land. M5b's scoreable region is a thin gate-only sliver,
and the old cap made the engine look more capable than it is.

**Handling until answered:** M5b Task 8 does not start. **Tasks 1–7 are built
and merged-ready** (2026-09-11) — none of them reads the ceiling.

**Task 9 is blocked too, and the plan said otherwise.** Corrected 2026-09-11
on discovery during execution. The plan header and this entry both claimed
`Tasks 1-7 and 9 are unaffected`; Task 9's own **Interfaces** block says
`Consumes: computeAllocation (Task 8)`, and the Interfaces block is the
accurate one. Task 9 replaces the `NotImplementedError` getter with a call to
`computeAllocation` — Task 8's function, gated on `requirePlacementCeiling`,
which throws until this question is answered. Building it would swap a
`NotImplementedError` for a ceiling `Error`, which is strictly worse.
`classifyFixture` (tests/golden/_shared.ts) holds a fixture **only** on
`NotImplementedError` and classifies every other throw as `fail`. No golden
fixture targets `decision.allocation` today, so nothing would break there
yet — but `decision.test.ts` **does** assert that reading `allocation`
throws `NotImplementedError` ("still holds the module U5 has not built"), and
that test would fail on the ceiling throw while the getter is no more usable
than before. Task 9 lands with Task 8, not before it.

### OQ-30 · One band schedule, two behaviours past its top band ✅ CLOSED 2026-09-12 — by AD-58
**Closed the day after it was opened, by making the PLANNING path refuse too.**
`bandForDressedG` now returns null above the top band as well as below it, so M4
refuses exactly where a real invoice refuses. Consistency with the sales path was
chosen over the convenience of the planning path — the convenience being that a
forecast would rather say something than nothing.

**The deciding argument was direction, not tidiness.** The schedule pays LESS as
the bird gets heavier, so reusing the top band was optimistic — and on Daniel's
own curve it kicked in at **day 34**, inside the hold-vs-sell window. It made
holding to day 35 look like it preserved $462.50 of bulk value the contract never
promised.

**Cost:** `hold_cost_to_day['35']`'s bulk figures are now null. The gate half
still answers. **The client question survives**: what a bird over 1.3 kg dressed
actually pays is question 2 on the Daniel list, unasked. When he answers, both
paths change together, because there is only one of them now.

**Superseded framing below.**

### OQ-30 (superseded) · One band schedule, two behaviours past its top band 🟠 OURS, PLUS ONE CLIENT QUESTION
**Status:** Open, deliberate, logged rather than quietly reconciled.
**Raised:** 2026-09-12, implementing AD-57.

The bulk bands stop at 1.3 kg dressed. Above that the engine now does two
different things:

| Path | Above 1.3 kg dressed | |
|---|---|---|
| `bandForDressedG` (M4 harvest planning) | silently reuses the top band, $3.70 | unchanged |
| `bulkContractProblems` (a real sale, AD-57) | refuses with `bulk_price` | new |

**Each is defensible in its own context and the pair is not obviously so.** A
forecast has to produce a number or say nothing at all about a day; an invoice
has a real carcass and a real contract, and the contract is silent. But a reader
finding both will reasonably ask which one the engine believes.

**The client half:** *what does the contract pay for a bird over 1.3 kg
dressed?* — question 2 on the Daniel list, unanswered. It is NOT in the six he
answered on 2026-09-12. Once answered, both paths collapse to one rule.

**Why it matters more than it looks.** The schedule pays LESS as the bird gets
heavier, so reusing the top band is an extrapolation in the OPTIMISTIC direction
— it assumes an over-held bird still fetches $3.70 when the trend of the
schedule says it would fetch less. That is the direction this engine is not
allowed to err in, and it currently does err in it on the planning path.

**Do not fix by making the sales path extrapolate too.** That propagates the
optimistic guess into real money.

### OQ-29 · A 1-bird placement step makes the enumeration 80x more expensive 🟠 OURS, NOT DANIEL'S
**Status:** Open, measured, not yet fixed. **Raised:** 2026-09-12, implementing
AD-53. **Affects:** `computeAllocation` latency at Daniel's real scale.
**Nobody asks Daniel about this** — his answer was correct and complete; the
cost is entirely on our side of the line.

OQ-18's answer (the hatchery invoices per chick) makes the placement step 1.
The grid is sizes x 31 dates, so the candidate count scales inversely with the
stride. Measured, not estimated:

| Ceiling | Stride | Candidates | `computeAllocation` |
|---|---|---|---|
| 5,000 | 100 | 1,550 | 0.26 s |
| 5,000 | 25 | 6,200 | 0.80 s |
| 5,000 | **1** | **155,000** | **20.8 s** |
| 30,000 | 1 | 930,000 | ~2 min, extrapolated |

**The fix is NOT to default the stride back to 100.** See AD-53: that puts a
search bound back inside a field that now carries a client fact, which is the
OQ-22 shape — two meanings, one name, and the wrong one silently winning.

**Recommended approach, not yet built: coarse-then-fine.** Sweep the grid at a
stride, then re-enumerate at 1 bird across a window of one stride either side of
the coarse winner, for the winning date and any date tied with it. Cost is
roughly the coarse sweep plus a few hundred candidates. **It is a heuristic and
must be reported as one** — scoring across size is not proven unimodal, so the
refinement finds the best size within one stride of the coarse winner, not the
global best. That fact belongs on the result, in the shape `tied_candidates`
already uses, rather than in a comment.

**It blocks nothing TODAY and it is a hard blocker on U9.** Both are true and
the second is the one to act on. `computeAllocation` is reachable only via M5b
Task 9 (blocked on OQ-25), so nothing ships at 20 s right now — but **U9 is the
screen where Daniel types a batch and presses a button**, and 20.8 s at his real
scale, ~2 min at 30,000, is not a slow screen. It is a screen he will assume has
crashed.

### This must be designed, not noted

**U9 does not start without a chosen answer to this.** "Consider performance" in
a U9 plan does not clear this entry. Three candidates, none yet chosen, each with
a real cost:

| Option | What it does | What it costs |
|---|---|---|
| **A · Coarse-then-fine** | Sweep at a stride, then re-enumerate at 1 bird within one stride of the coarse winner, for the winning date and any date tied with it | **A heuristic.** Scoring across size is not proven unimodal, so it finds the best size within one stride of the coarse winner, not the global best. **That must be reported on the result**, in the shape `tied_candidates` already uses — never implied to be exhaustive |
| **B · Incremental / memoised scoring** | The handoff is already memoised per DATE. Most of the per-candidate cost is a full cash projection that differs from its neighbour by one bird | Real work, and the honest one: it makes the exact answer cheap rather than approximating it. Unknown until someone profiles where the 20.8 s actually goes |
| **C · Coarse default, fine on request** | Default the UI to a 100-bird stride and offer "refine" | **Pushes the trade onto Daniel**, who has no basis to choose. And a 100-bird default silently reintroduces exactly what AD-53 removed — a search bound wearing a client fact's name |

**Recommended starting point: profile before choosing.** Nobody has measured
where the 20.8 s goes; B may be cheap and exact, which would make A's heuristic
unnecessary. **Do not pick A because it is the easiest to describe.**

**Whatever is chosen, one rule holds:** if the search stops being exhaustive, the
result says so. A recommendation that is "the best of what we looked at" must not
be rendered as "the best" — the same rule AD-43 applies to a null and AD-44 to a
tie.

### OQ-28 · Feed transport is $40/tonne ✅ ANSWERED AND BUILT 2026-09-12
**Answer (Daniel):** paid **on the spot when the feed is collected** — not on
the feed's 30-day terms. Built as AD-54: `delivery_cents_per_tonne` on
`Parameters` (seeded at his confirmed $40), `delivery_cents` on
`DrawLiability` BESIDE `total_cents`, `total_delivery_cents` on
`FeedLiability`, and a `FEED_DELIVERY_PAYMENT` flow on the collection date.

The deferred sub-question — whether planned draws carry delivery — is decided:
**they do.** Leaving it off understates the projected trough by up to $529 a
cycle, and the trough is what AD-43's reserve-floor filter reads.

**Superseded design note below.**

### OQ-28 (superseded) · Feed transport is $40/tonne and the engine has nowhere to put it 🟠 DESIGN
**Status:** **Value confirmed, design undecided, nothing wired.**
**Confirmed by the client:** 2026-09-12 — **$40 per tonne**, a real feed
transport cost. **Affects:** the true cost of feed, and therefore core credit,
break-even and every allocation scalar derived from them.

**This is NOT the OQ-16 answer, and must never be recorded as one.** OQ-16 was
about the $400 Other/Transport line and was RETIRED without its composition
ever being established. This is separate, new, and about FEED delivery — not
the run to the abattoir (that is OQ-2's transport half, still open). Three
different transport costs have now been in play in this project; conflating any
two of them produces a double-count or a hole.

| Cost | Status | Field |
|---|---|---|
| Feed delivery | **$40/tonne, confirmed 2026-09-12** | none yet — this entry |
| Run to the abattoir | unanswered (OQ-2) | `transport_cents_per_bird` |
| The $400 "Other/Transport" overhead | retired 2026-09-12 (OQ-16) | was `overhead_lines.transport_other` |

**Why it has nowhere to go.** Nothing in the engine separates feed DELIVERY cost
from feed PRICE. `PhasePricing.price_per_kg_cents` is a single blended rate, and
`FeedDraw.price_per_bag_cents` is what the supplier invoiced per bag. Neither
has a delivery component, and there is no field for one.

**The design question, unresolved:** does $40/tonne apply **per draw**, **per
tonne collected**, or does it **fold into the existing feed liability**? These
are not notational variants — they charge different amounts in different months
and they interact differently with `planned_draws`. Written up with a
recommendation in `progress-tracker.md`; **nothing is implemented until that is
chosen**, because guessing wrong here silently moves every feed number.

**Do not fold it into `price_per_kg_cents` as a convenience.** That would bury a
separately-confirmed, separately-variable cost inside a rate the client reads as
"what feed costs", and make the two impossible to tell apart later — the shape
of KB-3 and of OQ-24's two-prices problem.

**Related:** [[OQ-24]] — the workbook already carries two different feed prices
($29.60/bag in `Feed Account` vs $32.50 implied by `Record`). Whichever is the
real invoiced price, delivery is a THIRD component and the two questions should
be answered together.

### OQ-27 · A whole module was unreachable and every test passed ✅ CLOSED 2026-09-11
**Status:** Closed by a permanent test the same day it was found.
**Raised:** 2026-09-11, finishing M5b. **This was ours, not Daniel's.**

**What happened.** `allocation.ts` — nine exported functions, eight tasks, 35
passing tests — was never re-exported from `index.ts`. `computeAllocation` was
correct and invisible from the package's only entry point. Nothing failed,
because every test imports `../src/allocation.js` directly.

**The generalisable part:** a test suite that reaches the code by a different
route than the consumer cannot see anything wrong with the route it does not
take. "Tests pass" means the logic is right *when you can call it*.

**Closed by `tests/engine-surface.test.ts`**, which reads `src/` and fails if
any module exports a value `index.ts` does not re-export — written against the
source, so there is no list to remember to update. Verified to fail on an
injected unexported function, not merely written after the fix. Deliberately
internal exports go on an `INTERNAL_CROSS_MODULE` allowlist with their reason,
and a second test fails if an allowlisted name stops existing.

**The audit answered "was this a one-off?" rather than assuming.** Every engine
module was checked. Exactly one other export was unreachable —
`costing.costOfFeed`, deliberate (`cash.ts` reuses it so feed rounds
identically in both), now allowlisted. So: nearly a one-off, and worth
confirming. Written up in `code-standards.md` under Testing.

### OQ-31 · Build Reserve recommended a 1-bird batch 🔴 INTERNAL — PINNED NULL 2026-09-14
**Status:** Open, **pinned null by AD-59**. **Raised:** 2026-09-14, by the
pre-merge review of `u5-m5b-allocation-enumeration`.
**Affects:** a second of the three headline modes. **Ours, not Daniel's.**

**The finding, reproduced.** Running batch sells 2,900 birds at the gate, floor
out of reach, ceiling 300, step 1. Build Reserve's winner was **"place 1 bird on
2026-03-22"**, closing at **−$507.85**, with 31 dates tied. `place_nothing`
closed at **+$275.96**. The recommendation was strictly worse than not placing.

**Same root cause as OQ-26.** A candidate carries no forecast sales
(`candidateInput` empties `sales`), so its closing balance is the handoff minus
its own costs, and costs only grow with size. The smallest batch always wins.

**Why it is worse than OQ-26, and why it is now null.** Cover Fast failed
honestly: null. Build Reserve failed confidently: a real-looking winner. That is
the wrong number invariant 5 forbids, and an existing test pinned it as
acceptable. AD-59 sets `build_reserve_cents` to null for every candidate, so
`pickWinner('BUILD_RESERVE')` returns null exactly as Cover Fast does. The
closing balance stays on the candidate's `calendar`.

**What closing it needs.** The same thing as OQ-26: M6's forecast of a
candidate's own sales. **Do not close it by comparing against `place_nothing`**
— that would make "place nothing" Build Reserve's answer every time, which is the
same artefact read from the other side.

**U9 is bound on it** — `ui-context.md`'s null-state rule now covers Build
Reserve as well as Cover Fast. Only Maximum Growth answers until M6.

### OQ-26 · Cover Fast structurally cannot answer 🔴 INTERNAL
**Status:** Open, **pinned by a test rather than left to be discovered**.
**Raised:** 2026-09-11, from reviewing M5b's own output after Task 8.
**Affects:** one of the three headline modes — a third of the product's
decision surface. **This is ours, not Daniel's.**

**The finding.** `pickWinner('COVER_FAST', ...)` returns `null` for every
realistic input, including one where the running batch sells 2,900 birds at the
gate for real cash. Verified by running it, not by reading the code.

**It is structural, not a bug in the scalar.** Two design facts combine, and
each is individually correct:

1. **`candidateInput` empties `sales`** (Task 4). A candidate has no sales
   history, and inheriting the running batch's would replay it. M5b forecasts
   no sales for a hypothetical batch — nothing in the unit does.
2. **The running batch's receipts do not fill the gap.** Anything it settles
   before the candidate's placement collapses into `openingCents`
   (`handoffAtPlacement`, Task 3) — correctly, or it would be double-counted.
   Only receipts landing ON or AFTER the placement date ride along, and by then
   a batch harvested weeks earlier has usually been paid.

So `day.in_cents` is zero across a candidate's whole horizon, cumulative
receipts never reach `core_credit_cents`, and the scalar never fires.

**Why it is logged rather than quietly accepted.** The output is *honest* —
`null` says "could not determine", not a fabricated number, so invariant 5 is
intact. The risk is the **reading**: a console showing Cover Fast with no
recommendation invites "no candidate covers fast", which is a different and
false claim. An honest blank that is reliably misread is still a reporting
defect.

**What closing it needs.** A forecast of the candidate's OWN sales — how many
birds it would sell, when, through which channel. That is a real modelling
decision (it needs the gate/bulk split M6 exists to make), not a patch to the
scalar. Until then Cover Fast should be presented as unavailable rather than as
having no answer.

**U9 is already bound on this, so it cannot be rediscovered as a UX bug.**
`ui-context.md` now carries a required rendering rule: Cover Fast's null must
render as "not enough information yet — we cannot project this batch's own
sales", or name OQ-26 directly, and never as a blank, a dash, a zero or an empty
card. An empty Cover Fast panel reads to a farm owner as *"there is no way to
cover my costs"* — a financial verdict, arrived at by accident, from a mode that
never ran.

**Do NOT close it by lowering the bar.** Scoring against something cheaper to
compute — days to first receipt, or the running batch's receipts alone — would
produce a number that ranks, and a ranking built on the wrong quantity is worse
than a blank. Same reasoning as AD-43's refusal to sentinel a null.

### OQ-25 · The engine has no cash balance, and M5b needs one 🔴 BLOCKS M5b TASK 9
**Status:** Open. **Raised:** 2026-09-11, from executing M5b Task 9.
**Affects:** whether `decision.allocation` can be wired at all.
**This is ours, not Daniel's** — it is a decision about what the engine is
entitled to assume, not a question he can answer.

**The defect in the plan.** Task 9's getter passes
`input.parameters.reserve_floor_cents` as `computeAllocation`'s `openingCents`.
Those are **different quantities**:

| Quantity | What it is |
|---|---|
| `openingCents` | The cash the business actually HAS on the placement date. Every candidate's projection starts here. |
| `reserve_floor_cents` | The minimum it must KEEP. A constraint the running balance is tested against. |

Feeding the floor in as the balance starts every projection from a number that
was never a balance, and it does so *silently* — the arithmetic all works, the
types all match, and every figure downstream is wrong by the size of the floor.

**And there is nothing correct to pass instead.** Verified 2026-09-11:
`EngineInput` and `Parameters` carry **no** cash balance field
(`opening_cash`, `cash_balance`, `opening_balance` — none exist). The data is
in the architecture as `cash_accounts.opening_balance_cents`, but that is
**U6**, which is not built and which the build order says not to reorder.

**`0n` is not the safe default it looks like.** It asserts the client has no
money. That is a fabricated fact, and it is not even conservative in a useful
direction: it makes every candidate look unaffordable against a positive
reserve floor, so the optimiser would return "nothing is affordable" for
structural reasons rather than financial ones — a confident wrong answer
dressed as prudence.

**Three options, none chosen:**

1. **Add `opening_cash_cents` to `Parameters` as a required-on-use field**,
   and have `decision.allocation` return a typed refusal naming it when absent.
   Consistent with how `gate_price` and `max_placement_birds` already behave.
   Costs: `AllocationResult` needs a whole-result refusal shape, which it does
   not have — today only individual modes can refuse.
2. **Leave the getter throwing `NotImplementedError` until U6 supplies a
   balance.** Zero new surface, honest, and keeps the golden-fixture hold
   mechanism working (`classifyFixture` holds only on that exact type). Costs:
   M5b ships without its public entry point, and `computeAllocation` stays
   reachable only by direct call.
3. **Make `openingCents` an explicit argument to `computeDecision`.** Pushes
   the decision to the caller, where the balance actually lives. Costs: changes
   the engine's only public signature, which every fixture and consumer uses.

**Recommendation: option 2 until U6.** It is the only one that adds no new
guess and no new API surface, and it preserves the CI property that a fixture
targeting `decision.allocation` stays *held* rather than failing. Options 1 and
3 are both reasonable once there is a real balance to carry; picking between
them before U6 exists is deciding in the dark.

### OQ-24 · ~~The workbook carries TWO feed prices~~ 🔁 DUPLICATE OF OQ-13
**Closed as a duplicate 2026-09-12**, found by the full bulk-path trace.
**OQ-13 already covers this and covers it better** — it records that the
Record-vs-Feed-Account split is KB-8, that reconciling to the Final Report is
circular (`Final!C4 = Record!N93`, a re-presentation not a cross-check), and
that only Daniel can settle it. The brief adds a third statement of the same
prices ($31.60 / $29.60 / $28.60 per bag) which AGREES with the Feed Account,
so it is two sets and not three. Folded into OQ-13; ask it there, once.

**Original entry below, superseded.**

### OQ-24 · The workbook carries TWO feed prices ✅ CLOSED 2026-09-12 — both are historical
Asked and answered with OQ-13: Daniel's current prices are **$30.60 / $29.60 /
$28.60 a bag**, a THIRD set. Neither workbook set is current, so the
contradiction is no longer a question about which one to believe. See AD-52.

**Superseded framing below.**

### OQ-24 (superseded) · The workbook carries TWO feed prices 🟡 NOT YET ASKED
**Status:** Open, **deliberately not sent to Daniel yet** (2026-09-11) — it
blocks nothing currently in progress, and two more urgent questions (OQ-2
transport, OQ-16) are in front of him. Ask it when those land, or sooner if
feed costing comes under review. **Raised:** 2026-09-11, from reading
`RUNproduce Broiler Management .xlsx` while checking OQ-16.
**Affects:** every feed liability figure the engine produces.

**The discrepancy.** The client's own workbook prices feed two different ways:

| Source | Price | Per kg |
|---|---|---|
| `Feed Account`!D — "Est. Cost" per bag | **$29.60** | $0.592 |
| `Record`!F — cost of feed per kg | $0.65 starter, $0.60-0.62 grower/finisher | **$0.65** = **$32.50**/bag |

**The engine follows `Record`** — `SEED_BREED_CURVE`'s phase prices are the
per-kg figures, and fixture 1's $8,079.81 comes straight from `Record`!N. So
if the supplier actually invoices **$29.60**, every feed liability we report is
**overstated by roughly 9%**, in the pessimistic direction.

**Why it is not obviously a defect.** The column is headed **"Est. Cost"** —
an estimate, possibly stale, possibly a different (older or bulk-discounted)
supplier price. `Record`!F is what he actually costs consumption at. Both
readings are plausible and we cannot pick between them from the file.

**The ask:** *"Your feed account sheet has bags at $29.60 but your daily record
costs feed at $0.65/kg, which works out to $32.50 a bag — which one does the
supplier actually invoice you?"*

**Handling until answered:** unchanged. The engine keeps using `Record`'s
per-kg prices, which are the client's own measured figures and the ones every
golden fixture was built from. **Nothing is switched to $29.60 on a guess** —
that would move every feed number in the system on an inference from a column
header. Related: [[OQ-21]], which is the other thing `Feed Account` raises.

### OQ-22 · `bulk_price_cents_per_bird` is declared and never read ✅ CLOSED 2026-09-12 — by deletion
**Closed by AD-57, and by deleting the field rather than ranking the two
sources.** Daniel's answer to how bulk is priced — **"depends on the buyer"** —
moved the contract onto `SalesOrder`, where `pricing_basis` is now
`PER_BIRD | PER_KG | BANDED` with the buyer's own `bands`. Once the contract
belongs to the order, a per-batch flat bulk price has nothing left to mean.

`parameters.bulk_bands` SURVIVES with a narrowed job: the PLANNING default for
a bulk sale that has no buyer yet, which M4 needs and an invoice must never
borrow. That distinction is now enforced — a BANDED order carrying no schedule
refuses rather than falling back to it.

**Superseded framing below.**

### OQ-22 (superseded) · `bulk_price_cents_per_bird` is declared and never read 🟡 INTERNAL
**Status:** Open, documented in place, **behaviour deliberately unchanged**.
**Raised:** 2026-09-11, from M4's pre-merge code review. **Affects:** whether a
caller setting a bulk price gets the price they set. **This is ours, not
Daniel's.**

**The defect.** `Parameters.bulk_price_cents_per_bird` appears in `types.ts` and
**nowhere else in `packages/engine/src`**. M4 prices bulk from the contract's
dressed-weight bands (`bulk_bands` / `SEED_BULK_BANDS`) instead. Setting the
field to `900n` changes no output; setting it to `null` still produces a priced
bulk figure. Every fixture carries `"390"` in it, which is the lowest band's
price — so the two agree today by coincidence of seeding, not by construction.

**Why it was not "fixed" in the review fix wave.** Honouring the field means
deciding which of two sources wins for a bulk price, and that is precisely
M5b's bulk-net question — blocked on OQ-2's transport half and OQ-16. Picking a
winner now would answer a blocked question by implementation accident, in a
commit whose purpose was closing review findings. Deleting the field would
equally pre-empt M5b, which may well want it.

**What was done instead.** The field carries a doc comment saying, in the type
itself, that the engine does not read it, that bands are the live source, and
that it is reserved for M5b. A reader can no longer set it and reasonably
expect it to matter.

**Why it is logged rather than shrugged off.** Two live sources for one price
is the exact shape of **KB-3**, the client-spreadsheet bug we diverge from by
name. Ours is currently the benign version — one source is inert — and the way
that stops being benign is someone wiring the second one up without noticing
the first. **M5b must close this explicitly**, either by making bands the sole
source or by defining the precedence, and not leave both live.

### OQ-20 · A planned draw and a real one are matched by exact date 🟡 INTERNAL
**Status:** Open, known limitation, shipped deliberately. **Raised:** 2026-09-11,
from M5a's final code review. **Affects:** whether a cash calendar can
double-count one feed bill. **This is ours, not Daniel's** — no client answer
changes it.

**The defect.** `cash.ts` books `feed.planned_draws` so the calendar carries
upcoming feed obligations (without them it flattered the minimum balance by
thousands). To avoid booking a draw twice, it skips a planned draw whose
`collection_date` matches a real entered draw's. That match is **exact**, so a
real collection taken even one day off the idealised schedule fails to match and
**both** are booked.

**It is worse than one bill.** `feed.ts` chains each planned collection date off
the **previous planned** date, not off the real one. So a single off-schedule
collection desynchronises every planned entry after it, not just its own.

**Why it shipped anyway.**
- The error is in the **conservative** direction — the projection reads too
  pessimistic, never too flattering. That is the direction this engine is
  required to err in.
- It is **visible in the calendar itself**: the duplicated span shows both a
  `FEED_DRAW_PAYMENT` and a `PLANNED_FEED_DRAW_PAYMENT` in the same window, so it
  is auditable rather than silent.
- Closing it properly needs **`feed.ts`** to carry a link between planned and
  actual draws, which was outside M5a's scope.

**The fix when it is taken.** Either filter `planned_draws` against actual
collections at the source in `feed.ts`, or give `PlannedDraw` enough metadata for
a consumer to dedup robustly — a `matches_draws_through` cutoff, or a sequence
link to the `DrawLiability` it was superseded by. Re-chaining the planned
schedule off the last **real** collection date would fix the desynchronisation
half at the same time.

**Rejected, and why it matters that it was rejected.** The review suggested
matching within a ±3-day window. Declined: picking a tolerance is a judgement
with its own failure mode — too wide and it matches the wrong planned draw to
the wrong real one, which is a silent wrong number rather than a visible double
count. Inventing that threshold with nothing to calibrate it against is what
invariant 5 forbids. A visible over-count beats an invisible mis-match.

### OQ-19 · When does the client actually pay overheads? 🟠 NARROWED 2026-09-12, still open
**Answer (Daniel, partial):** *"labour when the batch is done, other expenses we
pay as when they arise."* Built as AD-56 — vaccines on day 1, labour on harvest
completion, electricity split across the months the batch spans.

**Still open, and the calendar still says `overhead_timing: 'assumed'`.** He
gave CADENCES, not DATES. "When the batch is done" does not say which day that
is; the calendar dates it against the first day the curve reaches the slaughter
target, which is ours and assumed. The question narrows from "we have no idea
when he pays" to "we know the cadence, not the day".

**The shape change is not cosmetic.** Day-1 overhead outflow on his own batch
drops from $822.00 to $145.87 with $640 moving to day 31. That materially
flattens the early-cycle trough — exactly what this entry predicted — and the
trough is what M5b's reserve-floor filter reads, so it changes which candidates
are judged affordable.

**Superseded framing below.**

### OQ-19 (superseded) · When does the client actually pay overheads? 🟡
**Status:** Open, assumed default. **Raised:** 2026-09-10, from M5a.
**Affects:** the shape of the cash calendar's early-cycle trough, and
therefore which candidates M5b's reserve-floor filter judges affordable.

`computeCosting()` supplies overhead amounts and no dates, because the
client books them per batch in his Final Report rather than per day. The
cash calendar needs a date for every outflow, so it charges all four
lines — vaccine $42, electricity and heating $140, labour $640,
Other/Transport $400, **$1,222.00** at his 3,000-bird scale — as a lump
on the **placement** date, and marks the calendar
`overhead_timing: 'assumed'`.

**The ask:** *when do you actually pay labour and electricity — monthly,
weekly, or at the end of a batch?*

**Why it matters.** Labour is almost certainly monthly, and a monthly
schedule would **flatten the early-cycle cash trough materially** rather
than digging the whole $1,222 on day 1. The reserve floor is what
M5b's filter tests every candidate's lowest projected balance against,
so the shape of this assumption changes which candidates are judged
affordable.

**A timing assumption, not a fabricated amount.** The four figures are
his own, measured, straight off the Final Report. Measured amounts do
not make their timing measured — the dates are ours, assumed, and
`overhead_timing` says so.

**Handling until answered:** all four lines land on the placement date.
**Does not block M5b** — the alternative, spreading the `PER_BATCH`
lines with `Money.split`, is a contained change if his answer warrants
it.

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

**Also affects U6 chunk 6 (2026-09-14):** which memberships the production seed
creates. The schema builds `OWNER`, `MANAGER` and `WORKER` as `architecture.md`
specifies either way; a WORKER sees no money (D22).
**Proposed question:** *"Who will enter the daily records: you, or someone on
the farm? And apart from you, does anyone need to see prices, costs or the cash
position, for example a farm manager?"*
**Meanwhile:** Daniel is the only OWNER; no MANAGER or WORKER is seeded in
production until answered. The role matrix's delegation rows (MANAGER reads
settings and places batches; WORKER reads no curve) are U6 defaults (AD-86); the
answer may call for per-org overrides.

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

### TD-4 · Pre-merge review of M5b, 2026-09-14 — minors deferred, not dismissed 🟡
The review of `u5-m5b-allocation-enumeration` raised 13 findings. Findings 1-5
are fixed (AD-59 / OQ-31, the flow-covering horizon, invariant 16 from real
sales, the null-fee guard, gate-order refusal), as are 6, 7 and 11. These remain:

| # | Finding | Why deferred |
|---|---|---|
| 8 | ✅ **Fixed 2026-09-14 as U6's opening task** (`refusals.ts`, AD-60). Was: refusals are spread across `missingInputsFor` (index.ts), `cashFlowsMissingInputs` and `salesMissingInputs`, and have drifted: a BANDED bulk order with no bands gives `computeDecision → ok`. `missingInputsFor` is also exported from index.ts only for a test | Harmless while the decision carries no cash output. **Must be one shared refusal before U6 wires `decision.allocation`** |
| 9 | A schedule of floors gives the top band zero width: 1,300 g pays $3.70, 1,301 g refuses. If "1.3 kg" means 1.30-1.39 kg, valid invoices are refused | Errs toward a blank, not a wrong number. **A Daniel question**, to go with question 2 on the Daniel list; pinned by a boundary test |
| 10 | `cash.ts` dates a HARVEST_COMPLETE overhead at the last curve day (or day 1) when the slaughter target is never reached, where `planHarvest` throws. And feed delivery falls back to its seed rate silently while AD-55 refuses a null abattoir fee: two policies for the same kind of client fact | The first is an invented date and should refuse; the second is AD-54 vs AD-55 and needs one policy chosen, not a patch |
| 12 | `PlaceNothing.overhead_still_incurred_cents` is hard-coded `0n`, copied from the plan with no derivation | Whether labour or any line is paid with no batch housed is unknown (OQ-15 territory). Zero is a claim; this should be null or derived |
| 13 | A bulk contract grossing under 20c a bird books a negative receipt with no refusal | Unrealistic; noted rather than guarded |
| R2-a | Invariant 16 now counts from the latest `order_date`, which has no upper bound: a mistyped far-future date silently pushes the placement floor out | Input validation, for U6/U8's sales ledger, not the engine |
| R2-b | `batchCashFlows` is exported and allowlisted as internal; it can be called without `cashFlowsMissingInputs` first | Acceptable while the allowlist entry stands; do not re-export it from index.ts |

### TD-5 · The engine types feed quantities as kg `number` 🟠 MUST CLOSE BEFORE U9
**Consistency debt, with a deadline (approved 2026-09-14).** Deferred out of U6
correctly, but it **must close before U9 (the decision screen) starts**. While it
is open, the database holds feed in grams and the engine in kg. A screen reading
one side in kg and the other in grams would show a figure 1,000 times wrong
with no error: the silent wrong answer this project is built to prevent. U9
planning checks this entry first.

**Raised:** 2026-09-14, U6 D16 (AD-77). `DailyRecord.feed_*_kg` and `FeedDraw.kg`
are floats in kg. CLAUDE.md rule 2 says integer grams, and the database stores
grams. The repository divides by 1000 at the boundary. `kgDiscrepancy` already
rounds back to grams to compare. **Fix:** retype to `Grams` in the engine, with
the golden fixtures' inputs migrated under an AD. Not U6: nothing is wrong
today, and it touches every fixture.

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
| Calibrated `MaxSafeBatchSize` | OQ-1 (mortality data) |
| ~~M5b · Task 8, the enumeration ceiling~~ | **UNBLOCKED 2026-09-11.** ~~OQ-23~~ answered: the ceiling is an operator-entered `max_placement_birds`, no derived cap. Tasks 1-8 built; Task 9 now blocked on OQ-25 below |
| M5b · the Build Reserve mode | **OQ-31** — pinned null by AD-59: without a candidate's forecast sales it recommended the smallest batch. Needs M6 |
| M5b · the Cover Fast mode | **OQ-26** — structurally cannot answer: a candidate has no forecast sales, so receipts never clear core credit. Needs M6 |
| M5b · Task 9, wiring `decision.allocation` | **OQ-25** — the engine holds no cash balance to pass as `openingCents`, and the plan passed `reserve_floor_cents`, a different quantity. Recommendation: leave the getter throwing until U6 |
| **U9 · the mode-selector / recommendation screen** | **OQ-29 — HARD BLOCKER, not an optimisation.** `computeAllocation` takes **20.8 s** at Daniel's realistic 5,000-bird ceiling and ~2 min at the brief's 30,000. U9 is a click-and-see screen; two minutes is not usable and no spinner makes it so. **U9 planning must produce a real design answer** — see OQ-29 for the three candidates and what each costs. A plan that says "consider performance" does not clear this |
| **U9 · any screen showing feed quantities** | **TD-5**: the engine types feed in kg, the database in grams. Closes before U9 starts, so no screen binds against two units |
| U3 · pricing a **part-bag** draw | OQ-21 — the client question half only. **The crash half landed 2026-09-11**: a part-bag draw now returns a typed `feed_draw_bags` refusal instead of a `RangeError` |
| Default strategy selection | ~~OQ-3~~ answered; mode set decided (AD-35) |
| ~~Gate harvest window past day 32~~ | **Moot.** Built in U4: under the settled flat gate price the window ends at day 31, so there is no "past day 32" to unblock. It reopens only if per-kg gate pricing becomes the default — see OQ-11 |

None of these blocked U1–U4, all four of which are now done. They affect
output accuracy and default selection, not structure. **OQ-21 is the one
exception in kind** — it is not an accuracy gap in work still to come but a live
crash in U3 code already written, and only its rounding half waits on Daniel.

**Invariant 16's 14-day inter-batch gap is not in this table on purpose** — it is not blocked on
anything, it is a settled hard constraint M5 builds against (AD-31).
