import { describe, expect, it } from 'vitest';
import { SEED_BREED_CURVE } from '../src/breed-curve.js';
import { Money } from '../src/money.js';
import { projectProduction, standardFeedForDay } from '../src/production.js';
import type {
  BasisPoints,
  DailyRecord,
  DayNumber,
  EngineInput,
  Grams,
  IsoDate,
  StandardFeedInput
} from '../src/types.js';

/**
 * U7 chunk 4, D24 to D26. The day's standard feed for the whole flock: the
 * curve's grams a bird for the day, times the day's opening birds. Exact
 * integer grams (D25); past the curve, no amount at all (D26, AD-99).
 */

const SEED = SEED_BREED_CURVE.points;

function record(
  overrides: Omit<Partial<DailyRecord>, 'day_number'> & { day_number: number }
): DailyRecord {
  return {
    mortality_cumulative: 0,
    cull_cumulative: 0,
    feed_starter_kg: 0,
    feed_grower_kg: 0,
    feed_finisher_kg: 0,
    avg_weight_g: null,
    weight_sample_size: null,
    feed_entry_source: null,
    feed_phase: null,
    feed_phase_source: null,
    ...overrides,
    day_number: overrides.day_number as DayNumber
  };
}

function input(overrides: Partial<StandardFeedInput> = {}): StandardFeedInput {
  return {
    points: SEED,
    day: 12,
    chick_count: 6000,
    extra_chick_count: 60,
    records: [],
    ...overrides
  };
}

describe('standardFeedForDay with no records (T-E6)', () => {
  it('is the curve figure for the day times the whole flock, extras included', () => {
    // Day 12 on the seed curve is 50 g a bird, in starter.
    expect(standardFeedForDay(input())).toEqual({
      kind: 'standard',
      feed_g: 303000,
      per_bird_g: 50,
      birds: 6060,
      phase: 'STARTER'
    });
  });

  it('counts the extra chicks (KB-1, invariant 9)', () => {
    const result = standardFeedForDay(input({ extra_chick_count: 0 }));
    expect(result).toMatchObject({ kind: 'standard', feed_g: 300000, birds: 6000 });
  });

  it('is whole grams on every day of the curve (rule 2)', () => {
    for (let day = 1; day <= 41; day += 1) {
      const result = standardFeedForDay(input({ day, chick_count: 5987, extra_chick_count: 13 }));
      if (result.kind !== 'standard') throw new Error(`day ${day} returned ${result.kind}`);
      expect(Number.isInteger(result.feed_g)).toBe(true);
      expect(result.feed_g).toBe(result.per_bird_g * result.birds);
    }
  });
});

describe('which record the birds come from (T-E7, D24)', () => {
  const records = [
    record({ day_number: 5, mortality_cumulative: 10, cull_cumulative: 2 }),
    record({ day_number: 9, mortality_cumulative: 20, cull_cumulative: 5 })
  ];

  it('a correction of day 9 ignores day 9 itself, and uses day 5', () => {
    expect(standardFeedForDay(input({ day: 9, records }))).toMatchObject({ birds: 6060 - 12 });
  });

  it('a backfill of day 7 ignores the later day 9', () => {
    expect(standardFeedForDay(input({ day: 7, records }))).toMatchObject({ birds: 6060 - 12 });
  });

  it('the day after the latest record uses it, culls subtracted like deaths', () => {
    expect(standardFeedForDay(input({ day: 10, records }))).toMatchObject({ birds: 6060 - 25 });
  });

  it('does not depend on the order the records arrive in', () => {
    const reversed = [...records].reverse();
    expect(standardFeedForDay(input({ day: 10, records: reversed }))).toEqual(
      standardFeedForDay(input({ day: 10, records }))
    );
  });

  it('a flock with no birds left has a standard of 0 g, a true figure', () => {
    const gone = [record({ day_number: 3, mortality_cumulative: 6000, cull_cumulative: 60 })];
    expect(standardFeedForDay(input({ day: 4, records: gone }))).toMatchObject({
      kind: 'standard',
      feed_g: 0,
      birds: 0
    });
  });
});

describe("parity with production's opening birds (T-E8, AD-7)", () => {
  it('gives the same birds as projectProduction on every day of the curve', () => {
    const records = [
      record({ day_number: 2, mortality_cumulative: 8 }),
      record({ day_number: 6, mortality_cumulative: 19, cull_cumulative: 1 }),
      record({ day_number: 7, mortality_cumulative: 23, cull_cumulative: 1 }),
      record({ day_number: 15, mortality_cumulative: 40, cull_cumulative: 4 }),
      record({ day_number: 30, mortality_cumulative: 71, cull_cumulative: 9 })
    ];
    const engineInput: EngineInput = {
      asOf: '2026-03-18' as IsoDate,
      batch: {
        placement_date: '2026-02-06' as IsoDate,
        chick_count: 3000,
        extra_chick_count: 30,
        chick_price_cents: Money.fromCents(100n)
      },
      parameters: {
        mortality: {
          base_rate_bp_daily: 0 as BasisPoints,
          preharvest_ramp_start_day: 30 as DayNumber,
          preharvest_ramp_rate_bp_daily: 0 as BasisPoints
        },
        slaughter_target_g: 1770 as Grams,
        gate_price_cents_per_bird: Money.fromCents(425n),
        gate_price_cents_per_kg: null,
        gate_pricing_basis: 'PER_BIRD',
        gate_capacity_per_day: 750,
        abattoir_fee_cents: null,
        transport_cents_per_bird: null,
        delivery_mode: 'ABATTOIR',
        feed_terms_days: 30,
        reserve_floor_cents: Money.fromCents(0n)
      },
      records,
      draws: [],
      sales: []
    };
    const production = projectProduction(engineInput);
    expect(production.days).toHaveLength(41);

    for (const day of production.days) {
      const result = standardFeedForDay({
        points: SEED,
        day: day.day_number,
        chick_count: 3000,
        extra_chick_count: 30,
        records
      });
      expect(result, `day ${day.day_number}`).toMatchObject({ birds: day.opening_birds });
    }
  });
});

describe("past the curve's last day (T-E9, D26)", () => {
  it('returns beyond_curve with the last day, and no amount', () => {
    expect(standardFeedForDay(input({ day: 42 }))).toEqual({ kind: 'beyond_curve', last_curve_day: 41 });
    expect(standardFeedForDay(input({ day: 60 }))).toEqual({ kind: 'beyond_curve', last_curve_day: 41 });
  });
});

describe('refusals (T-E10)', () => {
  it('throws when the records remove more birds than the flock', () => {
    const records = [record({ day_number: 3, mortality_cumulative: 6000, cull_cumulative: 61 })];
    expect(() => standardFeedForDay(input({ day: 5, records }))).toThrow(/removals exceed the flock/);
  });

  it('throws when a cumulative goes down', () => {
    const records = [
      record({ day_number: 3, mortality_cumulative: 9 }),
      record({ day_number: 4, mortality_cumulative: 7 })
    ];
    expect(() => standardFeedForDay(input({ day: 5, records }))).toThrow(/must be monotonic/);
  });

  it('throws for a day that cannot exist, as feedPhaseForDay does (D22)', () => {
    expect(() => standardFeedForDay(input({ day: 0 }))).toThrow(/day 0 /i);
    expect(() => standardFeedForDay(input({ day: 2.5 }))).toThrow(/day 2\.5 /i);
  });
});
