import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PLACEMENT_STEP_BIRDS,
  candidateInput,
  enumerateCandidates,
  handoffAtPlacement,
  computeAllocation,
  pickWinner,
  placeNothing,
  projectCandidate,
  scoreCandidate
} from '../src/allocation.js';
import { projectCashCalendar } from '../src/cash.js';
import { planHarvest } from '../src/harvest.js';
import { computeFeedLiability } from '../src/feed.js';
import { missingInputsFor } from '../src/index.js';
import { projectProduction } from '../src/production.js';
import type {
  Candidate,
  CashCalendar,
  Cents,
  EngineInput,
  Grams,
  IsoDate,
  MissingInput,
  ModeWinner,
  Parameters,
  SalesOrder,
  ScoredCandidate
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
    // OQ-23: operator-entered, no derived default. Small here so the grid stays
    // cheap — 3 sizes x 31 dates rather than the client's real 5,000.
    max_placement_birds: 300,
    ...overrides
  };
}

function baseInput(
  paramOverrides: Partial<Parameters> = {},
  sales: readonly SalesOrder[] = []
): EngineInput {
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
    sales
  };
}

function harvestOf(engineInput: EngineInput) {
  return planHarvest(engineInput, projectProduction(engineInput));
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

  it('steps size one bird at a time by default, since the hatchery invoices per chick', () => {
    const candidates = enumerateCandidates(baseInput(), '2026-03-20' as IsoDate, 300);
    const sizes = [...new Set(candidates.map((c) => c.chick_count))].sort((a, b) => a - b);

    // OQ-18, answered 2026-09-12: per chick, so nothing rounds a recommendation.
    expect(DEFAULT_PLACEMENT_STEP_BIRDS).toBe(1);
    expect(sizes).toHaveLength(300);
    // AD-41: size 0 is place_nothing's job, never a candidate.
    expect(sizes[0]).toBe(1);
    expect(sizes[299]).toBe(300);
  });

  /**
   * The cost of that answer, pinned so nobody discovers it in front of the
   * client (OQ-29, AD-53). The grid is sizes x 31 dates, so the candidate count
   * scales inversely with the stride — 20.8 s at Daniel's realistic 5,000-bird
   * ceiling against 0.26 s at the old assumed 100. This asserts the SHAPE, not
   * a wall-clock time, which would be a flaky test on someone else's machine.
   */
  it('pays for that with a candidate count that scales inversely with the stride', () => {
    const fine = enumerateCandidates(baseInput(), '2026-03-20' as IsoDate, 5000);
    const coarse = enumerateCandidates(
      baseInput({ placement_step_birds: 100 }),
      '2026-03-20' as IsoDate,
      5000
    );
    expect(fine.length).toBe(coarse.length * 100);
    expect(fine.length).toBe(5000 * 31);
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

describe('scoreCandidate', () => {
  it('scores Maximum Growth on placement size, which needs no bulk net', () => {
    const c: Candidate = { placement_date: '2026-04-03' as IsoDate, chick_count: 2500 };
    const handoff = handoffAtPlacement(
      baseInput(),
      feedFor(baseInput()),
      0n as Cents,
      c.placement_date
    );

    expect(scoreCandidate(baseInput(), c, handoff).maximum_growth_birds).toBe(2500);
  });

  it('scores Build Reserve in integer cents, never a float', () => {
    const c: Candidate = { placement_date: '2026-04-03' as IsoDate, chick_count: 2500 };
    const handoff = handoffAtPlacement(
      baseInput(),
      feedFor(baseInput()),
      0n as Cents,
      c.placement_date
    );

    expect(typeof scoreCandidate(baseInput(), c, handoff).build_reserve_cents).toBe('bigint');
  });

  it('reports a floor breach rather than scoring it', () => {
    const c: Candidate = { placement_date: '2026-04-03' as IsoDate, chick_count: 2500 };
    const withFloor = baseInput({ reserve_floor_cents: 10_000_000n as Cents });
    const handoff = handoffAtPlacement(withFloor, feedFor(withFloor), 0n as Cents, c.placement_date);
    const scored = scoreCandidate(withFloor, c, handoff);

    // AD-43. The floor is a filter, so the scalars are unchanged by it and the
    // breach is a separate fact. Folding it into Build Reserve's score would
    // both double-count it and let a high scorer buy past a hard constraint.
    expect(scored.breaches_reserve_floor).toBe(true);
    expect(scored.maximum_growth_birds).toBe(2500);
  });

  it('returns null Cover Fast days when receipts never clear core credit', () => {
    const c: Candidate = { placement_date: '2026-04-03' as IsoDate, chick_count: 2500 };
    const handoff = handoffAtPlacement(
      baseInput(),
      feedFor(baseInput()),
      0n as Cents,
      c.placement_date
    );

    // No sales orders on a synthetic candidate, so nothing ever clears. Null,
    // not Infinity and not a large sentinel: a sentinel sorts, and sorting a
    // "never happened" into a ranking is a confident wrong answer.
    expect(scoreCandidate(baseInput(), c, handoff).cover_fast_days).toBeNull();
  });
});

describe('pickWinner', () => {
  const at = (date: string, birds: number, cents: bigint): ScoredCandidate => ({
    candidate: { placement_date: date as IsoDate, chick_count: birds },
    calendar: {} as CashCalendar,
    cover_fast_days: null,
    maximum_growth_birds: birds,
    build_reserve_cents: cents as Cents,
    breaches_reserve_floor: false
  });

  it('breaks a tie on the earliest date, then the smaller size', () => {
    const scored = [at('2026-04-05', 300, 0n), at('2026-04-03', 300, 0n), at('2026-04-03', 200, 0n)];
    const won = pickWinner('BUILD_RESERVE', scored);

    // AD-44. Stated and tested, so the answer does not depend on loop order —
    // which no test pins down and which changes silently on a refactor.
    expect(won?.winner.candidate.placement_date).toBe('2026-04-03');
    expect(won?.winner.candidate.chick_count).toBe(200);
  });

  it('reports how many candidates tied, because an insensitive choice is news', () => {
    const scored = [at('2026-04-03', 200, 0n), at('2026-04-04', 300, 0n), at('2026-04-05', 100, 0n)];
    expect(pickWinner('BUILD_RESERVE', scored)?.tied_candidates).toBe(3);
  });

  it('excludes a floor-breaching candidate from the ranking entirely', () => {
    const breaching = { ...at('2026-04-03', 300, 999_999n), breaches_reserve_floor: true };
    const clean = at('2026-04-04', 100, 1n);
    expect(pickWinner('BUILD_RESERVE', [breaching, clean])?.winner.candidate.chick_count).toBe(100);
  });

  it('returns null when every candidate breaches the floor', () => {
    const breaching = { ...at('2026-04-03', 300, 999_999n), breaches_reserve_floor: true };
    // A real and reportable answer, not a failure to find one.
    expect(pickWinner('BUILD_RESERVE', [breaching])).toBeNull();
  });

  it('drops null Cover Fast scorers rather than ranking them last', () => {
    const never = at('2026-04-03', 300, 0n);
    const clears = { ...at('2026-04-10', 100, 0n), cover_fast_days: 55 };
    expect(pickWinner('COVER_FAST', [never, clears])?.winner.candidate.chick_count).toBe(100);
  });
});

describe('placeNothing', () => {
  it('avoids the PER_BATCH overhead and no more', () => {
    const handoff = handoffAtPlacement(
      baseInput(),
      feedFor(baseInput()),
      0n as Cents,
      '2026-04-03' as IsoDate
    );
    const nothing = placeNothing(baseInput(), handoff);

    // AD-26 / AD-41: labour $640 + electricity $140 = $780 is what NOT placing
    // avoids. PER_BIRD lines scale to zero birds on their own and are not
    // "avoided" — counting them here would double the saving.
    expect(nothing.overhead_avoided_cents).toBe(78_000n);
  });

  it('is not a zero-bird batch flowing through the standard fields', () => {
    const handoff = handoffAtPlacement(
      baseInput(),
      feedFor(baseInput()),
      0n as Cents,
      '2026-04-03' as IsoDate
    );
    const nothing = placeNothing(baseInput(), handoff);

    // It carries the overhead arithmetic that justifies it, and no candidate.
    expect('candidate' in nothing).toBe(false);
    expect('maximum_growth_birds' in nothing).toBe(false);
  });
});

describe('requirePlacementCeiling', () => {
  it('throws when nobody has said what caps a placement', () => {
    // OQ-23 settled the SOURCE — the operator types it — not a value the engine
    // may assume. 5,000 is today's scale and 30,000 the brief's target; picking
    // either here would invent the number that decides how much of the decision
    // space the engine is willing to look at.
    const noCeiling = baseInput();
    const { max_placement_birds: _omitted, ...rest } = noCeiling.parameters;
    const stripped: EngineInput = { ...noCeiling, parameters: rest as Parameters };

    expect(() =>
      computeAllocation(stripped, feedFor(stripped), harvestOf(stripped), 0n as Cents)
    ).toThrow(/max_placement_birds/);
  });
});

describe('computeAllocation — the two-blocked-one-working asymmetry', () => {
  const BULK: readonly SalesOrder[] = [
    {
      channel: 'BULK',
      order_date: '2026-03-10' as IsoDate,
      bird_count: 500,
      avg_live_weight_g: 1800 as Grams,
      avg_dressed_weight_g: null,
      bands: null,
      pricing_basis: 'PER_BIRD',
      price_cents_per_bird: 390n as Cents,
      price_cents_per_kg: null,
      terms_days: 30
    }
  ];
  const bulkInput = () => baseInput({}, BULK);
  const runBulk = () =>
    computeAllocation(bulkInput(), feedFor(bulkInput()), harvestOf(bulkInput()), 0n as Cents);

  it('does not throw, even though the running batch cannot be projected', () => {
    // The regression this pins: every projection path — handoffAtPlacement,
    // projectCandidate, placeNothing's closing balance — runs through
    // projectCashCalendar, which REFUSES a bulk-inclusive input. Scoring first
    // and checking afterwards throws before any refusal can be reported.
    expect(() => runBulk()).not.toThrow();
  });

  it('refuses Cover Fast and Build Reserve while transport is unsupplied', () => {
    const result = runBulk();
    const keys = (result.cover_fast as MissingInput[]).map((m) => m.key);

    // 'bulk_price' is no longer among these. It used to stand unconditionally
    // because no code computed a bulk net; AD-57 wrote it, so the only thing
    // blocking this input now is that it carries no transport value of its own.
    expect(keys).toContain('transport_cents_per_bird');
    expect(keys).not.toContain('bulk_price');
    expect(Array.isArray(result.build_reserve)).toBe(true);
  });

  it('still answers Maximum Growth, whose scalar needs no bulk net', () => {
    const result = runBulk();

    // Two of three modes blocked while the third answers is correct and
    // expected, not a partial failure. It is invariant 5 working.
    expect(Array.isArray(result.maximum_growth)).toBe(false);
    expect((result.maximum_growth as ModeWinner).winner.maximum_growth_birds).toBeGreaterThan(0);
  });

  it('admits the reserve floor went unchecked rather than implying it passed', () => {
    const result = runBulk();
    const won = result.maximum_growth as ModeWinner;

    // Without a calendar there is no trough to read, so "does not breach the
    // floor" is not a fact we hold. Reporting false would assert the winner is
    // affordable on no evidence — the confident wrong answer invariant 5 is
    // about. Null means unchecked, and the flag says so out loud.
    expect(won.winner.breaches_reserve_floor).toBeNull();
    expect(won.reserve_floor_checked).toBe(false);
  });

  it('says in the output itself that the split is expected', () => {
    const result = runBulk();
    const why = (result.cover_fast as MissingInput[]).map((m) => m.why).join(' ');

    // So anyone reading a test run or a demo finds the explanation in the
    // output rather than having to find the spec.
    expect(why).toMatch(/Maximum Growth/);
    expect(why).toMatch(/expected/i);
  });

  it('reports place_nothing overheads but a null closing balance', () => {
    const result = runBulk();

    // The overhead arithmetic needs no projection and is still real. The
    // closing balance needs one, and there isn't one — so it is null, not 0n.
    expect(result.place_nothing.overhead_avoided_cents).toBe(78_000n);
    expect(result.place_nothing.closing_cents).toBeNull();
  });
});

describe('computeAllocation — an unpriced gate order', () => {
  it('refuses with a typed gate_price rather than throwing mid-projection', () => {
    const unpriced = () =>
      baseInput({}, [
        {
          channel: 'GATE',
          order_date: '2026-03-08' as IsoDate,
          bird_count: 500,
          avg_live_weight_g: 1770 as Grams,
          avg_dressed_weight_g: null,
          bands: null,
          pricing_basis: 'PER_BIRD',
          price_cents_per_bird: null,
          price_cents_per_kg: null,
          terms_days: 0
        }
      ]);
    const result = computeAllocation(unpriced(), feedFor(unpriced()), harvestOf(unpriced()), 0n as Cents);
    expect((result.build_reserve as MissingInput[]).map((m) => m.key)).toEqual(['gate_price']);
  });
});

describe('computeAllocation — a gate-only batch answers everything', () => {
  // A floor low enough that candidates are affordable. baseInput carries NO
  // sales, so the running batch spends a whole cycle and earns nothing; against
  // a zero floor every candidate breaches and every mode correctly returns
  // null. That is real behaviour and is pinned separately below — it is just
  // not the behaviour THIS block is about.
  const affordable = () => baseInput({ reserve_floor_cents: -10_000_000n as Cents });
  const run = () =>
    computeAllocation(affordable(), feedFor(affordable()), harvestOf(affordable()), 0n as Cents);

  it('answers all three modes', () => {
    const result = run();
    expect(Array.isArray(result.cover_fast)).toBe(false);
    expect(Array.isArray(result.build_reserve)).toBe(false);
    expect(Array.isArray(result.maximum_growth)).toBe(false);
  });

  it('checks the reserve floor for real, and says so', () => {
    const result = run();
    expect((result.maximum_growth as ModeWinner).reserve_floor_checked).toBe(true);
    expect((result.maximum_growth as ModeWinner).winner.breaches_reserve_floor).toBe(false);
  });

  it('enumerates from the harvest completion floor, not from placement', () => {
    const result = run();
    // gate_window.last_day is 31, so completion is placement + 30 = 2026-03-08,
    // and invariant 16's floor is 14 days after that.
    const won = result.maximum_growth as ModeWinner;
    expect(won.winner.candidate.placement_date >= '2026-03-22').toBe(true);
    // 300 sizes x 31 dates — one candidate per bird, since the hatchery
    // invoices per chick (OQ-18). It was 93 at the old assumed 100-bird box.
    expect(result.candidates_considered).toBe(9300);
  });

  it('gives place_nothing a real closing balance', () => {
    expect(run().place_nothing.closing_cents).not.toBeNull();
  });

  it('returns null for every mode when nothing clears the floor', () => {
    // Not a failure to find an answer — "nothing is affordable" IS the answer,
    // and the caller reports it as one (AD-43). baseInput never sells, so a
    // zero floor is unreachable.
    const broke = computeAllocation(baseInput(), feedFor(baseInput()), harvestOf(baseInput()), 0n as Cents);
    expect(broke.cover_fast).toBeNull();
    expect(broke.maximum_growth).toBeNull();
    expect(broke.build_reserve).toBeNull();
    // The candidates were still enumerated and considered; none survived.
    expect(broke.candidates_considered).toBe(9300);
  });
});

describe('Cover Fast cannot currently answer — pinned, not accepted', () => {
  it('returns null even when the running batch sells for real cash', () => {
    const selling = () =>
      baseInput({ reserve_floor_cents: -10_000_000n as Cents }, [
        {
          channel: 'GATE',
          order_date: '2026-03-08' as IsoDate,
          bird_count: 2900,
          avg_live_weight_g: 1770 as Grams,
          avg_dressed_weight_g: null,
          bands: null,
          pricing_basis: 'PER_BIRD',
          price_cents_per_bird: 425n as Cents,
          price_cents_per_kg: null,
          terms_days: 0
        }
      ]);
    const result = computeAllocation(
      selling(),
      feedFor(selling()),
      harvestOf(selling()),
      0n as Cents
    );

    // OQ-26. Two design facts combine to make this structural, not incidental:
    //   1. candidateInput empties `sales` — a candidate carries no forecast
    //      sales of its own, and M5b does not model any.
    //   2. Anything the running batch settles BEFORE the candidate's placement
    //      collapses into opening_cents rather than riding along as a dated
    //      receipt — correctly, or it would be double-counted.
    // So in_cents is zero across a candidate's whole horizon and the scalar
    // never clears core credit. The other two modes answer normally.
    expect(result.cover_fast).toBeNull();
    expect(result.maximum_growth).not.toBeNull();
    expect(result.build_reserve).not.toBeNull();
  });
});
