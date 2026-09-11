# U4 — M4 Harvest Optimiser

**Approved spec.** Reconstructed from the conversation record on
2026-09-10 after a `/clear` dropped the in-window version, and written
to disk before any build work so it survives the next one.

---

## Chunk 1 — Framing correction

**OQ-1 is answered (2026-09-10).** Mortality is calibrated per batch
from that batch's own trailing cumulative entries — EMA, alpha 0.4,
actual vs standard — with the assumed ramp as fallback. Buildable now,
as specified.

**OQ-12 is genuinely unsettled.** The switchover threshold — how many
trailing days count as "sufficient" — is an assumed 3–5 days, not
validated by anything yet.

**A third thing was unsettled and came due in this unit.** OQ-1 carried
a rider claiming the fallback ramp is "roughly double" the client's
planning figure, with the instruction *do not act on this before U4; log
it against OQ-12*. That deadline expired at U4, which is why D1 below
had to be resolved before the build could start.

---

## Chunk 2 — D1: the deferred decision, resolved as "do not recalibrate"

The fallback ramp, compounded:

| Day | Cumulative mortality |
|---|---|
| 30 | 4.74% |
| **31 (harvest)** | **5.21%** |
| 35 | 7.10% |
| 41 | 9.85% |

The brief's planning figure is 5% over the cycle (30,000 → 28,500
saleable) — a **harvest-day** figure. The "roughly double" claim
compared our **day-41** figure (9.85%) against that harvest-day figure
(5%). Day 41 is not when anyone harvests; day 31 is. Correctly
compared: **5.21% against 5% — close agreement, not a 2x
discrepancy.**

**D1: do NOT recalibrate the fallback ramp down.** Recalibrating on the
strength of the mismatched comparison would understate mortality on the
one day the ramp is actually consulted — the harvest day.

Logged under **AD-36** (`progress-tracker.md:274`). It is the same
species of error as the prior AD-36 findings: two figures compared at
mismatched points, read as disagreeing when correctly compared they
agree. This instance is a correction to Claude's own earlier flag, not
to a client document.

D1 was signed off explicitly as correct, with the reasoning verified
independently. **The asymmetry favours declining to act:** if this
correction were itself wrong, the ramp simply stays as it has been
through U1–U3 — already shipped, already working. Recalibrating on a
flawed premise would have introduced a *new* error into the one number
the harvest decision depends on.

---

## Chunk 3 — Buildable now

| Item | Notes |
|---|---|
| **Bulk harvest day** | First day `weight_g >= slaughter_target_g`. Pure curve arithmetic, no mortality input. Fixture 10 → day 31, green. |
| **Dressing yield display** | New parameter (chunk 5). No client input needed. |
| **Gate harvest window** | Flat gate pricing (~$4.25 under ~2 kg) means growth adds no gate revenue, so the window collapses toward the target. Fixture 11 **generated**, not back-fitted. |
| **Cost of delay per channel** | Feed per day deterministic from the curve; birds lost per day from the ramp or the calibrated rate. |
| **Bulk band overshoot** | Bands are client data ($3.90 / $3.80 / $3.70 dressed). Seeded like `SEED_OVERHEADS`. |
| **EMA calibration itself** | OQ-1 settled the method. Buildable as specified. |

---

## Chunk 4 — Stays provisional / stays unwritten

- **Calibration threshold.** OQ-12's assumed 3–5 days, as a **named
  parameter, never a literal**. Below it → `confidence: 'assumed'`; at
  or above it → `'calibrated'`.
- **Fixture 8 stays unwritten.** `bulk_net = price − abattoir fee −
  transport`; transport is null pending OQ-2, and OQ-16 gates it
  independently.
- **Fixtures 7 and 11 are GENERATED from the model**, not back-fitted to
  the old discredited numbers ($3,305 and $2.46/kg — Claude's early
  illustrations, not client data). OQ-9 closes the $3,305 hunt.
- **OQ-11 tripwire** (intact on disk, `current-issues.md:567`): expect
  the gate window end **materially earlier than day 38** under flat
  `PER_BIRD` pricing — 38 only held under `PER_KG`. **A regenerated 38
  is evidence of a bug, not confirmation.** Report the generated number
  before writing the fixture.
- Everything harvest-day-related carries `confidence: 'assumed'` until
  OQ-17 lands a measured dressing yield.

---

## Chunk 5 — Output shape (OQ-17 as a structural requirement)

`Parameters` gains:

