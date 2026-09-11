import { describe, expect, it } from 'vitest';
import {
  candidateInput,
  enumerateCandidates,
  handoffAtPlacement,
  projectCandidate
} from '../src/allocation.js';
import { projectCashCalendar } from '../src/cash.js';
import { computeFeedLiability } from '../src/feed.js';
import { missingInputsFor } from '../src/index.js';
import { projectProduction } from '../src/production.js';
import type { Candidate, Cents, EngineInput, Grams, IsoDate, Parameters } from '../src/types.js';

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

function baseInput(paramOverrides: Partial<Parameters> = {}): EngineInput {
  return {
    asOf: PLACEMENT,
    batch: {
      placement_date: PLACEMENT,
      chick_count: 3000,
      extra_chick_count: 0,
      chick_price_cents: 100n as Cents
    },
    parameters: parameters(paramOverrides),
    records: [],
    draws: [],
    sales: []
  };
}

function feedFor(engineInput: EngineInput) {
  return computeFeedLiability(engineInput, projectProduction(engineInput));
}

describe('enumerateCandidates', () => {
  it('never generates a date earlier than harvest completion + 14', () => {
    const candidates = enumerateCandidates(baseInput(), '2026-03-20' as IsoDate, 300);
    const earliest = candidates.reduce(
      (a, c) => (c.placement_date < a ? c.placement_date : a),
      '9999-12-31' as IsoDate
    );

    // Invariant 16. Not a preference — nothing below the floor exists at all.
    expect(earliest).toBe('2026-04-03');
  });

  it('runs the date range to the floor + 30 and no further', () => {
    const candidates = enumerateCandidates(baseInput(), '2026-03-20' as IsoDate, 300);
    const latest = candidates.reduce(
      (a, c) => (c.placement_date > a ? c.placement_date : a),
      '0000-01-01' as IsoDate
    );

    expect(latest).toBe('2026-05-03');
    expect(new Set(candidates.map((c) => c.placement_date)).size).toBe(31);
  });

  it('steps size by placement_step_birds and never emits a zero-bird batch', () => {
    const candidates = enumerateCandidates(baseInput(), '2026-03-20' as IsoDate, 300);
    const sizes = [...new Set(candidates.map((c) => c.chick_count))].sort((a, b) => a - b);

    // AD-41: size 0 is place_nothing's job, never a candidate.
    expect(sizes).toEqual([100, 200, 300]);
  });

  it('honours an explicit step rather than a literal', () => {
    const candidates = enumerateCandidates(
      baseInput({ placement_step_birds: 150 }),
      '2026-03-20' as IsoDate,
      300
    );
    expect([...new Set(candidates.map((c) => c.chick_count))].sort((a, b) => a - b)).toEqual([
      150, 300
    ]);
  });
});

/**
 * The running batch's own completion horizon: last curve day + feed terms.
 * `handoffAtPlacement` derives this internally; the tests that split a
 * projection against it must use the SAME horizon, or they compare a split to
 * a projection it never came from and pass on the coincidence that the tail
 * days carry no flows.
 */
const RUNNING_HORIZON = 41 + 30;

describe('handoffAtPlacement', () => {
  it('collapses everything before the placement date into the opening balance', () => {
    const running = baseInput();
    const handoff = handoffAtPlacement(
      running,
      feedFor(running),
      0n as Cents,
      '2026-04-03' as IsoDate
    );
    const full = projectCashCalendar(running, RUNNING_HORIZON, 0n as Cents, feedFor(running));
    const dayBefore = full.days.find((d) => d.date === '2026-04-02');

    expect(handoff.opening_cents).toBe(dayBefore?.closing_cents);
  });

  it('hands over the flows dated on or after the placement date, and only those', () => {
    const running = baseInput();
    const handoff = handoffAtPlacement(
      running,
      feedFor(running),
      0n as Cents,
      '2026-04-03' as IsoDate
    );

    expect(handoff.carried_flows.length).toBeGreaterThan(0);
    for (const flow of handoff.carried_flows) {
      expect(flow.date >= '2026-04-03').toBe(true);
    }
  });

  it('double-counts nothing: opening plus carried equals the full projection', () => {
    const running = baseInput();
    const full = projectCashCalendar(running, RUNNING_HORIZON, 0n as Cents, feedFor(running));
    const handoff = handoffAtPlacement(
      running,
      feedFor(running),
      0n as Cents,
      '2026-04-03' as IsoDate
    );

    const carriedSum = handoff.carried_flows.reduce((sum, f) => sum + f.amount_cents, 0n);
    // Everything the running batch does, split across the handoff, still adds
    // up to what it did undivided. This is the test that catches a flow landing
    // on both sides of the split.
    expect(handoff.opening_cents + carriedSum).toBe(full.closing_cents);
  });
});

describe('candidateInput', () => {
  it('describes the candidate batch, not the running one', () => {
    const c: Candidate = { placement_date: '2026-04-03' as IsoDate, chick_count: 2500 };
    const synthetic = candidateInput(baseInput(), c);

    expect(synthetic.batch.placement_date).toBe('2026-04-03');
    expect(synthetic.batch.chick_count).toBe(2500);
    // A candidate has no history: records, draws and sales are the running
    // batch's and must not be inherited, or its mortality would be replayed.
    expect(synthetic.records).toEqual([]);
    expect(synthetic.draws).toEqual([]);
    expect(synthetic.sales).toEqual([]);
  });

  it('carries a gate price, so the decision does not refuse on gate_price', () => {
    const c: Candidate = { placement_date: '2026-04-03' as IsoDate, chick_count: 2500 };
    // The M4 review fix wave made missingInputsFor emit 'gate_price' when the
    // active basis has a null price. A synthetic input that dropped parameters
    // would refuse to compute for a reason that has nothing to do with M5b.
    expect(missingInputsFor(candidateInput(baseInput(), c)).map((m) => m.key)).not.toContain(
      'gate_price'
    );
  });

  it('sets asOf to the placement date, so no lookahead is claimed', () => {
    const c: Candidate = { placement_date: '2026-04-03' as IsoDate, chick_count: 2500 };
    expect(candidateInput(baseInput(), c).asOf).toBe('2026-04-03');
  });
});

describe('projectCandidate', () => {
  it("scores over the candidate's own completion horizon, not a fixed window", () => {
    const c: Candidate = { placement_date: '2026-04-03' as IsoDate, chick_count: 2500 };
    const handoff = handoffAtPlacement(
      baseInput(),
      feedFor(baseInput()),
      0n as Cents,
      c.placement_date
    );

    // AD-43: placement + 41 + terms_days. 41 + 30 = 71.
    expect(projectCandidate(baseInput(), c, handoff).through_day).toBe(71);
  });

  it('gives a later candidate the same number of its own days as an earlier one', () => {
    const early: Candidate = { placement_date: '2026-04-03' as IsoDate, chick_count: 2500 };
    const late: Candidate = { placement_date: '2026-05-03' as IsoDate, chick_count: 2500 };
    const h1 = handoffAtPlacement(
      baseInput(),
      feedFor(baseInput()),
      0n as Cents,
      early.placement_date
    );
    const h2 = handoffAtPlacement(
      baseInput(),
      feedFor(baseInput()),
      0n as Cents,
      late.placement_date
    );

    // The AD-36 error this guards: a fixed 90-day window from asOf would give
    // the later candidate 30 fewer of its OWN days, and Build Reserve would
    // prefer early placement for a window-truncation artefact.
    expect(projectCandidate(baseInput(), late, h2).days.length).toBe(
      projectCandidate(baseInput(), early, h1).days.length
    );
  });
});
