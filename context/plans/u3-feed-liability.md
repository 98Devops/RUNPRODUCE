# U3 — M3 Feed Liability: implementation plan

Signed off 2026-09-10. Spec agreed in six chunks; all six decisions held.

## Confirmations carried in from sign-off

**Cadence chains off the previous collection date, not off placement.**
Confirmed against the client's own formulas: `A3 = A2+14`, `A4 = A3+7`,
`A5 = A4+7` — each references the row above, not `A2`. So a draw entered
late shifts every subsequent planned draw with it, rather than the
schedule staying pinned to fixed offsets from day 1. Encoded as a chain,
never as an offset table from placement.

**The first-draw field is named for what it covers.** Fixture 5's assert
path was `decision.feed.starter_bags_to_day_14`. The first draw covers
days 1–14, which spans STARTER (1–13) and one GROWER day, so "starter"
is wrong in the client's sheet and would be wrong in our type. Field and
path both become `first_draw_bags_to_day_14`. The expected VALUE (26.64)
does not change. Declared as AD-37 because a golden fixture is a
protected file. See KB-11 for the client-side naming history.

**`cashflow_days` is not this field.** CONTEXT.md defines cashflow days
as *market date − due date*, which needs M4's market date. The per-draw
field here is `days_until_due` (`due_date − asOf`), matching
`v_feed_liability`. The real cashflow_days lands in U4/U5.

## The split

M3 is two halves sharing bag arithmetic and nothing else:

- **Liability** — entered draws → what is owed and when. Fixture 9.
- **Planning** — breed curve → what will need drawing. Fixture 5.

## Decisions (signed off)

1. Draw-level `terms_days` wins over `parameters.feed_terms_days`. The
   parameter is the default for PLANNED draws only.
2. Money from `bags × price_per_bag_cents`, not kg. Where
   `kg ≠ bags × 50`, trust bags for money and flag `kg_discrepancy`
   rather than reconciling silently (AD-36 discipline, applied forward).
3. Draws with `collection_date > asOf` are ignored (invariant 7). Due
   dates after `asOf` are KEPT — a scheduled obligation is not lookahead.
4. No `paid` / `outstanding` in U3. `feed_payments` is not in
   `EngineInput`; defaulting paid to zero would assert every draw is
   unpaid, which is inventing an input. Payments land in U6.
5. No `headroom` in U3. Needs the facility limit, which is not in
   `Parameters`. Deferred, not faked.
6. Bags stay `number` — a divisible bag count, not money. Money stays
   `bigint` cents throughout.

## Planned-draw sizing: the assumption, declared

Planned draws are sized on the flock held FLAT at `flock_size`, because
U3 has no mortality forecast — forecasting is M4's job (invariant 5,
AD-24). That makes planned quantities an UPPER BOUND, not a prediction,
and they carry `confidence: 'assumed'`. M4 refines them once it
calibrates a per-batch rate.

Planning runs to the curve's last day (41). The final draw covers the
remainder (36–41) rather than a full 7 days. Bounding the schedule by
the harvest day is a U4 refinement.

## Steps, red first

1. `addDays(date, n)` in `day-number.ts` — `civil_from_days`, the
   inverse of the existing `days_from_civil`. No `Date`, per its rule.
2. Types: `DrawLiability`, `PlannedDraw`, `FeedLiability`. `Decision.feed`
   narrows from `unknown`.
3. `first_draw_bags_to_day_14` from the curve → **fixture 5 green**.
4. Due-date derivation, draw totals, `days_until_due`, `kg_discrepancy`
   → **fixture 9 green**.
5. Planned-draw cadence, chained.
6. Replace the `feed` getter in `computeDecision`. Held count 4 → 2.
