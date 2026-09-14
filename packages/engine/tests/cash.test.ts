import { describe, expect, it } from 'vitest';
import {
  SEED_ABATTOIR_COST_CENTS_PER_BIRD,
  SEED_ABATTOIR_FEE_CENTS,
  SEED_TRANSPORT_CENTS_PER_BIRD,
  bulkNetCentsPerBird,
  cashFlowsMissingInputs,
  projectCashCalendar
} from '../src/cash.js';
import { addDays } from '../src/day-number.js';
import { computeFeedLiability } from '../src/feed.js';
import { projectProduction } from '../src/production.js';
import type {
  CashFlow,
  Cents,
  EngineInput,
  Grams,
  IsoDate,
  Parameters,
  SalesOrder
} from '../src/types.js';

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

    // $3,000 of chicks, $53.28 of delivery on the 1,332 kg collected that day
    // (AD-54), and only the overheads he actually pays on day 1 (AD-56):
    // $42 vaccine upfront plus February's $103.87 share of electricity.
    // Labour is not here any more — it lands when the batch is done.
    expect(day1?.out_cents).toBe(300000n + 5328n + 4200n + 10387n);
    expect(day1?.closing_cents).toBe(-319915n);
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
    const drawFlow = dueDay?.flows.find((f) => f.kind === 'FEED_DRAW_PAYMENT');
    expect(drawFlow?.amount_cents).toBe(-32500n);
    // Day 31 is also the day the batch finishes, so $640 of labour lands here
    // too since AD-56 — the flow is asserted rather than the day's total.
    expect(dueDay?.out_cents).toBe(32500n + 64000n);
    expect(dueDay?.flows.map((f) => f.kind)).toContain('FEED_DRAW_PAYMENT');

    const collectionDay = calendar.days[0];
    expect(collectionDay?.flows.map((f) => f.kind)).not.toContain('FEED_DRAW_PAYMENT');

    // M5b ranks strategies by this minimum, so the test exists to prove it can
    // resolve mid-series rather than always at day 1. The low point is day 36
    // rather than day 31 since AD-54: planned deliveries land on their own
    // COLLECTION dates, the last of which inside this 40-day horizon is
    // 2026-03-13, after the draw payment on 2026-03-08.
    expect(calendar.minimum_date).toBe('2026-03-13');
    // $3,000 chicks + $822 overheads + $325 draw payment + $20 delivery on the
    // real 500 kg draw + $475.68 on the four planned collections inside the
    // horizon (11,892 kg — everything the curve eats after day 14).
    expect(calendar.minimum_cents).toBe(-464268n);
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
    // 1,818,000 g, at GROWER's $29.60 a 50 kg bag = 107,625.6 cents, rounded
    // UP to 107,626 (AD-52). Due 30 days later: 2026-03-22.
    const dueDay = calendar.days.find((d) => d.date === '2026-03-22');
    expect(dueDay?.flows.map((f) => f.kind)).toContain('PLANNED_FEED_DRAW_PAYMENT');
    expect(dueDay?.out_cents).toBe(107626n);

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
    // Day 31 also carries labour since AD-56, so the FEED total is what this
    // test is about — summing the day would test the wrong thing.
    const feedOut = (dueDay?.flows ?? [])
      .filter((f) => f.kind === 'FEED_DRAW_PAYMENT' || f.kind === 'PLANNED_FEED_DRAW_PAYMENT')
      .reduce((sum, f) => sum - f.amount_cents, 0n);
    expect(feedOut).toBe(32500n);
  });
});

