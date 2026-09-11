import { SEED_BREED_CURVE, pointForDay } from './breed-curve.js';
import type {
  BreedCurve,
  BulkBand,
  Cents,
  EngineInput,
  Grams,
  HarvestPlan,
  HoldCost,
  MortalityModel,
  Parameters,
  ProductionProjection,
  YieldSensitivity
} from './types.js';

/**
 * The bulk contract's dressed-weight bands. Client data, seeded the same way
 * SEED_OVERHEADS is (AD-23's convention): no fixture should carry a literal
 * copy of client data it does not assert on.
 *
 * The schedule pays LESS as the bird gets heavier, which is why the slaughter
 * target is a floor and overshoot is a real loss (AD-33).
 */
export const SEED_BULK_BANDS: readonly BulkBand[] = [
  { dressed_floor_g: 1100 as Grams, price_cents_per_bird: 390n as Cents },
  { dressed_floor_g: 1200 as Grams, price_cents_per_bird: 380n as Cents },
  { dressed_floor_g: 1300 as Grams, price_cents_per_bird: 370n as Cents }
];

/**
 * Daniel's stated dressing percentage. An estimate, never measured — every
 * yield figure in this project traces back to this one number, which is what
 * OQ-17 exists to replace with ~20 paired live/dressed weights.
 */
export const SEED_DRESSING_YIELD_PCT = 62;

/**
 * Recorded own-batch days before the calibrated rate overrides the fallback.
 *
 * OQ-12's assumed 3-5 days, at the short end: enough to smooth one bad entry,
 * short enough to respond inside a 41-day cycle. Validated by nothing yet, and
 * exported as a named constant so it is visible rather than buried.
 */
export const DEFAULT_CALIBRATION_TRAILING_DAYS_MIN = 3;

/** The EMA weight on the newest observation — the weight curve's alpha (OQ-1). */
const EMA_ALPHA = 0.4;

/**
 * The FALLBACK daily removal rate, in basis points.
 *
 * The ramp is a flat STEP from `preharvest_ramp_start_day` — 15 bp a day
 * before, 50 bp a day from day 30 on — not a per-day escalation. That is what
 * compounds to the figures D1 was decided on: 4.74% cumulative at day 30,
 * 5.21% at the day-31 harvest, 9.85% by day 41.
 *
 * D1 (u4-harvest-optimiser.md chunk 2) is the decision NOT to recalibrate this
 * downward. The "roughly double the brief's 5%" flag compared the day-41
 * figure against a harvest-day figure; compared at the same point, 5.21%
 * against 5% is close agreement. Recalibrating on that mismatch would
 * understate mortality on the one day the ramp is actually consulted. See
 * AD-36 for the species of error.
 */
export function dailyMortalityRateBp(model: MortalityModel, day: number): number {
  return model.base_rate_bp_daily + preharvestUpliftBp(model, day);
}

/**
 * The pre-harvest ramp's UPLIFT over the base rate — the flat step, not the
 * whole rate.
 *
 * Named and exported because calibration has to be able to keep it. The rate
 * is `base + uplift`, and only the base is something this batch's own records
 * observe; the uplift is the accelerating pre-harvest death rate CONTEXT.md
 * calls the core operational risk, which no client data has ever spoken to.
 * Substituting one flat calibrated number for the whole thing deleted it.
 */
export function preharvestUpliftBp(model: MortalityModel, day: number): number {
  return day >= model.preharvest_ramp_start_day ? model.preharvest_ramp_rate_bp_daily : 0;
}

export interface CalibratedMortality {
  /** Basis points a day, or null when there is not enough history to calibrate. */
  readonly rate_bp: number | null;
  readonly source: 'calibrated' | 'assumed';
  readonly trailing_days_used: number;
}

