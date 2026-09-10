import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CALIBRATION_TRAILING_DAYS_MIN,
  SEED_BULK_BANDS,
  SEED_DRESSING_YIELD_PCT,
  bandForDressedG,
  calibrateMortalityRate,
  dailyMortalityRateBp,
  planHarvest
} from '../src/harvest.js';
import { projectProduction } from '../src/production.js';
import { computeDecision } from '../src/index.js';
import type {
  Cents,
  DailyRecord,
  EngineInput,
  Grams,
  IsoDate,
  Parameters,
  PricingBasis
} from '../src/types.js';

const PLACEMENT = '2026-02-06' as IsoDate;

/** Day 1 is placement day, so day N is placement + (N - 1). */
const DAYS: Readonly<Record<number, IsoDate>> = {
  20: '2026-02-25' as IsoDate,
  30: '2026-03-07' as IsoDate,
  31: '2026-03-08' as IsoDate,
  41: '2026-03-18' as IsoDate
};

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
    gate_pricing_basis: 'PER_BIRD' as PricingBasis,
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

function input(
  day: number,
  flock: number,
  records: readonly DailyRecord[] = [],
  overrides: Partial<Parameters> = {}
): EngineInput {
  const asOf = DAYS[day];
  if (asOf === undefined) throw new Error(`test helper has no date for day ${day}`);
  return {
    asOf,
    batch: {
      placement_date: PLACEMENT,
      chick_count: flock,
      extra_chick_count: 0,
      chick_price_cents: 100n as Cents
    },
    parameters: parameters(overrides),
    records,
    draws: [],
    sales: []
  };
}

function record(day: number, mortality: number, culls = 0): DailyRecord {
  return {
    day_number: day as Grams as never,
    mortality_cumulative: mortality,
    cull_cumulative: culls,
    feed_starter_kg: 0,
    feed_grower_kg: 0,
    feed_finisher_kg: 0,
    avg_weight_g: null,
    weight_sample_size: null
  };
}

function plan(
  day: number,
  flock: number,
  records: readonly DailyRecord[] = [],
  overrides: Partial<Parameters> = {}
) {
  const engineInput = input(day, flock, records, overrides);
  return planHarvest(engineInput, projectProduction(engineInput));
}

describe('dailyMortalityRateBp — the fallback ramp', () => {
  const params = parameters();

  it('is the base rate before the pre-harvest ramp starts', () => {
    expect(dailyMortalityRateBp(params.mortality, 29)).toBe(15);
    expect(dailyMortalityRateBp(params.mortality, 1)).toBe(15);
  });

  it('adds the ramp as a flat step from the ramp start day, not a per-day escalation', () => {
    expect(dailyMortalityRateBp(params.mortality, 30)).toBe(50);
    expect(dailyMortalityRateBp(params.mortality, 31)).toBe(50);
    expect(dailyMortalityRateBp(params.mortality, 41)).toBe(50);
  });

  /**
   * D1 (u4-harvest-optimiser.md chunk 2). The compounded ramp is what the
   * decision not to recalibrate rests on: 5.21% at the harvest day against the
   * brief's 5% planning figure is close agreement. The 9.85% at day 41 is the
   * figure that was wrongly compared against that 5% and read as ~2x.
   *
   * This test exists so the ramp cannot be quietly recalibrated later without
   * the comparison that justified leaving it alone failing first.
   */
  it('compounds to the figures D1 was decided on', () => {
    const cumulativeThrough = (day: number): number => {
      let survival = 1;
      for (let d = 1; d <= day; d += 1) {
        survival *= 1 - dailyMortalityRateBp(params.mortality, d) / 10000;
      }
      return Math.round((1 - survival) * 10000) / 100;
    };

    expect(cumulativeThrough(30)).toBeCloseTo(4.74, 2);
    expect(cumulativeThrough(31)).toBeCloseTo(5.21, 2);
    expect(cumulativeThrough(35)).toBeCloseTo(7.1, 2);
    expect(cumulativeThrough(41)).toBeCloseTo(9.85, 2);
  });
});

