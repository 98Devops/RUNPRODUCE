import { describe, expect, it } from 'vitest';
import { cashFlowsMissingInputs, projectCashCalendar } from '../src/cash.js';
import { computeFeedLiability } from '../src/feed.js';
import { projectProduction } from '../src/production.js';
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

function feedFor(engineInput: EngineInput) {
  return computeFeedLiability(engineInput, projectProduction(engineInput));
}

describe('projectCashCalendar — the spine', () => {
  it('covers day 1 through through_day, dated from placement', () => {
    const engineInput = input('2026-02-06');
    const calendar = projectCashCalendar(engineInput, 5, 0n as Cents, feedFor(engineInput));

    expect(calendar.days).toHaveLength(5);
    expect(calendar.days[0]?.day_number).toBe(1);
    expect(calendar.days[0]?.date).toBe('2026-02-06');
    expect(calendar.days[4]?.day_number).toBe(5);
    expect(calendar.days[4]?.date).toBe('2026-02-10');
    expect(calendar.through_day).toBe(5);
  });

  it("carries each day's closing into the next day's opening", () => {
    const engineInput = input('2026-02-06');
    const calendar = projectCashCalendar(engineInput, 5, 50000n as Cents, feedFor(engineInput));

    expect(calendar.opening_cents).toBe(50000n);
    for (let i = 1; i < calendar.days.length; i += 1) {
      expect(calendar.days[i]?.opening_cents).toBe(calendar.days[i - 1]?.closing_cents);
    }
    expect(calendar.closing_cents).toBe(calendar.days[4]?.closing_cents);
  });

  it('rejects a horizon before placement day 1', () => {
    const engineInput = input('2026-02-06');
    expect(() =>
      projectCashCalendar(engineInput, 0, 0n as Cents, feedFor(engineInput))
    ).toThrow(/through_day 0 is before placement day 1/);
  });
});

describe('projectCashCalendar — dated outflows', () => {
  it('charges chick cost on the placement date', () => {
    const engineInput = input('2026-02-06');
    const calendar = projectCashCalendar(engineInput, 5, 0n as Cents, feedFor(engineInput));
    const day1 = calendar.days[0];

    // 3,000 birds x $1.00 chicks + $1,222.00 of overheads, both on placement.
    expect(day1?.out_cents).toBe(422200n);
    expect(day1?.closing_cents).toBe(-422200n);
    expect(day1?.flows.map((f) => f.kind)).toContain('CHICK_COST');
  });

  it('charges a feed draw on its DUE date, not its collection date', () => {
    const engineInput = input('2026-03-10', {
      draws: [
        {
          collection_date: '2026-02-06' as IsoDate,
          phase: 'STARTER',
          bags: 10,
          kg: 500,
          price_per_bag_cents: 3250n as Cents,
          terms_days: 30
        }
      ]
    });
    const calendar = projectCashCalendar(engineInput, 40, 0n as Cents, feedFor(engineInput));

    // Collected day 1, 30-day terms, so it lands 2026-03-08 — day 31.
    const dueDay = calendar.days.find((d) => d.date === '2026-03-08');
    expect(dueDay?.out_cents).toBe(32500n);
    expect(dueDay?.flows.map((f) => f.kind)).toContain('FEED_DRAW_PAYMENT');

    const collectionDay = calendar.days[0];
    expect(collectionDay?.flows.map((f) => f.kind)).not.toContain('FEED_DRAW_PAYMENT');

    // The chick cost lands day 1 and the draw payment lands day 31; nothing
    // else moves after that, so day 31 is the low point for the rest of the
    // projection — and M5b ranks strategies by exactly this minimum, so it
    // needs a test proving the minimum can resolve mid-series, not just day 1.
    expect(calendar.minimum_date).toBe('2026-03-08');
    expect(calendar.minimum_cents).toBe(-454700n);
  });

  it('ignores a draw whose due date falls past the horizon', () => {
    const engineInput = input('2026-03-10', {
      draws: [
        {
          collection_date: '2026-02-06' as IsoDate,
          phase: 'STARTER',
          bags: 10,
          kg: 500,
          price_per_bag_cents: 3250n as Cents,
          terms_days: 30
        }
      ]
    });
    const calendar = projectCashCalendar(engineInput, 10, 0n as Cents, feedFor(engineInput));

    expect(calendar.days.some((d) => d.flows.some((f) => f.kind === 'FEED_DRAW_PAYMENT'))).toBe(
      false
    );
  });
});

const bulkOrder = {
  channel: 'BULK' as const,
  order_date: '2026-03-08' as IsoDate,
  bird_count: 1000,
  avg_live_weight_g: 1843 as Grams,
  pricing_basis: 'PER_BIRD' as const,
  price_cents_per_bird: 390n as Cents,
  price_cents_per_kg: null,
  terms_days: 30
};