const bulkOrder = {
  channel: 'BULK' as const,
  order_date: '2026-03-08' as IsoDate,
  bird_count: 1000,
  avg_live_weight_g: 1843 as Grams,
  avg_dressed_weight_g: null,
  bands: null,
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
  avg_dressed_weight_g: null,
  bands: null,
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
  it('reports the missing values for a BULK order rather than guessing bulk net', () => {
    const missing = cashFlowsMissingInputs(input('2026-03-10', { sales: [bulkOrder] }));
    const keys = missing.map((m) => m.key);

    expect(keys).toContain('transport_cents_per_bird');
    expect(keys).toContain('abattoir_fee');
    // No 'bulk_price' any more: this order states its own price, and the net
    // that consumes it exists since AD-57. What is missing is the two costs
    // deducted from it, which are parameters rather than contract terms.
    expect(keys).not.toContain('bulk_price');

    /**
     * The transport entry's wording is pinned, not just its presence. It used
     * to say nobody had priced the run to the abattoir; since 2026-09-12 they
     * have (10c a bird, AD-55), and the refusal now stands on a different and
     * narrower ground — this INPUT does not carry the value. A refusal that
     * describes an answered question as open sends the reader back to Daniel
     * for something he has already told us.
     */
    const transportEntry = missing.find((m) => m.key === 'transport_cents_per_bird');
    expect(transportEntry?.why).toMatch(/2026-09-12/);
    expect(transportEntry?.why).not.toMatch(/nobody has supplied it|nobody has said the truck/);
  });

  it('reports nothing missing when there is no bulk order', () => {
    expect(cashFlowsMissingInputs(input('2026-03-10', { sales: [gateOrder] }))).toEqual([]);
  });

  it('refuses a gate order that carries no price for its own basis', () => {
    // Before this, the calendar threw a raw Error on it, and computeAllocation
    // with it — a crash where a typed refusal belongs.
    const unpriced = { ...gateOrder, price_cents_per_bird: null };
    const missing = cashFlowsMissingInputs(input('2026-03-10', { sales: [unpriced] }));
    expect(missing.map((m) => m.key)).toEqual(['gate_price']);
  });

  it('refuses a BANDED gate order rather than pricing it per bird', () => {
    // Bands are a bulk contract. A gate order marked BANDED was booked at its
    // per-bird price with the bands silently ignored.
    const banded = {
      ...gateOrder,
      pricing_basis: 'BANDED' as const,
      avg_dressed_weight_g: 1100 as Grams,
      bands: [{ dressed_floor_g: 1000 as Grams, price_cents_per_bird: 370n as Cents }],
      price_cents_per_bird: 999n as Cents
    };
    const missing = cashFlowsMissingInputs(input('2026-03-10', { sales: [banded] }));
    expect(missing.map((m) => m.key)).toEqual(['gate_price']);
    expect(missing[0]!.why).toMatch(/BANDED/);
  });

  it('prices a BULK candidate once abattoir fee and transport are both supplied', () => {
    const engineInput = input('2026-03-10', {
      parameters: parameters({
        abattoir_fee_cents: 5000n as Cents,
        transport_cents_per_bird: 1000n as Cents
      }),
      sales: [bulkOrder]
    });

    /**
     * This test is the inverse of what it was, and the inversion is the point.
     * It used to pin a blanket "bulk net is not implemented" refusal that stood
     * whatever the inputs said — having the VALUES was not having the CODE.
     * Since AD-57 the code exists and the price source is settled (the ORDER's
     * own contract), so a fully-specified bulk order is priced rather than
     * refused. What survives is the per-ORDER check below: an order whose own
     * contract cannot price it still refuses, and its neighbour still does not.
     */
    expect(cashFlowsMissingInputs(engineInput)).toEqual([]);
  });

  it('refuses one unpriceable order without refusing the batch', () => {
    const priceless = { ...bulkOrder, price_cents_per_bird: null };
    const engineInput = input('2026-03-10', {
      parameters: parameters({
        abattoir_fee_cents: 5000n as Cents,
        transport_cents_per_bird: 1000n as Cents
      }),
      sales: [bulkOrder, priceless]
    });
    const missing = cashFlowsMissingInputs(engineInput);

    // One buyer's deal being unpriceable says nothing about another's, which is
    // why the check moved onto the order (AD-57).
    expect(missing.map((m) => m.key)).toEqual(['bulk_price']);
    expect(missing[0]?.why).toMatch(/PER_BIRD and carries no such price/);
  });

  it('throws rather than returning a calendar missing a bulk receipt', () => {
    const engineInput = input('2026-03-10', { sales: [bulkOrder] });
    expect(() => projectCashCalendar(engineInput, 35, 0n as Cents, feedFor(engineInput))).toThrow(
      /inputs are missing — abattoir_fee/
    );
  });
});