describe('calibrateMortalityRate', () => {
  it('falls back to the assumed ramp when there is no own-batch history', () => {
    const result = calibrateMortalityRate(projectProduction(input(20, 3000)), parameters());
    expect(result.source).toBe('assumed');
    expect(result.trailing_days_used).toBe(0);
    expect(result.rate_bp).toBeNull();
  });

  it('calibrates from recorded days once the sufficiency threshold is met', () => {
    // 0.5% a day on 3,000 birds: 15, then 15 of a smaller flock each day.
    const records = [record(16, 15), record(17, 30), record(18, 45), record(19, 60)];
    const result = calibrateMortalityRate(projectProduction(input(20, 3000, records)), parameters());

    expect(result.source).toBe('calibrated');
    expect(result.trailing_days_used).toBe(4);
    expect(result.rate_bp).not.toBeNull();
    expect(result.rate_bp ?? 0).toBeGreaterThan(45);
    expect(result.rate_bp ?? 0).toBeLessThan(55);
  });

  it('stays assumed below the threshold, however clean the data looks', () => {
    const records = [record(18, 15), record(19, 30)];
    const result = calibrateMortalityRate(projectProduction(input(20, 3000, records)), parameters());

    expect(DEFAULT_CALIBRATION_TRAILING_DAYS_MIN).toBe(3);
    expect(result.source).toBe('assumed');
    expect(result.trailing_days_used).toBe(2);
  });

  it('honours an explicit threshold rather than a literal', () => {
    const records = [record(18, 15), record(19, 30)];
    const result = calibrateMortalityRate(
      projectProduction(input(20, 3000, records, { calibration_trailing_days_min: 2 })),
      parameters({ calibration_trailing_days_min: 2 })
    );
    expect(result.source).toBe('calibrated');
  });

  /**
   * Invariant 5. A carried-forward day's derived delta is zero because nobody
   * wrote anything down, not because nothing died. Counting it as an observed
   * zero would drag the calibrated rate toward zero with fabricated data.
   */
  it('does not count carried-forward days as observations of zero', () => {
    const sparse = [record(10, 15), record(14, 30), record(18, 45)];
    const result = calibrateMortalityRate(projectProduction(input(20, 3000, sparse)), parameters());

    expect(result.trailing_days_used).toBe(3);
    expect(result.rate_bp ?? 0).toBeGreaterThan(0);
  });

  it('counts culls as removals alongside mortality', () => {
    const deaths = [record(16, 15), record(17, 30), record(18, 45)];
    const split = [record(16, 8, 7), record(17, 15, 15), record(18, 23, 22)];

    const a = calibrateMortalityRate(projectProduction(input(20, 3000, deaths)), parameters());
    const b = calibrateMortalityRate(projectProduction(input(20, 3000, split)), parameters());

    expect(b.rate_bp).toBeCloseTo(a.rate_bp ?? 0, 0);
  });
});

describe('planHarvest — the bulk harvest day', () => {
  it('is the first day the curve reaches the slaughter target', () => {
    // Day 30 is 1,754 g and day 31 is 1,843 g against a 1,770 g target.
    expect(plan(41, 3000).bulk_harvest_day).toBe(31);
  });

  it('carries the assumed dressing yield beside the day, never the day alone', () => {
    const harvest = plan(41, 3000);
    expect(harvest.assumed_dressing_yield_pct).toBe(SEED_DRESSING_YIELD_PCT);
    expect(harvest.confidence).toBe('assumed');
  });

  it('reports the yield window the day actually survives on', () => {
    const { yield_sensitivity: s } = plan(41, 3000);

    // 1,100 g dressed over day 31's 1,843 g and day 30's 1,754 g live.
    expect(s.holds_from_pct).toBeCloseTo(59.7, 1);
    expect(s.holds_to_pct).toBeCloseTo(62.7, 1);
    expect(s.day_below).toBe(32);
    expect(s.day_above).toBe(30);
  });

  /**
   * Decision 2. The yield is a real parameter and is reported, but it does NOT
   * re-derive `slaughter_target_g` — that stays Daniel's stated 1,770 g, because
   * re-deriving it would invent precision on top of an approximate 62% (AD-33).
   * So a different yield changes the sensitivity reported, not the day.
   */
  it('does not let the yield re-derive the slaughter target', () => {
    expect(plan(41, 3000, [], { dressing_yield_pct: 58 }).bulk_harvest_day).toBe(31);
    expect(plan(41, 3000, [], { dressing_yield_pct: 66 }).bulk_harvest_day).toBe(31);
  });
});

