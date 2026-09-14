import { SEED_BREED_CURVE } from './breed-curve.js';
import { batchCashFlows, cashFlowsMissingInputs, projectCashCalendar } from './cash.js';
import { addDays, daysBetween } from './day-number.js';
import { computeCosting } from './costing.js';
import { computeFeedLiability } from './feed.js';
import { SEED_OVERHEADS, overheadBreakdown } from './overheads.js';
import { projectProduction } from './production.js';
import type {
  AllocationMode,
  AllocationResult,
  Candidate,
  CashCalendar,
  CashFlow,
  Cents,
  EngineInput,
  FeedLiability,
  HarvestPlan,
  IsoDate,
  ModeWinner,
  Parameters,
  PlaceNothing,
  RunningBatchHandoff,
  ScoredCandidate
} from './types.js';

/**
 * The bird count the enumeration steps by — the hatchery's order unit, so a
 * recommendation is orderable.
 *
 * **ONE, and it is now a client figure** (OQ-18, answered 2026-09-12: the
 * hatchery invoices **per chick**). It was an assumed 100 — the conventional
 * day-old-chick box — and anything it determined carried `confidence:
 * 'assumed'` for that reason. It no longer does: a recommendation of 8,437
 * birds is an order Daniel can actually place, and nothing rounds it.
 *
 * **What this costs, measured rather than estimated (OQ-29).** The grid is
 * sizes x 31 dates, so a stride of 1 multiplies the candidate count by the
 * old stride: at his realistic 5,000-bird ceiling `computeAllocation` goes
 * from 0.26 s to **20.8 s**, and the brief's 30,000 target is ~6x that again.
 * That is ours to fix, not his to answer, and it is not fixed by putting 100
 * back — that would be a search bound wearing a client fact's name. See AD-53.
 */
export const DEFAULT_PLACEMENT_STEP_BIRDS = 1;

/** Invariant 16 / AD-31. Harvest completion, not first sale. Never tradeable. */
const INTER_BATCH_GAP_DAYS = 14;

/** AD-40. Past floor + 30 no further bulk receivable is unlocked by waiting. */
const DATE_RANGE_DAYS = 30;

export function enumerateCandidates(
  input: EngineInput,
  harvestCompletionDate: IsoDate,
  maxChickCount: number
): readonly Candidate[] {
  const step = input.parameters.placement_step_birds ?? DEFAULT_PLACEMENT_STEP_BIRDS;
  if (step <= 0) throw new Error(`placement_step_birds must be positive, got ${step}`);

  const floor = addDays(harvestCompletionDate, INTER_BATCH_GAP_DAYS);
  const candidates: Candidate[] = [];

  for (let offset = 0; offset <= DATE_RANGE_DAYS; offset += 1) {
    const placement_date = addDays(floor, offset);
    // Sizes start at one step, never zero: a zero-bird batch would push $780 of
    // PER_BATCH overhead through the standard fields as though a batch existed.
    // That outcome is place_nothing's, and it is reported separately (AD-41).
    for (let chick_count = step; chick_count <= maxChickCount; chick_count += step) {
      candidates.push({ placement_date, chick_count });
    }
  }

  return candidates;
}

/**
 * Split the running batch's cash position at a candidate's placement date.
 *
 * `projectCashCalendar` re-books the full chick cost and overhead lump on its
 * own day 1, so the candidate's `openingCents` cannot be the client's current
 * bank balance — it has to be the RUNNING batch's projected closing balance on
 * the day before the candidate is placed. Everything after that date stays
 * dated, because AD-43's reserve-floor filter reads the trough rather than the
 * endpoint.
 *
 * The horizon is the running batch's own completion, for the AD-36 reason
 * AD-43 gives: a fixed window would give candidates at different dates
 * different amounts of the running batch inside it.
 */
/**
 * A horizon long enough to hold every flow, never shorter than `ownCompletion`.
 *
 * AD-43's own-completion horizon is a floor, not a cut-off. A draw or receipt
 * on its OWN terms can land after `41 + feed_terms_days`, and a calendar that
 * stops first drops it — from the opening balance, from the carried flows, and
 * from the trough the reserve floor reads. Dropping an obligation flatters the
 * balance, the direction this engine must never err in.
 */
