import { describe, expect, it } from 'vitest';
import { enumerateCandidates } from '../src/allocation.js';
import type { Cents, EngineInput, Grams, IsoDate, Parameters } from '../src/types.js';

const PLACEMENT = '2026-02-06' as IsoDate;

function parameters(overrides: Partial<Parameters> = {}): Parameters {
  return {
    mortality: {
      base_rate_bp_daily: 15 as never,
      preharvest_ramp_start_day: 30 as never,
      preharvest_ramp_rate_bp_daily: 35 as never
    },
    slaughter_target_g: 1770 as Grams,
    gate_price_cents_per_bird: 425n as Cents,
    gate_price_cents_per_kg: null,
    gate_pricing_basis: 'PER_BIRD',
    gate_capacity_per_day: 750,
    bulk_price_cents_per_bird: 390n as Cents,
    abattoir_fee_cents: null,
    transport_cents_per_bird: null,
    delivery_mode: 'ABATTOIR',
    feed_terms_days: 30,
    reserve_floor_cents: 0n as Cents,
    ...overrides
  };
}

function baseInput(paramOverrides: Partial<Parameters> = {}): EngineInput {
  return {
    asOf: PLACEMENT,
    batch: {
      placement_date: PLACEMENT,
      chick_count: 3000,
      extra_chick_count: 0,
      chick_price_cents: 100n as Cents
    },
    parameters: parameters(paramOverrides),
    records: [],
    draws: [],
    sales: []
  };
}

describe('enumerateCandidates', () => {
  it('never generates a date earlier than harvest completion + 14', () => {
    const candidates = enumerateCandidates(baseInput(), '2026-03-20' as IsoDate, 300);
    const earliest = candidates.reduce(
      (a, c) => (c.placement_date < a ? c.placement_date : a),
      '9999-12-31' as IsoDate
    );

    // Invariant 16. Not a preference — nothing below the floor exists at all.
    expect(earliest).toBe('2026-04-03');
  });

  it('runs the date range to the floor + 30 and no further', () => {
    const candidates = enumerateCandidates(baseInput(), '2026-03-20' as IsoDate, 300);
    const latest = candidates.reduce(
      (a, c) => (c.placement_date > a ? c.placement_date : a),
      '0000-01-01' as IsoDate
    );

    expect(latest).toBe('2026-05-03');
    expect(new Set(candidates.map((c) => c.placement_date)).size).toBe(31);
  });

  it('steps size by placement_step_birds and never emits a zero-bird batch', () => {
    const candidates = enumerateCandidates(baseInput(), '2026-03-20' as IsoDate, 300);
    const sizes = [...new Set(candidates.map((c) => c.chick_count))].sort((a, b) => a - b);

    // AD-41: size 0 is place_nothing's job, never a candidate.
    expect(sizes).toEqual([100, 200, 300]);
  });

  it('honours an explicit step rather than a literal', () => {
    const candidates = enumerateCandidates(
      baseInput({ placement_step_birds: 150 }),
      '2026-03-20' as IsoDate,
      300
    );
    expect([...new Set(candidates.map((c) => c.chick_count))].sort((a, b) => a - b)).toEqual([
      150, 300
    ]);
  });
});
