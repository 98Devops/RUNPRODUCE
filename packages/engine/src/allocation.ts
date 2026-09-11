import { addDays } from './day-number.js';
import type { Candidate, EngineInput, IsoDate } from './types.js';

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
