/**
 * U9 v1's only input: golden fixture 7, hardcoded. No database, no auth.
 *
 * Fixture 7 over fixture 1 because it carries more of Daniel's real business:
 * 5,000 birds (his realistic ceiling today, OQ-23) and a mortality model that
 * loses birds, where fixture 1 places 3,000 and loses none.
 *
 * `tests/u9/console.test.ts` asserts this equals the golden file, so the copy
 * cannot drift from the contract.
 */
import type { BasisPoints, Cents, DayNumber, EngineInput, Grams, IsoDate } from '@runproduce/engine';

/**
 * The one field added to the fixture. The allocation enumeration refuses to run
 * without an operator-entered ceiling (OQ-23), and 5,000 is the figure Daniel
 * gave as realistic today. The screen shows it as his, not as a finding.
 */
export const PLACEMENT_CEILING_BIRDS = 5000;

export const FIXTURE_7: EngineInput = {
  asOf: '2026-03-07' as IsoDate,
  batch: {
    placement_date: '2026-02-06' as IsoDate,
    chick_count: 5000,
    extra_chick_count: 0,
    chick_price_cents: 100n as Cents
  },
  parameters: {
    mortality: {
      base_rate_bp_daily: 15 as BasisPoints,
      preharvest_ramp_start_day: 30 as DayNumber,
      preharvest_ramp_rate_bp_daily: 35 as BasisPoints
    },
    slaughter_target_g: 1770 as Grams,
    gate_price_cents_per_bird: 425n as Cents,
    gate_price_cents_per_kg: null,
    gate_pricing_basis: 'PER_BIRD',
    gate_capacity_per_day: 750,
    abattoir_fee_cents: null,
    transport_cents_per_bird: null,
    delivery_mode: 'ABATTOIR',
    feed_terms_days: 30,
    reserve_floor_cents: 0n as Cents,
    max_placement_birds: PLACEMENT_CEILING_BIRDS
  },
  records: [],
  draws: [],
  sales: []
};
