import { SEED_BREED_CURVE, cumulativeFeedG } from './breed-curve.js';
import { addDays, daysBetween } from './day-number.js';
import type {
  Cents,
  DrawLiability,
  EngineInput,
  FeedLiability,
  IsoDate,
  PlannedDraw,
  ProductionProjection
} from './types.js';

/** A feed bag is 50 kg. The client's own unit — `Feed!C2 = Record!M16/50`. */
const KG_PER_BAG = 50;

/**
 * The first draw covers days 1-14; every later draw covers the next 7.
 *
 * Read off the client's own Feed Account, not chosen by us:
 *   C2 = Record!M16/50              -> days 1-14
 *   C3 = (Record!M23-Record!M16)/50 -> days 15-21
 *   C4 = (Record!M30-Record!M23)/50 -> days 22-28
 *   C5 = (Record!M37-Record!M30)/50 -> days 29-35
 */
const FIRST_DRAW_LAST_DAY = 14;
const SUBSEQUENT_DRAW_DAYS = 7;

/** Bags to 2dp. A bag count is divisible and is not money — it stays a float. */
function bagsFromKg(kg: number): number {
  return Math.round((kg / KG_PER_BAG) * 100) / 100;
}

/**
 * M3 — feed liability.
 *
 * Two halves. The LIABILITY half reads entered draws and derives what is owed
 * and when. The PLANNING half reads the breed curve and derives what still
 * needs drawing. They share only the 50 kg bag.
 *
 * What this deliberately does NOT return, because nobody supplied the inputs:
 *
 *   - paid / outstanding. `feed_payments` is not in `EngineInput` (U6).
 *     Defaulting paid to zero looks conservative and is still a fabricated
 *     fact, which is the test invariant 5 actually applies.
 *   - headroom. Needs the facility limit, which is not in `Parameters`.
 */
export function computeFeedLiability(
  input: EngineInput,
  production: ProductionProjection
): FeedLiability {
  const curve = input.curve ?? SEED_BREED_CURVE;
  const { asOf, batch, parameters } = input;

  /**
   * Invariant 7 — no lookahead. A draw collected after `asOf` has not happened
   * yet as far as this computation is concerned.
   *
   * Its DUE DATE, by contrast, is kept even when it falls after `asOf`. That
   * is not lookahead: a bill already incurred and dated forward is a fact
   * about the past, not a reading of the future.
   */
  const collected = input.draws.filter(
    (draw) => daysBetween(draw.collection_date, asOf) >= 0
  );

  const draws: DrawLiability[] = collected.map((draw) => {
    const due_date = addDays(draw.collection_date, draw.terms_days);
    return {
      collection_date: draw.collection_date,
      due_date,
      phase: draw.phase,
      bags: draw.bags,
      kg: draw.kg,
      // Money from bags, always. `kg` never prices anything.
      total_cents: (BigInt(draw.bags) * draw.price_per_bag_cents) as Cents,
      terms_days: draw.terms_days,
      days_until_due: daysBetween(asOf, due_date),
      kg_discrepancy: draw.kg !== draw.bags * KG_PER_BAG
    };
  });

  const lastCurveDay = curve.points[curve.points.length - 1]!.day_number;

  /**
   * Feed for one interval of days, whole flock, in kg.
   *
   * The flock is held FLAT at `flock_size` — U3 forecasts no removals, because
   * forecasting them is M4's job. That makes every planned quantity an upper
   * bound rather than a prediction, which is why the schedule carries
   * `confidence: 'assumed'` rather than being presented as a requirement.
   */
  const kgForDays = (firstDay: number, lastDay: number): number => {
    const perBirdG =
      cumulativeFeedG(curve, lastDay) - (firstDay <= 1 ? 0 : cumulativeFeedG(curve, firstDay - 1));
    return (perBirdG * production.flock_size) / 1000;
  };

  const planned_draws: PlannedDraw[] = [];
  let collection_date: IsoDate = batch.placement_date;
  let firstDay = 1;
  let sequence = 1;

  while (firstDay <= lastCurveDay) {
    // The first draw runs to day 14; the rest cover a week, and the last one
    // takes whatever remains rather than overrunning the curve.
    const span = sequence === 1 ? FIRST_DRAW_LAST_DAY : SUBSEQUENT_DRAW_DAYS;
    const lastDay = Math.min(firstDay + span - 1, lastCurveDay);
    const kg = kgForDays(firstDay, lastDay);

    planned_draws.push({
      sequence,
      collection_date,
      due_date: addDays(collection_date, parameters.feed_terms_days),
      covers_first_day: firstDay,
      covers_last_day: lastDay,
      bags: bagsFromKg(kg),
      kg
    });

    // Chained off the PREVIOUS collection date, not off placement, so a late
    // draw carries the whole remaining schedule with it. See PlannedDraw.
    collection_date = addDays(collection_date, lastDay - firstDay + 1);
    firstDay = lastDay + 1;
    sequence += 1;
  }

  return {
    draws,
    due_dates: draws.map((draw) => draw.due_date),
    total_drawn_kg: collected.reduce((sum, draw) => sum + draw.kg, 0),
    total_drawn_cents: draws.reduce((sum, draw) => sum + draw.total_cents, 0n) as Cents,
    first_draw_bags_to_day_14: bagsFromKg(kgForDays(1, FIRST_DRAW_LAST_DAY)),
    planned_draws,
    planned_confidence: 'assumed'
  };
}