describe('projectCashCalendar — overheads', () => {
  it('charges each overhead line on its own cadence, all of them flagged assumed', () => {
    const engineInput = input('2026-02-06');
    const calendar = projectCashCalendar(engineInput, 5, 0n as Cents, feedFor(engineInput));
    const day1 = calendar.days[0];

    // $3,000 chicks + $53.28 delivery (AD-54) + the day-1 overheads only:
    // vaccine upfront and February's share of electricity. Labour is gone from
    // day 1 — it is paid when the batch is done (AD-56).
    expect(day1?.out_cents).toBe(300000n + 5328n + 4200n + 10387n);
    // Two on day 1, not the whole model: labour lands on day 31.
    expect(day1?.flows.filter((f) => f.kind === 'OVERHEAD')).toHaveLength(2);
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
    // Over the WHOLE calendar, not day 1: since AD-56 the lines land on three
    // different cadences, and a day-1 sum would test the schedule rather than
    // the scaling this test is about.
    const calendar = projectCashCalendar(engineInput, 60, 0n as Cents, feedFor(engineInput));
    const overheads = calendar.days.flatMap((d) => d.flows.filter((f) => f.kind === 'OVERHEAD'));
    const total = overheads.reduce((sum, f) => sum - f.amount_cents, 0n);

    // Vaccine $42 doubles; labour $640 and electricity $140 do not.
    // Transport $400 was retired by the client on 2026-09-12 (AD-51), which is
    // why this total dropped by $800 at 6,000 birds rather than $400.
    expect(total).toBe(8400n + 64000n + 14000n);
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
    // Electricity ($140.00) and labour ($640.00) are PER_BATCH: unchanged.
    // Overhead total: 4,340 + 14,000 + 64,000 = 82,340 cents. Transport/other
    // was retired by the client (AD-51).
    const chickFlow = day1?.flows.find((f) => f.kind === 'CHICK_COST');
    expect(chickFlow?.amount_cents).toBe(-310000n);

    const overheadTotal = (day1?.flows.filter((f) => f.kind === 'OVERHEAD') ?? []).reduce(
      (sum, f) => sum - f.amount_cents,
      0n
    );
    // Day 1 carries the vaccine in full and February's share of electricity;
    // labour lands when the batch is done (AD-56).
    expect(overheadTotal).toBe(4340n + 10387n);
    // Plus delivery on the first planned draw, which scales with the flock too:
    // 1,376.4 kg at $40 a tonne = $55.06.
    expect(day1?.out_cents).toBe(310000n + 4340n + 10387n + 5506n);

    // The scaling itself, over the whole calendar rather than one day.
    const whole = projectCashCalendar(engineInput, 60, 0n as Cents, feedFor(engineInput));
    const everyLine = whole.days
      .flatMap((d) => d.flows.filter((f) => f.kind === 'OVERHEAD'))
      .reduce((sum, f) => sum - f.amount_cents, 0n);
    expect(everyLine).toBe(82340n);
  });

  it('treats an omitted overheads parameter as the measured default, distinct from an explicit empty model', () => {
    const omitted = input('2026-02-06');
    const withDefault = projectCashCalendar(omitted, 1, 0n as Cents, feedFor(omitted));
    const defaultTotal = (
      withDefault.days[0]?.flows.filter((f) => f.kind === 'OVERHEAD') ?? []
    ).reduce((sum, f) => sum - f.amount_cents, 0n);
    // $42 vaccine + February's $103.87 of electricity. The whole-calendar
    // total is $822.00 — SEED_OVERHEADS at 3,000 birds, absent meaning "use the
    // client's measured default" per Parameters.overheads — and the cadence
    // decides only which day each part lands on (AD-56).
    expect(defaultTotal).toBe(4200n + 10387n);

    const explicitEmpty = input('2026-02-06', {
      parameters: parameters({ overheads: { lines: [] } })
    });
    const withEmpty = projectCashCalendar(explicitEmpty, 1, 0n as Cents, feedFor(explicitEmpty));
    // {lines: []} means "charge nothing" — deliberately, not "use the default".
    expect(withEmpty.days[0]?.flows.filter((f) => f.kind === 'OVERHEAD')).toHaveLength(0);
    // Chick cost plus the first planned draw's delivery, which is feed rather
    // than an overhead and so is unaffected by an empty overhead model.
    expect(withEmpty.days[0]?.out_cents).toBe(305328n);
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
    expect(calendar.days[0]?.closing_cents).toBe(-319915n);
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

    // Nothing moves after day 1 inside a 5-day horizon, so days 1-5 all hold
    // the minimum.
    expect(calendar.minimum_cents).toBe(-319915n);
    expect(calendar.minimum_date).toBe('2026-02-06');
  });
});