- `dressing_yield_pct` (~62, confidence `'assumed'`)
- `bulk_bands[]` (dressed kg → price, client data)

```ts
HarvestPlan {
  bulk_harvest_day: number              // fixture 10 = 31
  assumed_dressing_yield_pct: number    // REQUIRED beside the day
  yield_sensitivity: {
    holds_from_pct, holds_to_pct        // 59.7 - 62.7 (derived)
    day_below, day_above                // 32 / 30
  }
  confidence: 'assumed'
  gate_window: { first_day, last_day }
  cost_of_delay_per_day: { gate, bulk }
  band_overshoot_loss_cents             // AD-33
  mortality_source: 'calibrated' | 'assumed'
  trailing_days_used: number
  hold_cost_to_day: Record<day, HoldCost> // added in build — see below
}
```

**Corrected in build, 2026-09-10 — the upper bound is 62.7%, not 62.8%.**
1,100 g dressed over day 30's 1,754 g live is 62.714%, rounded inward so
the window never claims the day holds at a yield where it does not. The
lower bound, 1,100 ÷ 1,843 = 59.685% → 59.7%, was right. 62.8 was a stray
rounding in the spec; the derived figure stands and this document was
corrected to match rather than the reverse.

**Added in build, 2026-09-10 — `hold_cost_to_day`.** Chunk 5's shape had
no field fixture 7 could address: `cost_of_delay_per_day` is a single
pair and fixture 7 is a *range* total. `hold_cost_to_day` is the
cumulative hold cost from `asOf` forward, keyed by the day held through,
so a fixture names the day it means instead of counting array positions.
Approved as an addition to the approved shape.

`yield_sensitivity` is **mandatory, not optional**. A consumer reading
only `bulk_harvest_day` must actively choose to drop the caveat, not
have it absent by default. That is what makes OQ-17 protective rather
than a paragraph nobody's code reads.

---

## Chunk 6 — Decisions, all approved

1. **Do NOT recalibrate the fallback ramp** (D1, chunk 2) — approved.
2. `dressing_yield_pct` becomes a real parameter; `slaughter_target_g`
   stays Daniel's stated 1,770, **not** re-derived from yield —
   approved.
3. Bulk bands seeded as client data, same pattern as `SEED_OVERHEADS` —
   approved.
4. Gate and bulk are **separate decisions** (AD-34), not one optimiser
   with a swapped price constant — approved.
5. **Report generated fixture 7 and 11 values BEFORE writing them**,
   since both replace discredited numbers — approved. The OQ-11
   tripwire applies specifically: a result near 38 gets investigated as
   a probable bug regardless of how clean the derivation looks.

> **Note on the count.** The reconstructed spec introduced this section
> as "all six approved" and then enumerated five. Five are recorded
> here because five are what the record contains; no sixth has been
> invented to close the arithmetic. If a sixth decision was approved and
> is missing, it needs to be recovered before the work it governs is
> built.

---

## Outcome, 2026-09-10

Built and green. `packages/engine/src/harvest.ts`, 24 new tests, TDD
throughout. **Fixtures 7, 10 and 11 assert**; written is 11 of 13 and the
held count is down to the single U1 completeness hold. 192 tests green;
lint, typecheck and build clean.

**The generated values, reported before they were written:**

| Fixture | Value | Made of |
|---|---|---|
| 7 — hold cost day 30 → 35, 5,000 birds | **$3,200.71** | $2,669.46 feed + 125 birds × $4.25 |
| 11 — gate window end | **day 31** | flat pricing adds no revenue, so the window collapses onto the target |

Fixture 11 cleared the OQ-11 tripwire by a wide margin rather than
narrowly. Neither value was fitted to the discredited $3,305 or day 38.

**A finding from the controls.** Under `PER_KG` the gate window runs to
day 41 at both $2.00/kg and the discredited $2.46/kg — day 38 is not
reproducible at either. Day 38 meant "mortality overtakes growth", and
under the flat-step ramp mortality stops rising at day 30 while growth
keeps paying, so it never overtakes. Day 38 rested on the compounding
ramp that D1 retired. Logged against OQ-11.

**Also in this pass:** the gate price was reconciled to $4.25 across
**all nine** previously written fixtures, not just fixture 10 (AD-38). No
expected value moved.

## Build order (TDD)

1. EMA calibration
2. Bulk harvest day — fixture 10
3. Gate window derivation
4. Fixture 7 and 11 generation — **report values first**
5. Band overshoot
6. Wire into `computeDecision()`
