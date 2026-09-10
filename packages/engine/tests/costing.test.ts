import { describe, expect, it } from 'vitest';
import { computeCosting } from '../src/costing.js';
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
  it('reproduces the $8,079.81 feed cost at day 41 (fixture 1)', () => {
    expect(costingFor().feed_cost_cents).toBe(807981n);
  });

  it('charges every placed chick, extras included (KB-1)', () => {
    expect(costingFor().chick_cost_cents).toBe(300000n);
    expect(
      costingFor({ batch: { ...input().batch, extra_chick_count: 100 } }).chick_cost_cents
    ).toBe(310000n);
  });

  it('makes core credit chicks + feed and nothing else (invariant 15)', () => {
    expect(costingFor().core_credit_cents).toBe(300000n + 807981n);
  });

  it('charges his four measured overheads — $1,222.00 at 3,000 birds (AD-26)', () => {
    expect(costingFor().overhead_cost_cents).toBe(122200n);
    expect(costingFor().overhead_lines.map((l) => l.key)).toEqual([
      'vaccine',
      'electricity_heating',
      'labour',
      'transport_other'
    ]);
  });

  it('adds overheads only into full production cost, never into core credit', () => {
    const costing = costingFor();
    expect(costing.full_production_cost_cents).toBe(
      costing.core_credit_cents + costing.overhead_cost_cents
    );
    expect(costing.full_production_cost_cents).toBe(1230181n);
  });
});

describe('computeCosting — feed is priced by phase', () => {
  it('prices each phase at its own rate, not one blended rate', () => {
    // STARTER 1,149 kg @ $0.65, GROWER 4,398 @ $0.62, FINISHER 7,677 @ $0.60.
    expect(costingFor().feed_cost_cents).toBe(74685n + 272676n + 460620n);
  });

  it('charges only the phases reached so far', () => {
    // Day 13 is the last STARTER day: 383 g/bird over 3,000 birds @ $0.65.
    const day13 = costingFor({ asOf: '2026-02-18' as IsoDate });
    expect(day13.feed_cost_cents).toBe(74685n);
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
    // 3,000 birds eat on both days: 90 kg @ $0.65 = $58.50.
    expect(withDeaths.feed_cost_cents).toBe(5850n);
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
    expect(bigger.overhead_cost_cents).toBe(122200n + 4200n + 40000n);
  });
});
