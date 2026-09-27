import {
  DEFAULT_CALIBRATION_TRAILING_DAYS_MIN,
  DEFAULT_PLACEMENT_STEP_BIRDS,
  SEED_BREED_CURVE,
  SEED_BULK_BANDS,
  SEED_DELIVERY_CENTS_PER_TONNE,
  SEED_DRESSING_YIELD_PCT,
  SEED_OVERHEADS,
  type BreedCurve,
  type Parameters
} from '@runproduce/engine';
import { newMember, newOrg, rpc, uuid, type Member } from './harness.js';

const cents = (value: bigint | null): string | null => (value === null ? null : value.toString());

export function curvePayload(orgId: string, curve: BreedCurve = SEED_BREED_CURVE): Record<string, unknown> {
  return {
    org_id: orgId,
    name: `curve ${uuid().slice(0, 8)}`,
    source: curve.source,
    phases: curve.phases.map((p) => ({ phase: p.phase, first_day: p.first_day, last_day: p.last_day })),
    points: curve.points.map((p) => ({ day_number: p.day_number, weight_g: p.weight_g, feed_g: p.feed_g, phase: p.phase }))
  };
}

/**
 * A parameter set as `create_parameter_set` takes it. Every field the engine
 * would fall back to a seed for is written explicitly (D5), and feed prices come
 * from the curve's phases (D6, D12).
 */
export function parameterSetPayload(
  orgId: string,
  effectiveFrom: string,
  p: Parameters,
  curve: BreedCurve = SEED_BREED_CURVE
): Record<string, unknown> {
  const overheads = p.overheads ?? SEED_OVERHEADS;
  return {
    org_id: orgId,
    effective_from: effectiveFrom,
    note: null,
    mortality_base_rate_bp_daily: p.mortality.base_rate_bp_daily,
    mortality_ramp_start_day: p.mortality.preharvest_ramp_start_day,
    mortality_ramp_rate_bp_daily: p.mortality.preharvest_ramp_rate_bp_daily,
    slaughter_target_g: p.slaughter_target_g,
    gate_pricing_basis: p.gate_pricing_basis,
    gate_price_cents_per_bird: cents(p.gate_price_cents_per_bird),
    gate_price_cents_per_kg: cents(p.gate_price_cents_per_kg),
    gate_capacity_per_day: p.gate_capacity_per_day,
    abattoir_fee_cents: cents(p.abattoir_fee_cents),
    transport_cents_per_bird: cents(p.transport_cents_per_bird),
    delivery_mode: p.delivery_mode,
    feed_terms_days: p.feed_terms_days,
    delivery_cents_per_tonne: cents(p.delivery_cents_per_tonne ?? SEED_DELIVERY_CENTS_PER_TONNE),
    reserve_floor_cents: cents(p.reserve_floor_cents),
    dressing_yield_pct: p.dressing_yield_pct ?? SEED_DRESSING_YIELD_PCT,
    calibration_trailing_days_min: p.calibration_trailing_days_min ?? DEFAULT_CALIBRATION_TRAILING_DAYS_MIN,
    placement_step_birds: p.placement_step_birds ?? DEFAULT_PLACEMENT_STEP_BIRDS,
    max_placement_birds: p.max_placement_birds ?? null,
    overhead_lines: overheads.lines.map((l) => ({
      key: l.key,
      label: l.label,
      basis: l.basis,
      timing: l.timing,
      amount_cents: cents(l.amount_cents),
      measured_at_flock_size: l.measured_at_flock_size,
      confidence: l.confidence,
      source: l.source
    })),
    planning_bulk_bands: (p.bulk_bands ?? SEED_BULK_BANDS).map((b) => ({
      dressed_floor_g: b.dressed_floor_g,
      price_cents_per_bird: cents(b.price_cents_per_bird)
    })),
    feed_prices: curve.phases.map((ph) => ({
      phase: ph.phase,
      price_per_bag_cents: cents(ph.price_per_bag_cents),
      bag_kg: ph.bag_kg
    }))
  };
}

/** A plain seed-grade parameter set: enough for batches to be recorded against. */
export const BASE_PARAMETERS: Parameters = {
  mortality: { base_rate_bp_daily: 15, preharvest_ramp_start_day: 30, preharvest_ramp_rate_bp_daily: 35 } as Parameters['mortality'],
  slaughter_target_g: 1770 as Parameters['slaughter_target_g'],
  gate_price_cents_per_bird: 425n as NonNullable<Parameters['gate_price_cents_per_bird']>,
  gate_price_cents_per_kg: null,
  gate_pricing_basis: 'PER_BIRD',
  gate_capacity_per_day: 750,
  abattoir_fee_cents: 10n as NonNullable<Parameters['abattoir_fee_cents']>,
  transport_cents_per_bird: 10n as NonNullable<Parameters['transport_cents_per_bird']>,
  delivery_mode: 'ABATTOIR',
  feed_terms_days: 30,
  reserve_floor_cents: 0n as Parameters['reserve_floor_cents']
};

export interface Farm {
  readonly orgId: string;
  readonly owner: Member;
  readonly manager: Member;
  readonly worker: Member;
  readonly curveId: string;
}

export async function newFarm(label: string): Promise<Farm> {
  const orgId = await newOrg(label);
  const [owner, manager, worker] = await Promise.all([
    newMember(orgId, 'OWNER'),
    newMember(orgId, 'MANAGER'),
    newMember(orgId, 'WORKER')
  ]);
  const curveId = await rpc<string>(owner, 'create_breed_curve', { payload: curvePayload(orgId) });
  await rpc(owner, 'create_parameter_set', { payload: parameterSetPayload(orgId, '2026-01-01', BASE_PARAMETERS) });
  return { orgId, owner, manager, worker, curveId };
}

export interface Placement {
  readonly placement_date: string;
  readonly chick_count: number;
  readonly extra_chick_count: number;
  readonly chick_price_cents: string;
}

export async function newBatch(farm: Farm, placement: Placement, by: Member = farm.owner): Promise<string> {
  return rpc<string>(by, 'record_batch', {
    payload: {
      org_id: farm.orgId,
      code: `B-${uuid().slice(0, 8)}`,
      breed_curve_id: farm.curveId,
      client_request_id: uuid(),
      ...placement
    }
  });
}

export interface DayRow {
  readonly record_date: string;
  readonly mortality_cumulative: number;
  readonly cull_cumulative: number;
  readonly supersedes_id?: string | null;
  readonly voided?: boolean;
}

/** A daily record row with feed and weight filled in; only the removals vary in these tests. */
export function day(row: DayRow): Record<string, unknown> {
  return {
    client_request_id: uuid(),
    feed_starter_g: 1000,
    feed_grower_g: 0,
    feed_finisher_g: 0,
    avg_weight_g: null,
    weight_sample_size: null,
    notes: null,
    ...row
  };
}
