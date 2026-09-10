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

export type OverheadKey = 'vaccine' | 'electricity_heating' | 'labour' | 'transport_other';

/**
 * How an overhead line scales. The client's own brief draws this distinction
 * and tells us to respect it: VARIABLE costs (DOC, feed, medication,
 * processing, transport, packaging) move with bird count; FIXED/OVERHEAD costs
 * (labour, electricity, infrastructure, rent, administration) do not. The
 * brief also says "Do not double-count costs", which is why a line's basis is
 * declared rather than inferred.
 */
export type OverheadBasis = 'PER_BIRD' | 'PER_BATCH';

/**
 * One production overhead, as booked in the client's own Final Report.
 *
 * The amount is the MEASURED figure for a batch of `measured_at_flock_size`
 * birds, kept literally as he recorded it rather than pre-divided into a
 * per-bird rate — $42 of vaccine over 3,000 birds is 1.4 cents a bird, which
 * is not expressible in integer cents. A PER_BIRD line is scaled to the actual
 * flock at the point of use; a PER_BATCH line is charged as it stands.
 */
export interface OverheadLine {
  readonly key: OverheadKey;
  readonly label: string;
  readonly basis: OverheadBasis;
  readonly amount_cents: Cents;
  /** The flock `amount_cents` was measured against. Unused for PER_BATCH. */
  readonly measured_at_flock_size: number;
  readonly confidence: Confidence;
  readonly source: string;
}

export interface OverheadModel {
  readonly lines: readonly OverheadLine[];
}

/** One overhead line charged against an actual flock. */
export interface OverheadCharge {
  readonly key: OverheadKey;
  readonly label: string;
  readonly basis: OverheadBasis;
  readonly cents: Cents;
  readonly confidence: Confidence;
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
  /**
   * Omitted means SEED_OVERHEADS — the client's own Final Report figures. Same
   * convention EngineInput.curve follows (AD-23), for the same reason: no
   * fixture should have to carry a literal copy of client data it does not
   * assert on. Absent is his measured data; an empty `lines` array is a
   * deliberate "charge no overheads". The two are not the same, and null is
   * never used to mean either.
   */
  readonly overheads?: OverheadModel;
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

/**
 * One day of the projection, carrying its own provenance.
 *
 * `carried_forward` is the difference between "nobody died that day" and
 * "nobody wrote anything down that day". Both produce a derived delta of zero
 * and are otherwise indistinguishable — exactly the ambiguity invariant 5
 * forbids. The VALUE is never adjusted for it: a carried-forward cumulative is
 * the last recorded total, unchanged, and no fallback ramp fills the gap.
 * Only its provenance is marked, the same way `Confidence` marks a value that
 * was assumed rather than measured, so the console renders it differently
 * rather than showing an absence of data as a measured zero.
 */
export interface ProductionDay {
  readonly day_number: number;
  readonly opening_birds: number;
  readonly closing_birds: number;
  /** The last recorded cumulative total as of this day. Never adjusted. */
  readonly mortality_cumulative: number;
  readonly cull_cumulative: number;
  /** Derived: cumulative[d] − cumulative[d−1]. Zero on a carried-forward day. */
  readonly daily_mortality: number;
  readonly daily_culls: number;
  /** True when no record exists for this day, so its totals are carried forward. */
  readonly carried_forward: boolean;
  /**
   * 0 on a recorded day. Otherwise days since the most recent record — or since
   * placement, when nothing has been recorded yet. How stale the figure is, so
   * the console can widen its treatment as the gap grows (compare CR-2).
   */
  readonly days_since_last_record: number;
}

export interface ProductionProjection {
  /** chick_count + extra_chick_count. Invariant 9 — nothing is hardcoded off this. */
  readonly flock_size: number;
  readonly day_number: number;
  /** Birds alive at the start of asOf's day. */
  readonly opening_birds: number;
  /** opening_birds minus that day's derived mortality and culls. */
  readonly closing_birds: number;
  /** Per-bird cumulative feed through asOf, in kg. Fixture 4 asserts 2.337 at day 30. */
  readonly cumulative_feed_kg_per_bird: number;
  /** Whole-flock cumulative feed through asOf, in kg. Fixture 2 asserts 13224 at day 41. */
  readonly total_feed_kg: number;
  /**
   * kg feed / kg live weight produced, 2dp. Fixture 3 asserts 1.53 at day 41.
   *
   * NULL when no live weight was produced — every bird gone. Feed was still
   * eaten, so the ratio is undefined rather than zero, and Infinity is a
   * number that reads as a ratio. A blank beats a confident wrong figure.
   */
  readonly fcr: number | null;
  readonly live_weight_kg: number;
  /** Placement day through asOf, one entry per day, each carrying its provenance. */
  readonly days: readonly ProductionDay[];
  /** True when asOf itself has no record and the headline figures are carried forward. */
  readonly carried_forward: boolean;
  /** How stale the headline figures are. 0 when asOf is recorded. */
  readonly days_since_last_record: number;
}

export interface CostingResult {
  readonly chick_cost_cents: Cents;
  /** Phase-priced feed cost. Fixture 1 asserts 807981 at day 41, 3000 birds. */
  readonly feed_cost_cents: Cents;
  /**
   * Chick cost + feed cost, and deliberately nothing else. CONTEXT.md defines
   * core credit as exactly that, and it is what the brief calls the "DOC +
   * feed break-even". Overheads are real money but they are not core credit —
   * they land in full_production_cost_cents so both break-evens can be shown
   * separately, which the brief requires outright.
   */
  readonly core_credit_cents: Cents;
  /** Production overheads charged against this flock. See SEED_OVERHEADS. */
  readonly overhead_cost_cents: Cents;
  /** Per line, so the UI can show what the overhead is made of and how sure we are. */
  readonly overhead_lines: readonly OverheadCharge[];
  /** core_credit_cents + overhead_cost_cents. The brief's "full production" figure. */
  readonly full_production_cost_cents: Cents;
}

export interface Lever {
  readonly key: string;
  readonly description: string;
  readonly cash_impact_cents: Cents;
}

/** Filled in progressively across U2-U5. U2 lands production and costing. */
export interface Decision {
  readonly production: ProductionProjection;
  readonly costing: CostingResult;
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
