import { describe, expect, it } from 'vitest';
import { projectCashCalendar } from '../src/cash.js';
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

function input(asOf: string, overrides: Partial<EngineInput> = {}): EngineInput {
  return {
    asOf: asOf as IsoDate,
    batch: {
      placement_date: PLACEMENT,
      chick_count: 3000,
      extra_chick_count: 0,
      chick_price_cents: 100n as Cents
    },
    parameters: parameters(),
    records: [],
    draws: [],
    sales: [],
    ...overrides
  };
}

describe('projectCashCalendar — the spine', () => {
  it('covers day 1 through through_day, dated from placement', () => {
    const calendar = projectCashCalendar(input('2026-02-06'), 5, 0n as Cents);

    expect(calendar.days).toHaveLength(5);
    expect(calendar.days[0]?.day_number).toBe(1);
    expect(calendar.days[0]?.date).toBe('2026-02-06');
    expect(calendar.days[4]?.day_number).toBe(5);
    expect(calendar.days[4]?.date).toBe('2026-02-10');
    expect(calendar.through_day).toBe(5);
  });

  it("carries each day's closing into the next day's opening", () => {
    const calendar = projectCashCalendar(input('2026-02-06'), 5, 50000n as Cents);

    expect(calendar.opening_cents).toBe(50000n);
    for (let i = 1; i < calendar.days.length; i += 1) {
      expect(calendar.days[i]?.opening_cents).toBe(calendar.days[i - 1]?.closing_cents);
    }
    expect(calendar.closing_cents).toBe(calendar.days[4]?.closing_cents);
  });

  it('rejects a horizon before placement day 1', () => {
    expect(() => projectCashCalendar(input('2026-02-06'), 0, 0n as Cents)).toThrow(
      /through_day 0 is before placement day 1/
    );
  });
});
