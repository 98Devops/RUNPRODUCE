import { describe, expect, it } from 'vitest';
import { projectProduction } from '../src/production.js';
import { Money } from '../src/money.js';
import type { BasisPoints, DailyRecord, DayNumber, EngineInput, Grams, IsoDate } from '../src/types.js';

/**
 * The batch behind golden fixtures 1-5 and 12: the client's own 3,000-bird
 * run, placed 2026-02-06. Day 41 is 2026-03-18, day 30 is 2026-03-07.
 */
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
    ...overrides,
    day_number: overrides.day_number as DayNumber
  };
}

describe('projectProduction — the golden fixture batch', () => {
  it('counts extra chicks toward the flock (fixture 12, KB-1)', () => {
    const projection = projectProduction(
      input({ batch: { ...input().batch, extra_chick_count: 100 } })
    );
    expect(projection.flock_size).toBe(3100);
  });

  it('puts asOf 2026-03-18 at day 41 for a 2026-02-06 placement', () => {
    expect(projectProduction(input()).day_number).toBe(41);
  });

  it('gives 2.337 kg cumulative feed per bird at day 30 (fixture 4)', () => {
    const projection = projectProduction(input({ asOf: '2026-03-07' as IsoDate }));
    expect(projection.cumulative_feed_kg_per_bird).toBe(2.337);
  });

  it('gives 13,224 kg total feed at day 41 for 3,000 birds (fixture 2)', () => {
    expect(projectProduction(input()).total_feed_kg).toBe(13224);
  });

  it('gives FCR 1.53 at day 41 (fixture 3 — not the sheet’s 0.77, KB-4)', () => {
    expect(projectProduction(input()).fcr).toBe(1.53);
  });

  it('carries 8,625 kg of live weight at day 41', () => {
    expect(projectProduction(input()).live_weight_kg).toBe(8625);
  });
});

describe('projectProduction — birds alive', () => {
  it('has every placed bird opening and closing when nothing is recorded', () => {
    const projection = projectProduction(input());
    expect(projection.opening_birds).toBe(3000);
    expect(projection.closing_birds).toBe(3000);
  });

  it('derives the day’s removals from the cumulative columns, not a stored delta', () => {
    const projection = projectProduction(
      input({
        asOf: '2026-02-10' as IsoDate,
        records: [
          record({ day_number: 3, mortality_cumulative: 12, cull_cumulative: 1 }),
          record({ day_number: 4, mortality_cumulative: 15, cull_cumulative: 1 }),
          record({ day_number: 5, mortality_cumulative: 20, cull_cumulative: 4 })
        ]
      })
    );
    // Day 5 opens on day 4's cumulative total: 3000 - 15 - 1.
    expect(projection.opening_birds).toBe(2984);
    // and closes on day 5's: 3000 - 20 - 4. The deltas are 5 dead and 3 culled.
    expect(projection.closing_birds).toBe(2976);
  });

  it('carries the last known cumulative forward rather than inventing removals', () => {
    const projection = projectProduction(
      input({
        asOf: '2026-02-15' as IsoDate,
        records: [record({ day_number: 3, mortality_cumulative: 12, cull_cumulative: 1 })]
      })
    );
    expect(projection.opening_birds).toBe(2987);
    expect(projection.closing_birds).toBe(2987);
  });

  it('ignores records dated after asOf (invariant 7 — no lookahead)', () => {
    const projection = projectProduction(
      input({
        asOf: '2026-02-08' as IsoDate,
        records: [
          record({ day_number: 3, mortality_cumulative: 12 }),
          record({ day_number: 9, mortality_cumulative: 400 })
        ]
      })
    );
    expect(projection.closing_birds).toBe(2988);
  });
});

describe('projectProduction — feed is charged to opening birds (AD-7, invariant 10)', () => {
  it('charges a dead bird for the day it died on', () => {
    // Day 2 opens with 3,000 birds and closes with 2,900. The client's sheet
    // would feed 2,900 birds on day 2; we feed the 3,000 that were alive to eat.
    const withDeaths = projectProduction(
      input({
        asOf: '2026-02-07' as IsoDate,
        records: [record({ day_number: 2, mortality_cumulative: 100 })]
      })
    );
    const day1FeedG = 10;
    const day2FeedG = 20;
    expect(withDeaths.total_feed_kg).toBe((3000 * day1FeedG + 3000 * day2FeedG) / 1000);
  });

  it('feeds only the birds still alive on later days', () => {
    const projection = projectProduction(
      input({
        asOf: '2026-02-08' as IsoDate,
        records: [record({ day_number: 2, mortality_cumulative: 100 })]
      })
    );
    const day3FeedG = 20;
    expect(projection.total_feed_kg).toBe((3000 * 10 + 3000 * 20 + 2900 * day3FeedG) / 1000);
  });
});