describe('projectCashCalendar — carried flows from another batch', () => {
  it('books carried flows from another batch alongside its own', () => {
    const engineInput = input('2026-02-06');
    const carried: readonly CashFlow[] = [
      {
        kind: 'FEED_DRAW_PAYMENT',
        date: addDays(PLACEMENT, 5),
        amount_cents: -50_000n as Cents,
        description: 'running batch draw, due inside this candidate window'
      }
    ];

    const withCarried = projectCashCalendar(
      engineInput,
      10,
      0n as Cents,
      feedFor(engineInput),
      carried
    );
    const without = projectCashCalendar(engineInput, 10, 0n as Cents, feedFor(engineInput));

    expect(withCarried.closing_cents).toBe(without.closing_cents - 50_000n);
    expect(withCarried.days[5]?.flows.some((f) => f.description.includes('running batch'))).toBe(
      true
    );
  });

  it('still throws when a carried flow predates the candidate placement', () => {
    const engineInput = input('2026-02-06');
    const carried: readonly CashFlow[] = [
      {
        kind: 'GATE_RECEIPT',
        date: addDays(PLACEMENT, -1),
        amount_cents: 10_000n as Cents,
        description: 'settled before this batch was placed'
      }
    ];

    expect(() =>
      projectCashCalendar(engineInput, 10, 0n as Cents, feedFor(engineInput), carried)
    ).toThrow(/belongs in openingCents/);
  });
});

describe('bulkNetCentsPerBird — the arithmetic, ready for the pricing answer', () => {
  const bulkPerBird: SalesOrder = {
    channel: 'BULK',
    order_date: '2026-03-18' as IsoDate,
    bird_count: 3000,
    avg_live_weight_g: 1770 as Grams,
    avg_dressed_weight_g: null,
    bands: null,
    pricing_basis: 'PER_BIRD',
    price_cents_per_bird: 390n as Cents,
    price_cents_per_kg: null,
    terms_days: 30
  };
  const bulkPerKg: SalesOrder = {
    ...bulkPerBird,
    avg_live_weight_g: 2875 as Grams,
    avg_dressed_weight_g: null,
    bands: null,
    pricing_basis: 'PER_KG',
    price_cents_per_bird: null,
    price_cents_per_kg: 200n as Cents
  };
  const params = (transport: bigint | null) =>
    parameters({
      abattoir_fee_cents: 10n as Cents,
      transport_cents_per_bird: transport === null ? null : (transport as Cents)
    });

  it('nets a PER_BIRD order: gross minus fee minus transport', () => {
    // $3.90 − $0.10 − $0.13 = $3.67
    expect(bulkNetCentsPerBird(bulkPerBird, params(13n))).toBe(367n);
  });

  it("nets a PER_KG order off the order's own weight", () => {
    // 2.875 kg x $2.00 = $5.75 gross, − $0.10 − $0.13 = $5.52
    expect(bulkNetCentsPerBird(bulkPerKg, params(13n))).toBe(552n);
  });

  it('truncates a PER_KG gross rather than rounding up in our favour', () => {
    const odd = { ...bulkPerKg, avg_live_weight_g: 1777 as Grams, price_cents_per_kg: 199n as Cents };
    // 1777 x 199 / 1000 = 353.62 -> 353, then − 10 − 13 = 330
    expect(bulkNetCentsPerBird(odd, params(13n))).toBe(330n);
  });

  it('charges no abattoir fee on a DIRECT delivery', () => {
    const direct = parameters({
      abattoir_fee_cents: 10n as Cents,
      transport_cents_per_bird: 13n as Cents,
      delivery_mode: 'DIRECT'
    });
    // The fee is the abattoir's. Delivering straight to the buyer does not
    // incur it — though whether transport is the SAME per bird is unanswered.
    expect(bulkNetCentsPerBird(bulkPerBird, direct)).toBe(377n);
  });

  it('refuses to guess when transport is unknown', () => {
    // The programming-error guard, matching this module's own precedent: the
    // caller reports the refusal, and this only catches one that skipped it.
    expect(() => bulkNetCentsPerBird(bulkPerBird, params(null))).toThrow(/transport/i);
  });

  it('refuses to guess when the abattoir fee is unknown on an ABATTOIR delivery', () => {
    // Null is not zero. Treating a missing fee as free would overstate every
    // bulk receipt by 10c a bird, the flattering direction.
    const noFee = parameters({ abattoir_fee_cents: null, transport_cents_per_bird: 10n as Cents });
    expect(() => bulkNetCentsPerBird(bulkPerBird, noFee)).toThrow(/abattoir fee/i);
  });

  it('needs no abattoir fee on a DIRECT delivery, so a null one does not refuse', () => {
    const direct = parameters({
      abattoir_fee_cents: null,
      transport_cents_per_bird: 10n as Cents,
      delivery_mode: 'DIRECT'
    });
    expect(bulkNetCentsPerBird(bulkPerBird, direct)).toBe(380n);
  });

  it('values no offals — null is not zero', () => {
    // AD-32: the abattoir keeps the offals on top of the 10c cash fee. That is
    // real value given up, and it is NOT netted here, because nobody has priced
    // it. Subtracting zero would assert it is worthless.
    expect(bulkNetCentsPerBird(bulkPerBird, params(13n))).toBe(390n - 10n - 13n);
  });
});