/**
 * M4's per-batch mortality calibration (OQ-1, AD-24).
 *
 * The rate is an EMA over this batch's own RECORDED days, alpha 0.4, oldest to
 * newest. Two things about that are deliberate:
 *
 *   1. **Carried-forward days are skipped.** Their derived delta is zero
 *      because nobody wrote anything down, not because nothing died. Feeding
 *      that zero to the EMA would drag the rate down with fabricated data,
 *      which is exactly what invariant 5 forbids.
 *   2. **The EMA runs on the observed rate directly, not on a ratio against
 *      the fallback ramp.** OQ-1 describes the weight curve's "actual vs
 *      standard" pattern, but there IS no client standard for mortality — "it
 *      varies" was the answer. The only candidate standard is our own assumed
 *      ramp, and calibrating a ratio against it would anchor the calibrated
 *      output to the assumption OQ-1 says must stop being the source.
 *
 * Below the sufficiency threshold the rate is null and the caller uses the
 * fallback, with `confidence: 'assumed'` following it all the way out.
 */
export function calibrateMortalityRate(
  production: ProductionProjection,
  parameters: Parameters
): CalibratedMortality {
  const threshold =
    parameters.calibration_trailing_days_min ?? DEFAULT_CALIBRATION_TRAILING_DAYS_MIN;

  /**
   * Two corrections the pre-merge review forced, neither expressible in the
   * original one-line filter-and-map:
   *
   * 1. **A recorded day after a gap carries the gap's arrears.** Carried-
   *    forward days are skipped, but the next RECORDED day's derived delta is
   *    `cumulative[d] - cumulative[last recorded]`, which spans the whole gap.
   *    Dividing that by ONE day's opening birds read 45 deaths over 18 days
   *    identically to 45 deaths over 3. The delta is amortised over the days it
   *    actually covers instead. Spreading it evenly is an assumption, but it is
   *    an assumption about the SHAPE of a measured total, not an invented
   *    total, and it beats charging every death in the gap to one day.
   *
   * 2. **Ramp days are not evidence about the base rate.** An observation from
   *    day >= `preharvest_ramp_start_day` already contains whatever pre-harvest
   *    acceleration is really happening. Calibrating the base on it and then
   *    adding the assumed uplift back would count that acceleration twice; and
   *    SUBTRACTING the assumed uplift to recover a base is the ratio-against-
   *    our-own-assumption that OQ-1 exists to stop. Those days are left out of
   *    the base calibration entirely — they still advance the span cursor,
   *    because they are records.
   */
  const observed: number[] = [];
  let lastRecordedDay = 0;
  for (const day of production.days) {
    if (day.carried_forward || day.opening_birds <= 0) continue;

    const span = day.day_number - lastRecordedDay;
    lastRecordedDay = day.day_number;
    if (span <= 0) continue;
    if (day.day_number >= parameters.mortality.preharvest_ramp_start_day) continue;

    observed.push(((day.daily_mortality + day.daily_culls) / day.opening_birds / span) * 10000);
  }

  if (observed.length < threshold) {
    return { rate_bp: null, source: 'assumed', trailing_days_used: observed.length };
  }

  let ema = observed[0] ?? 0;
  for (const rate of observed.slice(1)) {
    ema = EMA_ALPHA * rate + (1 - EMA_ALPHA) * ema;
  }

  return {
    rate_bp: Math.round(ema * 100) / 100,
    source: 'calibrated',
    trailing_days_used: observed.length
  };
}

/** The highest band the dressed weight clears, or null if it clears none. */
export function bandForDressedG(bands: readonly BulkBand[], dressed_g: number): BulkBand | null {
  let best: BulkBand | null = null;
  for (const band of bands) {
    if (dressed_g >= band.dressed_floor_g && (best === null || band.dressed_floor_g > best.dressed_floor_g)) {
      best = band;
    }
  }
  return best;
}

/** Grams at a per-kg rate, rounding UP — a cost must never round in our favour. */
function feedCostCents(grams: bigint, price_per_kg_cents: Cents): bigint {
  return (grams * price_per_kg_cents + 999n) / 1000n;
}