function horizonCovering(
  placementDate: IsoDate,
  ownCompletion: number,
  flows: readonly CashFlow[]
): number {
  let horizon = ownCompletion;
  for (const flow of flows) {
    const day = daysBetween(placementDate, flow.date) + 1;
    if (day > horizon) horizon = day;
  }
  return horizon;
}

export function handoffAtPlacement(
  input: EngineInput,
  feed: FeedLiability,
  currentOpeningCents: Cents,
  placementDate: IsoDate
): RunningBatchHandoff {
  const curve = input.curve ?? SEED_BREED_CURVE;
  const lastCurveDay = curve.points[curve.points.length - 1]!.day_number;
  const horizon = horizonCovering(
    input.batch.placement_date,
    lastCurveDay + input.parameters.feed_terms_days,
    batchCashFlows(input, feed)
  );
  const calendar = projectCashCalendar(input, horizon, currentOpeningCents, feed);

  const dayBefore = addDays(placementDate, -1);
  let opening_cents = currentOpeningCents;
  const carried_flows: CashFlow[] = [];

  for (const day of calendar.days) {
    if (day.date <= dayBefore) {
      opening_cents = day.closing_cents;
      continue;
    }
    carried_flows.push(...day.flows);
  }

  return { opening_cents, carried_flows };
}

/**
 * A candidate rendered as an `EngineInput`, because that is the only thing
 * `projectCashCalendar` consumes — there is no candidate type it accepts.
 *
 * Records, draws and sales are emptied deliberately. They belong to the
 * RUNNING batch; inheriting them would replay its mortality and re-book its
 * feed against a batch that has not been placed. The running batch reaches the
 * projection through `handoff.carried_flows` instead, which is where its
 * obligations actually belong.
 *
 * `asOf` is the placement date: a candidate has no history to be `asOf` after,
 * and invariant 7 forbids reading past it anyway.
 */
export function candidateInput(input: EngineInput, candidate: Candidate): EngineInput {
  return {
    asOf: candidate.placement_date,
    batch: {
      placement_date: candidate.placement_date,
      chick_count: candidate.chick_count,
      // A candidate is what we would ORDER. Extra chicks are the hatchery's
      // gift and are not orderable, so a candidate never assumes any (KB-1 is
      // about counting the ones that arrive, not forecasting them).
      extra_chick_count: 0,
      chick_price_cents: input.batch.chick_price_cents
    },
    parameters: input.parameters,
    ...(input.curve === undefined ? {} : { curve: input.curve }),
    records: [],
    draws: [],
    sales: []
  };
}

export function projectCandidate(
  input: EngineInput,
  candidate: Candidate,
  handoff: RunningBatchHandoff
): CashCalendar {
  const synthetic = candidateInput(input, candidate);
  const curve = synthetic.curve ?? SEED_BREED_CURVE;
  const lastCurveDay = curve.points[curve.points.length - 1]!.day_number;

  // AD-43's own-completion horizon, passed explicitly because AD-47 gave
  // throughDay no default precisely so this choice cannot be inherited wrong.
  // Extended past it only as far as a carried flow reaches, so the running
  // batch's late obligations still land inside this candidate's trough.
  const throughDay = horizonCovering(
    candidate.placement_date,
    lastCurveDay + synthetic.parameters.feed_terms_days,
    handoff.carried_flows
  );

  const feed = computeFeedLiability(synthetic, projectProduction(synthetic));
  return projectCashCalendar(synthetic, throughDay, handoff.opening_cents, feed, handoff.carried_flows);
}

/**
 * The three integer scalars AD-43 ranks on, plus the floor as a separate fact.
 *
 * The floor FILTERS and never scores: a breach is reported on its own field so
 * `pickWinner` can drop the candidate outright. Folding it into Build Reserve's
 * cents would both double-count it and let a high scorer buy past what is meant
 * to be a hard constraint.
 */