describe('projectCashCalendar — feed delivery lands on collection day (AD-54)', () => {
  it("pays delivery on the collection date, not on the feed's 30-day terms", () => {
    // "On the spot when the feed is collected" — Daniel, 2026-09-12. The feed
    // itself is on 30-day terms; the truck is not, so the two are different
    // flows on different days rather than one payment.
    const engineInput = input('2026-02-06', {
      draws: [
        {
          collection_date: '2026-02-06' as IsoDate,
          phase: 'STARTER' as const,
          bags: 27,
          kg: 1350,
          price_per_bag_cents: 3060n as Cents,
          terms_days: 30
        }
      ]
    });
    const calendar = projectCashCalendar(engineInput, 45, 0n as Cents, feedFor(engineInput));

    const collectionDay = calendar.days.find((d) => d.date === '2026-02-06');
    const kinds = collectionDay?.flows.map((f) => f.kind) ?? [];
    expect(kinds).toContain('FEED_DELIVERY_PAYMENT');
    expect(kinds).not.toContain('FEED_DRAW_PAYMENT');

    const delivery = collectionDay?.flows.find((f) => f.kind === 'FEED_DELIVERY_PAYMENT');
    expect(delivery?.amount_cents).toBe(-5400n); // 1.35 t x $40

    const dueDay = calendar.days.find((d) => d.date === '2026-03-08');
    expect(dueDay?.flows.map((f) => f.kind)).toContain('FEED_DRAW_PAYMENT');
    expect(dueDay?.flows.map((f) => f.kind)).not.toContain('FEED_DELIVERY_PAYMENT');
  });

  it('charges delivery on a planned draw on ITS collection date too', () => {
    const engineInput = input('2026-02-06');
    const calendar = projectCashCalendar(engineInput, 45, 0n as Cents, feedFor(engineInput));
    const planned = feedFor(engineInput).planned_draws[0]!;
    const day = calendar.days.find((d) => d.date === planned.collection_date);
    const flow = day?.flows.find((f) => f.kind === 'PLANNED_FEED_DELIVERY_PAYMENT');
    expect(flow?.amount_cents).toBe(-planned.delivery_cents);
  });
});