describe('planHarvest — the gate window', () => {
  /**
   * OQ-11's tripwire. Flat per-bird gate pricing means another day of growth
   * adds no gate revenue at all, so every extra day is pure cost and the
   * window collapses onto the first qualifying day. A result at or near day 38
   * is a bug, not a confirmation: 38 only ever held under PER_KG.
   */
  it('collapses onto the first qualifying day under flat per-bird pricing', () => {
    const { gate_window } = plan(41, 3000);
    expect(gate_window.first_day).toBe(31);
    expect(gate_window.last_day).toBe(31);
    expect(gate_window.last_day).toBeLessThan(38);
  });

  it('widens under per-kg pricing, where growth does add revenue', () => {
    const { gate_window } = plan(41, 3000, [], {
      gate_pricing_basis: 'PER_KG',
      gate_price_cents_per_bird: null,
      gate_price_cents_per_kg: 200n as Cents
    });
    expect(gate_window.last_day).toBeGreaterThan(gate_window.first_day);
  });

  it('reports which source the mortality it charged came from', () => {
    expect(plan(41, 3000).mortality_source).toBe('assumed');
    expect(plan(41, 3000).trailing_days_used).toBe(0);
  });
});

describe('bandForDressedG', () => {
  it('picks the highest band the dressed weight clears', () => {
    expect(bandForDressedG(SEED_BULK_BANDS, 1142)?.price_cents_per_bird).toBe(390n);
    expect(bandForDressedG(SEED_BULK_BANDS, 1250)?.price_cents_per_bird).toBe(380n);
    expect(bandForDressedG(SEED_BULK_BANDS, 1364)?.price_cents_per_bird).toBe(370n);
  });

  /** A bird under the lowest band is still taken (AD-34) but cannot be priced. */
  it('returns null below the lowest band rather than guessing a price', () => {
    expect(bandForDressedG(SEED_BULK_BANDS, 1000)).toBeNull();
  });
});

describe('planHarvest — band overshoot', () => {
  it('is zero at the harvest day, which lands in the best-paying band', () => {
    expect(plan(41, 3000).band_overshoot_loss_cents).toBe(0n);
  });
});

describe('planHarvest — hold cost', () => {
  /**
   * Fixture 7's quantity, generated rather than back-fitted. The discredited
   * $3,305 came from an early illustration of Daniel's, not from client data
   * (OQ-9), and is not a target.
   */
  it('accumulates feed and lost birds from asOf forward', () => {
    const hold = plan(30, 5000).hold_cost_to_day['35'];
    if (hold === undefined) throw new Error('no hold cost through day 35');

    expect(hold.through_day).toBe(35);
    expect(hold.feed_cents).toBe(266946n);
    expect(hold.birds_lost).toBe(125);
    expect(hold.gate_value_lost_cents).toBe(53125n);
    expect(hold.gate_total_cents).toBe(320071n);
    expect(hold.bulk_value_lost_cents).toBe(46250n);
    expect(hold.bulk_total_cents).toBe(313196n);
  });

  it('grows with every further day held', () => {
    const hold = plan(30, 5000).hold_cost_to_day;
    const at32 = hold['32'];
    const at35 = hold['35'];
    if (at32 === undefined || at35 === undefined) throw new Error('missing hold costs');
    expect(at35.gate_total_cents).toBeGreaterThan(at32.gate_total_cents);
  });

  it('stops at the end of the curve rather than extrapolating past it', () => {
    expect(plan(30, 5000).hold_cost_to_day['42']).toBeUndefined();
    expect(plan(30, 5000).hold_cost_to_day['41']).toBeDefined();
  });
});

describe('planHarvest — cost of delay per day', () => {
  it('prices the marginal day past each channel target against the live flock', () => {
    const { cost_of_delay_per_day } = plan(41, 3000);
    // Day 32 feed is 176 g a bird at $0.60/kg over 3,000 birds, plus 15 birds.
    expect(cost_of_delay_per_day.gate).toBe(31680n + 6375n);
    expect(cost_of_delay_per_day.bulk).toBe(31680n + 5850n);
  });
});

describe('computeDecision — harvest is wired in', () => {
  it('returns a harvest plan rather than throwing NotImplementedError', () => {
    const result = computeDecision(input(41, 3000));
    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(result.decision.harvest.bulk_harvest_day).toBe(31);
  });
});