export function scoreCandidate(
  input: EngineInput,
  candidate: Candidate,
  handoff: RunningBatchHandoff
): ScoredCandidate {
  const synthetic = candidateInput(input, candidate);
  const calendar = projectCandidate(input, candidate, handoff);
  const production = projectProduction(synthetic);
  const costing = computeCosting(synthetic, production);

  // Cover Fast is "days until receipts have repaid the core credit". Null when
  // that never happens inside the horizon — a real state, not a large number.
  // A sentinel would sort, and sorting a "never happened" into a ranking is
  // exactly the confident wrong answer invariant 5 forbids.
  /**
   * KNOWN LIMITATION — OQ-26. This scalar cannot currently fire.
   *
   * `day.in_cents` is receipts, and a candidate has none: `candidateInput`
   * empties `sales` because a candidate has no sales history, and M5b forecasts
   * no sales for a hypothetical batch. The running batch's receipts do not fill
   * the gap either — anything it settles before the candidate's placement is
   * collapsed into `openingCents` by `handoffAtPlacement`, correctly, or it
   * would be counted twice.
   *
   * So `cover_fast_days` is null for every realistic input and
   * `pickWinner('COVER_FAST', ...)` returns null with it. That is HONEST — it
   * reports "could not determine" rather than a number — but it is easy to
   * misread as "no candidate covers fast", which is a different claim. Closing
   * it needs a forecast of the candidate's own sales, which is M6's territory.
   */
  let cumulativeReceipts = 0n;
  let cover_fast_days: number | null = null;
  for (const day of calendar.days) {
    cumulativeReceipts += day.in_cents;
    if (cover_fast_days === null && cumulativeReceipts >= costing.core_credit_cents) {
      cover_fast_days = day.day_number;
    }
  }

  return {
    candidate,
    calendar,
    cover_fast_days,
    maximum_growth_birds: candidate.chick_count,
    build_reserve_cents: calendar.closing_cents,
    breaches_reserve_floor: calendar.breaches_reserve_floor
  };
}

/**
 * The best candidate for one mode, with the tie-break stated rather than left
 * to loop order — which no test pins down and which changes silently on a
 * refactor (AD-44).
 *
 * Returns null when the mode has nothing to rank: every candidate breaches the
 * floor, or (for Cover Fast) none of them ever clears core credit. That is a
 * real and reportable answer, not a failure to find one.
 */
export function pickWinner(
  mode: AllocationMode,
  scored: readonly ScoredCandidate[]
): ModeWinner | null {
  // AD-43: the floor filters. A breaching candidate is not ranked lower, it is
  // not ranked. If that empties the field, "nothing is affordable" is the
  // honest answer and the caller reports it as one.
  // A null `breaches_reserve_floor` means UNCHECKED, not clean, so it does not
  // exclude — the candidate is still the best on its own scalar. What it does
  // do is make `reserve_floor_checked` false below, so nobody reads the winner
  // as having cleared a constraint that was never evaluated.
  const eligible = scored.filter(
    (s) =>
      s.breaches_reserve_floor !== true &&
      (mode !== 'COVER_FAST' || s.cover_fast_days !== null) &&
      (mode !== 'BUILD_RESERVE' || s.build_reserve_cents !== null)
  );
  if (eligible.length === 0) return null;

  const better = (a: ScoredCandidate, b: ScoredCandidate): number => {
    if (mode === 'COVER_FAST') return (a.cover_fast_days ?? 0) - (b.cover_fast_days ?? 0);
    if (mode === 'MAXIMUM_GROWTH') return b.maximum_growth_birds - a.maximum_growth_birds;
    // BUILD_RESERVE: nulls are filtered out above, so both sides are real.
    const aCents = a.build_reserve_cents ?? 0n;
    const bCents = b.build_reserve_cents ?? 0n;
    if (bCents > aCents) return 1;
    return bCents < aCents ? -1 : 0;
  };

  const ranked = [...eligible].sort((a, b) => {
    const byScore = better(a, b);
    if (byScore !== 0) return byScore;
    // AD-44: earliest date, because the floor already handles biosecurity and
    // idle days earn nothing; then smaller size, because at an equal score it
    // risks less capital.
    if (a.candidate.placement_date !== b.candidate.placement_date) {
      return a.candidate.placement_date < b.candidate.placement_date ? -1 : 1;
    }
    return a.candidate.chick_count - b.candidate.chick_count;
  });

  const winner = ranked[0]!;
  const tied_candidates = ranked.filter((s) => better(s, winner) === 0).length;

  return {
    mode,
    winner,
    tied_candidates,
    candidates_considered: scored.length,
    reserve_floor_checked: winner.breaches_reserve_floor !== null
  };
}