/** First day the curve's weight reaches `target_g`, or null if it never does. */
function firstDayAtWeight(curve: BreedCurve, target_g: number): number | null {
  for (const point of curve.points) {
    if (point.weight_g >= target_g) return point.day_number;
  }
  return null;
}

const lastCurveDay = (curve: BreedCurve): number =>
  curve.points[curve.points.length - 1]?.day_number ?? 0;

/**
 * The yield window the harvest day survives on.
 *
 * The sensitivity varies the one input actually in doubt — the dressing yield —
 * while holding the DRESSED goal fixed at the bulk contract's first band
 * (1.1 kg). That is what `slaughter_target_g` was derived from in the first
 * place, and taking the goal from client band data rather than from the product
 * of two estimates is what stops this from re-rounding its own assumption, the
 * error AD-36 names.
 */
function yieldSensitivity(
  curve: BreedCurve,
  bands: readonly BulkBand[],
  harvest_day: number,
  assumed_yield_pct: number
): YieldSensitivity {
  const dressed_goal_g = bands.reduce(
    (lowest, band) => Math.min(lowest, band.dressed_floor_g),
    Number.POSITIVE_INFINITY
  );

  const dayAtYield = (pct: number): number | null =>
    firstDayAtWeight(curve, dressed_goal_g / (pct / 100));

  // Scan at 0.01-point resolution, then report inward-rounded to 0.1 so the
  // window never claims the day holds at a yield where it does not.
  let from = Number.POSITIVE_INFINITY;
  let to = Number.NEGATIVE_INFINITY;
  for (let tenths = 4000; tenths <= 9000; tenths += 1) {
    const pct = tenths / 100;
    if (dayAtYield(pct) === harvest_day) {
      from = Math.min(from, pct);
      to = Math.max(to, pct);
    }
  }

  /**
   * No yield in the scanned range produces this harvest day at all, which
   * happens when the target sits in a stretch of the curve no dressing
   * percentage reaches. The unguarded version returned `Infinity` /
   * `-Infinity` bounds and a `day_below` of 1 — not a wide window, a broken
   * one.
   */
  if (from > to) {
    return {
      holds_from_pct: null,
      holds_to_pct: null,
      day_below: null,
      day_above: null,
      brackets_assumed_yield: false
    };
  }

  const holds_from_pct = Math.ceil(from * 10) / 10;
  const holds_to_pct = Math.floor(to * 10) / 10;

  return {
    holds_from_pct,
    holds_to_pct,
    day_below: dayAtYield(holds_from_pct - 0.1) ?? harvest_day,
    day_above: dayAtYield(holds_to_pct + 0.1) ?? harvest_day,
    /**
     * The window is derived from the band floors; the harvest day is derived
     * from `slaughter_target_g`. Those are two encodings of one fact and
     * nothing reconciled them, so a `dressing_yield_pct` of 58 reported day 31
     * beside a 59.7-62.7 window that EXCLUDES 58 — each half internally
     * consistent, the pair self-contradicting. Reported rather than thrown:
     * both values are the client's to reconcile, not ours to pick between.
     */
    brackets_assumed_yield:
      assumed_yield_pct >= holds_from_pct && assumed_yield_pct <= holds_to_pct
  };
}

/**
 * M4 — the harvest plan.
 *
 * Gate and bulk are answered separately (AD-34). Everything here carries
 * `confidence: 'assumed'`: the harvest day rests on an unmeasured dressing
 * yield (OQ-17) and, with no own-batch history, on the fallback ramp too.
 */
