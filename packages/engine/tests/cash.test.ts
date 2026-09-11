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

  it('throws rather than dropping a flow dated before placement day 1', () => {
    // terms_days: 0 and a collection the day before placement survives
    // feed.ts's asOf filter (it's already collected) but derives a due_date
    // before day 1 — the case finding 2 names.
    const engineInput = input('2026-02-06', {
      draws: [
        {
          collection_date: '2026-02-05' as IsoDate,
          phase: 'STARTER',
          bags: 5,
          kg: 250,
          price_per_bag_cents: 3250n as Cents,
          terms_days: 0
        }
      ]
    });
    expect(() =>
      projectCashCalendar(engineInput, 5, 0n as Cents, feedFor(engineInput))
    ).toThrow(/before placement day 1/);
  });
});

describe('projectCashCalendar — planned feed draws (finding 1)', () => {
  it('books a not-yet-collected planned draw on its due date, priced by phase like measured feed', () => {
    const engineInput = input('2026-02-06'); // no draws entered at all
    const calendar = projectCashCalendar(engineInput, 45, 0n as Cents, feedFor(engineInput));

    // Planned draw 2 (feed.test.ts: collection 2026-02-20, days 15-21) is
    // entirely GROWER: 67+73+80+86+93+100+107 = 606 g/bird x 3,000 birds =
    // 1,818,000 g, at GROWER's 62 cents/kg = 112,716 cents exactly (no
    // rounding needed — divides evenly). Due 30 days later: 2026-03-22.
    const dueDay = calendar.days.find((d) => d.date === '2026-03-22');
    expect(dueDay?.flows.map((f) => f.kind)).toContain('PLANNED_FEED_DRAW_PAYMENT');
    expect(dueDay?.out_cents).toBe(112716n);

    expect(calendar.planned_feed_confidence).toBe('assumed');
  });

  it('does not double-book a planned draw once the same collection has a real, entered draw', () => {
    // planned_draws[0] covers days 1-14, collection_date = placement,
    // due_date = placement + 30 = 2026-03-08 — the SAME collection as the
    // real draw entered below. Only the real payment should land there.
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
    const dueDay = calendar.days.find((d) => d.date === '2026-03-08');

    expect(dueDay?.flows.filter((f) => f.kind === 'FEED_DRAW_PAYMENT')).toHaveLength(1);
    expect(dueDay?.flows.filter((f) => f.kind === 'PLANNED_FEED_DRAW_PAYMENT')).toHaveLength(0);
    // The real draw's own price ($325.00), not that PLUS a planned figure.
    expect(dueDay?.out_cents).toBe(32500n);
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
  it('reports both value gaps and the formula gap for a BULK order rather than guessing bulk net', () => {
    const missing = cashFlowsMissingInputs(input('2026-03-10', { sales: [bulkOrder] }));
    const keys = missing.map((m) => m.key);

    expect(keys).toContain('transport_cents_per_bird');
    expect(keys).toContain('abattoir_fee');
    expect(keys).toContain('bulk_price');
    expect(missing.every((m) => /OQ-2|OQ-16/.test(m.why))).toBe(true);

    // OQ-16 gates transport independently of OQ-2 (finding 6) — pin the
    // specific entry's wording, not just the property across every entry.
    const transportEntry = missing.find((m) => m.key === 'transport_cents_per_bird');
    expect(transportEntry?.why).toMatch(/OQ-16/);
  });

  it('reports nothing missing when there is no bulk order', () => {
    expect(cashFlowsMissingInputs(input('2026-03-10', { sales: [gateOrder] }))).toEqual([]);
  });

  it('keeps reporting a BULK candidate once abattoir fee and transport are both supplied — OQ-16 is a formula question, not a values one (finding 4)', () => {
    const engineInput = input('2026-03-10', {
      parameters: parameters({
        abattoir_fee_cents: 5000n as Cents,
        transport_cents_per_bird: 1000n as Cents
      }),
      sales: [bulkOrder]
    });
    const missing = cashFlowsMissingInputs(engineInput);

    expect(missing.map((m) => m.key)).toEqual(['bulk_price']);
    expect(missing[0]?.why).toMatch(/OQ-16/);
    expect(missing[0]?.why).toMatch(/does not release|not release/);
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

  it('scales chick cost and PER_BIRD overheads off chick_count + extra_chick_count, not chick_count alone — invariant 9', () => {
    const engineInput = input('2026-02-06', {
      batch: {
        placement_date: PLACEMENT,
        chick_count: 3000,
        extra_chick_count: 100,
        chick_price_cents: 100n as Cents
      }
    });
    const calendar = projectCashCalendar(engineInput, 1, 0n as Cents, feedFor(engineInput));
    const day1 = calendar.days[0];

    // Flock = 3,100. Chick cost: 3,100 x $1.00 = $3,100.00 (310000 cents).
    //
    // Vaccine (PER_BIRD, $42.00 measured at 3,000): 4200 x 3100 / 3000 =
    // 4,340 cents exactly (13,020,000 / 3,000 divides evenly).
    // Transport/other (PER_BIRD, $400.00 measured at 3,000): 40000 x 3100 /
    // 3000 = 41,333.33..., rounds UP to 41,334 cents (a cost never rounds
    // down — overheadLineCents).
    // Electricity ($140.00) and labour ($640.00) are PER_BATCH: unchanged.
    // Overhead total: 4,340 + 41,334 + 14,000 + 64,000 = 123,674 cents.
    const chickFlow = day1?.flows.find((f) => f.kind === 'CHICK_COST');
    expect(chickFlow?.amount_cents).toBe(-310000n);

    const overheadTotal = (day1?.flows.filter((f) => f.kind === 'OVERHEAD') ?? []).reduce(
      (sum, f) => sum - f.amount_cents,
      0n
    );
    expect(overheadTotal).toBe(123674n);
    expect(day1?.out_cents).toBe(310000n + 123674n);
  });

  it('treats an omitted overheads parameter as the measured default, distinct from an explicit empty model', () => {
    const omitted = input('2026-02-06');
    const withDefault = projectCashCalendar(omitted, 1, 0n as Cents, feedFor(omitted));
    const defaultTotal = (
      withDefault.days[0]?.flows.filter((f) => f.kind === 'OVERHEAD') ?? []
    ).reduce((sum, f) => sum - f.amount_cents, 0n);
    // $1,222.00 — SEED_OVERHEADS at 3,000 birds, absent means "use the
    // client's measured default", per Parameters.overheads.
    expect(defaultTotal).toBe(122200n);

    const explicitEmpty = input('2026-02-06', {
      parameters: parameters({ overheads: { lines: [] } })
    });
    const withEmpty = projectCashCalendar(explicitEmpty, 1, 0n as Cents, feedFor(explicitEmpty));
    // {lines: []} means "charge nothing" — deliberately, not "use the default".
    expect(withEmpty.days[0]?.flows.filter((f) => f.kind === 'OVERHEAD')).toHaveLength(0);
    expect(withEmpty.days[0]?.out_cents).toBe(300000n); // chick cost only
  });
});

describe('projectCashCalendar — the reserve floor', () => {
  it('reports a breach and its first date without altering any balance', () => {
    const engineInput = input('2026-02-06', {
      parameters: parameters({ reserve_floor_cents: -100000n as Cents })
    });
    const calendar = projectCashCalendar(engineInput, 5, 0n as Cents, feedFor(engineInput));

    expect(calendar.breaches_reserve_floor).toBe(true);
    expect(calendar.first_breach_date).toBe('2026-02-06');
    // The floor REPORTS; it never clamps. AD-43: filtering is M5b's job.
    expect(calendar.days[0]?.closing_cents).toBe(-422200n);
  });

  it('reports no breach when every closing balance clears the floor', () => {
    const engineInput = input('2026-02-06', {
      parameters: parameters({ reserve_floor_cents: -1000000n as Cents })
    });
    const calendar = projectCashCalendar(engineInput, 5, 0n as Cents, feedFor(engineInput));

    expect(calendar.breaches_reserve_floor).toBe(false);
    expect(calendar.first_breach_date).toBeNull();
  });

  it('reports the EARLIEST date a recurring minimum occurs', () => {
    const engineInput = input('2026-02-06');
    const calendar = projectCashCalendar(engineInput, 5, 0n as Cents, feedFor(engineInput));

    // Nothing moves after day 1, so days 1-5 all hold the minimum.
    expect(calendar.minimum_cents).toBe(-422200n);
    expect(calendar.minimum_date).toBe('2026-02-06');
  });
});
