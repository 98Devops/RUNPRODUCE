import { describe, expect, it } from 'vitest';
import { computeCosting, costOfFeed } from '../src/costing.js';
import { projectProduction } from '../src/production.js';
import { Money } from '../src/money.js';
import type {
  BasisPoints,
  DayNumber,
  EngineInput,
  Grams,
  IsoDate,
  OverheadModel
} from '../src/types.js';

/** The client's own 3,000-bird batch: fixtures 1-4 and 12. */
function input(overrides: Partial<EngineInput> = {}): EngineInput {
  return {
    asOf: '2026-03-18' as IsoDate,
    batch: {
      placement_date: '2026-02-06' as IsoDate,
      chick_count: 3000,
      extra_chick_count: 0,
      chick_price_cents: Money.fromCents(100n)
    },
    parameters: {
      mortality: {
        base_rate_bp_daily: 0 as BasisPoints,
        preharvest_ramp_start_day: 30 as DayNumber,
        preharvest_ramp_rate_bp_daily: 0 as BasisPoints
      },
      slaughter_target_g: 1770 as Grams,
      gate_price_cents_per_bird: Money.fromCents(430n),
      gate_price_cents_per_kg: null,
      gate_pricing_basis: 'PER_BIRD',
      gate_capacity_per_day: 750,
      bulk_price_cents_per_bird: Money.fromCents(390n),
      abattoir_fee_cents: null,
      transport_cents_per_bird: null,
      delivery_mode: 'ABATTOIR',
      feed_terms_days: 30,
      reserve_floor_cents: Money.fromCents(0n)
    },
    records: [],
    draws: [],
    sales: [],
    ...overrides
  };
}

const costingFor = (overrides: Partial<EngineInput> = {}) => {
  const engineInput = input(overrides);
  return computeCosting(engineInput, projectProduction(engineInput));
};

const NO_OVERHEADS: OverheadModel = { lines: [] };

describe('computeCosting — the client’s own Final Report', () => {
  it('reproduces the $7,698.06 feed cost at day 41 (fixture 1, AD-52 prices)', () => {
    expect(costingFor().feed_cost_cents).toBe(769806n);
  });

  it('charges every placed chick, extras included (KB-1)', () => {
    expect(costingFor().chick_cost_cents).toBe(300000n);
    expect(
      costingFor({ batch: { ...input().batch, extra_chick_count: 100 } }).chick_cost_cents
    ).toBe(310000n);
  });

  it('makes core credit chicks + feed and nothing else (invariant 15)', () => {
    expect(costingFor().core_credit_cents).toBe(300000n + 769806n);
  });

  it('charges his four measured overheads — $1,222.00 at 3,000 birds (AD-26)', () => {
    // $400 transport_other retired by the client 2026-09-12 (AD-51).
    expect(costingFor().overhead_cost_cents).toBe(82200n);
    expect(costingFor().overhead_lines.map((l) => l.key)).toEqual([
      'vaccine',
      'electricity_heating',
      'labour'
    ]);
  });

  it('adds overheads only into full production cost, never into core credit', () => {
    const costing = costingFor();
    expect(costing.full_production_cost_cents).toBe(
      costing.core_credit_cents + costing.overhead_cost_cents
    );
    expect(costing.full_production_cost_cents).toBe(1152006n);
  });
});

describe('computeCosting — feed is priced by phase', () => {
  it('prices each phase at its own rate, not one blended rate', () => {
    // STARTER 1,149 kg @ $30.60/bag, GROWER 4,398 @ $29.60, FINISHER 7,677 @ $28.60.
    // Each phase rounds UP on its own: 70,318.8 / 260,361.6 / 439,124.4 cents.
    expect(costingFor().feed_cost_cents).toBe(70319n + 260362n + 439125n);
  });

  it('charges only the phases reached so far', () => {
    // Day 13 is the last STARTER day: 383 g/bird over 3,000 birds @ $30.60/50 kg.
    const day13 = costingFor({ asOf: '2026-02-18' as IsoDate });
    expect(day13.feed_cost_cents).toBe(70319n);
  });

  it('prices feed against opening birds, so a dead bird’s feed is still paid for', () => {
    const withDeaths = costingFor({
      asOf: '2026-02-07' as IsoDate,
      records: [
        {
          day_number: 2 as DayNumber,
          mortality_cumulative: 100,
          cull_cumulative: 0,
          feed_starter_kg: 0,
          feed_grower_kg: 0,
          feed_finisher_kg: 0,
          avg_weight_g: null,
          weight_sample_size: null
        }
      ]
    });
    // 3,000 birds eat on both days: 90 kg @ $30.60/50 kg = $55.08, exact.
    expect(withDeaths.feed_cost_cents).toBe(5508n);
  });
});

describe('computeCosting — overheads', () => {
  it('honours an explicit empty model as "charge no overheads"', () => {
    const costing = costingFor({
      parameters: { ...input().parameters, overheads: NO_OVERHEADS }
    });
    expect(costing.overhead_cost_cents).toBe(0n);
    expect(costing.overhead_lines).toEqual([]);
    expect(costing.full_production_cost_cents).toBe(costing.core_credit_cents);
  });

  it('scales the per-bird lines to the actual flock', () => {
    const bigger = costingFor({
      batch: { ...input().batch, chick_count: 6000 }
    });
    // Vaccine and transport are PER_BIRD and double; labour and electricity
    // are PER_BATCH and do not (OQ-15 is the open question about that).
    expect(bigger.overhead_cost_cents).toBe(82200n + 4200n);
  });
});

describe('costOfFeed — bag pricing (AD-52)', () => {
  const starter = { phase: 'STARTER' as const, first_day: 1 as DayNumber, last_day: 13 as DayNumber, price_per_bag_cents: Money.fromCents(3060n), bag_kg: 50 };

  it('prices a whole bag exactly', () => {
    expect(costOfFeed(50_000n, starter)).toBe(3060n);
  });

  it('prices a sub-cent-per-kg rate without inventing a whole-cent rate', () => {
    // 1,149,000 g is 61.2c/kg x 1,149 kg = 70,318.8c. A 61c/kg rate would
    // charge 70,089c — $2.30 light on one phase of one batch.
    expect(costOfFeed(1_149_000n, starter)).toBe(70319n);
    expect(costOfFeed(1_149_000n, starter)).toBeGreaterThan(1_149_000n * 61n / 1000n);
  });

  it('rounds UP, never in our favour', () => {
    expect(costOfFeed(1n, starter)).toBe(1n);
  });
});
