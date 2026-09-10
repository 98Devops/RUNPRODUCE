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
  const ramp = day >= model.preharvest_ramp_start_day ? model.preharvest_ramp_rate_bp_daily : 0;
  return model.base_rate_bp_daily + ramp;
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

  const observed = production.days
    .filter((day) => !day.carried_forward && day.opening_birds > 0)
    .map((day) => ((day.daily_mortality + day.daily_culls) / day.opening_birds) * 10000);

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
  harvest_day: number
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

  const holds_from_pct = Math.ceil(from * 10) / 10;
  const holds_to_pct = Math.floor(to * 10) / 10;

  return {
    holds_from_pct,
    holds_to_pct,
    day_below: dayAtYield(holds_from_pct - 0.1) ?? harvest_day,
    day_above: dayAtYield(holds_to_pct + 0.1) ?? harvest_day
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

  const calibration = calibrateMortalityRate(production, parameters);
  const rateBpFor = (day: number): number =>
    calibration.rate_bp ?? dailyMortalityRateBp(parameters.mortality, day);

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

  const gateValueCents = (day: number): bigint => {
    const weight_g = pointForDay(curve, day).weight_g;
    if (parameters.gate_pricing_basis === 'PER_KG') {
      const rate = parameters.gate_price_cents_per_kg;
      return rate === null ? 0n : (rate * BigInt(weight_g)) / 1000n;
    }
    return parameters.gate_price_cents_per_bird ?? 0n;
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
  while (gate_last_day + 1 <= lastCurveDay(curve)) {
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
    yield_sensitivity: yieldSensitivity(curve, bands, bulk_harvest_day),
    confidence: 'assumed',
    gate_window: { first_day: gate_first_day, last_day: gate_last_day },
    cost_of_delay_per_day: {
      gate: marginalDayCost(gate_last_day, gateValueCents(gate_last_day + 1 <= lastCurveDay(curve) ? gate_last_day + 1 : gate_last_day)),
      bulk: marginalDayCost(bulk_harvest_day, bulkValueCents(Math.min(bulk_harvest_day + 1, lastCurveDay(curve))))
    },
    band_overshoot_loss_cents:
      atHarvest === null ? null : ((bestBandPrice - atHarvest) * BigInt(birds)) as Cents,
    mortality_source: calibration.source,
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