export function planHarvest(input: EngineInput, production: ProductionProjection): HarvestPlan {
  const curve = input.curve ?? SEED_BREED_CURVE;
  const { parameters } = input;
  const bands = parameters.bulk_bands ?? SEED_BULK_BANDS;
  const yield_pct = parameters.dressing_yield_pct ?? SEED_DRESSING_YIELD_PCT;

  /**
   * Calibration replaces the BASE rate and leaves the pre-harvest uplift
   * standing. Returning one flat calibrated number for every day dropped the
   * ramp entirely: clean pre-ramp records forecast a fraction of the fallback's
   * loss to day 41 — an understatement across exactly the days the harvest
   * decision turns on, wearing the label 'calibrated'.
   */
  const calibration = calibrateMortalityRate(production, parameters);
  const rateBpFor = (day: number): number =>
    calibration.rate_bp === null
      ? dailyMortalityRateBp(parameters.mortality, day)
      : calibration.rate_bp + preharvestUpliftBp(parameters.mortality, day);

  const bulk_harvest_day = firstDayAtWeight(curve, parameters.slaughter_target_g);
  if (bulk_harvest_day === null) {
    throw new Error(
      `Breed curve never reaches the slaughter target of ${parameters.slaughter_target_g} g`
    );
  }

  const dressedG = (day: number): number =>
    Math.floor((pointForDay(curve, day).weight_g * yield_pct) / 100);

  const phaseRate = (day: number): Cents => {
    const phase = curve.phases.find((p) => p.phase === pointForDay(curve, day).phase);
    if (phase === undefined) throw new Error(`No phase pricing for day ${day}`);
    return phase.price_per_kg_cents;
  };

  const feedCentsForBirds = (day: number, birds: number): bigint =>
    feedCostCents(BigInt(birds) * BigInt(pointForDay(curve, day).feed_g), phaseRate(day));

  /**
   * Invariant 5, in its sharpest form. This returned `0n` for a null gate
   * price, which values a bird at nothing and so makes holding one look free:
   * fixture 7's hold cost comes out $2,669 instead of $3,200, with 125
   * forecast-dead birds costing nothing. Zero is a number the client never
   * gave us.
   *
   * `gate_price` is now emitted by `missingInputsFor`, so a caller going
   * through `computeDecision` gets a typed refusal and never reaches here.
   * This throw is the programming-error guard for a caller that skipped it —
   * the same shape, and the same reasoning, as `projectCashCalendar`'s.
   */
  const gateValueCents = (day: number): bigint => {
    const weight_g = pointForDay(curve, day).weight_g;
    if (parameters.gate_pricing_basis === 'PER_KG') {
      const rate = parameters.gate_price_cents_per_kg;
      if (rate === null) {
        throw new Error(
          'Cannot plan a harvest: the PER_KG gate price is unavailable. ' +
            'Call missingInputsFor() first and return missing_input.'
        );
      }
      return (rate * BigInt(weight_g)) / 1000n;
    }
    const perBird = parameters.gate_price_cents_per_bird;
    if (perBird === null) {
      throw new Error(
        'Cannot plan a harvest: the PER_BIRD gate price is unavailable. ' +
          'Call missingInputsFor() first and return missing_input.'
      );
    }
    return perBird;
  };

  const bulkValueCents = (day: number): bigint | null =>
    bandForDressedG(bands, dressedG(day))?.price_cents_per_bird ?? null;

  /**
   * The gate window. Under flat per-bird pricing `gateValueCents` is constant,
   * so the marginal day's revenue gain is zero against a real feed and
   * mortality cost, and the window collapses onto the first qualifying day.
   * Under PER_KG it extends while growth still outpaces that cost. One
   * implementation, and the basis decides — rather than a constant swapped in.
   */
  const gate_first_day = firstDayAtWeight(curve, parameters.slaughter_target_g) ?? bulk_harvest_day;
  let gate_last_day = gate_first_day;
  const birds = production.closing_birds;
  // With no birds every marginal gain and cost is 0n, the strict `gain < cost`
  // never trips, and the window ran to the end of the curve — advising a hold
  // on an empty flock. There is nothing to hold.
  while (birds > 0 && gate_last_day + 1 <= lastCurveDay(curve)) {
    const next = gate_last_day + 1;
    const gain = (gateValueCents(next) - gateValueCents(gate_last_day)) * BigInt(birds);
    const lost = BigInt(Math.round((birds * rateBpFor(next)) / 10000));
    const cost = feedCentsForBirds(next, birds) + lost * gateValueCents(next);
    if (gain < cost) break;
    gate_last_day = next;
  }

  /** One more day past a channel's target, charged against the live flock. */
  const marginalDayCost = (afterDay: number, value: bigint | null): Cents | null => {
    const day = afterDay + 1;
    if (day > lastCurveDay(curve) || value === null) return null;
    const lost = BigInt(Math.round((birds * rateBpFor(day)) / 10000));
    return (feedCentsForBirds(day, birds) + lost * value) as Cents;
  };

  const bestBandPrice = bands.reduce(
    (best, band) => (band.price_cents_per_bird > best ? band.price_cents_per_bird : best),
    0n as Cents
  );
  const atHarvest = bulkValueCents(bulk_harvest_day);

  return {
    bulk_harvest_day,
    assumed_dressing_yield_pct: yield_pct,
    yield_sensitivity: yieldSensitivity(curve, bands, bulk_harvest_day, yield_pct),
    confidence: 'assumed',
    gate_window: { first_day: gate_first_day, last_day: gate_last_day },
    cost_of_delay_per_day: {
      gate: marginalDayCost(gate_last_day, gateValueCents(gate_last_day + 1 <= lastCurveDay(curve) ? gate_last_day + 1 : gate_last_day)),
      bulk: marginalDayCost(bulk_harvest_day, bulkValueCents(Math.min(bulk_harvest_day + 1, lastCurveDay(curve))))
    },
    band_overshoot_loss_cents:
      atHarvest === null ? null : ((bestBandPrice - atHarvest) * BigInt(birds)) as Cents,
    mortality_source: calibration.source,
    preharvest_uplift_source: 'assumed',
    trailing_days_used: calibration.trailing_days_used,
    hold_cost_to_day: holdCostToDay(curve, production, rateBpFor, {
      feedCentsForBirds,
      gateValueCents,
      bulkValueCents
    })
  };
}

