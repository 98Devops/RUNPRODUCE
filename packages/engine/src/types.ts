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
  readonly mortality_count: number;
  readonly cull_count: number;
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
 * Mortality model. UNCALIBRATED — reverse-engineered from one sentence
 * the client said. See current-issues.md OQ-1. Everything downstream
 * carries confidence 'assumed'.
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
  readonly curve: BreedCurve;
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