const gateOrder = {
  channel: 'GATE' as const,
  order_date: '2026-03-08' as IsoDate,
  bird_count: 500,
  avg_live_weight_g: 1843 as Grams,
  pricing_basis: 'PER_BIRD' as const,
  price_cents_per_bird: 425n as Cents,
  price_cents_per_kg: null,
  terms_days: 0
};

describe('projectCashCalendar — receipts', () => {
  it('books a gate receipt on the order date, same day, for cash', () => {
    const engineInput = input('2026-03-10', { sales: [gateOrder] });
    const calendar = projectCashCalendar(engineInput, 35, 0n as Cents, feedFor(engineInput));
    const saleDay = calendar.days.find((d) => d.date === '2026-03-08');

    // 500 birds x $4.25.
    expect(saleDay?.in_cents).toBe(212500n);
    expect(saleDay?.flows.map((f) => f.kind)).toContain('GATE_RECEIPT');
  });

  it('prices a PER_KG gate order from integer grams', () => {
    const engineInput = input('2026-03-10', {
      sales: [{ ...gateOrder, pricing_basis: 'PER_KG', price_cents_per_bird: null, price_cents_per_kg: 200n as Cents }]
    });
    const calendar = projectCashCalendar(engineInput, 35, 0n as Cents, feedFor(engineInput));
    const saleDay = calendar.days.find((d) => d.date === '2026-03-08');

    // 500 birds x 1.843 kg x $2.00/kg, truncated to the cent.
    expect(saleDay?.in_cents).toBe(184300n);
  });

  it('truncates a PER_KG gate receipt rather than rounding up — 368, not 369', () => {
    const engineInput = input('2026-03-10', {
      sales: [
        {
          ...gateOrder,
          bird_count: 1,
          pricing_basis: 'PER_KG',
          price_cents_per_bird: null,
          price_cents_per_kg: 200n as Cents
        }
      ]
    });
    const calendar = projectCashCalendar(engineInput, 35, 0n as Cents, feedFor(engineInput));
    const saleDay = calendar.days.find((d) => d.date === '2026-03-08');

    // 1 bird x 1.843 kg x $2.00/kg = 368.6 cents. Truncated toward zero this
    // is 368; rounding up (which a receipt must never do) would give 369.
    expect(saleDay?.in_cents).toBe(368n);
  });

  /**
   * The spec's blocked half. Bulk net is contract price minus the abattoir fee
   * minus transport, and transport is null pending OQ-2 while OQ-16 gates the
   * double-count question independently.
   */
  it('reports both gaps for a BULK order rather than guessing bulk net', () => {
    const missing = cashFlowsMissingInputs(input('2026-03-10', { sales: [bulkOrder] }));
    const keys = missing.map((m) => m.key);

    expect(keys).toContain('transport_cents_per_bird');
    expect(keys).toContain('abattoir_fee');
    expect(missing.every((m) => /OQ-2|OQ-16/.test(m.why))).toBe(true);
  });

  it('reports nothing missing when there is no bulk order', () => {
    expect(cashFlowsMissingInputs(input('2026-03-10', { sales: [gateOrder] }))).toEqual([]);
  });

  it('throws rather than returning a calendar missing a bulk receipt', () => {
    const engineInput = input('2026-03-10', { sales: [bulkOrder] });
    expect(() => projectCashCalendar(engineInput, 35, 0n as Cents, feedFor(engineInput))).toThrow(
      /bulk net/
    );
  });
});

describe('projectCashCalendar — overheads', () => {
  it('charges every overhead line on the placement date, flagged assumed', () => {
    const engineInput = input('2026-02-06');
    const calendar = projectCashCalendar(engineInput, 5, 0n as Cents, feedFor(engineInput));
    const day1 = calendar.days[0];

    // $3,000 chicks + $1,222 of overheads at his 3,000-bird scale.
    expect(day1?.out_cents).toBe(300000n + 122200n);
    expect(day1?.flows.filter((f) => f.kind === 'OVERHEAD')).toHaveLength(4);
    expect(calendar.overhead_timing).toBe('assumed');
  });

  it('scales PER_BIRD overhead lines with the flock and leaves PER_BATCH alone', () => {
    const engineInput = input('2026-02-06', {
      batch: {
        placement_date: PLACEMENT,
        chick_count: 6000,
        extra_chick_count: 0,
        chick_price_cents: 100n as Cents
      }
    });
    const calendar = projectCashCalendar(engineInput, 5, 0n as Cents, feedFor(engineInput));
    const overheads = calendar.days[0]?.flows.filter((f) => f.kind === 'OVERHEAD') ?? [];
    const total = overheads.reduce((sum, f) => sum - f.amount_cents, 0n);

    // Vaccine $42 and transport $400 double; labour $640 and electricity $140 do not.
    expect(total).toBe(8400n + 80000n + 64000n + 14000n);
  });
});
