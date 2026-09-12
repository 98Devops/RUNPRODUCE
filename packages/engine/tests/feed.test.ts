import { describe, expect, it } from 'vitest';
import { computeFeedLiability, kgDiscrepancy } from '../src/feed.js';
import { computeDecision } from '../src/index.js';
import { projectProduction } from '../src/production.js';
import { addDays } from '../src/day-number.js';
import { Money } from '../src/money.js';
import type { EngineInput, FeedDraw, Grams, IsoDate } from '../src/types.js';

function baseInput(overrides: Partial<EngineInput> = {}): EngineInput {
  return {
    asOf: '2026-02-19' as IsoDate,
    batch: {
      placement_date: '2026-02-06' as IsoDate,
      chick_count: 3000,
      extra_chick_count: 0,
      chick_price_cents: Money.fromCents(100n)
    },
    parameters: {
      mortality: {
        base_rate_bp_daily: 0 as never,
        preharvest_ramp_start_day: 30 as never,
        preharvest_ramp_rate_bp_daily: 0 as never
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

function drawsOf(...draws: readonly Partial<FeedDraw>[]): readonly FeedDraw[] {
  return draws.map((d) => ({
    collection_date: '2026-02-06' as IsoDate,
    phase: 'STARTER' as const,
    bags: 27,
    kg: 1350,
    price_per_bag_cents: Money.fromCents(3250n),
    terms_days: 30,
    ...d
  }));
}

function feedFor(input: EngineInput) {
  return computeFeedLiability(input, projectProduction(input));
}

describe('addDays', () => {
  it('adds days across a month boundary', () => {
    expect(addDays('2026-02-06' as IsoDate, 30)).toBe('2026-03-08');
  });

  it('handles the leap day in a leap year', () => {
    expect(addDays('2024-02-28' as IsoDate, 1)).toBe('2024-02-29');
    expect(addDays('2024-02-28' as IsoDate, 2)).toBe('2024-03-01');
  });

  it('does not treat 2100 as a leap year', () => {
    expect(addDays('2100-02-28' as IsoDate, 1)).toBe('2100-03-01');
  });

  it('crosses a year boundary', () => {
    expect(addDays('2026-12-31' as IsoDate, 1)).toBe('2027-01-01');
  });

  it('round-trips with zero', () => {
    expect(addDays('2026-03-13' as IsoDate, 0)).toBe('2026-03-13');
  });

  it('rejects a non-ISO date rather than guessing', () => {
    expect(() => addDays('06/02/2026' as IsoDate, 1)).toThrow(/ISO date/);
  });
});

describe('first_draw_bags_to_day_14', () => {
  it('is 26.64 bags for 3,000 birds — the client\'s own Feed!C2', () => {
    // Record!M16/50: cumulative feed through day 14 (444 g/bird), whole flock,
    // in 50 kg bags. 444 * 3000 / 1000 / 50 = 26.64.
    expect(feedFor(baseInput()).first_draw_bags_to_day_14).toBe(26.64);
  });

  it('covers days 1-14, which is NOT the starter phase (KB-11)', () => {
    // Starter is days 1-13 = 383 g/bird = 22.98 bags. The client's first draw
    // spills one day into GROWER. The two numbers must not be confused.
    const feed = feedFor(baseInput());
    expect(feed.first_draw_bags_to_day_14).not.toBe(22.98);
    expect(feed.planned_draws[0]?.covers_first_day).toBe(1);
    expect(feed.planned_draws[0]?.covers_last_day).toBe(14);
  });

  it('scales with the flock, including extra chicks (invariant 9, KB-1)', () => {
    const input = baseInput({
      batch: { ...baseInput().batch, extra_chick_count: 100 }
    });
    // 444 g * 3100 / 1000 / 50 = 27.528
    expect(feedFor(input).first_draw_bags_to_day_14).toBeCloseTo(27.53, 2);
  });
});

describe('due dates', () => {
  it('derives collection_date + terms_days for the client\'s schedule', () => {
    const input = baseInput({
      asOf: '2026-03-18' as IsoDate,
      draws: drawsOf(
        { collection_date: '2026-02-06' as IsoDate },
        { collection_date: '2026-02-20' as IsoDate, phase: 'GROWER' },
        { collection_date: '2026-02-27' as IsoDate, phase: 'GROWER' },
        { collection_date: '2026-03-06' as IsoDate, phase: 'FINISHER' },
        { collection_date: '2026-03-13' as IsoDate, phase: 'FINISHER' }
      )
    });
    expect(feedFor(input).due_dates).toEqual([
      '2026-03-08',
      '2026-03-22',
      '2026-03-29',
      '2026-04-05',
      '2026-04-12'
    ]);
  });

  it('uses the DRAW\'s terms, not the parameter default (decision 1)', () => {
    const input = baseInput({
      asOf: '2026-02-19' as IsoDate,
      parameters: { ...baseInput().parameters, feed_terms_days: 30 },
      draws: drawsOf({ collection_date: '2026-02-06' as IsoDate, terms_days: 14 })
    });
    expect(feedFor(input).due_dates).toEqual(['2026-02-20']);
  });
});

describe('draw liability', () => {
  it('prices from bags x price_per_bag, not kg (decision 2)', () => {
    const input = baseInput({
      draws: drawsOf({ bags: 27, kg: 1350, price_per_bag_cents: Money.fromCents(3250n) })
    });
    const feed = feedFor(input);
    expect(feed.draws[0]?.total_cents).toBe(87750n); // 27 * 3250
    expect(feed.total_drawn_cents).toBe(87750n);
  });

  it('flags a kg/bag discrepancy rather than reconciling it silently', () => {
    const input = baseInput({ draws: drawsOf({ bags: 27, kg: 1400 }) });
    const feed = feedFor(input);
    expect(feed.draws[0]?.kg_discrepancy).toBe(true);
    // Money still comes from bags — the flag reports, it does not correct.
    expect(feed.draws[0]?.total_cents).toBe(87750n);
  });

  it('does not flag a discrepancy when kg is bags x 50', () => {
    const input = baseInput({ draws: drawsOf({ bags: 27, kg: 1350 }) });
    expect(feedFor(input).draws[0]?.kg_discrepancy).toBe(false);
  });

  it('reports days_until_due, negative once overdue', () => {
    const input = baseInput({
      asOf: '2026-03-18' as IsoDate,
      draws: drawsOf({ collection_date: '2026-02-06' as IsoDate }) // due 2026-03-08
    });
    expect(feedFor(input).draws[0]?.days_until_due).toBe(-10);
  });

  it('totals kg across draws', () => {
    const input = baseInput({
      asOf: '2026-02-21' as IsoDate,
      draws: drawsOf(
        { collection_date: '2026-02-06' as IsoDate, bags: 27, kg: 1350 },
        { collection_date: '2026-02-20' as IsoDate, bags: 40, kg: 2000 }
      )
    });
    expect(feedFor(input).total_drawn_kg).toBe(3350);
  });
});

describe('no lookahead (invariant 7)', () => {
  it('ignores draws collected after asOf', () => {
    const input = baseInput({
      asOf: '2026-02-19' as IsoDate,
      draws: drawsOf(
        { collection_date: '2026-02-06' as IsoDate },
        { collection_date: '2026-02-20' as IsoDate } // after asOf
      )
    });
    const feed = feedFor(input);
    expect(feed.draws).toHaveLength(1);
    expect(feed.due_dates).toEqual(['2026-03-08']);
  });

  it('KEEPS a due date that falls after asOf — an obligation is not lookahead', () => {
    const input = baseInput({
      asOf: '2026-02-19' as IsoDate,
      draws: drawsOf({ collection_date: '2026-02-06' as IsoDate })
    });
    const feed = feedFor(input);
    expect(feed.due_dates).toEqual(['2026-03-08']);
    expect(feed.draws[0]?.days_until_due).toBe(17);
  });

  it('a draw collected exactly on asOf counts', () => {
    const input = baseInput({
      asOf: '2026-02-20' as IsoDate,
      draws: drawsOf({ collection_date: '2026-02-20' as IsoDate })
    });
    expect(feedFor(input).draws).toHaveLength(1);
  });
});

describe('planned draw cadence', () => {
  it('chains off the previous collection date: placement, +14, then +7', () => {
    const planned = feedFor(baseInput()).planned_draws;
    expect(planned.map((p) => p.collection_date)).toEqual([
      '2026-02-06', // day 1
      '2026-02-20', // day 15
      '2026-02-27', // day 22
      '2026-03-06', // day 29
      '2026-03-13' // day 36
    ]);
  });

  it('reproduces the client\'s own draw sizes for the middle intervals', () => {
    // Feed!C3 = (M23-M16)/50 = 36.36, C4 = (M30-M23)/50 = 57.36,
    // C5 = (M37-M30)/50 = 73.80 — his own formulas, on his own curve.
    const planned = feedFor(baseInput()).planned_draws;
    expect(planned[1]?.bags).toBeCloseTo(36.36, 2);
    expect(planned[2]?.bags).toBeCloseTo(57.36, 2);
    expect(planned[3]?.bags).toBeCloseTo(73.8, 2);
  });

  it('covers contiguous day ranges with no gap and no overlap', () => {
    const planned = feedFor(baseInput()).planned_draws;
    expect(planned[0]?.covers_first_day).toBe(1);
    for (let i = 1; i < planned.length; i += 1) {
      expect(planned[i]!.covers_first_day).toBe(planned[i - 1]!.covers_last_day + 1);
    }
    expect(planned.at(-1)?.covers_last_day).toBe(41);
  });

  it('gives the final draw the remainder, not a full seven days', () => {
    const planned = feedFor(baseInput()).planned_draws;
    const last = planned.at(-1)!;
    expect(last.covers_first_day).toBe(36);
    expect(last.covers_last_day).toBe(41); // 6 days, not 7
  });

  it('dues planned draws off the parameter terms (decision 1)', () => {
    const input = baseInput({
      parameters: { ...baseInput().parameters, feed_terms_days: 14 }
    });
    expect(feedFor(input).planned_draws[0]?.due_date).toBe('2026-02-20');
  });

  it('planned totals equal the whole-cycle feed requirement', () => {
    const planned = feedFor(baseInput()).planned_draws;
    const kg = planned.reduce((sum, p) => sum + p.kg, 0);
    // 4,408 g/bird through day 41 * 3,000 birds = 13,224 kg — fixture 2.
    expect(kg).toBeCloseTo(13224, 6);
  });
});

/**
 * OQ-21. `bags` is the one client-entered field whose own arithmetic produces a
 * decimal: the planning half computes `kg / 50` to 2dp, so 26.64 is Daniel's
 * real first-draw figure and fixture 5 already asserts it. Pricing it with
 * `BigInt(draw.bags)` threw a RangeError out of `computeFeedLiability` and, via
 * the eager call in `computeDecision`, took production and costing down with it.
 *
 * These tests pin the REFUSAL, not a pricing rule. Whether a part bag is real
 * commerce to be priced or a capture-screen artefact to be rejected is still
 * open with Daniel; nothing here answers it.
 */
describe('OQ-21 — a fractional bag count refuses instead of crashing', () => {
  const fractional = baseInput({
    draws: drawsOf({ bags: 26.64, kg: 1332 })
  });

  it('does not throw a RangeError out of computeDecision', () => {
    expect(() => computeDecision(fractional)).not.toThrow();
  });

  it('returns a typed missing_input naming the bags field', () => {
    const result = computeDecision(fractional);

    expect(result.kind).toBe('missing_input');
    if (result.kind !== 'missing_input') throw new Error('unreachable');
    const entry = result.missing.find((m) => m.key === 'feed_draw_bags');
    expect(entry).toBeDefined();
    // The refusal has to be actionable: it names the draw, so a capture screen
    // can point at the row rather than at the concept.
    expect(entry?.why).toContain('26.64');
    expect(entry?.why).toContain('2026-02-06');
  });

  it('still refuses rather than answering OQ-21 in the client\'s stead', () => {
    const result = computeDecision(fractional);
    if (result.kind !== 'missing_input') throw new Error('unreachable');
    const why = result.missing.find((m) => m.key === 'feed_draw_bags')?.why ?? '';

    // Neither rounding nor pricing is chosen here. A refusal that quietly
    // rounded would change the money owed in a direction nobody picked.
    expect(why).toMatch(/OQ-21/);
  });

  it('throws a named, explanatory error if computeFeedLiability is called directly', () => {
    // Same precedent as cash.ts: the refusal is the caller's to report, and
    // this guard only catches a caller that skipped it. It must not be a raw
    // RangeError — M5b's projectCandidate calls computeFeedLiability directly.
    expect(() => feedFor(fractional)).toThrow(/bags/);
    expect(() => feedFor(fractional)).not.toThrow(RangeError);
  });

  it('leaves a whole-bag draw completely unchanged', () => {
    const whole = baseInput({ draws: drawsOf({ bags: 27, kg: 1350 }) });
    expect(computeDecision(whole).kind).toBe('ok');
    expect(feedFor(whole).draws[0]?.total_cents).toBe(27n * 3250n);
  });
});

describe('OQ-21 secondary — kg_discrepancy no longer reports a float artefact', () => {
  it('does not flag a part-bag draw whose kg genuinely matches', () => {
    // 0.07 * 50 is 3.5000000000000004 in binary floating point, so the old
    // exact `!==` reported a discrepancy that does not exist. Compared at
    // gram resolution — the project's own weight unit, invariant 2 — these
    // are equal, and equal is what they are.
    const draw = drawsOf({ bags: 0.07, kg: 3.5 })[0]!;
    expect(draw.bags * 50).not.toBe(draw.kg); // the artefact itself, for the record
    expect(kgDiscrepancy(draw)).toBe(false);
  });

  it('still flags a draw whose kg really does disagree with its bags', () => {
    const draw = drawsOf({ bags: 27, kg: 1300 })[0]!;
    expect(kgDiscrepancy(draw)).toBe(true);
  });
});

describe('feed delivery — $40 a tonne, paid on collection (OQ-28, AD-54)', () => {
  it("charges the client's confirmed rate against the draw's own kg", () => {
    const input = baseInput({ draws: drawsOf({ bags: 26, kg: 1300 }) });
    // 1.3 tonnes x $40 = $52.00.
    expect(feedFor(input).draws[0]?.delivery_cents).toBe(5200n);
  });

  it('keeps delivery BESIDE the feed total, never added into it', () => {
    const input = baseInput({ draws: drawsOf({ bags: 27, kg: 1350 }) });
    const draw = feedFor(input).draws[0];
    // The two costs vary independently and the client names them separately;
    // blended, neither is visible (AD-54, and the KB-3 shape).
    expect(draw?.total_cents).toBe(27n * 3250n);
    expect(draw?.delivery_cents).toBe(5400n);
  });

  it('totals delivery across the cycle so "what did delivery cost me" is answerable', () => {
    const input = baseInput({
      asOf: '2026-03-01' as IsoDate,
      draws: drawsOf(
        { collection_date: '2026-02-06' as IsoDate, bags: 27, kg: 1350 },
        { collection_date: '2026-02-20' as IsoDate, bags: 36, kg: 1800 }
      )
    });
    expect(feedFor(input).total_delivery_cents).toBe(5400n + 7200n);
  });

  it('rounds a part-cent UP, never in our favour', () => {
    // One 50 kg bag at $40.01 a tonne is 200.05 cents. Rounded down it would
    // flatter the break-even, which is the one direction this engine must not
    // err in — the same rule costOfFeed follows.
    const input = baseInput({
      parameters: { ...baseInput().parameters, delivery_cents_per_tonne: Money.fromCents(4001n) },
      draws: drawsOf({ bags: 1, kg: 50 })
    });
    expect(feedFor(input).draws[0]?.delivery_cents).toBe(201n);
  });

  it('honours an explicit rate over the seeded one', () => {
    const input = baseInput({
      parameters: { ...baseInput().parameters, delivery_cents_per_tonne: Money.fromCents(5000n) },
      draws: drawsOf({ bags: 27, kg: 1350 })
    });
    expect(feedFor(input).draws[0]?.delivery_cents).toBe(6750n);
  });

  it('charges delivery on a planned draw too, since its kg is an upper bound', () => {
    // Excluding it would understate the projected trough, and the trough is
    // what AD-43's reserve-floor filter reads. AD-54.
    const planned = feedFor(baseInput()).planned_draws[0];
    expect(planned?.delivery_cents).toBeGreaterThan(0n);
  });
});
