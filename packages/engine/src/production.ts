import { SEED_BREED_CURVE, cumulativeFeedG, pointForDay } from './breed-curve.js';
import { dayNumberFor } from './day-number.js';
import type { DailyRecord, EngineInput, ProductionDay, ProductionProjection } from './types.js';

/**
 * M1 — flock projection.
 *
 * Three things here are deliberate divergences from the client's own
 * spreadsheet, and each is load-bearing:
 *
 *   1. Extra chicks count toward the flock (KB-1, invariant 9). Every quantity
 *      scales from `chick_count + extra_chick_count`; nothing is hardcoded.
 *   2. Removals are entered CUMULATIVELY and the daily delta is derived
 *      (AD-24, AD-25, invariant 13). A running sum of hand-entered deltas is
 *      corrupted forever by one missed day; a restated cumulative total
 *      self-heals and trips the monotonicity check on the spot.
 *   3. Feed is charged to OPENING birds, not closing (AD-7, invariant 10). A
 *      bird that died today still ate today. His sheet uses closing birds,
 *      which is why our feed figures run slightly higher than his.
 *
 * Nothing is forecast here. Days with no record carry the last known
 * cumulative forward rather than inventing removals from the fallback ramp —
 * forecasting is M4's job, calibrated per batch (AD-24, invariant 14), and
 * inventing a number is what invariant 5 forbids.
 */
export function projectProduction(input: EngineInput): ProductionProjection {
  const curve = input.curve ?? SEED_BREED_CURVE;
  const flock_size = input.batch.chick_count + input.batch.extra_chick_count;
  const day_number = dayNumberFor(input.batch.placement_date, input.asOf);

  // Invariant 7: a computation asOf T never reads a record dated after T.
  const visible = input.records
    .filter((r) => r.day_number <= day_number)
    .slice()
    .sort((a, b) => a.day_number - b.day_number);

  validateRemovals(visible, flock_size);

  const byDay = new Map(visible.map((r) => [r.day_number as number, r]));

  const days: ProductionDay[] = [];
  let mortality_cumulative = 0;
  let cull_cumulative = 0;
  let lastRecordDay: number | null = null;
  let total_feed_g = 0;

  for (let day = 1; day <= day_number; day += 1) {
    const opening_birds = flock_size - mortality_cumulative - cull_cumulative;
    const record = byDay.get(day);

    // A day with no record carries the last recorded total forward UNCHANGED.
    // Nothing is forecast into the gap — see the note above.
    const daily_mortality = record ? record.mortality_cumulative - mortality_cumulative : 0;
    const daily_culls = record ? record.cull_cumulative - cull_cumulative : 0;
    if (record) {
      mortality_cumulative = record.mortality_cumulative;
      cull_cumulative = record.cull_cumulative;
      lastRecordDay = day;
    }

    total_feed_g += opening_birds * pointForDay(curve, day).feed_g;

    days.push({
      day_number: day,
      opening_birds,
      closing_birds: flock_size - mortality_cumulative - cull_cumulative,
      mortality_cumulative,
      cull_cumulative,
      daily_mortality,
      daily_culls,
      carried_forward: record === undefined,
      days_since_last_record: record ? 0 : day - (lastRecordDay ?? 1)
    });
  }

  const today = days[days.length - 1];
  if (today === undefined) {
    throw new Error(`Day ${day_number} is before placement day 1`);
  }

  const live_weight_kg =
    (today.closing_birds * pointForDay(curve, day_number).weight_g) / 1000;
  const total_feed_kg = total_feed_g / 1000;

  return {
    flock_size,
    day_number,
    opening_birds: today.opening_birds,
    closing_birds: today.closing_birds,
    cumulative_feed_kg_per_bird: cumulativeFeedG(curve, day_number) / 1000,
    total_feed_kg,
    fcr: live_weight_kg === 0 ? null : Math.round((total_feed_kg / live_weight_kg) * 100) / 100,
    live_weight_kg,
    days,
    carried_forward: today.carried_forward,
    days_since_last_record: today.days_since_last_record
  };
}

/**
 * Invariant 13. Both columns are monotonically non-decreasing, and the bound
 * is JOINT — a culled bird is no longer available to die, so bounding each
 * column separately would admit a flock losing twice its own size.
 */
function validateRemovals(records: readonly DailyRecord[], flock_size: number): void {
  let previousMortality = 0;
  let previousCulls = 0;

  for (const r of records) {
    if (r.mortality_cumulative < previousMortality) {
      throw new Error(
        `Day ${r.day_number}: mortality_cumulative must be monotonic — ` +
          `${r.mortality_cumulative} is below the previous ${previousMortality}`
      );
    }
    if (r.cull_cumulative < previousCulls) {
      throw new Error(
        `Day ${r.day_number}: cull_cumulative must be monotonic — ` +
          `${r.cull_cumulative} is below the previous ${previousCulls}`
      );
    }
    const removed = r.mortality_cumulative + r.cull_cumulative;
    if (removed > flock_size) {
      throw new Error(
        `Day ${r.day_number}: removals exceed the flock — ${r.mortality_cumulative} dead ` +
          `+ ${r.cull_cumulative} culled = ${removed} from ${flock_size} birds`
      );
    }
    previousMortality = r.mortality_cumulative;
    previousCulls = r.cull_cumulative;
  }
}