describe('projectProduction — cumulative removals are validated (invariant 13)', () => {
  it('rejects mortality that goes backwards', () => {
    expect(() =>
      projectProduction(
        input({
          records: [
            record({ day_number: 3, mortality_cumulative: 12 }),
            record({ day_number: 4, mortality_cumulative: 11 })
          ]
        })
      )
    ).toThrow(/monotonic/i);
  });

  it('rejects culls that go backwards', () => {
    expect(() =>
      projectProduction(
        input({
          records: [
            record({ day_number: 3, cull_cumulative: 5 }),
            record({ day_number: 4, cull_cumulative: 4 })
          ]
        })
      )
    ).toThrow(/monotonic/i);
  });

  it('rejects removals exceeding the flock under the JOINT bound', () => {
    // Neither column alone exceeds 3,000; together they remove 3,001 birds
    // from a flock of 3,000. A per-column bound would let this through.
    expect(() =>
      projectProduction(
        input({
          records: [
            record({ day_number: 10, mortality_cumulative: 2000, cull_cumulative: 1001 })
          ]
        })
      )
    ).toThrow(/exceed/i);
  });

  it('counts extra chicks in the joint bound', () => {
    expect(() =>
      projectProduction(
        input({
          batch: { ...input().batch, extra_chick_count: 100 },
          records: [
            record({ day_number: 10, mortality_cumulative: 2000, cull_cumulative: 1001 })
          ]
        })
      )
    ).not.toThrow();
  });

  it('rejects a day number outside the curve', () => {
    expect(() => projectProduction(input({ asOf: '2026-04-30' as IsoDate }))).toThrow(
      /curve/i
    );
  });
});

describe('projectProduction — nothing left alive', () => {
  it('reports no FCR rather than a confident wrong one when the flock is gone', () => {
    // Feed was eaten and no live weight was produced. FCR is undefined, not
    // zero and not Infinity — a blank beats a number that reads as a ratio.
    const projection = projectProduction(
      input({
        asOf: '2026-02-10' as IsoDate,
        records: [record({ day_number: 5, mortality_cumulative: 3000 })]
      })
    );
    expect(projection.closing_birds).toBe(0);
    expect(projection.live_weight_kg).toBe(0);
    expect(projection.fcr).toBeNull();
  });

  it('still charges feed for the days those birds were alive', () => {
    const projection = projectProduction(
      input({
        asOf: '2026-02-10' as IsoDate,
        records: [record({ day_number: 5, mortality_cumulative: 3000 })]
      })
    );
    // Days 1-5 all open with 3,000 birds; the deaths land on day 5's close.
    expect(projection.total_feed_kg).toBe((3000 * (10 + 20 + 20 + 20 + 20)) / 1000);
  });

  it('rejects a negative cumulative count', () => {
    expect(() =>
      projectProduction(
        input({ records: [record({ day_number: 3, mortality_cumulative: -5 })] })
      )
    ).toThrow(/monotonic/i);
  });
});

describe('projectProduction — a carried-forward day is distinguishable from a recorded one', () => {
  /**
   * Day 20 and day 22 are entered; day 21 is not. Day 22 restates day 20's
   * total, so its TRUE delta is zero. Day 21's zero is an absence of data.
   * The two must not look the same — invariant 5.
   */
  const withGap = () =>
    projectProduction(
      input({
        asOf: '2026-02-27' as IsoDate,
        records: [
          record({ day_number: 20, mortality_cumulative: 40, cull_cumulative: 3 }),
          record({ day_number: 22, mortality_cumulative: 40, cull_cumulative: 3 })
        ]
      })
    );

  it('flags the missing day as carried forward', () => {
    const day21 = withGap().days.find((d) => d.day_number === 21);
    expect(day21?.carried_forward).toBe(true);
  });

  it('does NOT flag a recorded day whose true delta happens to be zero', () => {
    const day22 = withGap().days.find((d) => d.day_number === 22);
    expect(day22?.carried_forward).toBe(false);
    expect(day22?.daily_mortality).toBe(0);
  });

  it('leaves the carried-forward VALUE untouched — only its provenance is marked', () => {
    const day21 = withGap().days.find((d) => d.day_number === 21);
    expect(day21?.mortality_cumulative).toBe(40);
    expect(day21?.cull_cumulative).toBe(3);
    expect(day21?.closing_birds).toBe(2957);
  });

  it('counts how far a carried-forward day is from the last real entry', () => {
    const days = withGap().days;
    expect(days.find((d) => d.day_number === 20)?.days_since_last_record).toBe(0);
    expect(days.find((d) => d.day_number === 21)?.days_since_last_record).toBe(1);
    expect(days.find((d) => d.day_number === 22)?.days_since_last_record).toBe(0);
  });

  it('marks days before the first entry, counting from placement', () => {
    const days = withGap().days;
    const day1 = days.find((d) => d.day_number === 1);
    expect(day1?.carried_forward).toBe(true);
    expect(day1?.days_since_last_record).toBe(0);
    expect(days.find((d) => d.day_number === 5)?.days_since_last_record).toBe(4);
  });

  it('runs the series from placement day through asOf', () => {
    const days = withGap().days;
    expect(days.map((d) => d.day_number)).toEqual(
      Array.from({ length: 22 }, (_, i) => i + 1)
    );
  });

  it('flags the headline figures when asOf itself has no entry', () => {
    const projection = projectProduction(
      input({
        asOf: '2026-02-27' as IsoDate,
        records: [record({ day_number: 20, mortality_cumulative: 40 })]
      })
    );
    expect(projection.carried_forward).toBe(true);
    expect(projection.days_since_last_record).toBe(2);
    expect(projection.closing_birds).toBe(2960);
  });

  it('does not flag the headline figures when asOf is entered', () => {
    const projection = projectProduction(
      input({
        asOf: '2026-02-27' as IsoDate,
        records: [record({ day_number: 22, mortality_cumulative: 40 })]
      })
    );
    expect(projection.carried_forward).toBe(false);
    expect(projection.days_since_last_record).toBe(0);
  });

  it('flags an entirely unrecorded batch rather than passing zero off as measured', () => {
    const projection = projectProduction(input());
    expect(projection.carried_forward).toBe(true);
    expect(projection.days.every((d) => d.carried_forward)).toBe(true);
  });
});
