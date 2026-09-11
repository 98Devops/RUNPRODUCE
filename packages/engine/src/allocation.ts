import { SEED_BREED_CURVE } from './breed-curve.js';
import { projectCashCalendar } from './cash.js';
import { addDays } from './day-number.js';
import { computeCosting } from './costing.js';
import { computeFeedLiability } from './feed.js';
import { projectProduction } from './production.js';
import type {
  AllocationMode,
  Candidate,
  CashCalendar,
  CashFlow,
  Cents,
  EngineInput,
  FeedLiability,
  IsoDate,
  ModeWinner,
  RunningBatchHandoff,
  ScoredCandidate
} from './types.js';

/**
 * The bird count the enumeration steps by — the hatchery's order unit, so a
 * recommendation is orderable. 100 is the conventional day-old-chick box and
 * divides both 3,000 and 30,000 exactly. It is NOT a client figure: OQ-18 asks
 * Daniel what his hatchery actually invoices in, and anything this determines
 * carries `confidence: 'assumed'` until he answers.
 */
export const DEFAULT_PLACEMENT_STEP_BIRDS = 100;

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
export function handoffAtPlacement(
  input: EngineInput,
  feed: FeedLiability,
  currentOpeningCents: Cents,
  placementDate: IsoDate
): RunningBatchHandoff {
  const curve = input.curve ?? SEED_BREED_CURVE;
  const lastCurveDay = curve.points[curve.points.length - 1]!.day_number;
  const horizon = lastCurveDay + input.parameters.feed_terms_days;
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
  const throughDay = lastCurveDay + synthetic.parameters.feed_terms_days;

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
  const eligible = scored.filter(
    (s) => !s.breaches_reserve_floor && (mode !== 'COVER_FAST' || s.cover_fast_days !== null)
  );
  if (eligible.length === 0) return null;

  const better = (a: ScoredCandidate, b: ScoredCandidate): number => {
    if (mode === 'COVER_FAST') return (a.cover_fast_days ?? 0) - (b.cover_fast_days ?? 0);
    if (mode === 'MAXIMUM_GROWTH') return b.maximum_growth_birds - a.maximum_growth_birds;
    if (b.build_reserve_cents > a.build_reserve_cents) return 1;
    return b.build_reserve_cents < a.build_reserve_cents ? -1 : 0;
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

  return { mode, winner, tied_candidates, candidates_considered: scored.length };
}
