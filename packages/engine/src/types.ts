import type { Cents } from './money.js';

export type { Cents } from './money.js';

export type Grams = number & { readonly __brand: 'Grams' };
export type DayNumber = number & { readonly __brand: 'DayNumber' };
export type BasisPoints = number & { readonly __brand: 'BasisPoints' };

/** ISO calendar date, 'YYYY-MM-DD'. The engine never constructs a Date. */
export type IsoDate = string & { readonly __brand: 'IsoDate' };

export type Phase = 'STARTER' | 'GROWER' | 'FINISHER';
export type Channel = 'GATE' | 'BULK';
export type PricingBasis = 'PER_BIRD' | 'PER_KG';
export type Confidence = 'measured' | 'calibrated' | 'assumed';
export type DeliveryMode = 'ABATTOIR' | 'DIRECT';

export interface Explained<T> {
  readonly value: T;
  readonly formula: string;
  readonly inputs: Readonly<Record<string, { value: unknown; source: string }>>;
  readonly confidence: Confidence;
}

export interface BreedCurvePoint {
  readonly day_number: DayNumber;
  readonly weight_g: Grams;
  readonly feed_g: Grams;
  readonly phase: Phase;
}

export interface PhasePricing {
  readonly phase: Phase;
  readonly first_day: DayNumber;
  readonly last_day: DayNumber;
  readonly price_per_kg_cents: Cents;
}

export interface BreedCurve {
  readonly source: string;
  readonly points: readonly BreedCurvePoint[];
  readonly phases: readonly PhasePricing[];
}

export interface Batch {
  readonly placement_date: IsoDate;
  readonly chick_count: number;
  readonly extra_chick_count: number;
  readonly chick_price_cents: Cents;
}

export interface DailyRecord {
  readonly day_number: DayNumber;
  /**
   * CUMULATIVE total dead as of this day — "total dead so far", not the
   * day's deaths. Per the client (OQ-1, answered 2026-09-10) this is what
   * gets entered by hand. The daily delta is DERIVED:
   *   delta[d] = mortality_cumulative[d] - mortality_cumulative[d-1]
   * Invariant: monotonically non-decreasing across records. See
   * cull_cumulative for the joint upper bound. AD-24.
   */
  readonly mortality_cumulative: number;
  /**
   * CUMULATIVE total culled as of this day — same semantics as
   * mortality_cumulative, for the same reason (AD-25). A cull is a
   * deliberate removal, a death is not, but both are irreversible
   * removals from the flock counted by hand at the same moment on the
   * same form, so they are entered the same way. Delta is DERIVED:
   *   delta[d] = cull_cumulative[d] - cull_cumulative[d-1]
   * Invariants: monotonically non-decreasing, and jointly bounded —
   *   mortality_cumulative[d] + cull_cumulative[d]
   *     <= chick_count + extra_chick_count
   * The bound is JOINT, not per-column: a bird that was culled is no
   * longer available to die, so bounding each column separately would
   * admit a flock losing up to twice its own size.
   */
  readonly cull_cumulative: number;
  readonly feed_starter_kg: number;
  readonly feed_grower_kg: number;
  readonly feed_finisher_kg: number;
  readonly avg_weight_g: Grams | null;
  readonly weight_sample_size: number | null;
}

export interface FeedDraw {
  readonly collection_date: IsoDate;
  readonly phase: Phase;
  readonly bags: number;
  readonly kg: number;
  readonly price_per_bag_cents: Cents;
  readonly terms_days: number;
}

export interface SalesOrder {
  readonly channel: Channel;
  readonly order_date: IsoDate;
  readonly bird_count: number;
  readonly avg_live_weight_g: Grams;
  readonly pricing_basis: PricingBasis;
  readonly price_cents_per_bird: Cents | null;
  readonly price_cents_per_kg: Cents | null;
  readonly terms_days: number;
}

/**
 * FALLBACK mortality model only. Per OQ-1 (answered 2026-09-10) there is
 * no standard mortality curve — "it varies". The harvest optimiser (M4)
 * CALIBRATES a rate from this batch's own trailing cumulative entries via
 * the same EMA pattern as the weight curve (alpha 0.4, actual vs
 * standard). These constants are used only for days where insufficient
 * own-batch history exists to calibrate from — never as the permanent
 * source. Output from the fallback carries confidence 'assumed'; output
 * from the calibrated rate carries 'calibrated'.
 */
export interface MortalityModel {
  readonly base_rate_bp_daily: BasisPoints;
  readonly preharvest_ramp_start_day: DayNumber;
  readonly preharvest_ramp_rate_bp_daily: BasisPoints;
}

export interface Parameters {
  readonly mortality: MortalityModel;
  readonly slaughter_target_g: Grams;
  readonly gate_price_cents_per_bird: Cents | null;
  readonly gate_price_cents_per_kg: Cents | null;
  readonly gate_pricing_basis: PricingBasis;
  readonly gate_capacity_per_day: number;
  readonly bulk_price_cents_per_bird: Cents | null;
  /** null until the client answers OQ-2. Never estimate. */
  readonly abattoir_fee_cents: Cents | null;
  /** null until the client answers OQ-2. Never estimate. */
  readonly transport_cents_per_bird: Cents | null;
  readonly delivery_mode: DeliveryMode;
  readonly feed_terms_days: number;
  readonly reserve_floor_cents: Cents;
}

export interface EngineInput {
  readonly asOf: IsoDate;
  readonly batch: Batch;
  readonly parameters: Parameters;
  /**
   * Omitted by every golden fixture, which would otherwise each carry a
   * literal copy of 41 curve rows. Absent means SEED_BREED_CURVE — the
   * client's own data, which is what the fixtures are written against.
   * Present means a calibrated curve supplied by the caller.
   */
  readonly curve?: BreedCurve;
  readonly records: readonly DailyRecord[];
  readonly draws: readonly FeedDraw[];
  readonly sales: readonly SalesOrder[];
}

export type MissingInputKey =
  | 'abattoir_fee'
  | 'transport_cents_per_bird'
  | 'gate_price'
  | 'bulk_price'
  | 'mortality_history';

export interface MissingInput {
  readonly key: MissingInputKey;
  readonly why: string;
}

export interface Lever {
  readonly key: string;
  readonly description: string;
  readonly cash_impact_cents: Cents;
}

/** Filled in progressively across U2-U5. U1 defines the envelope only. */
export interface Decision {
  readonly production: unknown;
  readonly costing: unknown;
  readonly feed: unknown;
  readonly harvest: unknown;
  readonly allocation: unknown;
}

export type DecisionResult =
  | { readonly kind: 'ok'; readonly decision: Decision }
  | { readonly kind: 'missing_input'; readonly missing: readonly MissingInput[] }
  | {
      readonly kind: 'infeasible';
      readonly gap_cents: Cents;
      readonly levers: readonly Lever[];
    };
