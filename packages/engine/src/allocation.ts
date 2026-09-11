import { SEED_BREED_CURVE } from './breed-curve.js';
import { projectCashCalendar } from './cash.js';
import { addDays } from './day-number.js';
import type {
  Candidate,
  CashFlow,
  Cents,
  EngineInput,
  FeedLiability,
  IsoDate,
  RunningBatchHandoff
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
