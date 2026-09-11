import { SEED_BREED_CURVE, cumulativeFeedG } from './breed-curve.js';
import { addDays, daysBetween } from './day-number.js';
import type {
  Cents,
  DrawLiability,
  EngineInput,
  FeedDraw,
  FeedLiability,
  IsoDate,
  MissingInput,
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
 * Whether a draw's recorded kg disagrees with its bag count.
 *
 * Compared at GRAM resolution rather than with `!==` on the raw product.
 * `bags * 50` is not exact in binary floating point for a 2dp bag count —
 * `0.07 * 50` gives `3.5000000000000004` — so exact inequality reported a
 * discrepancy that does not exist. Grams are the project's own weight unit
 * (invariant 2), so agreeing to the gram IS agreeing; this is that unit
 * convention applied, not a tolerance invented to paper over the artefact.
 */
export function kgDiscrepancy(draw: FeedDraw): boolean {
  const fromBagsG = Math.round(draw.bags * KG_PER_BAG * 1000);
  const recordedG = Math.round(draw.kg * 1000);
  return fromBagsG !== recordedG;
}

/**
 * Draws this module cannot price, and why — checked BEFORE pricing.
 *
 * `bags` is the one client-entered field the client's own arithmetic produces
 * as a decimal (`bagsFromKg` above rounds `kg / 50` to 2dp, which is where
 * 26.64 comes from). `BigInt()` throws on a fractional value, so pricing one
 * used to take the WHOLE decision down with an uncaught `RangeError` — no
 * `missing_input`, no partial result, nothing rendered at all.
 *
 * This refuses instead, and refuses on purpose rather than rounding: whether a
 * part bag is real commerce to be priced or a capture-screen artefact to be
 * rejected is OQ-21, still open with the client. Rounding `bags` would change
 * the money owed in a direction nobody chose, which invariant 5 forbids
 * whichever way it rounds.
 */
export function feedDrawsMissingInputs(input: EngineInput): MissingInput[] {
  return input.draws
    .filter((draw) => !Number.isInteger(draw.bags))
    .map((draw) => ({
      key: 'feed_draw_bags' as const,
      why:
        `The feed draw collected ${draw.collection_date} carries ${draw.bags} bags, ` +
        'which is not a whole number. A draw is priced per bag, and whether the ' +
        'supplier ever invoices a part bag — or whether this is a kg / 50 figure ' +
        'entered into a field that wants what the supplier invoiced — is OQ-21, ' +
        'unanswered. The bag count is not rounded: that would change the money ' +
        'owed in a direction nobody chose.'
    }));
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

    // A draw we cannot price is not a draw with a caveat, it is a wrong
  // liability — so this is a programming-error guard, not the invariant-5
  // path. Callers must check feedDrawsMissingInputs() first and return
  // missing_input; this only catches one that skipped it. It matters that it
  // is named rather than a raw RangeError: M5b's projectCandidate calls this
  // function directly.
  const unpriceable = feedDrawsMissingInputs(input);
  if (unpriceable.length > 0) {
    throw new Error(
      `Cannot price a feed draw: ${unpriceable.map((m) => m.why).join(' ')} ` +
        'Call feedDrawsMissingInputs() first and return missing_input.'
    );
  }

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
      kg_discrepancy: kgDiscrepancy(draw)
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