/**
 * The outcome where the best candidate is to place no next batch at all.
 *
 * A real answer with its own overhead justification (AD-41), never a zero-bird
 * batch through the standard fields: that would put $0 of revenue and the full
 * PER_BATCH overhead into a projection as though a batch existed.
 */
export function placeNothing(
  input: EngineInput,
  /**
   * null when the running batch could not be projected — a bulk sale the
   * calendar refuses because `cashFlowsMissingInputs` names a gap (a null
   * abattoir fee or transport rate, or that order's own contract incomplete:
   * AD-55, AD-57). The overhead arithmetic below needs no projection and stays
   * real either way.
   */
  handoff: RunningBatchHandoff | null
): PlaceNothing {
  const overheads = input.parameters.overheads ?? SEED_OVERHEADS;
  // Only PER_BATCH lines are avoided by not placing. PER_BIRD lines scale to
  // zero on their own, so counting them as "avoided" would double the saving.
  const perBatch = overheadBreakdown(overheads, 0).filter((line) => line.basis === 'PER_BATCH');
  const overhead_avoided_cents = perBatch.reduce((sum, line) => sum + line.cents, 0n) as Cents;

  if (handoff === null) {
    // Null, never 0n. A zero balance is a claim about the money; this is the
    // absence of one.
    return {
      overhead_avoided_cents,
      overhead_still_incurred_cents: 0n as Cents,
      closing_cents: null
    };
  }

  const carriedSum = handoff.carried_flows.reduce((sum, f) => sum + f.amount_cents, 0n);

  return {
    overhead_avoided_cents,
    overhead_still_incurred_cents: 0n as Cents,
    closing_cents: (handoff.opening_cents + carriedSum) as Cents
  };
}

/**
 * The enumeration's upper bound — the largest placement the optimiser may even
 * consider.
 *
 * OPERATOR-ENTERED. OQ-23 settled the SOURCE (the client's own requirements
 * call: the placement field takes "any figure technically", 5,000 realistic
 * today, 30,000 the brief's planning target) but deliberately not a value the
 * engine may assume. So this throws on absence rather than defaulting: a
 * default here would invent the single number deciding how much of the decision
 * space gets looked at, which is invariant 5's mistake at its largest scale.
 *
 * NOT gate-derived, and that is the whole point of OQ-23. Gate capacity caps
 * how fast a batch converts to same-day cash; a bulk-inclusive batch exceeds
 * gate absorption by design, on the brief's own instruction to "use the bulk
 * buyer to absorb volume". The client says the same thing himself: 7,000 at the
 * gate while pushing to place 15,000.
 */
function requirePlacementCeiling(parameters: Parameters): number {
  const ceiling = parameters.max_placement_birds;
  if (ceiling === undefined) {
    throw new Error(
      'Cannot enumerate candidates: parameters.max_placement_birds is not set. ' +
        'What caps a placement is the operator\'s to state (OQ-23) — house space, ' +
        'hatchery supply or cash — and the engine does not guess it. Neither the ' +
        "brief's 30,000 target nor today's 5,000 is a ceiling we may assume."
    );
  }
  if (ceiling <= 0) {
    throw new Error(`max_placement_birds must be positive, got ${ceiling}`);
  }
  return ceiling;
}

