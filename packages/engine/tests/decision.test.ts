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
  avg_dressed_weight_g: null,
  bands: null,
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
    expect(result.decision.costing.feed_cost_cents).toBe(769806n);
  });

  it('refuses to price a BULK sale with no abattoir fee, naming both gaps (fixture 13)', () => {
    const result = computeDecision(input({ sales: [bulkSale] }));
    expect(result).toEqual({
      kind: 'missing_input',
      missing: [
        // AD-60: the wording is the shared refusal's. It said "Client has not
        // provided ... (OQ-2)" — true when written, false since 2026-09-12.
        { key: 'abattoir_fee', why: 'This input carries no abattoir fee per bird, which nets a bulk sale delivered via the abattoir. The client answered it on 2026-09-10 (10 cents, SEED_ABATTOIR_FEE_CENTS), but a known value is not a supplied one.' },
        { key: 'transport_cents_per_bird', why: 'This input carries no transport cost per bird, which nets a bulk sale. The client answered it on 2026-09-12 (10 cents, SEED_TRANSPORT_CENTS_PER_BIRD, separate from the abattoir fee), but a known value is not a supplied one.' }
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

  /**
   * TD-4 finding 8. computeDecision, the cash calendar and computeAllocation
   * each carried their own refusal list, and they drifted: these two inputs
   * returned ok here while the calendar refused them. One shared list now
   * answers for all three.
   */
  it('refuses a BANDED bulk order that carries no band schedule', () => {
    const naked: SalesOrder = { ...bulkSale, pricing_basis: 'BANDED', price_cents_per_bird: null };
    const result = computeDecision(
      input({
        sales: [naked],
        parameters: {
          ...input().parameters,
          abattoir_fee_cents: Money.fromCents(10n),
          transport_cents_per_bird: Money.fromCents(10n)
        }
      })
    );
    expect(result.kind).toBe('missing_input');
    if (result.kind !== 'missing_input') return;
    expect(result.missing.map((m) => m.key)).toEqual(['bulk_price']);
  });

  it('refuses a gate order that carries no price for its own basis', () => {
    const unpriced: SalesOrder = { ...bulkSale, channel: 'GATE', price_cents_per_bird: null };
    const result = computeDecision(input({ sales: [unpriced] }));
    expect(result.kind).toBe('missing_input');
    if (result.kind !== 'missing_input') return;
    expect(result.missing.map((m) => m.key)).toEqual(['gate_price']);
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

describe('the engine surface', () => {
  /**
   * The gap this exists to catch: every M5b function lived in allocation.ts and
   * was never re-exported from index.ts, so the whole module was unreachable
   * from the package entry point. No test noticed, because the allocation tests
   * import '../src/allocation.js' directly.
   */
  it('reaches the allocation module from the package entry point', async () => {
    const engine = await import('../src/index.js');
    for (const name of [
      'computeAllocation',
      'enumerateCandidates',
      'handoffAtPlacement',
      'candidateInput',
      'projectCandidate',
      'scoreCandidate',
      'pickWinner',
      'placeNothing',
      'DEFAULT_PLACEMENT_STEP_BIRDS'
    ]) {
      expect(engine, `${name} should be exported from index.ts`).toHaveProperty(name);
    }
  });

  it('holds allocation on the cash balance, not on the optimiser being unbuilt', () => {
    const result = computeDecision(input());
    if (result.kind !== 'ok') throw new Error('expected ok');

    let thrown: unknown;
    try {
      void result.decision.allocation;
    } catch (error) {
      thrown = error;
    }
    // Still NotImplementedError, because classifyFixture holds only on that
    // exact type — but the reason is now OQ-25, and the unit is U6.
    expect(isNotImplemented(thrown)).toBe(true);
    expect((thrown as Error).message).toMatch(/OQ-25/);
    expect((thrown as Error).message).toMatch(/U6/);
  });
});

describe('sales quantity validation — 0 < ordered <= birds alive', () => {
  const gateSale = (bird_count: number, order_date = '2026-03-08'): SalesOrder => ({
    channel: 'GATE',
    order_date: order_date as IsoDate,
    bird_count,
    avg_live_weight_g: 1770 as Grams,
    avg_dressed_weight_g: null,
    bands: null,
    pricing_basis: 'PER_BIRD',
    price_cents_per_bird: Money.fromCents(430n),
    price_cents_per_kg: null,
    terms_days: 0
  });

  it('refuses an order for more birds than are alive that day', () => {
    // The exact shape found in the 2026-09-12 due-diligence pass: this returned
    // `ok`, and every downstream figure would have been revenue on birds that
    // do not exist.
    const result = computeDecision(input({ sales: [gateSale(999_999)] }));

    expect(result.kind).toBe('missing_input');
    if (result.kind !== 'missing_input') throw new Error('unreachable');
    const entry = result.missing.find((m) => m.key === 'sales_bird_count');
    expect(entry).toBeDefined();
    // Actionable: it names the order and both numbers, so a capture screen can
    // point at the row rather than at the concept.
    expect(entry?.why).toContain('999999');
    expect(entry?.why).toContain('2026-03-08');
  });

  it('refuses a negative bird count', () => {
    const result = computeDecision(input({ sales: [gateSale(-500)] }));

    expect(result.kind).toBe('missing_input');
    if (result.kind !== 'missing_input') throw new Error('unreachable');
    expect(result.missing.map((m) => m.key)).toContain('sales_bird_count');
  });

  it('refuses a zero bird count — an order for nothing is not an order', () => {
    const result = computeDecision(input({ sales: [gateSale(0)] }));
    if (result.kind !== 'missing_input') throw new Error('expected refusal');
    expect(result.missing.map((m) => m.key)).toContain('sales_bird_count');
  });

  it('refuses two orders that are individually fine but oversell together', () => {
    // Production models mortality and NEVER subtracts sold birds, so each of
    // these passes a per-day check on its own. Their sum does not.
    const result = computeDecision({
      ...input(),
      sales: [gateSale(2000, '2026-03-08'), gateSale(1500, '2026-03-09')]
    });

    expect(result.kind).toBe('missing_input');
    if (result.kind !== 'missing_input') throw new Error('unreachable');
    expect(result.missing.map((m) => m.key)).toContain('sales_bird_count');
  });

  it('allows a legitimate order and changes nothing about it', () => {
    const result = computeDecision(input({ sales: [gateSale(2900)] }));
    expect(result.kind).toBe('ok');
  });

  it('allows a future-dated order the production series does not reach', () => {
    // asOf is 2026-03-18 and the series stops there, so there is no day to
    // check against. The flock-size ceiling still applies — you can never sell
    // more birds than were ever placed — but a plausible forward order stands.
    const result = computeDecision(input({ sales: [gateSale(2500, '2026-04-01')] }));
    expect(result.kind).toBe('ok');
  });

  it('still refuses a future-dated order that exceeds the whole flock', () => {
    const result = computeDecision(input({ sales: [gateSale(999_999, '2026-04-01')] }));
    if (result.kind !== 'missing_input') throw new Error('expected refusal');
    expect(result.missing.map((m) => m.key)).toContain('sales_bird_count');
  });
});