describe('the abattoir run and the abattoir fee are two costs (AD-55)', () => {
  const bulk: SalesOrder = {
    channel: 'BULK',
    order_date: '2026-03-18' as IsoDate,
    bird_count: 3000,
    avg_live_weight_g: 1770 as Grams,
    avg_dressed_weight_g: null,
    bands: null,
    pricing_basis: 'PER_BIRD',
    price_cents_per_bird: 390n as Cents,
    price_cents_per_kg: null,
    terms_days: 30
  };

  it('seeds them as separate 10c figures answered on separate dates', () => {
    // The fee (2026-09-10) and the run to the abattoir (2026-09-12) happen to
    // be the same number. They are not the same cost, and a single 10c
    // constant would make the coincidence permanent.
    expect(SEED_ABATTOIR_FEE_CENTS).toBe(10n);
    expect(SEED_TRANSPORT_CENTS_PER_BIRD).toBe(10n);
    expect(SEED_ABATTOIR_COST_CENTS_PER_BIRD).toBe(
      SEED_ABATTOIR_FEE_CENTS + SEED_TRANSPORT_CENTS_PER_BIRD
    );
  });

  it('deducts BOTH from a bulk net — 20c a bird in total', () => {
    const params = parameters({
      abattoir_fee_cents: SEED_ABATTOIR_FEE_CENTS,
      transport_cents_per_bird: SEED_TRANSPORT_CENTS_PER_BIRD
    });
    // $3.90 − $0.10 fee − $0.10 run = $3.70.
    expect(bulkNetCentsPerBird(bulk, params)).toBe(390n - SEED_ABATTOIR_COST_CENTS_PER_BIRD);
    expect(bulkNetCentsPerBird(bulk, params)).toBe(370n);
  });

  it('still refuses a null transport rather than defaulting to the seeded 10c', () => {
    // The value being KNOWN is not the same as it being SUPPLIED. Nothing reads
    // the seed behind a caller's back — a null is a refusal, as it always was.
    const missing = cashFlowsMissingInputs(input('2026-03-18', { sales: [bulk] }));
    expect(missing.map((m) => m.key)).toContain('transport_cents_per_bird');
  });
});

describe('overhead cadences — when Daniel actually pays (AD-56)', () => {
  const day = (calendar: ReturnType<typeof projectCashCalendar>, date: string) =>
    calendar.days.find((d) => d.date === date);
  const overheadsOn = (calendar: ReturnType<typeof projectCashCalendar>, date: string) =>
    (day(calendar, date)?.flows ?? []).filter((f) => f.kind === 'OVERHEAD');

  const run = () => {
    const engineInput = input('2026-02-06');
    return projectCashCalendar(engineInput, 60, 0n as Cents, feedFor(engineInput));
  };

  it('pays vaccine on day 1 — "vaccines upfront"', () => {
    const vaccine = overheadsOn(run(), '2026-02-06').filter((f) => /Vaccine/.test(f.description));
    expect(vaccine).toHaveLength(1);
    expect(vaccine[0]?.amount_cents).toBe(-4200n);
  });

  it('pays labour when the batch is done, not on placement day', () => {
    const calendar = run();
    const labourFlows = calendar.days.flatMap((d) =>
      d.flows.filter((f) => f.kind === 'OVERHEAD' && /Labour/.test(f.description)).map((f) => ({ date: d.date, f }))
    );
    expect(labourFlows).toHaveLength(1);
    // Day 31 is the first day the curve reaches the 1,770 g slaughter target
    // (fixture 10) — 2026-03-08 from a 2026-02-06 placement.
    expect(labourFlows[0]?.date).toBe('2026-03-08');
    expect(labourFlows[0]?.f.amount_cents).toBe(-64000n);
  });

  it('spreads electricity across the months the batch spans, without inventing a second bill', () => {
    const calendar = run();
    const electricity = calendar.days.flatMap((d) =>
      d.flows
        .filter((f) => f.kind === 'OVERHEAD' && /Electricity/.test(f.description))
        .map((f) => ({ date: d.date, cents: f.amount_cents }))
    );

    // February and March — two instalments, not two bills. The measured $140
    // is his figure for one BATCH; charging $140 a month would invent money he
    // never spent (AD-56).
    expect(electricity.map((e) => e.date)).toEqual(['2026-02-06', '2026-03-01']);
    expect(electricity.reduce((sum, e) => sum + e.cents, 0n)).toBe(-14000n);
    // Weighted by housed days: 23 in February, 8 in March to the day-31 finish.
    expect(electricity[0]?.cents).toBe(-10387n);
    expect(electricity[1]?.cents).toBe(-3613n);
  });

  it('still charges every measured cent, whatever the cadence', () => {
    const calendar = run();
    const total = calendar.days
      .flatMap((d) => d.flows.filter((f) => f.kind === 'OVERHEAD'))
      .reduce((sum, f) => sum - f.amount_cents, 0n);
    // $822.00 — SEED_OVERHEADS at 3,000 birds. The cadence moves WHEN money
    // leaves, never HOW MUCH: the amounts are his, measured, and only the
    // dates are ours (OQ-19).
    expect(total).toBe(82200n);
    expect(calendar.overhead_timing).toBe('assumed');
  });
});