/**
 * A candidate the engine can name but cannot price.
 *
 * Every field needing a cash calendar is null, because the calendar refuses a
 * bulk sale that `cashFlowsMissingInputs` names a gap in (AD-55, AD-57). Only
 * `maximum_growth_birds` survives, which is exactly why Maximum Growth still
 * answers while the other two modes refuse.
 */
function unscorableCandidate(candidate: Candidate): ScoredCandidate {
  return {
    candidate,
    calendar: null,
    cover_fast_days: null,
    maximum_growth_birds: candidate.chick_count,
    build_reserve_cents: null,
    breaches_reserve_floor: null
  };
}

/**
 * M5b — the allocation answer.
 *
 * Enumerates size x date candidates from invariant 16's floor, scores each
 * against one cash projection, and returns a winner per mode plus
 * `place_nothing`.
 *
 * **The refusal is checked BEFORE anything is projected, not after.** Every
 * projection path here runs through `projectCashCalendar`, which refuses a
 * bulk-inclusive input outright — so scoring first and reporting the refusal
 * afterwards would throw before the refusal could ever be returned. The blocked
 * path therefore builds no calendars at all.
 */
export function computeAllocation(
  input: EngineInput,
  feed: FeedLiability,
  harvest: HarvestPlan,
  openingCents: Cents
): AllocationResult {
  // Harvest COMPLETION, not first sale (invariant 16): the day the last bird
  // goes. The planned gate window says when that SHOULD be; a real order dated
  // later says it was not, and the biosecurity floor (AD-40, never tradeable)
  // must count from the later of the two, never the plan.
  let harvestCompletionDate = addDays(
    input.batch.placement_date,
    harvest.gate_window.last_day - 1
  );
  for (const sale of input.sales) {
    if (sale.order_date > harvestCompletionDate) harvestCompletionDate = sale.order_date;
  }

  const maxChickCount = requirePlacementCeiling(input.parameters);
  const candidates = enumerateCandidates(input, harvestCompletionDate, maxChickCount);
  const blocked = cashFlowsMissingInputs(input);

  /**
   * One handoff per DATE, not per candidate. The handoff depends only on the
   * placement date — it is the running batch's position split at that date, and
   * the candidate's size does not enter it. Without this the grid projects the
   * same 31 calendars once per size: 93 projections at the test ceiling, and
   * thousands at the client's real one.
   */
  const handoffByDate = new Map<IsoDate, RunningBatchHandoff>();
  const handoffFor = (date: IsoDate): RunningBatchHandoff => {
    let handoff = handoffByDate.get(date);
    if (handoff === undefined) {
      handoff = handoffAtPlacement(input, feed, openingCents, date);
      handoffByDate.set(date, handoff);
    }
    return handoff;
  };

  const scored: ScoredCandidate[] = blocked.length > 0
    ? candidates.map(unscorableCandidate)
    : candidates.map((candidate) =>
        scoreCandidate(input, candidate, handoffFor(candidate.placement_date))
      );

  /**
   * The asymmetry, stated in the output rather than only in the spec, so
   * anyone reading a demo or a test run finds the explanation where the
   * refusal is instead of having to go looking for it.
   */
  const asymmetry =
    ' Two of three modes returning missing_input while Maximum Growth returns a real ' +
    'number is EXPECTED, not a regression: its scalar is placement size, which needs no ' +
    'cash calendar. Its winner carries reserve_floor_checked: false, because without a ' +
    'calendar the floor could not be evaluated either. See u5-allocation-optimiser.md.';
  const refusal = blocked.map((m) => ({ ...m, why: m.why + asymmetry }));

  const earliest = candidates[0]?.placement_date ?? input.batch.placement_date;

  return {
    cover_fast: blocked.length > 0 ? refusal : pickWinner('COVER_FAST', scored),
    maximum_growth: pickWinner('MAXIMUM_GROWTH', scored),
    build_reserve: blocked.length > 0 ? refusal : pickWinner('BUILD_RESERVE', scored),
    place_nothing: placeNothing(input, blocked.length > 0 ? null : handoffFor(earliest)),
    candidates_considered: candidates.length
  };
}