/**
 * Cumulative hold cost from `asOf` forward, one entry per further day on the
 * curve.
 *
 * Anchored on `asOf` rather than on the target day, because the question it
 * answers is "what does holding from today cost" — which is what fixture 7
 * asks. `cost_of_delay_per_day` answers the different question of what the
 * marginal day past target costs, and is anchored there.
 *
 * Forecast birds are rounded to whole birds each day before any money is
 * computed, so no float ever touches a money path (invariant 2).
 */
function holdCostToDay(
  curve: BreedCurve,
  production: ProductionProjection,
  rateBpFor: (day: number) => number,
  price: {
    feedCentsForBirds: (day: number, birds: number) => bigint;
    gateValueCents: (day: number) => bigint;
    bulkValueCents: (day: number) => bigint | null;
  }
): Record<string, HoldCost> {
  const out: Record<string, HoldCost> = {};
  const startingBirds = production.closing_birds;

  let birds = startingBirds;
  let feed_cents = 0n;

  for (let day = production.day_number + 1; day <= lastCurveDay(curve); day += 1) {
    feed_cents += price.feedCentsForBirds(day, birds);
    birds -= Math.round((birds * rateBpFor(day)) / 10000);

    const birds_lost = startingBirds - birds;
    const gate_value_lost_cents = BigInt(birds_lost) * price.gateValueCents(day);
    const bulkUnit = price.bulkValueCents(day);
    const bulk_value_lost_cents = bulkUnit === null ? null : BigInt(birds_lost) * bulkUnit;

    out[String(day)] = {
      through_day: day,
      feed_cents: feed_cents as Cents,
      birds_lost,
      gate_value_lost_cents: gate_value_lost_cents as Cents,
      bulk_value_lost_cents: bulk_value_lost_cents as Cents | null,
      gate_total_cents: (feed_cents + gate_value_lost_cents) as Cents,
      bulk_total_cents:
        bulk_value_lost_cents === null ? null : ((feed_cents + bulk_value_lost_cents) as Cents)
    };
  }

  return out;
}