describe("bulk pricing is the buyer's own contract, not ours (AD-57)", () => {
  const order = (overrides: Partial<SalesOrder> = {}): SalesOrder => ({
    channel: 'BULK',
    order_date: '2026-03-08' as IsoDate,
    bird_count: 1000,
    avg_live_weight_g: 1843 as Grams,
    avg_dressed_weight_g: null,
    pricing_basis: 'PER_BIRD',
    price_cents_per_bird: 390n as Cents,
    price_cents_per_kg: null,
    bands: null,
    terms_days: 30,
    ...overrides
  });
  const settled = () =>
    parameters({
      abattoir_fee_cents: SEED_ABATTOIR_FEE_CENTS,
      transport_cents_per_bird: SEED_TRANSPORT_CENTS_PER_BIRD
    });

  const BUYER_BANDS = [
    { dressed_floor_g: 1100 as Grams, price_cents_per_bird: 390n as Cents },
    { dressed_floor_g: 1200 as Grams, price_cents_per_bird: 380n as Cents },
    { dressed_floor_g: 1300 as Grams, price_cents_per_bird: 370n as Cents }
  ];

  it('holds a PER_LIVE_KG contract — the structure of his one recorded sale', () => {
    const perKg = order({
      avg_live_weight_g: 2875 as Grams,
      pricing_basis: 'PER_KG',
      price_cents_per_bird: null,
      price_cents_per_kg: 200n as Cents
    });
    // 2.875 kg x $2.00 = $5.75 gross, less 20c of abattoir costs = $5.55.
    expect(bulkNetCentsPerBird(perKg, settled())).toBe(555n);
  });

  it("holds a BANDED contract, priced off the buyer's OWN schedule", () => {
    const banded = order({
      avg_dressed_weight_g: 1250 as Grams,
      pricing_basis: 'BANDED',
      price_cents_per_bird: null,
      bands: BUYER_BANDS
    });
    // 1,250 g dressed clears the 1,200 band: $3.80 less 20c = $3.60.
    expect(bulkNetCentsPerBird(banded, settled())).toBe(360n);
  });

  it('prices two buyers on one batch by two different contracts', () => {
    const engineInput = input('2026-03-08', {
      parameters: settled(),
      sales: [
        order({ bird_count: 600 }),
        order({
          bird_count: 400,
          avg_live_weight_g: 2875 as Grams,
          pricing_basis: 'PER_KG',
          price_cents_per_bird: null,
          price_cents_per_kg: 200n as Cents
        })
      ]
    });
    expect(cashFlowsMissingInputs(engineInput)).toEqual([]);

    const calendar = projectCashCalendar(engineInput, 70, 0n as Cents, feedFor(engineInput));
    const receipts = calendar.days.flatMap((d) =>
      d.flows.filter((f) => f.kind === 'BULK_RECEIPT')
    );
    // "Depends on the buyer" means both contracts are live at once.
    expect(receipts.map((f) => f.amount_cents)).toEqual([600n * 370n, 400n * 555n]);
  });

  it('books the receipt NET and 30 days out, never gross on the day', () => {
    const engineInput = input('2026-03-08', { parameters: settled(), sales: [order()] });
    const calendar = projectCashCalendar(engineInput, 70, 0n as Cents, feedFor(engineInput));

    const onTheDay = calendar.days.find((d) => d.date === '2026-03-08');
    expect(onTheDay?.flows.some((f) => f.kind === 'BULK_RECEIPT')).toBe(false);

    const paid = calendar.days.find((d) => d.date === '2026-04-07');
    const receipt = paid?.flows.find((f) => f.kind === 'BULK_RECEIPT');
    // $3.90 gross less the 10c fee and the 10c run (AD-55) = $3.70 a bird.
    // Booking the $3,900 gross would overstate the balance by $200.
    expect(receipt?.amount_cents).toBe(370000n);
  });

  it('refuses a BANDED order with no dressed weight rather than deriving one', () => {
    const banded = order({ pricing_basis: 'BANDED', price_cents_per_bird: null, bands: BUYER_BANDS });
    const missing = cashFlowsMissingInputs(
      input('2026-03-08', { parameters: settled(), sales: [banded] })
    );
    // 1,843 g live x the assumed 62% would give 1,142 g and a $3.90 band. That
    // is a real invoice priced off an estimate OQ-17 exists to replace.
    expect(missing.map((m) => m.key)).toEqual(['dressed_weight']);
  });

  it('refuses a bird heavier than the contract rather than reusing the top band', () => {
    const heavy = order({
      avg_dressed_weight_g: 1780 as Grams,
      pricing_basis: 'BANDED',
      price_cents_per_bird: null,
      bands: BUYER_BANDS
    });
    const missing = cashFlowsMissingInputs(
      input('2026-03-08', { parameters: settled(), sales: [heavy] })
    );
    // The schedule stops at 1.3 kg and pays LESS as the bird gets heavier, so
    // reusing the top band is an extrapolation that is not even conservative.
    expect(missing.map((m) => m.key)).toEqual(['bulk_price']);
    expect(missing[0]?.why).toMatch(/above this contract's top band/i);
  });

  it('refuses a bird lighter than the lowest band rather than reading the bottom band down', () => {
    const light = order({
      avg_dressed_weight_g: 1099 as Grams,
      pricing_basis: 'BANDED',
      price_cents_per_bird: null,
      bands: BUYER_BANDS
    });
    const missing = cashFlowsMissingInputs(
      input('2026-03-08', { parameters: settled(), sales: [light] })
    );
    expect(missing.map((m) => m.key)).toEqual(['bulk_price']);
    expect(missing[0]?.why).toMatch(/BELOW this contract's lowest band/);
  });

  it('prices exactly the top floor and refuses one gram over it (AD-58)', () => {
    const at = (g: number) =>
      order({
        avg_dressed_weight_g: g as Grams,
        pricing_basis: 'BANDED',
        price_cents_per_bird: null,
        bands: BUYER_BANDS
      });
    const missingAt = (g: number) =>
      cashFlowsMissingInputs(input('2026-03-08', { parameters: settled(), sales: [at(g)] }));

    // 1,300 g clears the top floor: $3.70 less 20c.
    expect(missingAt(1300)).toEqual([]);
    expect(bulkNetCentsPerBird(at(1300), settled())).toBe(350n);
    // 1,301 g is past the last stated floor. Whether the top band is meant to
    // run on (1.30-1.39 kg, say) is a question for Daniel, logged as TD-4 finding 9.
    expect(missingAt(1301).map((m) => m.key)).toEqual(['bulk_price']);
  });

  it('refuses a BANDED order carrying no schedule, rather than borrowing the planning default', () => {
    const naked = order({ pricing_basis: 'BANDED', price_cents_per_bird: null, avg_dressed_weight_g: 1250 as Grams });
    const missing = cashFlowsMissingInputs(
      input('2026-03-08', { parameters: settled(), sales: [naked] })
    );
    // parameters.bulk_bands is what an UNCONTRACTED future sale is planned
    // against. Substituting it here would invent this buyer's terms.
    expect(missing.map((m) => m.key)).toEqual(['bulk_price']);
    expect(missing[0]?.why).toMatch(/planning default/);
  });
});
