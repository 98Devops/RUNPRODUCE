import { describe, expect, it } from 'vitest';
import { computeDecision, isNotImplemented } from '../src/index.js';
import { Money } from '../src/money.js';
import type { BasisPoints, DayNumber, EngineInput, Grams, IsoDate, SalesOrder } from '../src/types.js';

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

const bulkSale: SalesOrder = {
  channel: 'BULK',
  order_date: '2026-03-08' as IsoDate,
  bird_count: 1200,
  avg_live_weight_g: 1843 as Grams,
  pricing_basis: 'PER_BIRD',
  price_cents_per_bird: Money.fromCents(390n),
  price_cents_per_kg: null,
  terms_days: 30
};

describe('computeDecision', () => {
  it('returns production and costing for a batch with no sales', () => {
    const result = computeDecision(input());
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.decision.production.total_feed_kg).toBe(13224);
    expect(result.decision.costing.feed_cost_cents).toBe(807981n);
  });

  it('refuses to price a BULK sale with no abattoir fee, naming both gaps (fixture 13)', () => {
    const result = computeDecision(input({ sales: [bulkSale] }));
    expect(result).toEqual({
      kind: 'missing_input',
      missing: [
        { key: 'abattoir_fee', why: 'Client has not provided the abattoir fee per bird (OQ-2)' },
        {
          key: 'transport_cents_per_bird',
          why: 'Client has not provided transport cost per bird (OQ-2)'
        }
      ]
    });
  });

  it('does not demand an abattoir fee when nothing is sold in bulk', () => {
    const gateSale: SalesOrder = { ...bulkSale, channel: 'GATE' };
    expect(computeDecision(input({ sales: [gateSale] })).kind).toBe('ok');
  });

  it('does not demand an abattoir fee when birds go direct, not via the abattoir', () => {
    const result = computeDecision(
      input({
        sales: [bulkSale],
        parameters: {
          ...input().parameters,
          delivery_mode: 'DIRECT',
          transport_cents_per_bird: Money.fromCents(15n)
        }
      })
    );
    expect(result.kind).toBe('ok');
  });

  it('returns feed liability now that U3 has built it', () => {
    const result = computeDecision(input());
    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(result.decision.feed.first_draw_bags_to_day_14).toBe(26.64);
    expect(result.decision.feed.due_dates).toEqual([]);
  });

  it('returns a harvest plan now that U4 has built it', () => {
    const result = computeDecision(input());
    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(result.decision.harvest.bulk_harvest_day).toBe(31);
    expect(result.decision.harvest.confidence).toBe('assumed');
    // The yield caveat travels with the day, never behind an optional field.
    expect(result.decision.harvest.yield_sensitivity.holds_to_pct).toBeCloseTo(62.7, 1);
  });

  it('still holds the module U5 has not built', () => {
    const result = computeDecision(input());
    if (result.kind !== 'ok') throw new Error('expected ok');
    for (const key of ['allocation'] as const) {
      let thrown: unknown;
      try {
        void result.decision[key];
      } catch (error) {
        thrown = error;
      }
      expect(isNotImplemented(thrown), `${key} should still be held`).toBe(true);
    }
  });
});
